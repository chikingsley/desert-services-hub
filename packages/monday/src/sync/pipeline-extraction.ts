/* biome-ignore lint/nursery/noExcessiveLinesPerFile: Pipeline orchestration file — extraction, reconciliation, and persistence are tightly coupled */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runGeminiJsonPrompt } from "@background-jobs/lib/llm";
import { db } from "@lib/db/hub";
import {
  ingestPdf,
  extractEstimate as pdfExtractEstimate,
} from "@lib/pdf-analysis";
import { getItemAssets } from "@monday/client";
import { EXTRACTION_COLUMN, FILES_DIR } from "@monday/sync/pipeline-config";
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

// -- Types --

interface LineItem {
  item: string;
  description: string;
  qty: number;
  unit: string | null;
  unit_price: number;
  total: number;
  taxable: boolean;
  section: string;
}

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
  line_items: LineItem[];
  grand_total: number;
  page_count: number;
  source_file: string;
}

type ExtractionSource = "ocr" | "llm" | "reconciled";

interface IngestClassification {
  isEstimate: boolean;
  result: FileExtractionResult | null;
}

// -- Config --

const DUAL_EXTRACTION_ENABLED =
  (process.env.ESTIMATE_DUAL_EXTRACTION ?? "true") === "true";

const LLM_RECONCILE_ENABLED =
  (process.env.ESTIMATE_OPENCODE_RECONCILE ?? "true") === "true";

const GEMINI_SMART_MODEL = (
  process.env.GEMINI_SMART_MODEL ?? "gemini-2.5-flash-lite"
).trim();

// -- PDF Analysis Service Client --

/**
 * Kreuzberg deterministic table extraction via pdf-analysis service.
 * 100% accurate where it finds table structure. Returns null on failure.
 */
async function runKreuzbergEstimate(
  pdfPath: string
): Promise<FileExtractionResult | null> {
  try {
    return (await pdfExtractEstimate(
      pdfPath
    )) as unknown as FileExtractionResult;
  } catch (err) {
    console.log(
      `[pipeline]   estimate error: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

// -- LLM Ingest Extraction --

const ESTIMATE_DOC_TYPES = ["estimate", "bid", "quote", "proposal"];

/**
 * Run pdf-analysis ingest via HTTP service -- kreuzberg text, optional OCR,
 * LLM classification + extraction. Returns whether the doc is an estimate
 * and, if so, the extracted data mapped to FileExtractionResult.
 */
async function runIngest(
  pdfPath: string
): Promise<IngestClassification | null> {
  let results: Record<string, unknown>[];
  try {
    results = (await ingestPdf(pdfPath)) as unknown as Record<
      string,
      unknown
    >[];
  } catch (err) {
    console.log(
      `[pipeline]   ingest error: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }

  const ingest = results[0];
  if (!ingest) {
    return null;
  }

  const docType = String(ingest.document_type ?? "").toLowerCase();
  const isEstimate = ESTIMATE_DOC_TYPES.some((t) => docType.includes(t));

  if (!isEstimate) {
    return { isEstimate: false, result: null };
  }

  const extracted = (ingest.extracted ?? {}) as Record<string, unknown>;
  const parties = (extracted.parties ?? {}) as Record<string, unknown>;
  const project = (extracted.project ?? {}) as Record<string, unknown>;
  const financial = (extracted.financial ?? {}) as Record<string, unknown>;
  const rawItems = (extracted.line_items ?? []) as Record<string, unknown>[];

  const lineItems: LineItem[] = rawItems
    .filter((li) => li.description || li.amount)
    .map((li, i) => {
      const total = Number(li.amount) || 0;
      const qty = Number(li.qty) || 1;
      return {
        item: String(li.description ?? `Item ${i + 1}`),
        description: String(li.description ?? ""),
        qty,
        unit: li.unit ? String(li.unit) : null,
        unit_price: qty > 0 ? total / qty : total,
        total,
        taxable: false,
        section: "",
      };
    });

  if (lineItems.length === 0) {
    return { isEstimate: true, result: null };
  }

  return {
    isEstimate: true,
    result: {
      header: {
        estimate_number: String(extracted.estimate_reference ?? ""),
        revision: null,
        date: "",
        gc_name: String(parties.contractor ?? ""),
        gc_address: "",
        job_name: String(project.name ?? ""),
        job_address: String(project.address ?? ""),
        estimator: "",
      },
      line_items: lineItems,
      grand_total:
        Number(financial.contract_value) ||
        lineItems.reduce((sum, li) => sum + li.total, 0),
      page_count: Number(ingest.page_count) || 0,
      source_file: pdfPath,
    },
  };
}

// -- Reconciliation: Merge kreuzberg + LLM results --

const WHITESPACE_RE = /\s+/;

/** Fuzzy match two line items via token overlap + total proximity. */
function itemsMatch(a: LineItem, b: LineItem): boolean {
  const aDesc = `${a.item} ${a.description}`.toLowerCase().trim();
  const bDesc = `${b.item} ${b.description}`.toLowerCase().trim();

  // Exact match
  if (aDesc === bDesc) {
    return true;
  }

  // Substring containment
  if (
    aDesc.length > 5 &&
    bDesc.length > 5 &&
    (aDesc.includes(bDesc) || bDesc.includes(aDesc))
  ) {
    return true;
  }

  // Token overlap (Jaccard similarity)
  const aTokens = new Set(
    aDesc.split(WHITESPACE_RE).filter((t) => t.length > 2)
  );
  const bTokens = new Set(
    bDesc.split(WHITESPACE_RE).filter((t) => t.length > 2)
  );
  if (aTokens.size === 0 || bTokens.size === 0) {
    return false;
  }

  let intersection = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) {
      intersection++;
    }
  }
  const union = new Set([...aTokens, ...bTokens]).size;
  const jaccard = intersection / union;

  // High token overlap + similar totals = same item
  if (jaccard > 0.5 && a.total > 0 && b.total > 0) {
    const ratio = Math.abs(a.total - b.total) / Math.max(a.total, b.total);
    if (ratio < 0.05) {
      return true;
    }
  }

  return jaccard > 0.7;
}

/**
 * Deterministic merge: kreuzberg items are ground truth, LLM fills gaps.
 * Used as fallback when LLM reconciliation is unavailable.
 */
function deterministicMerge(
  kreuz: FileExtractionResult | null,
  ingest: FileExtractionResult | null
): { result: FileExtractionResult; source: ExtractionSource } {
  const kreuzItems = kreuz?.line_items ?? [];
  const ingestItems = ingest?.line_items ?? [];

  // Only one side has items — return it directly
  if (kreuz && kreuzItems.length > 0 && ingestItems.length === 0) {
    return { result: kreuz, source: "ocr" };
  }
  if (ingest && ingestItems.length > 0 && kreuzItems.length === 0) {
    return { result: ingest, source: "llm" };
  }

  // Neither has items
  if (kreuzItems.length === 0 && ingestItems.length === 0) {
    return { result: kreuz ?? ingest ?? emptyResult(""), source: "ocr" };
  }

  // Both have data — merge with kreuzberg priority
  return mergeKreuzAndIngest(
    kreuz as FileExtractionResult,
    ingest as FileExtractionResult,
    kreuzItems,
    ingestItems
  );
}

/** Merge two non-null extraction results with kreuzberg priority. */
function mergeKreuzAndIngest(
  kreuz: FileExtractionResult,
  ingest: FileExtractionResult,
  kreuzItems: LineItem[],
  ingestItems: LineItem[]
): { result: FileExtractionResult; source: ExtractionSource } {
  const merged: LineItem[] = [...kreuzItems];

  for (const llmItem of ingestItems) {
    const isDuplicate = merged.some((kItem) => itemsMatch(kItem, llmItem));
    if (!isDuplicate && llmItem.total > 0) {
      merged.push(llmItem);
    }
  }

  const kH = kreuz.header;
  const iH = ingest.header;

  return {
    result: {
      header: {
        estimate_number: kH.estimate_number || iH.estimate_number,
        revision: kH.revision ?? iH.revision,
        date: kH.date || iH.date,
        gc_name: kH.gc_name || iH.gc_name,
        gc_address: kH.gc_address || iH.gc_address,
        job_name: kH.job_name || iH.job_name,
        job_address: kH.job_address || iH.job_address,
        estimator: kH.estimator || iH.estimator,
      },
      line_items: merged,
      grand_total: kreuz.grand_total || ingest.grand_total,
      page_count: kreuz.page_count || ingest.page_count,
      source_file: kreuz.source_file,
    },
    source: merged.length > kreuzItems.length ? "reconciled" : "ocr",
  };
}

function emptyResult(pdfPath: string): FileExtractionResult {
  return {
    header: {
      estimate_number: "",
      revision: null,
      date: "",
      gc_name: "",
      gc_address: "",
      job_name: "",
      job_address: "",
      estimator: "",
    },
    line_items: [],
    grand_total: 0,
    page_count: 0,
    source_file: pdfPath,
  };
}

// -- LLM Reconciliation --

const RECONCILE_PROMPT = `You are reconciling two extractions of a construction estimate PDF.

EXTRACTION 1 — DETERMINISTIC (kreuzberg table parser, 100% accurate where present):
{kreuzberg}

EXTRACTION 2 — LLM (broader coverage, may have minor errors):
{ingest}

Merge into one final estimate following these rules:
1. Where both have the same line item, use DETERMINISTIC values (exact numbers from the PDF)
2. Add any LLM items that the deterministic parser missed (do NOT create duplicates)
3. Header info: prefer deterministic values, fill gaps from LLM
4. Grand total: use deterministic if it found items, else use LLM
5. Verify line item totals approximately sum to grand total
6. Remove items with $0 total unless they appear intentional

Return ONLY valid JSON with this exact structure:
{
  "header": {
    "estimate_number": "string",
    "revision": "string or null",
    "date": "string",
    "gc_name": "string",
    "gc_address": "string",
    "job_name": "string",
    "job_address": "string",
    "estimator": "string"
  },
  "line_items": [
    {"item": "string", "description": "string", "qty": 0, "unit": "string or null", "unit_price": 0, "total": 0, "taxable": false, "section": "string"}
  ],
  "grand_total": 0
}`;

/**
 * Send both extractions to the LLM for intelligent reconciliation.
 * Returns merged result or null on failure.
 */
async function reconcileWithLlm(
  kreuz: FileExtractionResult | null,
  ingest: FileExtractionResult | null
): Promise<FileExtractionResult | null> {
  if (!LLM_RECONCILE_ENABLED) {
    return null;
  }

  try {
    const prompt = RECONCILE_PROMPT.replace(
      "{kreuzberg}",
      JSON.stringify(kreuz, null, 2)
    ).replace("{ingest}", JSON.stringify(ingest, null, 2));

    const result = await runGeminiJsonPrompt(prompt, {
      model: GEMINI_SMART_MODEL,
    });

    if (!result) {
      return null;
    }

    const header = (result.header ?? {}) as Record<string, unknown>;
    const rawItems = (result.line_items ?? []) as Record<string, unknown>[];

    const lineItems: LineItem[] = rawItems
      .filter(
        (li) =>
          li.description ||
          li.item ||
          (typeof li.total === "number" && li.total > 0)
      )
      .map((li) => ({
        item: String(li.item ?? ""),
        description: String(li.description ?? ""),
        qty: Number(li.qty) || 1,
        unit: li.unit ? String(li.unit) : null,
        unit_price: Number(li.unit_price) || 0,
        total: Number(li.total) || 0,
        taxable: li.taxable === true,
        section: String(li.section ?? ""),
      }));

    if (lineItems.length === 0) {
      return null;
    }

    return {
      header: {
        estimate_number: String(header.estimate_number ?? ""),
        revision: header.revision != null ? String(header.revision) : null,
        date: String(header.date ?? ""),
        gc_name: String(header.gc_name ?? ""),
        gc_address: String(header.gc_address ?? ""),
        job_name: String(header.job_name ?? ""),
        job_address: String(header.job_address ?? ""),
        estimator: String(header.estimator ?? ""),
      },
      line_items: lineItems,
      grand_total:
        Number(result.grand_total) ||
        lineItems.reduce((sum, li) => sum + li.total, 0),
      page_count: kreuz?.page_count ?? ingest?.page_count ?? 0,
      source_file: kreuz?.source_file ?? ingest?.source_file ?? "",
    };
  } catch (err) {
    console.log(
      `[pipeline]   LLM reconciliation failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

/**
 * Orchestrate reconciliation: try LLM first, fall back to deterministic merge.
 */
async function reconcileExtractions(
  kreuz: FileExtractionResult | null,
  ingest: FileExtractionResult | null
): Promise<{ result: FileExtractionResult; source: ExtractionSource }> {
  const kreuzHasItems = (kreuz?.line_items?.length ?? 0) > 0;
  const ingestHasItems = (ingest?.line_items?.length ?? 0) > 0;

  // If both have items, try OpenCode reconciliation
  if (kreuzHasItems && ingestHasItems) {
    console.log(
      `[pipeline]   Both extractions returned items (kreuz=${kreuz?.line_items.length ?? 0}, llm=${ingest?.line_items.length ?? 0}) — reconciling`
    );

    const llmResult = await reconcileWithLlm(kreuz, ingest);
    if (llmResult) {
      console.log(
        `[pipeline]   LLM reconciled: ${llmResult.line_items.length} items, $${llmResult.grand_total.toLocaleString()}`
      );
      return { result: llmResult, source: "reconciled" };
    }

    console.log(
      "[pipeline]   LLM reconciliation unavailable — falling back to deterministic merge"
    );
  }

  return deterministicMerge(kreuz, ingest);
}

// -- Save Extraction Results --

async function saveExtractionResults(
  estimateId: number,
  source: ExtractionSource,
  result: FileExtractionResult
): Promise<void> {
  await markOldVersionsNotCurrent.run(estimateId);

  const versionId = randomUUID();
  const nextNum = (await getNextVersionNumber.get(estimateId))?.next_num ?? 1;

  await insertVersion.run(
    versionId,
    estimateId,
    nextNum,
    source,
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
    estimateId
  );
}

// -- Asset Re-download (exported for repair CLI) --

export async function redownloadAsset(
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

// -- Retry Existing Extraction --

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

// -- Main Extraction --

/** Best-effort file cleanup after extraction. */
function tryUnlink(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Cleanup is best-effort
  }
}

function isEmptyExtraction(result: FileExtractionResult | null): boolean {
  return (
    !result || (result.line_items.length === 0 && result.grand_total === 0)
  );
}

const tagNonEstimate = db.prepare(`
  UPDATE estimates
  SET extraction_error = ?
  WHERE id = ?
`);

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
    // Run both extractions (parallel or sequential based on config)
    let kreuzResult: FileExtractionResult | null;
    let ingestResult: IngestClassification | null;

    if (DUAL_EXTRACTION_ENABLED) {
      [kreuzResult, ingestResult] = await Promise.all([
        runKreuzbergEstimate(pdfPath),
        runIngest(pdfPath),
      ]);
    } else {
      kreuzResult = await runKreuzbergEstimate(pdfPath);
      ingestResult = isEmptyExtraction(kreuzResult)
        ? await runIngest(pdfPath)
        : null;
    }

    // Handle non-estimate classification from LLM
    if (ingestResult && !ingestResult.isEstimate) {
      if (isEmptyExtraction(kreuzResult)) {
        await db.transaction(async () => {
          await saveExtractionResults(
            estimate.id,
            "ocr",
            kreuzResult ?? emptyResult(pdfPath)
          );
        });
        await tagNonEstimate.run(
          "[llm:non_estimate] Document classified as non-estimate by LLM",
          estimate.id
        );
        console.log(`[pipeline]   Classified as non-estimate: ${fileName}`);
        tryUnlink(pdfPath);
        return;
      }

      // kreuzberg found items but LLM says non-estimate -- trust kreuzberg
      console.log(
        `[pipeline]   LLM says non-estimate but kreuzberg found ${kreuzResult?.line_items.length ?? 0} items -- using kreuzberg`
      );
    }

    // Reconcile both extractions
    const { result, source } = await reconcileExtractions(
      kreuzResult,
      ingestResult?.result ?? null
    );

    await db.transaction(async () => {
      await saveExtractionResults(estimate.id, source, result);
    });

    if (result.line_items.length === 0 && result.grand_total === 0) {
      console.log(`[pipeline]   No items extracted: ${fileName}`);
    } else {
      console.log(
        `[pipeline]   Extracted (${source}): ${result.line_items.length} items, $${result.grand_total.toLocaleString()}`
      );
    }

    tryUnlink(pdfPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[pipeline]   Extraction failed: ${msg}`);
    await updateExtractionFailed.run(msg.slice(0, 500), estimate.id);
  }
}
