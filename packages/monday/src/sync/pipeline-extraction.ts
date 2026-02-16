import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@lib/db/hub";
import { getItemAssets } from "@monday/client";
import {
  EXTRACTION_COLUMN,
  FILES_DIR,
  PDF_ANALYSIS_CWD,
} from "@monday/sync/pipeline-config";
import {
  getEstimateByMondayId,
  getLatestEstimateAsset,
  getNextVersionNumber,
  insertLineItem,
  insertVersion,
  markOldVersionsNotCurrent,
  updateAssetLocalPath,
  updateEstimatePath,
  updateExtractionFailed,
  updateExtractionSuccess,
} from "@monday/sync/pipeline-db";

interface FileExtractionResult {
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
    unit_price: number;
    total: number;
    taxable: boolean;
    section: string;
  }>;
  grand_total: number;
  page_count: number;
  source_file: string;
}

export async function retryExistingEstimateExtraction(
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
  if (!asset?.file_name.toLowerCase().endsWith(".pdf")) {
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
  if (!existsSync(itemDir)) {
    mkdirSync(itemDir, { recursive: true });
  }

  const localPath = join(itemDir, `${assetId}_${fileName}`);
  writeFileSync(localPath, buffer);
  await updateAssetLocalPath.run(localPath, assetId);
  await updateEstimatePath.run(localPath, fileName, mondayItemId);
  console.log(
    `[pipeline]   Re-downloaded ${fileName} (${(buffer.length / 1024).toFixed(0)}KB)`
  );
  return localPath;
}

export async function runExtraction(
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

    const result = JSON.parse(stdout) as FileExtractionResult;

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
          li.unit_price,
          i
        );
      }

      await updateExtractionSuccess.run(
        result.grand_total,
        result.header.job_name,
        result.header.estimator,
        result.header.job_name,
        result.header.job_address,
        result.header.estimator,
        result.header.gc_name,
        result.header.gc_address,
        estimate.id
      );
    });

    console.log(
      `[pipeline]   Extracted: ${result.line_items.length} items, $${result.grand_total.toLocaleString()}`
    );

    try {
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
