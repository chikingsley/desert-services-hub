#!/usr/bin/env bun
/**
 * Repair Hollow Extractions
 *
 * Re-processes estimates that were marked extraction_status = 'success'
 * but have 0 line items in their current version. Now that runExtraction()
 * includes an LLM fallback, re-running should either:
 *   - Extract real line items via LLM (source = 'llm')
 *   - Tag non-estimates with [llm:non_estimate]
 *   - Leave hollow if LLM also finds nothing
 *
 * Usage:
 *   bun apps/background-jobs/cli/repair-hollow-extractions.ts [--limit N] [--dry-run]
 */
import { existsSync } from "node:fs";
import { db } from "@lib/db/hub";
import { EXTRACTION_COLUMN } from "@monday/sync/pipeline-config";
import {
  redownloadAsset,
  runExtraction,
} from "@monday/sync/pipeline-extraction";

interface HollowEstimate {
  id: number;
  monday_item_id: string;
  name: string;
  estimate_storage_path: string | null;
  estimate_file_name: string | null;
  asset_id: string | null;
  asset_file_name: string | null;
  asset_local_path: string | null;
}

const findHollowEstimates = db.query<HollowEstimate, [number]>(`
  SELECT
    e.id,
    e.monday_item_id,
    e.name,
    e.estimate_storage_path,
    e.estimate_file_name,
    a.monday_asset_id as asset_id,
    a.file_name as asset_file_name,
    a.local_path as asset_local_path
  FROM estimates e
  LEFT JOIN LATERAL (
    SELECT monday_asset_id, file_name, local_path
    FROM monday_assets ma
    WHERE ma.monday_item_id = e.monday_item_id
      AND ma.column_id = '${EXTRACTION_COLUMN}'
    ORDER BY downloaded_at DESC NULLS LAST, ma.id DESC
    LIMIT 1
  ) a ON true
  WHERE e.extraction_status = 'success'
    AND NOT EXISTS (
      SELECT 1 FROM estimate_line_items eli
      JOIN estimate_versions ev ON ev.id = eli.version_id
      WHERE ev.estimate_id = e.id AND ev.is_current = 1
    )
  ORDER BY e.id
  LIMIT $1
`);

function parseArgs(): { limit: number; dryRun: boolean } {
  const args = process.argv.slice(2);
  let limit = 100;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10) || 100;
      i++;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { limit, dryRun };
}

function printDryRun(
  rows: Awaited<ReturnType<typeof findHollowEstimates.all>>
): void {
  for (const row of rows) {
    const hasFile = row.asset_id ? "has asset" : "no asset";
    console.log(
      `[repair]   ${row.name} (monday:${row.monday_item_id}) — ${hasFile}, file: ${row.asset_file_name ?? row.estimate_file_name ?? "none"}`
    );
  }
}

async function resolveAssetPath(
  row: Awaited<ReturnType<typeof findHollowEstimates.all>>[number]
): Promise<{ localPath: string; fileName: string } | null> {
  if (row.asset_local_path && existsSync(row.asset_local_path)) {
    return {
      localPath: row.asset_local_path,
      fileName: row.asset_file_name ?? "",
    };
  }
  if (row.asset_id && row.asset_file_name) {
    console.log(`[repair]   Re-downloading: ${row.asset_file_name}`);
    const localPath = await redownloadAsset(
      row.monday_item_id,
      row.asset_id,
      row.asset_file_name
    );
    if (localPath) {
      return { localPath, fileName: row.asset_file_name };
    }
  }
  return null;
}

async function main(): Promise<void> {
  const { limit, dryRun } = parseArgs();

  console.log(
    `[repair] Finding hollow-success estimates (limit=${limit}, dryRun=${dryRun})`
  );

  const rows = await findHollowEstimates.all(limit);
  console.log(`[repair] Found ${rows.length} hollow-success estimates`);

  if (rows.length === 0 || dryRun) {
    if (dryRun && rows.length > 0) {
      printDryRun(rows);
    }
    return;
  }

  let reprocessed = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const asset = await resolveAssetPath(row);
      if (!asset) {
        console.log(`[repair]   Skipped ${row.name}: no downloadable asset`);
        skipped++;
        continue;
      }

      if (!asset.fileName.toLowerCase().endsWith(".pdf")) {
        console.log(
          `[repair]   Skipped ${row.name}: not a PDF (${asset.fileName})`
        );
        skipped++;
        continue;
      }

      console.log(`[repair]   Re-extracting: ${row.name} (${asset.fileName})`);
      await runExtraction(row.monday_item_id, asset.localPath, asset.fileName);
      reprocessed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[repair]   Error ${row.name}: ${msg}`);
      errors++;
    }
  }

  console.log(
    `[repair] Done: ${reprocessed} reprocessed, ${skipped} skipped, ${errors} errors`
  );
}

main().catch((error) => {
  const msg =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[repair] fatal ${msg}`);
  process.exit(1);
});
