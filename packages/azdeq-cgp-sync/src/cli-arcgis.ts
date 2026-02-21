import { mkdir, writeFile } from "node:fs/promises";
import { ARCGIS_LAYER_BY_KEY } from "./arcgis-constants";
import { ArcGisSqliteRepository } from "./arcgis-sqlite-repo";
import { runArcGisSync } from "./arcgis-sync";

interface RunArcGisSyncCliOptions {
  dbPath: string;
  delayMs: number;
  layerKeys: string[];
  pageSize: number;
}

interface RunArcGisExportCliOptions {
  dbPath: string;
  outputDir: string;
  perLayer: number;
}

function sanitizeFilename(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return normalized || "unknown";
}

export async function runArcGisSyncCli(
  options: RunArcGisSyncCliOptions
): Promise<void> {
  const summary = await runArcGisSync({
    dbPath: options.dbPath,
    layerKeys: options.layerKeys,
    delayBetweenPagesMs: options.delayMs,
    pageSize: options.pageSize,
    onProgress: (layerKey, fetchedRows, expectedCount) => {
      if (fetchedRows === 0 || fetchedRows % 1000 !== 0) {
        return;
      }
      const denominator = expectedCount > 0 ? expectedCount : fetchedRows;
      const percent = ((fetchedRows / denominator) * 100).toFixed(1);
      console.log(
        `[arcgis-sync:${layerKey}] ${fetchedRows}/${expectedCount} (${percent}%)`
      );
    },
  });

  console.log(JSON.stringify(summary, null, 2));
}

export async function runArcGisExportCli(
  options: RunArcGisExportCliOptions
): Promise<void> {
  const repository = new ArcGisSqliteRepository(options.dbPath);
  repository.init();

  await mkdir(options.outputDir, { recursive: true });
  const layerCounts = repository.getLayerCounts();
  const summary: Array<{
    file: string;
    key: string;
    sampledRecords: number;
    storedRecords: number;
  }> = [];

  for (const layer of layerCounts) {
    const key = `${layer.serviceName}:${layer.layerId}`;
    const records = repository.getLayerSamples(
      layer.serviceName,
      layer.layerId,
      options.perLayer
    );
    const layerLabel = ARCGIS_LAYER_BY_KEY.get(key)?.layerName ?? key;
    const filename = `${sanitizeFilename(`${key}-${layerLabel}`)}.json`;
    const filePath = `${options.outputDir}/${filename}`;

    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          key,
          layerName: layerLabel,
          storedRecords: layer.count,
          sampledRecords: records.length,
          records,
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    summary.push({
      key,
      storedRecords: layer.count,
      sampledRecords: records.length,
      file: filename,
    });
  }

  summary.sort((left, right) => right.storedRecords - left.storedRecords);
  await writeFile(
    `${options.outputDir}/_summary.json`,
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );
  console.table(summary);
}
