/**
 * Build a deterministic alignment report for source-packet candidates.
 *
 * This script compares fields extracted from selected source attachments against
 * canonical ground-truth rows in CANONICAL_DOCS.tsv.
 *
 * Current deterministic fields:
 * - project.name (from estimate header.job_name)
 * - project.address_line1 (from estimate header.job_address)
 * - operator.company (from estimate header.gc_name)
 * - dates.swppp_preparation_date (from estimate header.date)
 * - permit.number_best_effort (from NOI filename permit token)
 *
 * Usage:
 *   bun apps/narrative/scripts/narrative_inventory/report-packet-alignment.ts
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DEFAULT_CANONICAL_DOCS =
  "apps/narrative/workflows/eva-jayson-variable-inventory/artifacts/CANONICAL_DOCS.tsv";
const DEFAULT_PAIRS_JSON =
  "apps/narrative/data/intake/eva-to-jayson/source-packets/pairs.json";
const DEFAULT_OUTPUT_DIR =
  "apps/narrative/data/intake/eva-to-jayson/source-packets";
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

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePermit(value: string): string {
  const digits = value.replace(/\D+/g, "");
  return digits;
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
    throw new Error(`Expected array in ${path}`);
  }
  return parsed as PairRow[];
}

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
      "apps/cli-tools/pdf-analysis-cli",
      "pdf-analysis",
      "estimate",
      absolutePdfPath,
      "--format",
      "json",
    ],
    stdout: "pipe",
    stderr: "pipe",
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

function buildExtractedValues(params: {
  estimateHeader: EstimateHeader | null;
  noiAttachmentName: string;
}): Record<FieldKey, string> {
  const h = params.estimateHeader;
  return {
    "project.name": h?.job_name?.trim() ?? "",
    "project.address_line1": h?.job_address?.trim() ?? "",
    "operator.company": h?.gc_name?.trim() ?? "",
    "dates.swppp_preparation_date": h?.date?.trim() ?? "",
    "permit.number_best_effort": parsePermitFromNoiName(
      params.noiAttachmentName
    ),
  };
}

function main(): void {
  const canonical = parseCanonicalRows(DEFAULT_CANONICAL_DOCS);
  const pairs = parsePairs(DEFAULT_PAIRS_JSON);

  const estimateCache = new Map<string, EstimateHeader | null>();

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

  for (const pair of pairs) {
    const row = canonical.get(pair.doc_id);
    if (!row) {
      continue;
    }
    docsWithCanonical += 1;

    const packetJsonPath = join(
      DEFAULT_OUTPUT_DIR,
      pair.packet_id,
      "packet.json"
    );
    if (!existsSync(packetJsonPath)) {
      continue;
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
    const noiAttachmentName =
      packet.selected?.noi?.attachment_name ??
      pair.noi?.selectedAttachment ??
      "";

    let estimateHeader: EstimateHeader | null = null;
    if (estimatePath && existsSync(estimatePath)) {
      if (estimateCache.has(estimatePath)) {
        estimateHeader = estimateCache.get(estimatePath) ?? null;
      } else {
        const estimateExtract = runEstimateExtract(estimatePath);
        estimateHeader = estimateExtract?.header ?? null;
        estimateCache.set(estimatePath, estimateHeader);
      }
    }

    if (estimateHeader) {
      docsWithEstimate += 1;
    }

    const extracted = buildExtractedValues({
      estimateHeader,
      noiAttachmentName,
    });

    for (const field of FIELD_KEYS) {
      const expected = (row[field] ?? "").trim();
      const actual = (extracted[field] ?? "").trim();
      const ok = fieldsEqual(field, expected, actual);

      const stat = fieldStats.get(field);
      if (!stat) {
        continue;
      }
      stat.total += 1;
      if (ok) {
        stat.matches += 1;
      }

      csvLines.push(
        [
          csvEscape(pair.doc_id),
          csvEscape(pair.packet_id),
          String(pair.narrative_email_id),
          field,
          ok ? "1" : "0",
          csvEscape(expected),
          csvEscape(actual),
        ].join(",")
      );
    }
  }
  csvLines.push("");

  writeFileSync(
    join(DEFAULT_OUTPUT_DIR, "alignment.csv"),
    csvLines.join("\n"),
    "utf8"
  );

  const mdLines: string[] = [];
  mdLines.push("# Source Packet Alignment Report");
  mdLines.push("");
  mdLines.push(`- Canonical rows evaluated: ${docsWithCanonical}`);
  mdLines.push(`- Rows with parseable estimate PDF: ${docsWithEstimate}`);
  mdLines.push(`- Generated: ${new Date().toISOString()}`);
  mdLines.push("");
  mdLines.push("## Field Match Rates");
  mdLines.push("");
  mdLines.push("| Field | Matches | Total | Rate |");
  mdLines.push("| --- | ---: | ---: | ---: |");
  for (const field of FIELD_KEYS) {
    const stat = fieldStats.get(field);
    if (!stat) {
      continue;
    }
    const rate =
      stat.total > 0 ? ((100 * stat.matches) / stat.total).toFixed(1) : "0.0";
    mdLines.push(`| ${field} | ${stat.matches} | ${stat.total} | ${rate}% |`);
  }
  mdLines.push("");
  mdLines.push("## Notes");
  mdLines.push("");
  mdLines.push(
    "- This report currently uses deterministic estimate parsing + NOI filename permit parsing."
  );
  mdLines.push(
    "- Storm plan PDF extraction is not included in this first pass."
  );
  mdLines.push("- Use `alignment.csv` for row-level mismatch triage.");
  mdLines.push("");

  writeFileSync(
    join(DEFAULT_OUTPUT_DIR, "alignment.md"),
    `${mdLines.join("\n")}\n`,
    "utf8"
  );

  console.log(`Wrote ${join(DEFAULT_OUTPUT_DIR, "alignment.csv")}`);
  console.log(`Wrote ${join(DEFAULT_OUTPUT_DIR, "alignment.md")}`);
}

main();
