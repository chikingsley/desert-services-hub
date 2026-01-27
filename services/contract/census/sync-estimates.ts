/**
 * Monday.com Estimates Sync
 *
 * Syncs estimate data from Monday.com ESTIMATING board to the census database.
 * Downloads estimate PDFs to MinIO storage.
 *
 * Usage:
 *   bun services/email/census/sync-estimates.ts [options]
 *
 * Options:
 *   --limit=<n>        Max items to sync (default: all)
 *   --skip-files       Skip file downloads, only sync metadata
 *   --stats            Show sync statistics only
 *   --include-plans    Also download plan files (future)
 *   --include-contracts Also download contract files (future)
 */
import { BUCKETS, fileExists, uploadFile } from "@/lib/minio";
import {
  getItemsRich,
  type MondayItemRich,
  query,
} from "@/services/monday/client";
import { BOARD_IDS, ESTIMATING_COLUMNS } from "@/services/monday/types";
import {
  getEstimateByMondayId,
  getEstimateStats,
  type UpsertEstimateData,
  updateEstimateStorage,
  upsertEstimate,
} from "./db";

// ============================================
// Types
// ============================================

interface Asset {
  id: string;
  name: string;
  public_url: string;
}

interface ItemWithAssets {
  id: string;
  name: string;
  assets: Asset[];
}

interface SyncOptions {
  limit?: number;
  skipFiles?: boolean;
  includePlans?: boolean;
  includeContracts?: boolean;
  onProgress?: (progress: SyncProgress) => void;
}

interface SyncProgress {
  phase: "fetching" | "syncing" | "complete";
  current?: number;
  total?: number;
  itemName?: string;
  fileStatus?: "downloading" | "uploading" | "skipped" | "done" | "no-file";
}

interface SyncResult {
  itemsSynced: number;
  filesUploaded: number;
  filesSkipped: number;
  errors: string[];
}

// ============================================
// Asset Fetching
// ============================================

/**
 * Fetch asset URLs for items with file columns.
 * Monday's items_page doesn't include public_url, so we need a separate query.
 */
async function fetchItemAssets(
  itemIds: string[],
  columnId: string
): Promise<Map<string, Asset[]>> {
  if (itemIds.length === 0) {
    return new Map();
  }

  const result = await query<{ items: ItemWithAssets[] }>(`
    query {
      items(ids: [${itemIds.join(",")}]) {
        id
        name
        assets(column_ids: ["${columnId}"]) {
          id
          name
          public_url
        }
      }
    }
  `);

  const assetMap = new Map<string, Asset[]>();
  for (const item of result.items) {
    assetMap.set(item.id, item.assets ?? []);
  }
  return assetMap;
}

// ============================================
// Data Extraction
// ============================================

function parseNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/[,$]/g, "");
  const num = Number.parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

/**
 * Extract linked account ID from the ACCOUNTS board_relation column
 */
function extractAccountId(item: MondayItemRich): string | null {
  const accountsColumnId = ESTIMATING_COLUMNS.ACCOUNTS.id;
  const colValue = item.columnValues.find((cv) => cv.id === accountsColumnId);
  const linkedIds = colValue?.linkedItemIds;
  return linkedIds?.[0] ?? null;
}

/**
 * Batch fetch domains from CONTRACTORS board
 */
async function fetchAccountDomains(
  accountIds: string[]
): Promise<Map<string, string>> {
  const domainMap = new Map<string, string>();
  if (accountIds.length === 0) {
    return domainMap;
  }

  // Dedupe
  const uniqueIds = [...new Set(accountIds)];

  // Batch in groups of 100
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const batch = uniqueIds.slice(i, i + 100);
    const result = await query<{
      items: Array<{
        id: string;
        column_values: Array<{ id: string; text: string | null }>;
      }>;
    }>(`
      query {
        items(ids: [${batch.join(",")}]) {
          id
          column_values(ids: ["company_domain"]) {
            id
            text
          }
        }
      }
    `);

    for (const item of result.items) {
      const domainCol = item.column_values.find(
        (cv) => cv.id === "company_domain"
      );
      if (domainCol?.text) {
        domainMap.set(item.id, domainCol.text);
      }
    }
  }

  return domainMap;
}

function extractEstimateData(
  item: MondayItemRich,
  domainMap: Map<string, string>
): UpsertEstimateData {
  const cols = item.columns;
  const accountMondayId = extractAccountId(item);
  const accountDomain = accountMondayId
    ? (domainMap.get(accountMondayId) ?? null)
    : null;

  return {
    mondayItemId: item.id,
    name: item.name,
    estimateNumber: cols[ESTIMATING_COLUMNS.ESTIMATE_ID.id] ?? null,
    contractor: cols[ESTIMATING_COLUMNS.CONTRACTOR.id] ?? null,
    groupId: item.groupId,
    groupTitle: item.groupTitle,
    mondayUrl: item.url,
    accountMondayId,
    accountDomain,
    bidStatus: cols[ESTIMATING_COLUMNS.BID_STATUS.id] ?? null,
    bidValue: parseNumber(cols[ESTIMATING_COLUMNS.BID_VALUE.id]),
    awardedValue: parseNumber(cols[ESTIMATING_COLUMNS.AWARDED_VALUE.id]),
    bidSource: cols[ESTIMATING_COLUMNS.BID_SOURCE.id] ?? null,
    awarded: cols[ESTIMATING_COLUMNS.AWARDED.id] === "Yes",
    dueDate: cols[ESTIMATING_COLUMNS.DUE_DATE.id] ?? null,
    location: cols[ESTIMATING_COLUMNS.LOCATION.id] ?? null,
    sharepointUrl: cols[ESTIMATING_COLUMNS.SHAREPOINT_URL.id] ?? null,
  };
}

// ============================================
// File Download & Upload
// ============================================

async function downloadAndUploadEstimatePdf(
  mondayItemId: string,
  asset: Asset
): Promise<{ bucket: string; path: string } | null> {
  const objectPath = `${mondayItemId}/${asset.name}`;

  // Check if already uploaded
  const exists = await fileExists(BUCKETS.MONDAY_ESTIMATES, objectPath);
  if (exists) {
    return { bucket: BUCKETS.MONDAY_ESTIMATES, path: objectPath };
  }

  // Download from Monday's public URL
  const response = await fetch(asset.public_url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Upload to MinIO
  await uploadFile(
    BUCKETS.MONDAY_ESTIMATES,
    objectPath,
    buffer,
    "application/pdf"
  );

  return { bucket: BUCKETS.MONDAY_ESTIMATES, path: objectPath };
}

// ============================================
// Sync Logic
// ============================================

export async function syncEstimates(
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { limit, skipFiles = false, onProgress } = options;

  const result: SyncResult = {
    itemsSynced: 0,
    filesUploaded: 0,
    filesSkipped: 0,
    errors: [],
  };

  // Fetch items from ESTIMATING board (with optional limit for faster testing)
  onProgress?.({ phase: "fetching" });
  const fetchOptions = limit && limit > 0 ? { maxItems: limit } : {};
  let items = await getItemsRich(BOARD_IDS.ESTIMATING, fetchOptions);

  // Apply exact limit (Monday API returns pages of 500 minimum)
  if (limit && limit > 0 && items.length > limit) {
    items = items.slice(0, limit);
  }

  const total = items.length;
  onProgress?.({ phase: "syncing", current: 0, total });

  // Collect all account IDs and fetch their domains from CONTRACTORS board
  const accountIds = items
    .map((item) => extractAccountId(item))
    .filter((id): id is string => id !== null);
  const domainMap = await fetchAccountDomains(accountIds);

  // Batch fetch assets for items with estimate files
  const itemsWithEstimateColumn = items.filter((item) => {
    const fileValue = item.columns[ESTIMATING_COLUMNS.ESTIMATE.id];
    return fileValue && fileValue !== "";
  });

  const assetMap = new Map<string, Asset[]>();
  if (!skipFiles && itemsWithEstimateColumn.length > 0) {
    const itemIds = itemsWithEstimateColumn.map((i) => i.id);
    // Batch in groups of 100 to avoid query limits
    for (let i = 0; i < itemIds.length; i += 100) {
      const batch = itemIds.slice(i, i + 100);
      const batchAssets = await fetchItemAssets(
        batch,
        ESTIMATING_COLUMNS.ESTIMATE.id
      );
      for (const [id, assets] of batchAssets) {
        assetMap.set(id, assets);
      }
    }
  }

  // Process each item
  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    try {
      // Extract and upsert metadata (includes account domain lookup)
      const data = extractEstimateData(item, domainMap);
      upsertEstimate(data);
      result.itemsSynced++;

      // Handle file sync
      if (skipFiles) {
        onProgress?.({
          phase: "syncing",
          current: i + 1,
          total,
          itemName: item.name,
          fileStatus: "skipped",
        });
      } else {
        const assets = assetMap.get(item.id) ?? [];
        const pdfAssets = assets.filter(
          (a) => a.name.toLowerCase().endsWith(".pdf") && a.public_url
        );

        if (pdfAssets.length > 0) {
          // Use the first PDF (usually there's only one estimate)
          const asset = pdfAssets[0];
          const existing = getEstimateByMondayId(item.id);

          // Skip if already synced
          if (existing?.estimateStoragePath) {
            result.filesSkipped++;
            onProgress?.({
              phase: "syncing",
              current: i + 1,
              total,
              itemName: item.name,
              fileStatus: "skipped",
            });
          } else {
            onProgress?.({
              phase: "syncing",
              current: i + 1,
              total,
              itemName: item.name,
              fileStatus: "downloading",
            });

            const uploadResult = await downloadAndUploadEstimatePdf(
              item.id,
              asset
            );

            if (uploadResult) {
              updateEstimateStorage(
                item.id,
                uploadResult.bucket,
                uploadResult.path,
                asset.name
              );
              result.filesUploaded++;
            }

            onProgress?.({
              phase: "syncing",
              current: i + 1,
              total,
              itemName: item.name,
              fileStatus: "done",
            });
          }
        } else {
          onProgress?.({
            phase: "syncing",
            current: i + 1,
            total,
            itemName: item.name,
            fileStatus: "no-file",
          });
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`${item.name}: ${errMsg}`);
    }
  }

  onProgress?.({ phase: "complete", current: total, total });
  return result;
}

// ============================================
// CLI
// ============================================

function printStats(): void {
  const stats = getEstimateStats();

  console.log(`\n${"=".repeat(50)}`);
  console.log("ESTIMATES SYNC STATS");
  console.log("=".repeat(50));
  console.log(`Total estimates: ${stats.total.toLocaleString()}`);
  console.log(`With PDF file: ${stats.withFile.toLocaleString()}`);
  console.log(`Without PDF file: ${stats.withoutFile.toLocaleString()}`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);

  // Check for stats command
  if (args.includes("--stats")) {
    printStats();
    process.exit(0);
  }

  // Parse options
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const skipFiles = args.includes("--skip-files");
  const includePlans = args.includes("--include-plans");
  const includeContracts = args.includes("--include-contracts");

  const limit = limitArg
    ? Number.parseInt(limitArg.split("=")[1], 10)
    : undefined;

  console.log("=".repeat(50));
  console.log("MONDAY ESTIMATES SYNC");
  console.log("=".repeat(50));
  console.log(`Limit: ${limit ?? "all"}`);
  console.log(`Skip files: ${skipFiles}`);
  console.log(`Include plans: ${includePlans} (not implemented)`);
  console.log(`Include contracts: ${includeContracts} (not implemented)`);
  console.log(`${"=".repeat(50)}\n`);

  syncEstimates({
    limit,
    skipFiles,
    includePlans,
    includeContracts,
    onProgress: (p) => {
      if (p.phase === "fetching") {
        console.log("Fetching items from Monday.com...");
      } else if (p.phase === "syncing" && p.current !== undefined) {
        let icon = "\u2192";
        if (p.fileStatus === "done") {
          icon = "\u2713";
        } else if (p.fileStatus === "skipped") {
          icon = "\u21B7";
        } else if (p.fileStatus === "no-file") {
          icon = "\u2205";
        } else if (p.fileStatus === "downloading") {
          icon = "\u2193";
        }

        const name = (p.itemName ?? "").slice(0, 40).padEnd(40);
        console.log(`[${p.current}/${p.total}] ${icon} ${name}`);
      }
    },
  })
    .then((result) => {
      console.log(`\n${"=".repeat(50)}`);
      console.log("SYNC COMPLETE");
      console.log("=".repeat(50));
      console.log(`Items synced: ${result.itemsSynced}`);
      console.log(`Files uploaded: ${result.filesUploaded}`);
      console.log(`Files skipped (already synced): ${result.filesSkipped}`);

      if (result.errors.length > 0) {
        console.log(`\nErrors (${result.errors.length}):`);
        for (const err of result.errors.slice(0, 10)) {
          console.log(`  - ${err}`);
        }
        if (result.errors.length > 10) {
          console.log(`  ... and ${result.errors.length - 10} more`);
        }
      }

      printStats();
    })
    .catch((error) => {
      console.error("Sync failed:", error);
      process.exit(1);
    });
}
