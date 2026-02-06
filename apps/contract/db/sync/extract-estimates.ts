#!/usr/bin/env bun
/**
 * Extract line items from estimate PDFs stored in SharePoint.
 *
 * Downloads estimate PDFs from SharePoint, runs them through the
 * pdf-analysis Python CLI, and stores extracted line items in hub.db.
 *
 * Usage:
 *   bun apps/contract/db/sync/extract-estimates.ts <id>           # Single by DB id
 *   bun apps/contract/db/sync/extract-estimates.ts --number=NUM   # Single by estimate number
 *   bun apps/contract/db/sync/extract-estimates.ts --batch        # All unextracted
 *   bun apps/contract/db/sync/extract-estimates.ts --batch --limit=10
 *   bun apps/contract/db/sync/extract-estimates.ts --retry-failed # Re-extract failed
 *   bun apps/contract/db/sync/extract-estimates.ts --stats        # Show extraction stats
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { db } from "@lib/db/hub";
import "@lib/db/schema";
import { SharePointClient } from "@sharepoint/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EstimateRow {
  id: number;
  estimate_number: string | null;
  name: string;
  sharepoint_url: string;
  extraction_status: string | null;
}

interface ExtractedLineItem {
  item: string;
  description: string;
  qty: number;
  unit: string | null;
  unit_cost: number;
  total: number;
  taxable: boolean;
  section: string;
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
  line_items: ExtractedLineItem[];
  grand_total: number;
  page_count: number;
  source_file: string;
}

// ---------------------------------------------------------------------------
// SharePoint helpers
// ---------------------------------------------------------------------------

const sp = new SharePointClient({
  azureTenantId: process.env.AZURE_TENANT_ID ?? "",
  azureClientId: process.env.AZURE_CLIENT_ID ?? "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
});

const PDF_ANALYSIS_CWD = join(import.meta.dir, "../../../pdf-analysis");

const RE_URL = /https?:\/\/.+$/;
const RE_SHARED_DOCS = /Shared Documents\/(.+)$/;

/**
 * Extract the SharePoint folder path from the sharepoint_url column.
 *
 * Format: "Label - https://desertservices.sharepoint.com/sites/DataDrive/Shared%20Documents/Customer%20Projects/..."
 * Returns: "Customer Projects/..."
 */
function extractSharePointPath(sharepointUrl: string): string | null {
  const urlMatch = sharepointUrl.match(RE_URL);
  if (!urlMatch) {
    return null;
  }

  const decoded = decodeURIComponent(urlMatch[0]);
  const pathMatch = decoded.match(RE_SHARED_DOCS);
  if (!pathMatch) {
    return null;
  }

  return pathMatch[1];
}

/**
 * Find estimate PDF files in the SharePoint Estimates folder.
 * Looks in both "01-Estimates" (new convention) and "Estimates" (legacy).
 */
async function findEstimatePdfs(
  folderPath: string
): Promise<{ name: string; fullPath: string }[]> {
  const subfolders = ["01-Estimates", "Estimates"];

  for (const sub of subfolders) {
    const estimatesPath = `${folderPath}/${sub}`;
    try {
      const items = await sp.listFiles(estimatesPath);
      const pdfs = items
        .filter((item) => item.file && item.name.toLowerCase().endsWith(".pdf"))
        .map((item) => ({
          name: item.name,
          fullPath: `${estimatesPath}/${item.name}`,
        }));

      if (pdfs.length > 0) {
        return pdfs;
      }
    } catch {
      // Folder doesn't exist, try next
    }
  }

  return [];
}

/**
 * Run the pdf-analysis CLI to extract estimate data from a PDF file.
 */
async function runExtraction(pdfPath: string): Promise<ExtractedEstimate> {
  const proc = Bun.spawn(
    ["uv", "run", "pdf-analysis", "estimate", pdfPath, "--format", "json"],
    {
      cwd: PDF_ANALYSIS_CWD,
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`pdf-analysis failed (exit ${exitCode}): ${stderr.trim()}`);
  }

  return JSON.parse(stdout) as ExtractedEstimate;
}

// ---------------------------------------------------------------------------
// Database operations (versioned model)
// ---------------------------------------------------------------------------

const markOldVersionsNotCurrent = db.prepare(
  "UPDATE estimate_versions SET is_current = 0 WHERE estimate_id = ? AND source = 'ocr'"
);

const getNextVersionNumber = db.prepare<{ next_num: number }, [number]>(
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

const updateSuccess = db.prepare(`
  UPDATE estimates SET
    extraction_status = 'success',
    extraction_error = NULL,
    extracted_at = datetime('now'),
    extracted_grand_total = ?,
    extracted_job_name = ?,
    extracted_estimator = ?
  WHERE id = ?
`);

const updateFailed = db.prepare(`
  UPDATE estimates SET
    extraction_status = 'failed',
    extraction_error = ?,
    extracted_at = datetime('now')
  WHERE id = ?
`);

const updateNoPdf = db.prepare(`
  UPDATE estimates SET
    extraction_status = 'no_pdf',
    extracted_at = datetime('now')
  WHERE id = ?
`);

// ---------------------------------------------------------------------------
// Core extraction logic
// ---------------------------------------------------------------------------

async function extractOne(estimate: EstimateRow): Promise<boolean> {
  const label = `#${estimate.estimate_number ?? estimate.id} (${estimate.name})`;

  // Parse SharePoint path
  const folderPath = extractSharePointPath(estimate.sharepoint_url);
  if (!folderPath) {
    console.log(`  SKIP ${label}: could not parse SharePoint URL`);
    updateFailed.run("Could not parse SharePoint URL", estimate.id);
    return false;
  }

  // Find PDFs in Estimates folder
  let pdfs: { name: string; fullPath: string }[];
  try {
    pdfs = await findEstimatePdfs(folderPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  FAIL ${label}: SharePoint error — ${msg}`);
    updateFailed.run(`SharePoint: ${msg}`, estimate.id);
    return false;
  }

  if (pdfs.length === 0) {
    console.log(`  NO PDF ${label}`);
    updateNoPdf.run(estimate.id);
    return false;
  }

  // Use the first PDF found (most estimates have exactly one)
  const pdf = pdfs[0];
  console.log(`  Extracting ${label} from ${pdf.name}...`);

  // Download to temp file
  const tempDir = join(tmpdir(), "estimate-extraction");
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  const tempPath = join(tempDir, `est-${estimate.id}.pdf`);

  try {
    const buffer = await sp.download(pdf.fullPath);
    writeFileSync(tempPath, buffer);

    // Run Python extraction
    const result = await runExtraction(tempPath);

    // Store in DB — create new OCR version (preserves previous versions)
    db.transaction(() => {
      markOldVersionsNotCurrent.run(estimate.id);

      const versionId = randomUUID();
      const { next_num } = getNextVersionNumber.get(estimate.id) ?? {
        next_num: 1,
      };

      insertVersion.run(versionId, estimate.id, next_num, result.grand_total);

      for (let i = 0; i < result.line_items.length; i++) {
        const item = result.line_items[i];
        insertLineItem.run(
          randomUUID(),
          versionId,
          item.item,
          item.description,
          item.qty,
          item.unit ?? "EA",
          item.unit_cost,
          item.total,
          i
        );
      }

      updateSuccess.run(
        result.grand_total,
        result.header.job_name,
        result.header.estimator,
        estimate.id
      );
    })();

    console.log(
      `  OK ${label}: ${result.line_items.length} items, $${result.grand_total.toLocaleString()}`
    );
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  FAIL ${label}: ${msg}`);
    updateFailed.run(msg.slice(0, 500), estimate.id);
    return false;
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {
      // Already cleaned up
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function showStats(): void {
  const stats = db
    .query<{ status: string; count: number }, []>(
      `SELECT COALESCE(extraction_status, 'unprocessed') as status, COUNT(*) as count
       FROM estimates
       GROUP BY extraction_status
       ORDER BY count DESC`
    )
    .all();

  const total = stats.reduce((sum, s) => sum + s.count, 0);
  const withSp =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM estimates WHERE sharepoint_url IS NOT NULL AND sharepoint_url <> ''"
      )
      .get()?.count ?? 0;

  const itemCount =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM estimate_line_items"
      )
      .get()?.count ?? 0;

  console.log("Estimate Extraction Stats");
  console.log("─".repeat(40));
  console.log(`Total estimates: ${total}`);
  console.log(`With SharePoint URL: ${withSp}`);
  console.log(`Extracted line items: ${itemCount}`);
  console.log("");

  for (const { status, count } of stats) {
    const pct = ((count / total) * 100).toFixed(1);
    console.log(
      `  ${status.padEnd(15)} ${String(count).padStart(5)}  (${pct}%)`
    );
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      number: { type: "string" },
      batch: { type: "boolean", default: false },
      "retry-failed": { type: "boolean", default: false },
      stats: { type: "boolean", default: false },
      limit: { type: "string" },
    },
    allowPositionals: true,
  });

  if (values.stats) {
    showStats();
    return;
  }

  const limit = values.limit ? Number.parseInt(values.limit, 10) : 0;

  // Single estimate by ID
  if (positionals.length > 0) {
    const id = Number.parseInt(positionals[0], 10);
    const estimate = db
      .query<EstimateRow, [number]>(
        "SELECT id, estimate_number, name, sharepoint_url, extraction_status FROM estimates WHERE id = ?"
      )
      .get(id);

    if (!estimate) {
      console.error(`Estimate id=${id} not found`);
      process.exit(1);
    }

    if (!estimate.sharepoint_url) {
      console.error(`Estimate id=${id} has no SharePoint URL`);
      process.exit(1);
    }

    await extractOne(estimate);
    return;
  }

  // Single estimate by number
  if (values.number) {
    const estimates = db
      .query<EstimateRow, [string]>(
        "SELECT id, estimate_number, name, sharepoint_url, extraction_status FROM estimates WHERE estimate_number = ? AND sharepoint_url IS NOT NULL AND sharepoint_url <> ''"
      )
      .all(values.number);

    if (estimates.length === 0) {
      console.error(`No estimates found with number=${values.number}`);
      process.exit(1);
    }

    for (const est of estimates) {
      await extractOne(est);
    }
    return;
  }

  // Batch: all unextracted or retry failed
  let query: string;
  if (values["retry-failed"]) {
    query =
      "SELECT id, estimate_number, name, sharepoint_url, extraction_status FROM estimates WHERE extraction_status = 'failed' AND sharepoint_url IS NOT NULL AND sharepoint_url <> ''";
  } else if (values.batch) {
    query =
      "SELECT id, estimate_number, name, sharepoint_url, extraction_status FROM estimates WHERE extraction_status IS NULL AND sharepoint_url IS NOT NULL AND sharepoint_url <> ''";
  } else {
    console.log("Usage:");
    console.log("  extract-estimates.ts <id>              # Single by DB id");
    console.log(
      "  extract-estimates.ts --number=NUM      # By estimate number"
    );
    console.log("  extract-estimates.ts --batch            # All unextracted");
    console.log(
      "  extract-estimates.ts --batch --limit=N  # First N unextracted"
    );
    console.log(
      "  extract-estimates.ts --retry-failed     # Re-extract failed"
    );
    console.log("  extract-estimates.ts --stats            # Show stats");
    return;
  }

  if (limit > 0) {
    query += ` LIMIT ${limit}`;
  }

  const estimates = db.query<EstimateRow, []>(query).all();
  console.log(`Processing ${estimates.length} estimates...\n`);

  let success = 0;
  let failed = 0;
  let noPdf = 0;

  for (const est of estimates) {
    const result = await extractOne(est);
    if (result) {
      success++;
    } else {
      // Check if it was no_pdf or failed
      const updated = db
        .query<{ extraction_status: string }, [number]>(
          "SELECT extraction_status FROM estimates WHERE id = ?"
        )
        .get(est.id);

      if (updated?.extraction_status === "no_pdf") {
        noPdf++;
      } else {
        failed++;
      }
    }
  }

  console.log(`\nDone: ${success} success, ${noPdf} no PDF, ${failed} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
