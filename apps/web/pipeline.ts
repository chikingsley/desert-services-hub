/**
 * Monday File Download + Extraction Pipeline
 *
 * Downloads files from Monday.com items (Plans, Estimates, Contracts, NOI)
 * and runs PDF extraction on estimate files.
 *
 * Change detection: Compares Monday asset IDs against the monday_assets table.
 * Only downloads files we haven't seen before.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@lib/db/hub";
import { getItemAssets, getItemRich } from "@monday/client";
import { ESTIMATING_COLUMNS } from "@monday/types";

// ============================================================================
// Config
// ============================================================================

/** Where downloaded files are stored (inside Docker volume) */
const FILES_DIR =
  process.env.MONDAY_FILES_DIR ??
  join(import.meta.dir, "../../lib/db/monday-files");

/** CWD for the pdf-analysis Python CLI */
const PDF_ANALYSIS_CWD = join(
  import.meta.dir,
  "../../apps/cli-tools/pdf-analysis-cli"
);

/** File columns on the ESTIMATING board -> storage path columns in estimates table */
/** Only download Estimate PDFs — Plans/NOI/Contracts stay in Monday */
const FILE_COLUMNS = {
  [ESTIMATING_COLUMNS.ESTIMATE.id]: "estimate_storage_path",
} as const;

/** Only the ESTIMATE column triggers PDF extraction */
const EXTRACTION_COLUMN = ESTIMATING_COLUMNS.ESTIMATE.id;

// ============================================================================
// Types
// ============================================================================

interface FileColumnAsset {
  assetId: number;
  name: string;
}

interface ExtractedEstimate {
  header: {
    estimate_number: string;
    revision: string | null;
    date: string;
    gc_name: string;
    gc_address: string;
    job_name: string;
    job_address: string;
    estimator: string;
  };
  line_items: Array<{
    item: string;
    description: string;
    qty: number;
    unit: string | null;
    unit_cost: number;
    total: number;
    taxable: boolean;
    section: string;
  }>;
  grand_total: number;
  page_count: number;
  source_file: string;
}

// ============================================================================
// Prepared Statements
// ============================================================================

const getExistingAssets = db.query<{ monday_asset_id: string }>(
  "SELECT monday_asset_id FROM monday_assets WHERE monday_item_id = ?"
);

const insertAsset = db.prepare(`
  INSERT INTO monday_assets
    (monday_asset_id, monday_item_id, column_id, file_name, file_extension, file_size, local_path, downloaded_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, now())
  ON CONFLICT DO NOTHING
`);

const updateEstimatePath = db.prepare(
  "UPDATE estimates SET estimate_storage_path = ?, estimate_file_name = ?, updated_at = now() WHERE monday_item_id = ?"
);

const getEstimateByMondayId = db.query<{
  id: number;
  name: string;
  extraction_status: string | null;
}>(
  "SELECT id, name, extraction_status FROM estimates WHERE monday_item_id = ?"
);

const getLatestEstimateAsset = db.query<{
  monday_asset_id: string;
  file_name: string;
  local_path: string | null;
}>(
  `SELECT monday_asset_id, file_name, local_path
   FROM monday_assets
   WHERE monday_item_id = ?
     AND column_id = ?
   ORDER BY downloaded_at DESC NULLS LAST, id DESC
   LIMIT 1`
);

const updateAssetLocalPath = db.prepare(
  "UPDATE monday_assets SET local_path = ?, downloaded_at = now() WHERE monday_asset_id = ?"
);

const markOldVersionsNotCurrent = db.prepare(
  "UPDATE estimate_versions SET is_current = 0 WHERE estimate_id = ?"
);

const getNextVersionNumber = db.query<{ next_num: number }>(
  "SELECT COALESCE(MAX(version_number), 0) + 1 as next_num FROM estimate_versions WHERE estimate_id = ?"
);

const insertVersion = db.prepare(`
  INSERT INTO estimate_versions (id, estimate_id, version_number, source, total, is_current)
  VALUES (?, ?, ?, 'ocr', ?, 1)
`);

const insertLineItem = db.prepare(`
  INSERT INTO estimate_line_items
    (id, version_id, item_name, description, quantity, unit, unit_cost, unit_price, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateExtractionSuccess = db.prepare(`
  UPDATE estimates SET
    extraction_status = 'success',
    extraction_error = NULL,
    extracted_at = now(),
    extracted_grand_total = ?,
    extracted_job_name = ?,
    extracted_estimator = ?
  WHERE id = ?
`);

const updateExtractionFailed = db.prepare(`
  UPDATE estimates SET
    extraction_status = 'failed',
    extraction_error = ?,
    extracted_at = now()
  WHERE id = ?
`);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse a Monday file column value JSON to get asset references.
 * File columns store: {"files":[{"assetId":123,"name":"file.pdf",...}]}
 */
function parseFileColumnValue(rawValue: string | null): FileColumnAsset[] {
  if (!rawValue) {
    return [];
  }
  try {
    const parsed = JSON.parse(rawValue) as {
      files?: Array<{ assetId: number; name: string }>;
    };
    return (
      parsed.files?.map((f) => ({
        assetId: f.assetId,
        name: f.name,
      })) ?? []
    );
  } catch {
    return [];
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

async function redownloadAsset(
  mondayItemId: string,
  assetId: string,
  fileName: string
): Promise<string | null> {
  const assets = await getItemAssets(mondayItemId);
  const asset = assets.find((candidate) => candidate.id === assetId);
  if (!asset?.public_url) {
    console.log(
      `[pipeline]   Retry skipped ${fileName}: no public_url (asset ${assetId})`
    );
    return null;
  }

  const response = await fetch(asset.public_url);
  if (!response.ok) {
    console.log(
      `[pipeline]   Retry failed ${fileName}: HTTP ${response.status}`
    );
    return null;
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  const itemDir = join(FILES_DIR, mondayItemId);
  ensureDir(itemDir);
  const localPath = join(itemDir, `${assetId}_${fileName}`);
  writeFileSync(localPath, buffer);

  await updateAssetLocalPath.run(localPath, assetId);
  await updateEstimatePath.run(localPath, fileName, mondayItemId);

  console.log(
    `[pipeline]   Re-downloaded ${fileName} (${(buffer.length / 1024).toFixed(0)}KB)`
  );
  return localPath;
}

async function retryExistingEstimateExtraction(
  mondayItemId: string
): Promise<void> {
  const estimate = await getEstimateByMondayId.get(mondayItemId);
  if (!estimate || estimate.extraction_status === "success") {
    return;
  }

  const asset = await getLatestEstimateAsset.get(
    mondayItemId,
    EXTRACTION_COLUMN
  );
  if (!asset) {
    return;
  }

  if (!asset.file_name.toLowerCase().endsWith(".pdf")) {
    return;
  }

  let localPath = asset.local_path;
  if (!(localPath && existsSync(localPath))) {
    localPath = await redownloadAsset(
      mondayItemId,
      asset.monday_asset_id,
      asset.file_name
    );
  }

  if (!localPath) {
    return;
  }

  console.log(
    `[pipeline]   Retrying extraction for ${asset.file_name} (${mondayItemId})`
  );
  await runExtraction(mondayItemId, localPath, asset.file_name);
}

// ============================================================================
// Core Pipeline
// ============================================================================

/**
 * Download new files from a Monday item and run extraction if needed.
 * Returns the number of files downloaded.
 */
export async function processItemFiles(mondayItemId: string): Promise<number> {
  // Fetch rich item data to get file column values
  const item = await getItemRich(mondayItemId);
  if (!item) {
    console.log(`[pipeline] Item ${mondayItemId} not found`);
    return 0;
  }

  // Collect asset IDs from file columns
  const columnAssets = new Map<string, FileColumnAsset[]>();
  for (const col of item.columnValues) {
    if (col.id in FILE_COLUMNS && col.value) {
      const assets = parseFileColumnValue(col.value);
      if (assets.length > 0) {
        columnAssets.set(col.id, assets);
      }
    }
  }

  if (columnAssets.size === 0) {
    return 0;
  }

  // Check which assets we already have
  const existingRows = await getExistingAssets.all(mondayItemId);
  const existingIds = new Set(existingRows.map((r) => r.monday_asset_id));

  // Collect new asset IDs that need downloading
  const newAssets: Array<{
    columnId: string;
    assetId: number;
    fileName: string;
  }> = [];

  for (const [columnId, assets] of columnAssets) {
    for (const asset of assets) {
      if (!existingIds.has(String(asset.assetId))) {
        newAssets.push({
          columnId,
          assetId: asset.assetId,
          fileName: asset.name,
        });
      }
    }
  }

  if (newAssets.length === 0) {
    await retryExistingEstimateExtraction(mondayItemId);
    return 0;
  }

  console.log(
    `[pipeline] ${item.name}: ${newAssets.length} new file(s) to download`
  );

  // Fetch public URLs for all assets
  const allAssets = await getItemAssets(mondayItemId);
  const urlMap = new Map(allAssets.map((a) => [a.id, a]));

  let downloaded = 0;
  const itemDir = join(FILES_DIR, mondayItemId);
  ensureDir(itemDir);

  for (const { columnId, assetId, fileName } of newAssets) {
    const assetData = urlMap.get(String(assetId));
    if (!assetData?.public_url) {
      console.log(
        `[pipeline]   Skip ${fileName}: no public_url (asset ${assetId})`
      );
      continue;
    }

    try {
      // Download file
      const response = await fetch(assetData.public_url);
      if (!response.ok) {
        console.log(`[pipeline]   Failed ${fileName}: HTTP ${response.status}`);
        continue;
      }

      const buffer = new Uint8Array(await response.arrayBuffer());
      const ext = fileName.includes(".")
        ? fileName.slice(fileName.lastIndexOf("."))
        : "";
      const localPath = join(itemDir, `${assetId}_${fileName}`);
      writeFileSync(localPath, buffer);

      // Record in DB
      await insertAsset.run(
        String(assetId),
        mondayItemId,
        columnId,
        fileName,
        ext,
        buffer.length,
        localPath
      );

      // Update the estimate's storage path
      await updateEstimatePath.run(localPath, fileName, mondayItemId);

      console.log(
        `[pipeline]   Downloaded ${fileName} (${(buffer.length / 1024).toFixed(0)}KB)`
      );
      downloaded++;

      // Trigger extraction for estimate PDFs
      if (columnId === EXTRACTION_COLUMN && ext.toLowerCase() === ".pdf") {
        await runExtraction(mondayItemId, localPath, fileName);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[pipeline]   Error downloading ${fileName}: ${msg}`);
    }
  }

  return downloaded;
}

// ============================================================================
// PDF Extraction
// ============================================================================

async function runExtraction(
  mondayItemId: string,
  pdfPath: string,
  fileName: string
): Promise<void> {
  const estimate = await getEstimateByMondayId.get(mondayItemId);
  if (!estimate) {
    return;
  }

  console.log(`[pipeline]   Extracting: ${fileName}`);

  try {
    const proc = Bun.spawn(
      [
        "uv",
        "run",
        "-m",
        "pdf_analysis.cli",
        "estimate",
        pdfPath,
        "--format",
        "json",
      ],
      {
        cwd: PDF_ANALYSIS_CWD,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, PATH: process.env.PATH ?? "" },
      }
    );

    const timeout = setTimeout(() => proc.kill(), 120_000);
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    clearTimeout(timeout);

    if (exitCode !== 0) {
      throw new Error(
        `pdf-analysis exit ${exitCode}: ${stderr.trim().slice(0, 500)}`
      );
    }

    const result = JSON.parse(stdout) as ExtractedEstimate;

    // Store extraction results (versioned model)
    await db.transaction(async () => {
      await markOldVersionsNotCurrent.run(estimate.id);

      const versionId = randomUUID();
      const nextNum =
        (await getNextVersionNumber.get(estimate.id))?.next_num ?? 1;

      await insertVersion.run(
        versionId,
        estimate.id,
        nextNum,
        result.grand_total
      );

      for (let i = 0; i < result.line_items.length; i++) {
        const li = result.line_items[i];
        await insertLineItem.run(
          randomUUID(),
          versionId,
          li.item,
          li.description,
          li.qty,
          li.unit ?? "EA",
          li.unit_cost,
          li.total,
          i
        );
      }

      await updateExtractionSuccess.run(
        result.grand_total,
        result.header.job_name,
        result.header.estimator,
        estimate.id
      );
    });

    console.log(
      `[pipeline]   Extracted: ${result.line_items.length} items, $${result.grand_total.toLocaleString()}`
    );

    // Clean up PDF after successful extraction
    try {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(pdfPath);
    } catch {
      // File cleanup is best-effort
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[pipeline]   Extraction failed: ${msg}`);
    await updateExtractionFailed.run(msg.slice(0, 500), estimate.id);
  }
}

/**
 * Check if an item has any file columns with content.
 * Used by the worker to decide whether to enqueue a download_files job.
 */
export function itemHasFiles(
  columnValues: Array<{ id: string; value: string | null }>
): boolean {
  for (const col of columnValues) {
    if (col.id in FILE_COLUMNS && col.value) {
      const assets = parseFileColumnValue(col.value);
      if (assets.length > 0) {
        return true;
      }
    }
  }
  return false;
}
