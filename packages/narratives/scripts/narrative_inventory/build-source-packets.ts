/**
 * Build source packets (NOI + SWPPP plan + estimate candidates) for narratives.
 *
 * This script:
 * 1) Reads canonical narrative rows from CANONICAL_DOCS.tsv
 * 2) Finds candidate source emails in Postgres using permit + project heuristics
 * 3) Optionally downloads selected attachments via Graph app auth
 *
 * Usage:
 *   bun packages/narratives/scripts/narrative_inventory/build-source-packets.ts --limit 20
 *   bun packages/narratives/scripts/narrative_inventory/build-source-packets.ts --limit 20 --download
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { csvEscape } from "./shared";
import {
  getNarrativeEmail,
  maybeDownloadPair,
  queryCandidates,
} from "./source-packet-data";
import type { Candidate, EmailRow } from "./source-packet-scoring";
import { chooseBestCandidate, tokeniseProject } from "./source-packet-scoring";

// ============================================================================
// Types
// ============================================================================

interface CanonicalRow {
  docId: string;
  emailId: number;
  fileName: string;
  projectName: string;
  permitNumber: string;
  operatorCompany: string;
}

interface Pair {
  row: CanonicalRow;
  narrativeEmail: EmailRow;
  noi: Candidate | null;
  plan: Candidate | null;
  estimate: Candidate | null;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CANONICAL_DOCS =
  "packages/narratives/workflows/eva-jayson-variable-inventory/artifacts/CANONICAL_DOCS.tsv";
const DEFAULT_OUTPUT_DIR =
  "packages/narratives/data/intake/eva-to-jayson/source-packets";

// ============================================================================
// Helpers
// ============================================================================

function parseDate(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hashString(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 8);
}

function packetFolderName(row: CanonicalRow): string {
  const key = row.docId || `${row.emailId}:${row.fileName}`;
  return `${row.emailId}-${hashString(key)}`;
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

// ============================================================================
// Canonical TSV parsing
// ============================================================================

function parseCanonicalRows(tsvPath: string): CanonicalRow[] {
  const text = readFileSync(tsvPath, "utf8");
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return [];
  }
  const header = lines[0]?.split("\t");
  const idx = (name: string): number => {
    const i = header.indexOf(name);
    if (i === -1) {
      throw new Error(`Missing canonical column: ${name}`);
    }
    return i;
  };

  const iDocId = idx("doc_id");
  const iEmailId = idx("email_id");
  const iFileName = idx("file_name");
  const iProject = idx("project.name");
  const iPermit = idx("permit.number_best_effort");
  const iOperator = idx("operator.company");

  const rows: CanonicalRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split("\t");
    const emailId = Number.parseInt(cols[iEmailId] ?? "", 10);
    if (!Number.isFinite(emailId)) {
      continue;
    }
    rows.push({
      docId: cols[iDocId] ?? "",
      emailId,
      fileName: cols[iFileName] ?? "",
      operatorCompany: cols[iOperator] ?? "",
      permitNumber: cols[iPermit] ?? "",
      projectName: cols[iProject] ?? "",
    });
  }
  return rows;
}

// ============================================================================
// Pair building
// ============================================================================

async function buildPair(row: CanonicalRow): Promise<Pair | null> {
  const narrativeEmail = await getNarrativeEmail(row.emailId);
  if (!narrativeEmail) {
    return null;
  }

  const narrativeReceivedAt = parseDate(narrativeEmail.received_at);
  if (!narrativeReceivedAt) {
    return null;
  }

  const projectTokens = tokeniseProject(row.projectName);
  const commonOpts = {
    narrativeReceivedAt,
    permitNumber: row.permitNumber,
    projectTokens,
  };

  const noiCandidates = await queryCandidates({ ...commonOpts, type: "noi" });
  const noi = chooseBestCandidate({
    ...commonOpts,
    candidates: noiCandidates,
    type: "noi",
  });

  const planCandidates = await queryCandidates({ ...commonOpts, type: "plan" });
  const plan = chooseBestCandidate({
    ...commonOpts,
    candidates: planCandidates,
    excludeAttachmentNames: new Set(
      noi?.selectedAttachment ? [noi.selectedAttachment.toLowerCase()] : []
    ),
    type: "plan",
  });

  const estimateCandidates = await queryCandidates({
    ...commonOpts,
    type: "estimate",
  });
  const estimate = chooseBestCandidate({
    ...commonOpts,
    candidates: estimateCandidates,
    type: "estimate",
  });

  return { estimate, narrativeEmail, noi, plan, row };
}

// ============================================================================
// Pair filtering
// ============================================================================

async function buildFilteredPairs(params: {
  rows: CanonicalRow[];
  limit: number;
  minNoiScore: number;
  minPlanScore: number;
}): Promise<Pair[]> {
  const pairs: Pair[] = [];
  for (const row of params.rows) {
    if (pairs.length >= params.limit) {
      break;
    }
    const pair = await buildPair(row);
    if (!(pair?.noi && pair.plan)) {
      continue;
    }
    if (
      pair.noi.score < params.minNoiScore ||
      pair.plan.score < params.minPlanScore
    ) {
      continue;
    }
    pairs.push(pair);
  }
  return pairs;
}

// ============================================================================
// Output writers
// ============================================================================

function writePairsCsv(
  outPath: string,
  pairs: Pair[],
  minEstimateScore: number
): void {
  const lines: string[] = [];
  lines.push(
    [
      "doc_id",
      "narrative_email_id",
      "packet_id",
      "project_name",
      "permit_number",
      "narrative_file",
      "noi_email_id",
      "noi_attachment",
      "noi_score",
      "noi_reason",
      "plan_email_id",
      "plan_attachment",
      "plan_score",
      "plan_reason",
      "estimate_email_id",
      "estimate_attachment",
      "estimate_score",
      "estimate_reason",
    ].join(",")
  );

  for (const pair of pairs) {
    const estimateOk =
      pair.estimate && pair.estimate.score >= minEstimateScore
        ? pair.estimate
        : null;
    lines.push(
      [
        csvEscape(pair.row.docId),
        String(pair.row.emailId),
        csvEscape(packetFolderName(pair.row)),
        csvEscape(pair.row.projectName),
        csvEscape(pair.row.permitNumber),
        csvEscape(pair.row.fileName),
        String(pair.noi?.email.id ?? ""),
        csvEscape(pair.noi?.selectedAttachment ?? ""),
        String(pair.noi?.score ?? ""),
        csvEscape(pair.noi?.reason ?? ""),
        String(pair.plan?.email.id ?? ""),
        csvEscape(pair.plan?.selectedAttachment ?? ""),
        String(pair.plan?.score ?? ""),
        csvEscape(pair.plan?.reason ?? ""),
        String(estimateOk?.email.id ?? ""),
        csvEscape(estimateOk?.selectedAttachment ?? ""),
        String(estimateOk?.score ?? ""),
        csvEscape(estimateOk?.reason ?? ""),
      ].join(",")
    );
  }
  lines.push("");
  writeFileSync(outPath, lines.join("\n"), "utf8");
}

function writePairsJson(outPath: string, pairs: Pair[]): void {
  const data = pairs.map((pair) => ({
    canonical_file_name: pair.row.fileName,
    doc_id: pair.row.docId,
    estimate: pair.estimate,
    narrative: pair.narrativeEmail,
    narrative_email_id: pair.row.emailId,
    noi: pair.noi,
    packet_id: packetFolderName(pair.row),
    permit_number: pair.row.permitNumber,
    plan: pair.plan,
    project_name: pair.row.projectName,
  }));
  writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

// ============================================================================
// Download
// ============================================================================

async function downloadAllPairs(pairs: Pair[], outDir: string): Promise<void> {
  for (const pair of pairs) {
    const packetId = packetFolderName(pair.row);
    await maybeDownloadPair({ outDir, packetId, pair });
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const { values } = parseArgs({
    allowPositionals: false,
    args: Bun.argv.slice(2),
    options: {
      input: { type: "string", default: DEFAULT_CANONICAL_DOCS },
      out: { type: "string", default: DEFAULT_OUTPUT_DIR },
      limit: { type: "string", default: "20" },
      download: { type: "boolean", default: false },
      minNoiScore: { type: "string", default: "80" },
      minPlanScore: { type: "string", default: "60" },
      minEstimateScore: { type: "string", default: "40" },
    },
  });

  const inputPath = String(values.input);
  const outDir = String(values.out);
  const limit = Math.max(1, Number.parseInt(String(values.limit), 10) || 20);
  const minNoiScore = Number.parseInt(String(values.minNoiScore), 10) || 80;
  const minPlanScore = Number.parseInt(String(values.minPlanScore), 10) || 60;
  const minEstimateScore =
    Number.parseInt(String(values.minEstimateScore), 10) || 40;
  const download = Boolean(values.download);

  ensureDir(outDir);
  const rows = parseCanonicalRows(inputPath);
  const pairs = await buildFilteredPairs({
    limit,
    minNoiScore,
    minPlanScore,
    rows,
  });

  writePairsCsv(join(outDir, "pairs.csv"), pairs, minEstimateScore);
  writePairsJson(join(outDir, "pairs.json"), pairs);

  if (download) {
    await downloadAllPairs(pairs, outDir);
  }

  console.log(
    `Built ${pairs.length} source pairs${download ? " and downloaded selected attachments" : ""}.`
  );
  console.log(`Output: ${outDir}`);
}

await main();
