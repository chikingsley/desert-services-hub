import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DustApplicationDetailQAResult } from "../../apps/aqdata-worker/src/aqdata/parsers/dust-application-detail-qa";
import type { DustAppStatus } from "../../apps/aqdata-worker/src/aqdata/types";

export type RunMode = "existing" | "rescrape-all" | "rescrape-missing";
export type RowSource = "existing" | "rescraped";

interface CounterEntry {
  count: number;
  key: string;
}

interface RuleCounterEntry extends CounterEntry {
  severity: "error" | "warn";
}

export interface CliOptions {
  dryRun: boolean;
  ids: string[];
  limit: number;
  mode: RunMode;
  offset: number;
  outputPath?: string;
  retryAttempts: number;
  retryBackoffMs: number;
  rescrapeTimeoutMs: number;
  statuses: DustAppStatus[];
}

export interface PermitRow {
  detail_html: string | null;
  id: string;
  status: string | null;
}

export interface PermitAuditRow {
  error?: string;
  id: string;
  optionalCoverage?: number;
  passed?: boolean;
  qa?: DustApplicationDetailQAResult;
  requiredCoverage?: number;
  source: RowSource;
  status: string | null;
}

const VALID_STATUSES: readonly DustAppStatus[] = [
  "Active",
  "Closed",
  "Rejected",
  "Submitted",
  "Superseded",
];

const PERMIT_ID_REGEX = /^D\d{7}$/i;

export function parseArgs(argv: string[]): CliOptions {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelpAndExit();
  }

  const raw = new Map<string, string | true>();
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq === -1) {
      raw.set(arg.slice(2), true);
      continue;
    }
    raw.set(arg.slice(2, eq), arg.slice(eq + 1));
  }

  const mode = parseMode(readString(raw, "mode") ?? "rescrape-missing");
  const statuses = parseStatuses(readString(raw, "status"));
  const ids = parseIds(readString(raw, "ids"));

  return {
    dryRun: readBool(raw, "dry-run", false),
    ids,
    limit: readInt(raw, "limit", 25, 1),
    mode,
    offset: readInt(raw, "offset", 0, 0),
    outputPath: readString(raw, "output"),
    retryAttempts: readInt(raw, "retry-attempts", 3, 1),
    retryBackoffMs: readInt(raw, "retry-backoff-ms", 1500, 0),
    rescrapeTimeoutMs: readInt(raw, "rescrape-timeout-ms", 45_000, 5000),
    statuses,
  };
}

export function buildReport(options: CliOptions, results: PermitAuditRow[]) {
  const evaluated = results.filter((row) => row.qa !== undefined);
  const passed = evaluated.filter((row) => row.passed).length;
  const failed = evaluated.length - passed;
  const errors = results.filter((row) => row.error).length;
  const rescraped = results.filter((row) => row.source === "rescraped").length;
  const existing = results.filter((row) => row.source === "existing").length;

  const requiredCoverageAvg =
    evaluated.length > 0
      ? Number(
          (
            evaluated.reduce(
              (sum, row) => sum + (row.requiredCoverage ?? 0),
              0
            ) / evaluated.length
          ).toFixed(4)
        )
      : 0;
  const optionalCoverageAvg =
    evaluated.length > 0
      ? Number(
          (
            evaluated.reduce(
              (sum, row) => sum + (row.optionalCoverage ?? 0),
              0
            ) / evaluated.length
          ).toFixed(4)
        )
      : 0;

  const missingRequiredCounter = new Map<string, number>();
  const missingOptionalCounter = new Map<string, number>();
  const ruleFailureCounter = new Map<
    string,
    { count: number; severity: "error" | "warn" }
  >();
  const schemaIssueCounter = new Map<string, number>();

  for (const row of evaluated) {
    const qa = row.qa;
    if (!qa) {
      continue;
    }
    for (const field of qa.missingRequired) {
      incrementCounter(missingRequiredCounter, field);
    }
    for (const field of qa.missingOptional) {
      incrementCounter(missingOptionalCounter, field);
    }
    for (const failure of qa.ruleFailures) {
      const current = ruleFailureCounter.get(failure.id);
      if (current) {
        current.count += 1;
      } else {
        ruleFailureCounter.set(failure.id, {
          count: 1,
          severity: failure.severity,
        });
      }
    }
    for (const issue of qa.schemaIssues) {
      incrementCounter(schemaIssueCounter, issue.id);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    options,
    results: results.map((row) => ({
      error: row.error,
      id: row.id,
      missingOptional: row.qa?.missingOptional ?? [],
      missingRequired: row.qa?.missingRequired ?? [],
      optionalCoverage: row.optionalCoverage,
      passed: row.passed,
      requiredCoverage: row.requiredCoverage,
      ruleFailures: row.qa?.ruleFailures ?? [],
      schemaIssues: row.qa?.schemaIssues ?? [],
      source: row.source,
      status: row.status,
    })),
    summary: {
      counts: {
        errors,
        evaluated: evaluated.length,
        existing,
        failed,
        passed,
        rescraped,
        selected: results.length,
      },
      coverage: {
        optionalAverage: optionalCoverageAvg,
        requiredAverage: requiredCoverageAvg,
      },
      topMissingOptional: topCounters(missingOptionalCounter, 20),
      topMissingRequired: topCounters(missingRequiredCounter, 20),
      topRuleFailures: topRuleCounters(ruleFailureCounter, 20),
      topSchemaIssues: topCounters(schemaIssueCounter, 20),
    },
  };
}

export function writeReport(report: unknown, outputPath?: string): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const resolvedPath =
    outputPath ??
    join("data", "aqdata", "qa", `aqdata-detail-qa-${timestamp}.json`);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  Bun.write(resolvedPath, `${JSON.stringify(report, null, 2)}\n`);
  return resolvedPath;
}

export function normalizeStatus(value: string | null): DustAppStatus | null {
  if (!value) {
    return null;
  }
  return VALID_STATUSES.includes(value as DustAppStatus)
    ? (value as DustAppStatus)
    : null;
}

export function buildStatusAttemptOrder(
  hint: DustAppStatus | null,
  fallbackOrder: readonly DustAppStatus[]
): readonly DustAppStatus[] {
  if (!hint) {
    return fallbackOrder;
  }
  const out: DustAppStatus[] = [hint];
  for (const status of fallbackOrder) {
    if (status !== hint) {
      out.push(status);
    }
  }
  return out;
}

export const DEFAULT_STATUS_SEARCH_ORDER: readonly DustAppStatus[] = [
  "Active",
  "Submitted",
  "Closed",
  "Superseded",
  "Rejected",
];

function parseStatuses(raw: string | undefined): DustAppStatus[] {
  if (!raw) {
    return [];
  }
  const parts = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return [];
  }
  const statuses: DustAppStatus[] = [];
  for (const part of parts) {
    if (!VALID_STATUSES.includes(part as DustAppStatus)) {
      throw new Error(
        `Invalid status '${part}'. Allowed: ${VALID_STATUSES.join(", ")}`
      );
    }
    statuses.push(part as DustAppStatus);
  }
  return statuses;
}

function parseIds(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  const ids = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  for (const id of ids) {
    if (!PERMIT_ID_REGEX.test(id)) {
      throw new Error(
        `Invalid permit ID '${id}'. Expected pattern D1234567 (7 digits).`
      );
    }
  }
  return ids;
}

function parseMode(raw: string): RunMode {
  if (
    raw === "existing" ||
    raw === "rescrape-missing" ||
    raw === "rescrape-all"
  ) {
    return raw;
  }
  throw new Error(
    "Invalid mode. Allowed: existing, rescrape-missing, rescrape-all."
  );
}

function incrementCounter(counter: Map<string, number>, key: string): void {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function topCounters(
  counter: Map<string, number>,
  limit: number
): CounterEntry[] {
  return [...counter.entries()]
    .map(([key, count]) => ({ count, key }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function topRuleCounters(
  counter: Map<string, { count: number; severity: "error" | "warn" }>,
  limit: number
): RuleCounterEntry[] {
  return [...counter.entries()]
    .map(([key, value]) => ({
      count: value.count,
      key,
      severity: value.severity,
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function readString(
  raw: Map<string, string | true>,
  key: string
): string | undefined {
  const value = raw.get(key);
  return typeof value === "string" ? value : undefined;
}

function readInt(
  raw: Map<string, string | true>,
  key: string,
  fallback: number,
  min: number
): number {
  const value = readString(raw, key);
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer for --${key}: ${value}`);
  }
  return Math.max(min, parsed);
}

function readBool(
  raw: Map<string, string | true>,
  key: string,
  fallback: boolean
): boolean {
  const value = raw.get(key);
  if (value === undefined) {
    return fallback;
  }
  if (value === true) {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean for --${key}: ${value}`);
}

function printHelpAndExit(): never {
  console.log(`AQData detail QA batch runner

Usage:
  bun scripts/aqdata/aqdata-detail-qa-batch.ts [options]

Options:
  --limit=25                 Number of permits to process
  --offset=0                 Offset for permit selection
  --status=Active,Closed     Filter statuses
  --ids=D0059617,D0058823    Explicit permit ID list
  --mode=rescrape-missing    existing | rescrape-missing | rescrape-all
  --dry-run                  Do not persist rescraped detail_html/detail_fields
  --retry-attempts=3         Retry attempts for no-detail/timeout cases
  --retry-backoff-ms=1500    Delay between retries (ms)
  --rescrape-timeout-ms=45000  Timeout per permit when live scraping
  --output=path.json         Output report path
  --help                     Show this help
`);
  process.exit(0);
}
