/**
 * Build a deterministic alignment report for source-packet candidates.
 *
 * Compares fields extracted from selected source attachments against
 * canonical ground-truth rows in CANONICAL_DOCS.tsv.
 *
 * Usage:
 *   bun packages/narratives/scripts/narrative_inventory/report-packet-alignment.ts
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { csvEscape, normalizeText } from "./shared";

const DEFAULT_CANONICAL_DOCS =
  "packages/narratives/workflows/eva-jayson-variable-inventory/artifacts/CANONICAL_DOCS.tsv";
const DEFAULT_PAIRS_JSON =
  "packages/narratives/data/intake/eva-to-jayson/source-packets/pairs.json";
const DEFAULT_OUTPUT_DIR =
  "packages/narratives/data/intake/eva-to-jayson/source-packets";
const MDY_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERMIT_NUMBER_PATTERN = /(?:^|[^\d])(\d{6})(?:[^\d]|$)/;

const FIELD_KEYS = [
  "project.name",
  "project.address_line1",
  "operator.company",
  "dates.swppp_preparation_date",
  "permit.number_best_effort",
] as const;

type FieldKey = (typeof FIELD_KEYS)[number];
type CanonicalRow = Record<string, string>;

interface PairRow {
  doc_id: string;
  packet_id: string;
  narrative_email_id: number;
  project_name: string;
  permit_number: string;
  noi?: { selectedAttachment?: string; selected_attachment?: string };
  estimate?: { selectedAttachment?: string; selected_attachment?: string };
}

interface EstimateHeader {
  estimate_number?: string;
  revision?: string | null;
  date?: string;
  gc_name?: string;
  gc_address?: string;
  job_name?: string;
  job_address?: string;
  estimator?: string;
}

interface EstimateExtractionResult {
  header?: EstimateHeader;
}

interface NoiExtractionResult {
  permitId?: string | null;
  permit_id?: string | null;
}

interface PairEvalResult {
  comparisons: {
    field: FieldKey;
    expected: string;
    actual: string;
    ok: boolean;
  }[];
  hasEstimate: boolean;
  hasNoiPermit: boolean;
}

// --- Normalization helpers ---

function normalizePermit(value: string): string {
  return value.replaceAll(/\D+/g, "");
}

function normalizeDateMMDDYYYY(value: string): string {
  const raw = value.trim();
  if (!raw) {
    return "";
  }
  const mdy = raw.match(MDY_DATE_PATTERN);
  if (mdy) {
    const mm = mdy[1]?.padStart(2, "0");
    const dd = mdy[2]?.padStart(2, "0");
    const yyyy = mdy[3];
    if (!yyyy) {
      return raw;
    }
    return `${mm}/${dd}/${yyyy}`;
  }
  const iso = raw.match(ISO_DATE_PATTERN);
  if (iso) {
    return `${iso[2]}/${iso[3]}/${iso[1]}`;
  }
  return raw;
}

function fieldsEqual(
  field: FieldKey,
  expected: string,
  actual: string
): boolean {
  if (field === "permit.number_best_effort") {
    return normalizePermit(expected) === normalizePermit(actual);
  }
  if (field === "dates.swppp_preparation_date") {
    return normalizeDateMMDDYYYY(expected) === normalizeDateMMDDYYYY(actual);
  }
  return normalizeText(expected) === normalizeText(actual);
}

// --- Data loading ---

function parseCanonicalRows(tsvPath: string): Map<string, CanonicalRow> {
  const text = readFileSync(tsvPath, "utf8");
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return new Map();
  }
  const header = lines[0]?.split("\t");
  const rows = new Map<string, CanonicalRow>();
  for (const line of lines.slice(1)) {
    const cols = line.split("\t");
    const row: CanonicalRow = {};
    for (let i = 0; i < header.length; i++) {
      const columnName = header[i];
      if (!columnName) {
        continue;
      }
      row[columnName] = cols[i] ?? "";
    }
    const docId = row.doc_id ?? "";
    if (docId) {
      rows.set(docId, row);
    }
  }
  return rows;
}

function parsePermitFromNoiName(name: string | undefined): string {
  if (!name) {
    return "";
  }
  const m = name.match(PERMIT_NUMBER_PATTERN);
  return m?.[1] ?? "";
}

function parsePairs(path: string): PairRow[] {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new TypeError(`Expected array in ${path}`);
  }
  return parsed as PairRow[];
}

// --- PDF extraction runners ---

function runEstimateExtract(pdfPath: string): EstimateExtractionResult | null {
  if (!existsSync(pdfPath)) {
    return null;
  }
  const absolutePdfPath = resolve(pdfPath);
  const proc = Bun.spawnSync({
    cmd: [
      "uv",
      "run",
      "--directory",
      "packages/documents/pdf-analysis-cli",
      "pdf-analysis",
      "estimate",
      absolutePdfPath,
      "--format",
      "json",
    ],
    stderr: "pipe",
    stdout: "pipe",
  });
  if (proc.exitCode !== 0) {
    return null;
  }
  const stdout = Buffer.from(proc.stdout).toString("utf8").trim();
  if (!stdout) {
    return null;
  }
  try {
    return JSON.parse(stdout) as EstimateExtractionResult;
  } catch {
    return null;
  }
}

function runNoiExtract(pdfPath: string): string | null {
  if (!existsSync(pdfPath)) {
    return null;
  }
  const absolutePdfPath = resolve(pdfPath);
  const textProc = Bun.spawnSync({
    cmd: [
      "uv",
      "run",
      "--directory",
      "packages/documents/pdf-analysis-cli",
      "pdf-analysis",
      "text",
      absolutePdfPath,
      "--format",
      "text",
    ],
    stderr: "pipe",
    stdout: "pipe",
  });
  if (textProc.exitCode !== 0) {
    return null;
  }
  const text = Buffer.from(textProc.stdout).toString("utf8").trim();
  if (!text) {
    return null;
  }
  const tempTextPath = join(
    tmpdir(),
    `noi-align-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`
  );
  try {
    writeFileSync(tempTextPath, text, "utf8");
    const noiProc = Bun.spawnSync({
      cmd: [
        "uv",
        "run",
        "--directory",
        "packages/documents/pdf-analysis-cli",
        "pdf-analysis",
        "noi",
        tempTextPath,
        "--format",
        "json",
      ],
      stderr: "pipe",
      stdout: "pipe",
    });
    if (noiProc.exitCode !== 0) {
      return null;
    }
    const stdout = Buffer.from(noiProc.stdout).toString("utf8").trim();
    if (!stdout) {
      return null;
    }
    const parsed = JSON.parse(stdout) as NoiExtractionResult;
    const permit = (parsed.permitId ?? parsed.permit_id ?? "").trim();
    return permit || null;
  } catch {
    return null;
  } finally {
    if (existsSync(tempTextPath)) {
      unlinkSync(tempTextPath);
    }
  }
}

function buildExtractedValues(params: {
  estimateHeader: EstimateHeader | null;
  noiPermitNumber: string;
}): Record<FieldKey, string> {
  const h = params.estimateHeader;
  return {
    "dates.swppp_preparation_date": h?.date?.trim() ?? "",
    "operator.company": h?.gc_name?.trim() ?? "",
    "permit.number_best_effort": params.noiPermitNumber.trim(),
    "project.address_line1": h?.job_address?.trim() ?? "",
    "project.name": h?.job_name?.trim() ?? "",
  };
}

// --- Per-pair evaluation ---

function evaluateOnePair(params: {
  pair: PairRow;
  row: CanonicalRow;
  estimateCache: Map<string, EstimateHeader | null>;
  noiPermitCache: Map<string, string | null>;
}): PairEvalResult | null {
  const packetJsonPath = join(
    DEFAULT_OUTPUT_DIR,
    params.pair.packet_id,
    "packet.json"
  );
  if (!existsSync(packetJsonPath)) {
    return null;
  }

  const packet = JSON.parse(readFileSync(packetJsonPath, "utf8")) as {
    selected?: {
      noi?: { attachment_name?: string; downloaded_path?: string | null };
      estimate?: {
        attachment_name?: string;
        downloaded_path?: string | null;
      };
    };
  };

  const estimatePath = packet.selected?.estimate?.downloaded_path ?? null;
  const noiPath = packet.selected?.noi?.downloaded_path ?? null;
  const noiAttachmentName =
    packet.selected?.noi?.attachment_name ??
    params.pair.noi?.selectedAttachment ??
    "";

  let estimateHeader: EstimateHeader | null = null;
  if (estimatePath && existsSync(estimatePath)) {
    if (params.estimateCache.has(estimatePath)) {
      estimateHeader = params.estimateCache.get(estimatePath) ?? null;
    } else {
      const estimateExtract = runEstimateExtract(estimatePath);
      estimateHeader = estimateExtract?.header ?? null;
      params.estimateCache.set(estimatePath, estimateHeader);
    }
  }

  let noiPermitNumber = parsePermitFromNoiName(noiAttachmentName);
  let hasNoiPermit = false;
  if (noiPath && existsSync(noiPath)) {
    if (!params.noiPermitCache.has(noiPath)) {
      params.noiPermitCache.set(noiPath, runNoiExtract(noiPath));
    }
    const extractedNoiPermit = params.noiPermitCache.get(noiPath) ?? null;
    if (extractedNoiPermit) {
      noiPermitNumber = extractedNoiPermit;
      hasNoiPermit = true;
    }
  }

  const extracted = buildExtractedValues({ estimateHeader, noiPermitNumber });
  const comparisons = FIELD_KEYS.map((field) => {
    const expected = (params.row[field] ?? "").trim();
    const actual = (extracted[field] ?? "").trim();
    return {
      actual,
      expected,
      field,
      ok: fieldsEqual(field, expected, actual),
    };
  });

  return { comparisons, hasEstimate: Boolean(estimateHeader), hasNoiPermit };
}

// --- Report writers ---

function writeAlignmentReport(params: {
  fieldStats: Map<FieldKey, { matches: number; total: number }>;
  docsWithCanonical: number;
  docsWithEstimate: number;
  docsWithNoiPermit: number;
}): void {
  const fieldRows = FIELD_KEYS.map((field) => {
    const stat = params.fieldStats.get(field);
    if (!stat) {
      return "";
    }
    const rate =
      stat.total > 0 ? ((100 * stat.matches) / stat.total).toFixed(1) : "0.0";
    return `| ${field} | ${stat.matches} | ${stat.total} | ${rate}% |`;
  })
    .filter(Boolean)
    .join("\n");

  const md = `# Source Packet Alignment Report

- Canonical rows evaluated: ${params.docsWithCanonical}
- Rows with parseable estimate PDF: ${params.docsWithEstimate}
- Rows with parseable NOI permit: ${params.docsWithNoiPermit}
- Generated: ${new Date().toISOString()}

## Field Match Rates

| Field | Matches | Total | Rate |
| --- | ---: | ---: | ---: |
${fieldRows}

## Notes

- This report uses deterministic estimate parsing + NOI extraction (fallback: NOI filename permit token).
- Storm plan PDF extraction is not included in this first pass.
- Use \`alignment.csv\` for row-level mismatch triage.
`;

  writeFileSync(join(DEFAULT_OUTPUT_DIR, "alignment.md"), md, "utf8");
}

function accumulateComparisons(params: {
  result: PairEvalResult;
  pair: PairRow;
  fieldStats: Map<FieldKey, { matches: number; total: number }>;
  csvLines: string[];
}): void {
  for (const c of params.result.comparisons) {
    const stat = params.fieldStats.get(c.field);
    if (!stat) {
      continue;
    }
    stat.total += 1;
    if (c.ok) {
      stat.matches += 1;
    }
    params.csvLines.push(
      [
        csvEscape(params.pair.doc_id),
        csvEscape(params.pair.packet_id),
        String(params.pair.narrative_email_id),
        c.field,
        c.ok ? "1" : "0",
        csvEscape(c.expected),
        csvEscape(c.actual),
      ].join(",")
    );
  }
}

// --- Main ---

function main(): void {
  const canonical = parseCanonicalRows(DEFAULT_CANONICAL_DOCS);
  const pairs = parsePairs(DEFAULT_PAIRS_JSON);

  const estimateCache = new Map<string, EstimateHeader | null>();
  const noiPermitCache = new Map<string, string | null>();

  const csvLines: string[] = [];
  csvLines.push(
    [
      "doc_id",
      "packet_id",
      "narrative_email_id",
      "field",
      "match",
      "expected",
      "actual",
    ].join(",")
  );

  const fieldStats = new Map<FieldKey, { matches: number; total: number }>();
  for (const key of FIELD_KEYS) {
    fieldStats.set(key, { matches: 0, total: 0 });
  }

  let docsWithCanonical = 0;
  let docsWithEstimate = 0;
  let docsWithNoiPermit = 0;

  for (const pair of pairs) {
    const row = canonical.get(pair.doc_id);
    if (!row) {
      continue;
    }
    docsWithCanonical += 1;

    const result = evaluateOnePair({
      estimateCache,
      noiPermitCache,
      pair,
      row,
    });
    if (!result) {
      continue;
    }
    if (result.hasEstimate) {
      docsWithEstimate += 1;
    }
    if (result.hasNoiPermit) {
      docsWithNoiPermit += 1;
    }
    accumulateComparisons({ csvLines, fieldStats, pair, result });
  }
  csvLines.push("");

  writeFileSync(
    join(DEFAULT_OUTPUT_DIR, "alignment.csv"),
    csvLines.join("\n"),
    "utf8"
  );

  writeAlignmentReport({
    docsWithCanonical,
    docsWithEstimate,
    docsWithNoiPermit,
    fieldStats,
  });

  console.log(`Wrote ${join(DEFAULT_OUTPUT_DIR, "alignment.csv")}`);
  console.log(`Wrote ${join(DEFAULT_OUTPUT_DIR, "alignment.md")}`);
}

main();
