import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  runMegaSearchExportCli,
  runMegaSearchSyncCli,
} from "./src/cli-megasearch";
import { AzdeqCgpClient } from "./src/client";
import { COUNTY_NAME_BY_CODE } from "./src/constants";
import { MEGASEARCH_SPLIT_PLAN } from "./src/megasearch-constants";
import { CgpSqliteRepository } from "./src/sqlite-repo";
import { runCgpCountySync, runCgpLtfIdRangeSync } from "./src/sync";
import type { CgpPermitRecord } from "./src/types";

const DEFAULT_DB_PATH = "packages/azdeq-cgp-sync/.data/azdeq-cgp-sync.sqlite";
const DEFAULT_SAMPLE_OUTPUT_DIR =
  "packages/azdeq-cgp-sync/research/noi-type-samples";
const DEFAULT_MEGASEARCH_OUTPUT_DIR =
  "packages/azdeq-cgp-sync/research/megasearch";
const DEFAULT_MEGASEARCH_MAX_SPLIT_LEVELS = MEGASEARCH_SPLIT_PLAN.length;
const DEFAULT_LTFID_START = 1;
const DEFAULT_LTFID_FALLBACK_END = 120_000;
const DEFAULT_TAIL_PADDING = 2000;
const US_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const LTFID_MAX_DISCOVERY_PROBES: ReadonlyArray<{
  label: string;
  query: { companyname?: string; facilityname?: string };
}> = [
  { label: "company:llc", query: { companyname: "llc" } },
  { label: "company:arizona", query: { companyname: "arizona" } },
  { label: "company:district", query: { companyname: "district" } },
  { label: "company:development", query: { companyname: "development" } },
  { label: "company:city", query: { companyname: "city" } },
  { label: "facility:phase", query: { facilityname: "phase" } },
  { label: "facility:road", query: { facilityname: "road" } },
  { label: "facility:lot", query: { facilityname: "lot" } },
  { label: "facility:school", query: { facilityname: "school" } },
  { label: "facility:solar", query: { facilityname: "solar" } },
  { label: "facility:station", query: { facilityname: "station" } },
];

interface ProbeResult {
  maxLtfId: number | null;
  records: number;
  source: string;
}

interface ResolvedLtfIdRange {
  autoRange: {
    discoveredMaxLtfId: number | null;
    endId: number;
    existingDbMaxLtfId: number | null;
    startId: number;
  } | null;
  endId: number;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function readFlag(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function readFlags(flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  }
  return values;
}

function parseUsDate(input: string | null | undefined): number {
  if (!input) {
    return Number.NEGATIVE_INFINITY;
  }

  const match = input.match(US_DATE_RE);
  if (!match) {
    return Number.NEGATIVE_INFINITY;
  }

  const [, month, day, year] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function parsePositiveIntegerFlag(
  flag: string,
  defaultValue: number
): number | null {
  const value = Number(readFlag(flag) ?? `${defaultValue}`);
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function sanitizeFilename(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

  return normalized || "unknown";
}

function printUsage(): void {
  console.log(`
Usage:
  bun packages/azdeq-cgp-sync/cli.ts sync [--db <path>] [--county <code> ...] [--delay-ms <n>]
  bun packages/azdeq-cgp-sync/cli.ts sync-ltf-range [--db <path>] [--start-id <n>] [--end-id <n>] [--tail-padding <n>] [--concurrency <n>] [--progress-every <n>]
  bun packages/azdeq-cgp-sync/cli.ts megasearch-sync [--db <path>] [--endpoint <name> ...] [--max-queries <n>] [--max-split-levels <n>] [--delay-ms <n>] [--headful]
  bun packages/azdeq-cgp-sync/cli.ts megasearch-export [--db <path>] [--per-endpoint <n>] [--out-dir <dir>]
  bun packages/azdeq-cgp-sync/cli.ts latest [--db <path>] [--limit <n>] [--out <file>]
  bun packages/azdeq-cgp-sync/cli.ts full --ltf-id <id> [--db <path>] [--out <file>]
  bun packages/azdeq-cgp-sync/cli.ts sample-types [--db <path>] [--per-type <n>] [--out-dir <dir>]
  bun packages/azdeq-cgp-sync/cli.ts fetch-ltf --ltf-id <id> [--out <file>]
`);
}

function parseNumericLtfId(record: CgpPermitRecord): number | null {
  const parsed = Number(record.ltfIdno);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

async function discoverLikelyMaxLtfId(client: AzdeqCgpClient): Promise<{
  maxLtfId: number | null;
  probeResults: ProbeResult[];
}> {
  const probeResults: ProbeResult[] = [];
  let discoveredMax = 0;

  for (const probe of LTFID_MAX_DISCOVERY_PROBES) {
    try {
      const records = await client.fetchPermits(probe.query);
      let probeMax = 0;
      for (const record of records) {
        const numericId = parseNumericLtfId(record);
        if (numericId && numericId > probeMax) {
          probeMax = numericId;
        }
      }

      if (probeMax > discoveredMax) {
        discoveredMax = probeMax;
      }

      probeResults.push({
        source: probe.label,
        records: records.length,
        maxLtfId: probeMax > 0 ? probeMax : null,
      });
    } catch {
      probeResults.push({
        source: probe.label,
        records: 0,
        maxLtfId: null,
      });
    }
  }

  return {
    maxLtfId: discoveredMax > 0 ? discoveredMax : null,
    probeResults,
  };
}

async function resolveLtfIdRange(
  dbPath: string,
  startId: number,
  explicitEndId: string | null,
  tailPadding: number
): Promise<ResolvedLtfIdRange> {
  const endIdCandidate = explicitEndId ? Number(explicitEndId) : Number.NaN;
  if (Number.isInteger(endIdCandidate) && endIdCandidate > 0) {
    return {
      endId: endIdCandidate,
      autoRange: null,
    };
  }

  const repository = new CgpSqliteRepository(dbPath);
  repository.init();
  const bounds = repository.getNumericLtfIdBounds();

  const client = new AzdeqCgpClient();
  const discovery = await discoverLikelyMaxLtfId(client);
  const existingDbMaxLtfId = bounds.maxId;
  const discoveredMaxLtfId = discovery.maxLtfId;
  const autoEndBase = Math.max(
    startId,
    existingDbMaxLtfId ?? 0,
    discoveredMaxLtfId ?? 0
  );
  const safeTailPadding = Math.max(0, tailPadding);
  const endId =
    autoEndBase > 0
      ? autoEndBase + safeTailPadding
      : DEFAULT_LTFID_FALLBACK_END;

  console.log(
    JSON.stringify(
      {
        rangeDiscovery: {
          startId,
          existingDbMaxLtfId,
          discoveredMaxLtfId,
          tailPadding: safeTailPadding,
          computedEndId: endId,
          probes: discovery.probeResults,
        },
      },
      null,
      2
    )
  );

  return {
    endId,
    autoRange: {
      startId,
      existingDbMaxLtfId,
      discoveredMaxLtfId,
      endId,
    },
  };
}

async function runSync(): Promise<void> {
  const dbPath = resolve(readFlag("--db") ?? DEFAULT_DB_PATH);
  const counties = readFlags("--county");
  const delayMs = Number(readFlag("--delay-ms") ?? "300");

  const summary = await runCgpCountySync({
    dbPath,
    counties,
    delayBetweenCountiesMs: Number.isNaN(delayMs) ? 300 : delayMs,
  });

  console.log(JSON.stringify(summary, null, 2));
}

async function runSyncLtfRange(): Promise<void> {
  const dbPath = resolve(readFlag("--db") ?? DEFAULT_DB_PATH);
  const startId = parsePositiveIntegerFlag("--start-id", DEFAULT_LTFID_START);
  const explicitEndId = readFlag("--end-id");
  const tailPadding = parsePositiveIntegerFlag(
    "--tail-padding",
    DEFAULT_TAIL_PADDING
  );
  const concurrency = parsePositiveIntegerFlag("--concurrency", 8);
  const progressEvery = parsePositiveIntegerFlag("--progress-every", 500);

  if (!startId) {
    throw new Error("--start-id must be a positive integer");
  }
  if (!tailPadding) {
    throw new Error("--tail-padding must be a positive integer");
  }
  if (!concurrency) {
    throw new Error("--concurrency must be a positive integer");
  }
  if (!progressEvery) {
    throw new Error("--progress-every must be a positive integer");
  }

  const { endId, autoRange } = await resolveLtfIdRange(
    dbPath,
    startId,
    explicitEndId,
    tailPadding
  );
  if (endId < startId) {
    throw new Error("--end-id must be greater than or equal to --start-id");
  }

  const summary = await runCgpLtfIdRangeSync({
    dbPath,
    startId,
    endId,
    concurrency,
    progressEvery,
    onProgress: (requestedLtfIds, totalLtfIds) => {
      const percent = ((requestedLtfIds / totalLtfIds) * 100).toFixed(1);
      console.log(
        `[sync-ltf-range] ${requestedLtfIds}/${totalLtfIds} (${percent}%)`
      );
    },
  });

  console.log(
    JSON.stringify(
      {
        ...(autoRange ? { autoRange } : {}),
        summary,
      },
      null,
      2
    )
  );
}

async function runMegaSearchSyncCommand(): Promise<void> {
  const dbPath = resolve(readFlag("--db") ?? DEFAULT_DB_PATH);
  const endpointNames = readFlags("--endpoint");
  const maxQueries = parsePositiveIntegerFlag("--max-queries", 600);
  const maxSplitLevels = parsePositiveIntegerFlag(
    "--max-split-levels",
    DEFAULT_MEGASEARCH_MAX_SPLIT_LEVELS
  );
  const delayMs = parsePositiveIntegerFlag("--delay-ms", 100);
  const headless = !hasFlag("--headful");

  if (!maxQueries) {
    throw new Error("--max-queries must be a positive integer");
  }
  if (maxSplitLevels === null) {
    throw new Error("--max-split-levels must be a positive integer");
  }
  if (delayMs === null) {
    throw new Error("--delay-ms must be a positive integer");
  }

  await runMegaSearchSyncCli({
    dbPath,
    endpointNames,
    headless,
    maxQueries,
    maxSplitLevels,
    delayMs,
  });
}

async function runMegaSearchExport(): Promise<void> {
  const dbPath = resolve(readFlag("--db") ?? DEFAULT_DB_PATH);
  const outputDir = resolve(
    readFlag("--out-dir") ?? DEFAULT_MEGASEARCH_OUTPUT_DIR
  );
  const perEndpoint = parsePositiveIntegerFlag("--per-endpoint", 20);

  if (!perEndpoint) {
    throw new Error("--per-endpoint must be a positive integer");
  }

  await runMegaSearchExportCli({
    dbPath,
    outputDir,
    perEndpoint,
  });
}

async function runLatest(): Promise<void> {
  const dbPath = resolve(readFlag("--db") ?? DEFAULT_DB_PATH);
  const limit = Number(readFlag("--limit") ?? "15");
  const outFile = readFlag("--out");

  const repository = new CgpSqliteRepository(dbPath);
  repository.init();
  const records = repository.getLatest(
    Number.isNaN(limit) ? 15 : limit
  ) as unknown as CgpPermitRecord[];

  const rows = records.map((record) => {
    const countyCode =
      record.ltfFacilityDetails?.placeAddress?.address?.countyCode ??
      record.ltfFacilityDetails?.facilityCounty?.countyCode ??
      record.companyAddress?.address?.countyCode ??
      null;

    return {
      ltfIdno: record.ltfIdno,
      permitAuthCode: record.permitAuthCode,
      dateSubmitted: record.dateSubmitted,
      dateApplied: record.dateApplied,
      issuedDate: record.ltfFacilityDetails?.issuedDate ?? null,
      status: record.ltfFacilityDetails?.ltfStatus ?? null,
      facilityName: record.facilityName,
      companyName: record.companyName,
      countyCode,
      countyName: countyCode
        ? (COUNTY_NAME_BY_CODE.get(countyCode) ?? null)
        : null,
      permitProjectArea: record.permitProjectArea,
      conStartDate: record.conStartDate,
      conEndDate: record.conEndDate,
    };
  });

  if (outFile) {
    const resolved = resolve(outFile);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  }

  console.table(rows);
}

async function runFull(): Promise<void> {
  const ltfId = readFlag("--ltf-id");
  if (!ltfId) {
    throw new Error("--ltf-id is required for full command");
  }

  const dbPath = resolve(readFlag("--db") ?? DEFAULT_DB_PATH);
  const outFile = readFlag("--out");
  const repository = new CgpSqliteRepository(dbPath);
  repository.init();

  const record = repository.getByLtfId(ltfId);
  if (!record) {
    throw new Error(`No record found for ltfId ${ltfId}`);
  }

  const formatted = `${JSON.stringify(record, null, 2)}\n`;
  if (outFile) {
    const resolved = resolve(outFile);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, formatted, "utf8");
  }

  console.log(formatted);
}

async function runSampleTypes(): Promise<void> {
  const dbPath = resolve(readFlag("--db") ?? DEFAULT_DB_PATH);
  const perType = Number(readFlag("--per-type") ?? "20");
  const outputDir = resolve(readFlag("--out-dir") ?? DEFAULT_SAMPLE_OUTPUT_DIR);

  const repository = new CgpSqliteRepository(dbPath);
  repository.init();
  const records = repository.getAllRawRecords() as unknown as CgpPermitRecord[];

  const byType = new Map<string, CgpPermitRecord[]>();
  for (const record of records) {
    const type = record.ltfFacilityDetails?.ltfCatName ?? "(unknown-type)";
    const list = byType.get(type) ?? [];
    list.push(record);
    byType.set(type, list);
  }

  await mkdir(outputDir, { recursive: true });

  const summary: Array<{
    type: string;
    totalRecords: number;
    sampledRecords: number;
    file: string;
  }> = [];
  let fileIndex = 0;

  for (const [type, list] of Array.from(byType.entries())) {
    fileIndex += 1;
    list.sort(
      (left, right) =>
        parseUsDate(right.dateSubmitted) - parseUsDate(left.dateSubmitted)
    );
    const sample = list.slice(0, Number.isNaN(perType) ? 20 : perType);
    const filename = `${String(fileIndex).padStart(2, "0")}-${sanitizeFilename(type)}.json`;
    const filePath = `${outputDir}/${filename}`;

    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          type,
          totalRecords: list.length,
          sampledRecords: sample.length,
          records: sample,
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    summary.push({
      type,
      totalRecords: list.length,
      sampledRecords: sample.length,
      file: filename,
    });
  }

  summary.sort((left, right) => right.totalRecords - left.totalRecords);
  await writeFile(
    `${outputDir}/_summary.json`,
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );

  console.table(summary);
}

async function runFetchLtf(): Promise<void> {
  const ltfId = readFlag("--ltf-id");
  if (!ltfId) {
    throw new Error("--ltf-id is required for fetch-ltf command");
  }

  const outFile = readFlag("--out");
  const client = new AzdeqCgpClient();
  const records = await client.fetchByLtfId(ltfId);

  const output = `${JSON.stringify(records, null, 2)}\n`;
  if (outFile) {
    const resolved = resolve(outFile);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, output, "utf8");
  }

  console.log(output);
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command || hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  switch (command) {
    case "sync":
      await runSync();
      break;
    case "sync-ltf-range":
      await runSyncLtfRange();
      break;
    case "megasearch-sync":
      await runMegaSearchSyncCommand();
      break;
    case "megasearch-export":
      await runMegaSearchExport();
      break;
    case "latest":
      await runLatest();
      break;
    case "full":
      await runFull();
      break;
    case "sample-types":
      await runSampleTypes();
      break;
    case "fetch-ltf":
      await runFetchLtf();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(message);
  process.exit(1);
});
