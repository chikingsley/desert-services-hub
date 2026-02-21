import { createHash } from "node:crypto";
import {
  AzdeqMegaSearchClient,
  AzdeqMegaSearchClientError,
} from "./megasearch-client";
import {
  DEFAULT_QUERY_CAP,
  MEGASEARCH_ENDPOINT_BY_NAME,
  MEGASEARCH_ENDPOINTS,
  MEGASEARCH_RECORD_ID_KEYS_BY_ENDPOINT,
  MEGASEARCH_RECORD_ID_PREFERRED_KEYS,
  MEGASEARCH_SPLIT_PLAN,
} from "./megasearch-constants";
import { MegaSearchSqliteRepository } from "./megasearch-sqlite-repo";
import type {
  MegaSearchEndpointConfig,
  MegaSearchEndpointSyncSummary,
  MegaSearchQuery,
  MegaSearchQueryField,
  MegaSearchRow,
  MegaSearchRunOptions,
  MegaSearchRunSummary,
} from "./megasearch-types";

const DEFAULT_DELAY_BETWEEN_QUERIES_MS = 100;
const DEFAULT_MAX_QUERIES_PER_ENDPOINT = 600;
const DEFAULT_MAX_SPLIT_LEVELS = MEGASEARCH_SPLIT_PLAN.length;

interface QueryNode {
  query: MegaSearchQuery;
  splitLevel: number;
}

interface EndpointCounters {
  cappedQueries: number;
  failedQueries: number;
  fetchedRows: number;
  insertedRecords: number;
  queriedCount: number;
  unchangedRecords: number;
  unresolvedCappedQueries: number;
  updatedRecords: number;
}

function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `megasearch-sync-${timestamp}`;
}

function emptyQuery(): MegaSearchQuery {
  return {
    facilityName: "",
    uniqueId: "",
    address: "",
    city: "",
    zip: "",
  };
}

function queryToKey(query: MegaSearchQuery): string {
  return JSON.stringify([
    query.facilityName,
    query.uniqueId,
    query.address,
    query.city,
    query.zip,
  ]);
}

function normalizeQueryValue(value: string): string {
  return value.trim().toLowerCase();
}

function buildChildQuery(
  parent: MegaSearchQuery,
  field: MegaSearchQueryField,
  token: string
): MegaSearchQuery {
  return {
    ...parent,
    [field]: `${parent[field]}${token}`,
  };
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

export function hashMegaSearchRow(row: MegaSearchRow): string {
  return createHash("sha256").update(stringifyStable(row)).digest("hex");
}

function firstNonEmptyString(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  return trimmed ? trimmed : null;
}

export function buildMegaSearchRecordId(
  endpoint: string,
  row: MegaSearchRow
): string {
  const rowHash = hashMegaSearchRow(row);
  const endpointKeys = MEGASEARCH_RECORD_ID_KEYS_BY_ENDPOINT[endpoint] ?? [];
  const endpointParts = endpointKeys
    .map((key) => {
      const candidate = firstNonEmptyString(row[key]);
      return candidate ? `${key}=${candidate}` : null;
    })
    .filter((part): part is string => Boolean(part));

  if (endpointParts.length > 0) {
    return `${endpointParts.join("|")}|rowHash=${rowHash}`;
  }

  for (const key of MEGASEARCH_RECORD_ID_PREFERRED_KEYS) {
    const candidate = firstNonEmptyString(row[key]);
    if (candidate) {
      return `${key}=${candidate}|rowHash=${rowHash}`;
    }
  }

  return `hash:${endpoint}:${rowHash}`;
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

function resolveEndpoints(
  endpointNames?: string[]
): MegaSearchEndpointConfig[] {
  if (!endpointNames || endpointNames.length === 0) {
    return [...MEGASEARCH_ENDPOINTS];
  }

  const resolved: MegaSearchEndpointConfig[] = [];
  const unknownNames: string[] = [];
  for (const endpointName of endpointNames) {
    const endpoint = MEGASEARCH_ENDPOINT_BY_NAME.get(endpointName);
    if (!endpoint) {
      unknownNames.push(endpointName);
      continue;
    }
    resolved.push(endpoint);
  }

  if (unknownNames.length > 0) {
    throw new Error(`Unknown MegaSearch endpoints: ${unknownNames.join(", ")}`);
  }

  return resolved;
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

function shouldSplitQuery(
  rowCount: number,
  splitLevel: number,
  maxSplitLevels: number
): boolean {
  return rowCount >= DEFAULT_QUERY_CAP && splitLevel < maxSplitLevels;
}

function buildChildQueries(node: QueryNode): QueryNode[] {
  const splitPlan = MEGASEARCH_SPLIT_PLAN[node.splitLevel];
  if (!splitPlan) {
    return [];
  }

  return splitPlan.tokens.map((token) => ({
    query: buildChildQuery(node.query, splitPlan.field, token),
    splitLevel: node.splitLevel + 1,
  }));
}

interface CrawlEndpointInput {
  delayBetweenQueriesMs: number;
  endpointConfig: MegaSearchEndpointConfig;
  maxQueriesPerEndpoint: number;
  maxSplitLevels: number;
  onProgress: MegaSearchRunOptions["onProgress"];
  repository: MegaSearchSqliteRepository;
  runId: string;
  syncClient: AzdeqMegaSearchClient;
}

function normalizeQuery(query: MegaSearchQuery): MegaSearchQuery {
  return {
    facilityName: normalizeQueryValue(query.facilityName),
    uniqueId: normalizeQueryValue(query.uniqueId),
    address: normalizeQueryValue(query.address),
    city: normalizeQueryValue(query.city),
    zip: normalizeQueryValue(query.zip),
  };
}

function persistRowsForQuery(input: {
  counters: EndpointCounters;
  endpointConfig: MegaSearchEndpointConfig;
  repository: MegaSearchSqliteRepository;
  rows: MegaSearchRow[];
  runId: string;
  uniqueRecordIds: Set<string>;
}): void {
  for (const row of input.rows) {
    const recordId = buildMegaSearchRecordId(
      input.endpointConfig.endpoint,
      row
    );
    input.uniqueRecordIds.add(recordId);

    const changeType = input.repository.upsertRecord({
      endpoint: input.endpointConfig.endpoint,
      recordId,
      runId: input.runId,
      payloadHash: hashMegaSearchRow(row),
      rawJson: asJsonString(row),
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

function enqueueChildQueries(input: {
  counters: EndpointCounters;
  maxSplitLevels: number;
  node: QueryNode;
  queue: QueryNode[];
  queuedKeys: Set<string>;
  rowCount: number;
}): void {
  if (
    !shouldSplitQuery(
      input.rowCount,
      input.node.splitLevel,
      input.maxSplitLevels
    )
  ) {
    if (input.rowCount >= DEFAULT_QUERY_CAP) {
      input.counters.unresolvedCappedQueries += 1;
    }
    return;
  }

  const children = buildChildQueries(input.node);
  if (children.length === 0) {
    input.counters.unresolvedCappedQueries += 1;
    return;
  }

  for (const child of children) {
    const childKey = queryToKey(child.query);
    if (input.queuedKeys.has(childKey)) {
      continue;
    }
    input.queuedKeys.add(childKey);
    input.queue.push(child);
  }
}

function logFailedQuery(input: {
  endpointConfig: MegaSearchEndpointConfig;
  error: unknown;
  normalizedQuery: MegaSearchQuery;
  repository: MegaSearchSqliteRepository;
  runId: string;
}): void {
  const details =
    input.error instanceof AzdeqMegaSearchClientError
      ? input.error.details
      : {
          endpoint: input.endpointConfig.endpoint,
          responseStatus: 0,
          query: input.normalizedQuery,
        };

  const message =
    input.error instanceof Error ? input.error.message : "Unknown query error";
  input.repository.logQuery({
    runId: input.runId,
    endpoint: input.endpointConfig.endpoint,
    queryJson: asJsonString(details.query),
    responseStatus: details.responseStatus,
    rowCount: 0,
    wasCapped: false,
    errorMessage: message,
  });
}

async function crawlEndpoint(
  input: CrawlEndpointInput
): Promise<MegaSearchEndpointSyncSummary> {
  const queue: QueryNode[] = [{ query: emptyQuery(), splitLevel: 0 }];
  const queuedKeys = new Set<string>([queryToKey(emptyQuery())]);
  const uniqueRecordIds = new Set<string>();
  const counters: EndpointCounters = {
    queriedCount: 0,
    failedQueries: 0,
    cappedQueries: 0,
    unresolvedCappedQueries: 0,
    fetchedRows: 0,
    insertedRecords: 0,
    updatedRecords: 0,
    unchangedRecords: 0,
  };

  let truncatedByQueryLimit = false;

  while (queue.length > 0) {
    if (counters.queriedCount >= input.maxQueriesPerEndpoint) {
      truncatedByQueryLimit = true;
      break;
    }

    const nextNode = queue.shift();
    if (!nextNode) {
      break;
    }

    counters.queriedCount += 1;
    const normalizedQuery = normalizeQuery(nextNode.query);

    try {
      const result = await input.syncClient.queryEndpoint(
        input.endpointConfig,
        normalizedQuery
      );

      const rowCount = result.rows.length;
      counters.fetchedRows += rowCount;
      const wasCapped = rowCount >= DEFAULT_QUERY_CAP;
      if (wasCapped) {
        counters.cappedQueries += 1;
      }

      input.repository.logQuery({
        runId: input.runId,
        endpoint: input.endpointConfig.endpoint,
        queryJson: asJsonString(normalizedQuery),
        responseStatus: result.responseStatus,
        rowCount,
        wasCapped,
      });

      persistRowsForQuery({
        endpointConfig: input.endpointConfig,
        repository: input.repository,
        runId: input.runId,
        counters,
        rows: result.rows,
        uniqueRecordIds,
      });
      enqueueChildQueries({
        counters,
        node: nextNode,
        rowCount,
        maxSplitLevels: input.maxSplitLevels,
        queue,
        queuedKeys,
      });
    } catch (error) {
      counters.failedQueries += 1;
      logFailedQuery({
        endpointConfig: input.endpointConfig,
        error,
        normalizedQuery,
        repository: input.repository,
        runId: input.runId,
      });
    }

    if (input.onProgress) {
      input.onProgress(
        input.endpointConfig.endpoint,
        counters.queriedCount,
        input.maxQueriesPerEndpoint
      );
    }

    await sleep(input.delayBetweenQueriesMs);
  }

  return {
    endpoint: input.endpointConfig.endpoint,
    label: input.endpointConfig.label,
    queriedCount: counters.queriedCount,
    failedQueries: counters.failedQueries,
    cappedQueries: counters.cappedQueries,
    unresolvedCappedQueries: counters.unresolvedCappedQueries,
    fetchedRows: counters.fetchedRows,
    uniqueRecordIdsSeen: uniqueRecordIds.size,
    insertedRecords: counters.insertedRecords,
    updatedRecords: counters.updatedRecords,
    unchangedRecords: counters.unchangedRecords,
    truncatedByQueryLimit,
  };
}

export async function runMegaSearchSync(
  options: MegaSearchRunOptions
): Promise<MegaSearchRunSummary> {
  const startedAt = new Date().toISOString();
  const runId = createRunId();
  const repository = new MegaSearchSqliteRepository(options.dbPath);
  const syncClient = new AzdeqMegaSearchClient({
    headless: options.headless ?? true,
  });
  const endpoints = resolveEndpoints(options.endpointNames);
  const maxQueriesPerEndpoint = parsePositiveInteger(
    options.maxQueriesPerEndpoint,
    DEFAULT_MAX_QUERIES_PER_ENDPOINT,
    1
  );
  const maxSplitLevels = parsePositiveInteger(
    options.maxSplitLevels,
    DEFAULT_MAX_SPLIT_LEVELS,
    0
  );
  const delayBetweenQueriesMs = parsePositiveInteger(
    options.delayBetweenQueriesMs,
    DEFAULT_DELAY_BETWEEN_QUERIES_MS,
    0
  );

  repository.init();
  repository.beginRun(
    runId,
    startedAt,
    asJsonString({
      endpoints: endpoints.map((endpoint) => endpoint.endpoint),
      maxQueriesPerEndpoint,
      maxSplitLevels,
      delayBetweenQueriesMs,
      queryCap: DEFAULT_QUERY_CAP,
    })
  );

  try {
    await syncClient.start();

    const endpointSummaries: MegaSearchEndpointSyncSummary[] = [];
    for (const endpointConfig of endpoints) {
      endpointSummaries.push(
        await crawlEndpoint({
          endpointConfig,
          runId,
          repository,
          syncClient,
          maxQueriesPerEndpoint,
          maxSplitLevels,
          delayBetweenQueriesMs,
          onProgress: options.onProgress,
        })
      );
    }

    const finishedAt = new Date().toISOString();
    const summary: MegaSearchRunSummary = {
      runId,
      startedAt,
      finishedAt,
      endpointSummaries,
      queriedCount: endpointSummaries.reduce(
        (acc, current) => acc + current.queriedCount,
        0
      ),
      failedQueries: endpointSummaries.reduce(
        (acc, current) => acc + current.failedQueries,
        0
      ),
      cappedQueries: endpointSummaries.reduce(
        (acc, current) => acc + current.cappedQueries,
        0
      ),
      fetchedRows: endpointSummaries.reduce(
        (acc, current) => acc + current.fetchedRows,
        0
      ),
      insertedRecords: endpointSummaries.reduce(
        (acc, current) => acc + current.insertedRecords,
        0
      ),
      updatedRecords: endpointSummaries.reduce(
        (acc, current) => acc + current.updatedRecords,
        0
      ),
      unchangedRecords: endpointSummaries.reduce(
        (acc, current) => acc + current.unchangedRecords,
        0
      ),
    };

    repository.finishRun(runId, finishedAt, {
      queriedCount: summary.queriedCount,
      failedQueries: summary.failedQueries,
      cappedQueries: summary.cappedQueries,
      fetchedRows: summary.fetchedRows,
      insertedRecords: summary.insertedRecords,
      updatedRecords: summary.updatedRecords,
      unchangedRecords: summary.unchangedRecords,
    });

    return summary;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message =
      error instanceof Error ? error.message : "Unknown MegaSearch failure";
    repository.failRun(runId, finishedAt, message);
    throw error;
  } finally {
    await syncClient.close();
  }
}
