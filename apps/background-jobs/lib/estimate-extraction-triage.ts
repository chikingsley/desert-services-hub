import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "@lib/db/hub";
import { getItemAssets } from "@monday/client";
import { processItemFiles } from "@monday/sync/pipeline";

const ESTIMATE_COLUMN_ID = "file_mksebs2e";
let PDF_ANALYSIS_CWD = join(
  import.meta.dir,
  "../../../packages/documents/pdf-analysis-cli"
);
if (existsSync("/app/packages/documents/pdf-analysis-cli")) {
  PDF_ANALYSIS_CWD = "/app/packages/documents/pdf-analysis-cli";
}
if (process.env.PDF_ANALYSIS_CLI_CWD?.trim()) {
  PDF_ANALYSIS_CWD = process.env.PDF_ANALYSIS_CLI_CWD.trim();
}

type Classification = "estimate_like" | "non_estimate" | "unknown";

interface TriageRow {
  id: number;
  monday_item_id: string;
  name: string;
  extraction_status: string | null;
  extraction_error: string | null;
  monday_asset_id: string | null;
  file_name: string | null;
  file_extension: string | null;
  local_path: string | null;
}

export interface EstimateExtractionTriageOptions {
  provider?: string;
  maxRows?: number;
  includeNullNonPdf?: boolean;
  onlyUntaggedFailed?: boolean;
  log?: (line: string) => void;
}

export interface EstimateExtractionTriageResult {
  candidateRows: number;
  processedRows: number;
  fixedByRetry: number;
  markedNonEstimate: number;
  markedUnknown: number;
  markedNonPdf: number;
  retryStillFailed: number;
  skippedNoAsset: number;
}

const listFailedRows = db.query<TriageRow>(
  `select
     e.id,
     e.monday_item_id,
     e.name,
     e.extraction_status,
     e.extraction_error,
     a.monday_asset_id,
     a.file_name,
     a.file_extension,
     a.local_path
   from estimates e
   left join lateral (
     select monday_asset_id, file_name, file_extension, local_path, downloaded_at, id
     from monday_assets a
     where a.monday_item_id = e.monday_item_id
       and a.column_id = '${ESTIMATE_COLUMN_ID}'
     order by a.downloaded_at desc nulls last, a.id desc
     limit 1
   ) a on true
   where e.extraction_status = 'failed'
     and (? = 0 or coalesce(e.extraction_error, '') not like '[triage:%')
   order by e.extracted_at desc nulls last
   limit ?`
);

const listNullNonPdfRows = db.query<TriageRow>(
  `select
     e.id,
     e.monday_item_id,
     e.name,
     e.extraction_status,
     e.extraction_error,
     a.monday_asset_id,
     a.file_name,
     a.file_extension,
     a.local_path
   from estimates e
   join lateral (
     select monday_asset_id, file_name, file_extension, local_path, downloaded_at, id
     from monday_assets a
     where a.monday_item_id = e.monday_item_id
       and a.column_id = '${ESTIMATE_COLUMN_ID}'
     order by a.downloaded_at desc nulls last, a.id desc
     limit 1
   ) a on true
   where e.extraction_status is null
     and lower(coalesce(a.file_extension, '')) <> '.pdf'
   order by e.updated_at desc nulls last
   limit ?`
);

const markFailed = db.prepare(
  "UPDATE estimates SET extraction_status = 'failed', extraction_error = ?, extracted_at = now(), updated_at = now() WHERE id = ?"
);

const getEstimateStatus = db.query<{
  extraction_status: string | null;
  extraction_error: string | null;
}>("SELECT extraction_status, extraction_error FROM estimates WHERE id = ?");

function classifyFromOcrText(text: string): {
  kind: Classification;
  reason: string;
} {
  const lower = text.toLowerCase();

  const estimateSignals = [
    "estimate #",
    "estimate number",
    "swppp estimate for",
    "estimator",
    "job name",
    "subtotal required items",
    "additional services",
  ];

  const nonEstimateSignals = [
    "profit & loss detail",
    "location map",
    "bid drawings",
    "project contacts",
    "sheet index",
    "architectural",
    "civil",
    "detail sheet",
    "specifications",
  ];

  const estimateHits = estimateSignals.filter((signal) =>
    lower.includes(signal)
  );
  const nonEstimateHits = nonEstimateSignals.filter((signal) =>
    lower.includes(signal)
  );

  if (lower.includes("[ocr failed")) {
    return {
      kind: "unknown",
      reason: "OCR returned failure markers on preview pages",
    };
  }

  if (nonEstimateHits.length > 0 && estimateHits.length === 0) {
    return {
      kind: "non_estimate",
      reason: `non-estimate signals: ${nonEstimateHits.slice(0, 3).join(", ")}`,
    };
  }

  if (estimateHits.length >= 2 && nonEstimateHits.length === 0) {
    return {
      kind: "estimate_like",
      reason: `estimate signals: ${estimateHits.slice(0, 4).join(", ")}`,
    };
  }

  if (estimateHits.length >= 3) {
    return {
      kind: "estimate_like",
      reason: `estimate signals dominate (${estimateHits.length} hits)`,
    };
  }

  if (nonEstimateHits.length > 0) {
    return {
      kind: "non_estimate",
      reason: `non-estimate signals present: ${nonEstimateHits
        .slice(0, 3)
        .join(", ")}`,
    };
  }

  return {
    kind: "unknown",
    reason: "insufficient document signals from OCR preview",
  };
}

function buildErrorTag(
  tag: string,
  reason: string,
  previous: string | null | undefined
): string {
  const prev = previous?.trim()
    ? ` | prev=${previous.trim().slice(0, 260)}`
    : "";
  return `[triage:${tag}] ${reason}${prev}`;
}

async function runOcrPreview(
  pdfPath: string,
  provider: string
): Promise<{
  ok: boolean;
  text: string;
  error?: string;
}> {
  let uvBin = "uv";
  if (existsSync("/root/.local/bin/uv")) {
    uvBin = "/root/.local/bin/uv";
  }
  if (process.env.UV_BIN?.trim()) {
    uvBin = process.env.UV_BIN.trim();
  }

  const proc = Bun.spawn(
    [
      uvBin,
      "run",
      "-m",
      "pdf_analysis.cli",
      "ocr",
      pdfPath,
      "--provider",
      provider,
      "--pages",
      "1-2",
      "--format",
      "text",
    ],
    {
      cwd: PDF_ANALYSIS_CWD,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: process.env.PATH ?? "" },
    }
  );

  const timeout = setTimeout(() => proc.kill(), 180_000);
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  clearTimeout(timeout);

  if (exitCode !== 0) {
    return {
      ok: false,
      text: "",
      error: `ocr exit ${exitCode}: ${stderr.trim().slice(0, 280)}`,
    };
  }

  return { ok: true, text: stdout };
}

async function downloadAssetToTemp(
  mondayItemId: string,
  mondayAssetId: string,
  fallbackName: string
): Promise<string | null> {
  const assets = await getItemAssets(mondayItemId);
  const asset = assets.find((candidate) => candidate.id === mondayAssetId);
  if (!asset?.public_url) {
    return null;
  }

  const response = await fetch(asset.public_url);
  if (!response.ok) {
    return null;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const dir = mkdtempSync(join(tmpdir(), "estimate-triage-"));
  const path = join(dir, `${mondayAssetId}_${fallbackName}`);
  writeFileSync(path, bytes);
  return path;
}

type TriageOutcome =
  | "no_asset"
  | "asset_unavailable"
  | "non_pdf"
  | "ocr_failed"
  | "non_estimate"
  | "fixed_by_retry"
  | "retry_failed"
  | "unknown";

async function triageOneRow(
  row: TriageRow,
  provider: string,
  log: (line: string) => void
): Promise<TriageOutcome> {
  const label = `${row.monday_item_id} ${row.name}`;
  const extension = (row.file_extension ?? "").toLowerCase();

  if (!(row.monday_asset_id && row.file_name)) {
    await markFailed.run(
      buildErrorTag(
        "no_asset",
        "No estimate-column asset found for failed row",
        row.extraction_error
      ),
      row.id
    );
    log(`[triage] ${label}: no asset`);
    return "no_asset";
  }

  if (extension !== ".pdf") {
    await markFailed.run(
      buildErrorTag(
        "non_pdf",
        `Estimate column file is non-PDF (${row.file_name})`,
        row.extraction_error
      ),
      row.id
    );
    log(`[triage] ${label}: non-pdf (${row.file_name})`);
    return "non_pdf";
  }

  let probePath: string | null =
    row.local_path && existsSync(row.local_path) ? row.local_path : null;

  if (!probePath) {
    probePath = await downloadAssetToTemp(
      row.monday_item_id,
      row.monday_asset_id,
      row.file_name
    );
  }

  if (!probePath) {
    await markFailed.run(
      buildErrorTag(
        "asset_unavailable",
        "Could not access asset/public_url for OCR triage",
        row.extraction_error
      ),
      row.id
    );
    log(`[triage] ${label}: asset unavailable`);
    return "asset_unavailable";
  }

  const ocr = await runOcrPreview(probePath, provider);

  if (probePath !== row.local_path) {
    try {
      rmSync(probePath, { force: true });
    } catch {
      // no-op
    }
  }

  if (!ocr.ok) {
    await markFailed.run(
      buildErrorTag(
        "ocr_failed",
        ocr.error ?? "OCR preview failed",
        row.extraction_error
      ),
      row.id
    );
    log(`[triage] ${label}: ocr failed`);
    return "ocr_failed";
  }

  const classification = classifyFromOcrText(ocr.text);

  if (classification.kind === "non_estimate") {
    await markFailed.run(
      buildErrorTag(
        "non_estimate",
        classification.reason,
        row.extraction_error
      ),
      row.id
    );
    log(`[triage] ${label}: non-estimate (${classification.reason})`);
    return "non_estimate";
  }

  if (classification.kind === "estimate_like") {
    await processItemFiles(row.monday_item_id);
    const after = await getEstimateStatus.get(row.id);
    if (after?.extraction_status === "success") {
      log(`[triage] ${label}: retry succeeded`);
      return "fixed_by_retry";
    }
    await markFailed.run(
      buildErrorTag(
        "estimate_like_retry_failed",
        classification.reason,
        after?.extraction_error ?? row.extraction_error
      ),
      row.id
    );
    log(`[triage] ${label}: retry failed`);
    return "retry_failed";
  }

  await markFailed.run(
    buildErrorTag("unknown", classification.reason, row.extraction_error),
    row.id
  );
  log(`[triage] ${label}: unknown (${classification.reason})`);
  return "unknown";
}

function tallyTriageOutcome(
  outcome: TriageOutcome,
  result: EstimateExtractionTriageResult
): void {
  switch (outcome) {
    case "no_asset":
    case "asset_unavailable":
      result.skippedNoAsset++;
      break;
    case "non_pdf":
      result.markedNonPdf++;
      break;
    case "ocr_failed":
    case "unknown":
      result.markedUnknown++;
      break;
    case "non_estimate":
      result.markedNonEstimate++;
      break;
    case "fixed_by_retry":
      result.fixedByRetry++;
      break;
    case "retry_failed":
      result.retryStillFailed++;
      break;
    default:
      break;
  }
}

export async function runEstimateExtractionTriage(
  options?: EstimateExtractionTriageOptions
): Promise<EstimateExtractionTriageResult> {
  const provider = (options?.provider ?? "mistral").trim() || "mistral";
  const maxRows = Number.isFinite(options?.maxRows)
    ? Math.max(1, Number(options?.maxRows))
    : 10;
  const onlyUntaggedFailed = options?.onlyUntaggedFailed ?? true;
  const includeNullNonPdf = options?.includeNullNonPdf ?? true;
  const log = options?.log ?? console.log;

  const failedRows = await listFailedRows.all(
    onlyUntaggedFailed ? 1 : 0,
    maxRows
  );
  const rows: TriageRow[] = [...failedRows];

  if (includeNullNonPdf && rows.length < maxRows) {
    const remaining = maxRows - rows.length;
    const nullRows = await listNullNonPdfRows.all(remaining);
    const seen = new Set(rows.map((row) => row.id));
    for (const row of nullRows) {
      if (!seen.has(row.id)) {
        rows.push(row);
      }
    }
  }

  if (rows.length > 0) {
    log(`[triage] candidate rows=${rows.length} provider=${provider}`);
  }

  const result: EstimateExtractionTriageResult = {
    candidateRows: rows.length,
    processedRows: rows.length,
    fixedByRetry: 0,
    markedNonEstimate: 0,
    markedUnknown: 0,
    markedNonPdf: 0,
    retryStillFailed: 0,
    skippedNoAsset: 0,
  };

  for (const row of rows) {
    const outcome = await triageOneRow(row, provider, log);
    tallyTriageOutcome(outcome, result);
  }

  return result;
}
