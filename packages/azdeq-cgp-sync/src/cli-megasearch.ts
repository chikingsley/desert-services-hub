import { mkdir, writeFile } from "node:fs/promises";
import { MEGASEARCH_ENDPOINTS } from "./megasearch-constants";
import { MegaSearchSqliteRepository } from "./megasearch-sqlite-repo";
import { runMegaSearchSync } from "./megasearch-sync";

interface RunMegaSearchSyncCliOptions {
  dbPath: string;
  delayMs: number;
  endpointNames: string[];
  headless: boolean;
  maxQueries: number;
  maxSplitLevels: number;
}

interface RunMegaSearchExportCliOptions {
  dbPath: string;
  outputDir: string;
  perEndpoint: number;
}

function sanitizeFilename(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

  return normalized || "unknown";
}

export async function runMegaSearchSyncCli(
  options: RunMegaSearchSyncCliOptions
): Promise<void> {
  const summary = await runMegaSearchSync({
    dbPath: options.dbPath,
    endpointNames: options.endpointNames,
    headless: options.headless,
    maxQueriesPerEndpoint: options.maxQueries,
    maxSplitLevels: options.maxSplitLevels,
    delayBetweenQueriesMs: options.delayMs,
    onProgress: (endpoint, queriedCount, maxQueriesPerEndpoint) => {
      const shouldLog =
        queriedCount === 1 ||
        queriedCount === maxQueriesPerEndpoint ||
        queriedCount % 25 === 0;
      if (!shouldLog) {
        return;
      }

      const percent = ((queriedCount / maxQueriesPerEndpoint) * 100).toFixed(1);
      console.log(
        `[megasearch-sync:${endpoint}] ${queriedCount}/${maxQueriesPerEndpoint} (${percent}%)`
      );
    },
  });

  console.log(JSON.stringify(summary, null, 2));
}

export async function runMegaSearchExportCli(
  options: RunMegaSearchExportCliOptions
): Promise<void> {
  const repository = new MegaSearchSqliteRepository(options.dbPath);
  repository.init();

  await mkdir(options.outputDir, { recursive: true });
  const endpointCounts = repository.getEndpointCounts();
  const summary: Array<{
    endpoint: string;
    file: string;
    label: string | null;
    sampledRecords: number;
    storedRecords: number;
  }> = [];

  for (const { endpoint, count } of endpointCounts) {
    const records = repository.getEndpointSamples(
      endpoint,
      options.perEndpoint
    );
    const filename = `${sanitizeFilename(endpoint)}.json`;
    const filePath = `${options.outputDir}/${filename}`;
    const endpointLabel =
      MEGASEARCH_ENDPOINTS.find((entry) => entry.endpoint === endpoint)
        ?.label ?? null;

    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          endpoint,
          label: endpointLabel,
          storedRecords: count,
          sampledRecords: records.length,
          records,
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    summary.push({
      endpoint,
      label: endpointLabel,
      sampledRecords: records.length,
      storedRecords: count,
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
