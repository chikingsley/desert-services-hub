import { createHash } from "node:crypto";
import { ArcGisClient } from "./arcgis-client";
import { ARCGIS_LAYER_BY_KEY, ARCGIS_LAYERS } from "./arcgis-constants";
import { ArcGisSqliteRepository } from "./arcgis-sqlite-repo";
import type {
  ArcGisFeature,
  ArcGisLayerConfig,
  ArcGisLayerSyncSummary,
  ArcGisRunOptions,
  ArcGisRunSummary,
} from "./arcgis-types";

const DEFAULT_DELAY_BETWEEN_PAGES_MS = 25;
const DEFAULT_PAGE_SIZE = 1000;

interface LayerCounters {
  fetchedRows: number;
  insertedRecords: number;
  pagesFetched: number;
  unchangedRecords: number;
  updatedRecords: number;
}

function stringifyStable(input: unknown): string {
  if (input === null || typeof input !== "object") {
    return JSON.stringify(input);
  }

  if (Array.isArray(input)) {
    const items = input.map((item) => stringifyStable(item));
    return `[${items.join(",")}]`;
  }

  const objectInput = input as Record<string, unknown>;
  const keys = Object.keys(objectInput).sort();
  const keyValuePairs = keys.map(
    (key) => `${JSON.stringify(key)}:${stringifyStable(objectInput[key])}`
  );
  return `{${keyValuePairs.join(",")}}`;
}

function hashFeature(input: ArcGisFeature): string {
  return createHash("sha256").update(stringifyStable(input)).digest("hex");
}

function parsePositiveInteger(
  value: number | undefined,
  fallback: number,
  minimum: number
): number {
  if (!Number.isInteger(value)) {
    return fallback;
  }
  return Math.max(minimum, value ?? fallback);
}

function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `arcgis-sync-${timestamp}`;
}

function asJsonString(value: unknown): string {
  return JSON.stringify(value);
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveLayers(layerKeys?: string[]): ArcGisLayerConfig[] {
  if (!layerKeys || layerKeys.length === 0) {
    return [...ARCGIS_LAYERS];
  }

  const resolved: ArcGisLayerConfig[] = [];
  const unknownKeys: string[] = [];
  for (const key of layerKeys) {
    const layer = ARCGIS_LAYER_BY_KEY.get(key);
    if (!layer) {
      unknownKeys.push(key);
      continue;
    }
    resolved.push(layer);
  }

  if (unknownKeys.length > 0) {
    throw new Error(`Unknown ArcGIS layer keys: ${unknownKeys.join(", ")}`);
  }

  return resolved;
}

function firstNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function extractObjectId(
  feature: ArcGisFeature,
  objectIdField: string
): string | null {
  const directValue = feature.attributes[objectIdField];
  if (typeof directValue === "number" && Number.isFinite(directValue)) {
    return `${directValue}`;
  }
  const directString = firstNonEmptyString(directValue);
  if (directString) {
    return directString;
  }

  const fallbackFields = ["OBJECTID", "GLOBALID", "FID"];
  for (const fallbackField of fallbackFields) {
    const value = feature.attributes[fallbackField];
    if (typeof value === "number" && Number.isFinite(value)) {
      return `${value}`;
    }
    const asString = firstNonEmptyString(value);
    if (asString) {
      return asString;
    }
  }

  return null;
}

export function buildArcGisRecordId(
  layer: ArcGisLayerConfig,
  feature: ArcGisFeature,
  objectIdField: string
): string {
  const objectId = extractObjectId(feature, objectIdField);
  if (objectId) {
    return objectId;
  }
  return `hash:${layer.key}:${hashFeature(feature)}`;
}

function applyFeaturesToRepository(input: {
  counters: LayerCounters;
  features: ArcGisFeature[];
  layer: ArcGisLayerConfig;
  objectIdField: string;
  repository: ArcGisSqliteRepository;
  runId: string;
}): void {
  for (const feature of input.features) {
    const objectId = buildArcGisRecordId(
      input.layer,
      feature,
      input.objectIdField
    );
    const payloadHash = hashFeature(feature);
    const changeType = input.repository.upsertRecord({
      serviceName: input.layer.serviceName,
      layerId: input.layer.layerId,
      objectId,
      payloadHash,
      rawJson: asJsonString(feature),
      runId: input.runId,
    });

    if (changeType === "inserted") {
      input.counters.insertedRecords += 1;
      continue;
    }
    if (changeType === "updated") {
      input.counters.updatedRecords += 1;
      continue;
    }
    input.counters.unchangedRecords += 1;
  }
}

function toLayerFailureSummary(
  layer: ArcGisLayerConfig
): ArcGisLayerSyncSummary {
  return {
    key: layer.key,
    serviceName: layer.serviceName,
    layerId: layer.layerId,
    layerName: layer.layerName,
    expectedCount: 0,
    fetchedRows: 0,
    pagesFetched: 0,
    insertedRecords: 0,
    updatedRecords: 0,
    unchangedRecords: 0,
    softDeletedRecords: 0,
  };
}

export async function runArcGisSync(
  options: ArcGisRunOptions
): Promise<ArcGisRunSummary> {
  const startedAt = new Date().toISOString();
  const runId = createRunId();
  const layers = resolveLayers(options.layerKeys);
  const repository = new ArcGisSqliteRepository(options.dbPath);
  const client = new ArcGisClient();
  const pageSize = parsePositiveInteger(options.pageSize, DEFAULT_PAGE_SIZE, 1);
  const delayBetweenPagesMs = parsePositiveInteger(
    options.delayBetweenPagesMs,
    DEFAULT_DELAY_BETWEEN_PAGES_MS,
    0
  );

  repository.init();
  repository.beginRun(
    runId,
    startedAt,
    asJsonString({
      layerKeys: layers.map((layer) => layer.key),
      pageSize,
      delayBetweenPagesMs,
    })
  );

  const layerSummaries: ArcGisLayerSyncSummary[] = [];
  let failedLayers = 0;

  try {
    for (const layer of layers) {
      try {
        const metadata = await client.getLayerMetadata(layer);
        const objectIdField = metadata.objectIdField?.trim()
          ? metadata.objectIdField.trim()
          : "OBJECTID";
        const expectedCount = await client.getLayerCount(layer);

        const counters: LayerCounters = {
          fetchedRows: 0,
          pagesFetched: 0,
          insertedRecords: 0,
          updatedRecords: 0,
          unchangedRecords: 0,
        };

        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const page = await client.queryLayerPage({
            layer,
            objectIdField,
            resultOffset: offset,
            pageSize: Math.min(pageSize, metadata.maxRecordCount ?? pageSize),
          });
          counters.pagesFetched += 1;
          counters.fetchedRows += page.features.length;

          applyFeaturesToRepository({
            runId,
            layer,
            objectIdField,
            features: page.features,
            repository,
            counters,
          });

          offset += page.features.length;
          if (options.onProgress) {
            options.onProgress(layer.key, counters.fetchedRows, expectedCount);
          }

          hasMore =
            page.features.length > 0 &&
            (page.exceededTransferLimit ||
              counters.fetchedRows < expectedCount);

          await sleep(delayBetweenPagesMs);
        }

        const softDeletedRecords = repository.markLayerSoftDeletedMissingInRun(
          runId,
          new Date().toISOString(),
          layer.serviceName,
          layer.layerId
        );

        repository.logLayer({
          runId,
          key: layer.key,
          serviceName: layer.serviceName,
          layerId: layer.layerId,
          layerName: layer.layerName,
          expectedCount,
          fetchedRows: counters.fetchedRows,
          pagesFetched: counters.pagesFetched,
        });

        layerSummaries.push({
          key: layer.key,
          serviceName: layer.serviceName,
          layerId: layer.layerId,
          layerName: layer.layerName,
          expectedCount,
          fetchedRows: counters.fetchedRows,
          pagesFetched: counters.pagesFetched,
          insertedRecords: counters.insertedRecords,
          updatedRecords: counters.updatedRecords,
          unchangedRecords: counters.unchangedRecords,
          softDeletedRecords,
        });
      } catch {
        failedLayers += 1;
        layerSummaries.push(toLayerFailureSummary(layer));
      }
    }

    const finishedAt = new Date().toISOString();
    const summary: ArcGisRunSummary = {
      runId,
      startedAt,
      finishedAt,
      failedLayers,
      layerSummaries,
      fetchedRows: layerSummaries.reduce(
        (acc, current) => acc + current.fetchedRows,
        0
      ),
      insertedRecords: layerSummaries.reduce(
        (acc, current) => acc + current.insertedRecords,
        0
      ),
      updatedRecords: layerSummaries.reduce(
        (acc, current) => acc + current.updatedRecords,
        0
      ),
      unchangedRecords: layerSummaries.reduce(
        (acc, current) => acc + current.unchangedRecords,
        0
      ),
    };

    repository.finishRun(runId, finishedAt, {
      queriedLayers: layers.length,
      failedLayers: summary.failedLayers,
      fetchedRows: summary.fetchedRows,
      insertedRecords: summary.insertedRecords,
      updatedRecords: summary.updatedRecords,
      unchangedRecords: summary.unchangedRecords,
    });

    return summary;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message =
      error instanceof Error ? error.message : "Unknown ArcGIS sync failure";
    repository.failRun(runId, finishedAt, message);
    throw error;
  }
}
