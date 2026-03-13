/**
 * Monday File Download Pipeline
 *
 * Downloads files from Monday.com items into local storage and creates
 * documents table rows with extraction_status='downloaded'.
 * The unified document backfill handles classification + extraction.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getItemAssets } from "@monday/client/assets";
import { getItemRich } from "@monday/client/rich";
import {
  type FileColumnAsset,
  parseFileColumnValue,
} from "@monday/sync/estimate-sync/file-assets";
import { FILE_COLUMNS, FILES_DIR } from "@monday/sync/pipeline-config";
import {
  getExistingAssets,
  insertAsset,
  updateEstimatePath,
} from "@monday/sync/pipeline-db";

interface FileColumnValue {
  id: string;
  value: string | null;
}

interface NewAssetDownload {
  assetId: number;
  columnId: string;
  fileName: string;
}

export interface ProcessItemFilesOptions {
  forceAssetIds?: Iterable<string>;
}

const DEFAULT_MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS = 30_000;

function readPositiveIntEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return parsed;
  }

  return fallback;
}

const MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS = readPositiveIntEnv(
  "MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS",
  DEFAULT_MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS
);

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(timeoutMessage)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function collectColumnAssets(
  columnValues: FileColumnValue[]
): Map<string, FileColumnAsset[]> {
  const columnAssets = new Map<string, FileColumnAsset[]>();
  for (const columnValue of columnValues) {
    if (!(columnValue.id in FILE_COLUMNS && columnValue.value)) {
      continue;
    }

    const assets = parseFileColumnValue(columnValue.value);
    if (assets.length > 0) {
      columnAssets.set(columnValue.id, assets);
    }
  }
  return columnAssets;
}

function collectNewAssetsToDownload(
  existingIds: Set<string>,
  columnAssets: Map<string, FileColumnAsset[]>
): NewAssetDownload[] {
  const newAssets: NewAssetDownload[] = [];

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
  return newAssets;
}

function buildAssetUrlMap(
  assets: Awaited<ReturnType<typeof getItemAssets>>
): Map<string, { public_url?: string | null }> {
  return new Map(assets.map((asset) => [asset.id, asset]));
}

async function downloadSingleAsset(
  mondayItemId: string,
  itemDir: string,
  toDownload: NewAssetDownload,
  assetUrlMap: Map<string, { public_url?: string | null }>
): Promise<boolean> {
  const assetData = assetUrlMap.get(String(toDownload.assetId));
  if (!assetData?.public_url) {
    console.log(
      `[pipeline]   Skip ${toDownload.fileName}: no public_url (asset ${toDownload.assetId})`
    );
    return false;
  }

  const response = await withTimeout(
    fetch(assetData.public_url),
    MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS,
    `Asset request timed out after ${MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS}ms`
  );
  if (!response.ok) {
    console.log(
      `[pipeline]   Failed ${toDownload.fileName}: HTTP ${response.status}`
    );
    return false;
  }

  const bytes = await withTimeout(
    response.arrayBuffer(),
    MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS,
    `Asset body read timed out after ${MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS}ms`
  );
  const buffer = new Uint8Array(bytes);
  const ext = toDownload.fileName.includes(".")
    ? toDownload.fileName.slice(toDownload.fileName.lastIndexOf("."))
    : "";

  const localPath = join(
    itemDir,
    `${toDownload.assetId}_${toDownload.fileName}`
  );
  writeFileSync(localPath, buffer);

  await insertAsset.run(
    String(toDownload.assetId),
    mondayItemId,
    toDownload.columnId,
    toDownload.fileName,
    ext,
    buffer.length,
    localPath
  );
  await updateEstimatePath.run(localPath, toDownload.fileName, mondayItemId);

  console.log(
    `[pipeline]   Downloaded ${toDownload.fileName} (${(
      buffer.length / 1024
    ).toFixed(0)}KB) -> extraction_status='downloaded'`
  );

  // Extraction is handled by the unified document backfill
  return true;
}

async function downloadAssets(
  mondayItemId: string,
  itemDir: string,
  assetsToDownload: NewAssetDownload[],
  assetUrlMap: Map<string, { public_url?: string | null }>
): Promise<number> {
  let downloaded = 0;
  for (const toDownload of assetsToDownload) {
    try {
      const didDownload = await downloadSingleAsset(
        mondayItemId,
        itemDir,
        toDownload,
        assetUrlMap
      );
      if (didDownload) {
        downloaded += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(
        `[pipeline]   Error downloading ${toDownload.fileName}: ${message}`
      );
    }
  }
  return downloaded;
}

export async function processItemFiles(
  mondayItemId: string,
  options?: ProcessItemFilesOptions
): Promise<number> {
  const item = await getItemRich(mondayItemId);
  if (!item) {
    console.log(`[pipeline] Item ${mondayItemId} not found`);
    return 0;
  }

  const columnAssets = collectColumnAssets(item.columnValues);
  if (columnAssets.size === 0) {
    return 0;
  }

  const existingRows = await getExistingAssets.all(mondayItemId);
  const existingIds = new Set(existingRows.map((row) => row.monday_asset_id));
  const forcedIds = options?.forceAssetIds
    ? new Set(Array.from(options.forceAssetIds, (id) => String(id)))
    : null;
  const newAssets = collectNewAssetsToDownload(existingIds, columnAssets);
  const forceDownloads: NewAssetDownload[] = [];
  if (forcedIds && forcedIds.size > 0) {
    for (const [columnId, assets] of columnAssets) {
      for (const asset of assets) {
        if (forcedIds.has(String(asset.assetId))) {
          forceDownloads.push({
            columnId,
            assetId: asset.assetId,
            fileName: asset.name,
          });
        }
      }
    }
  }
  const allDownloads = [
    ...newAssets,
    ...forceDownloads.filter(
      (forced) =>
        !newAssets.some(
          (next) =>
            next.assetId === forced.assetId && next.columnId === forced.columnId
        )
    ),
  ];

  if (allDownloads.length === 0) {
    return 0;
  }

  console.log(
    `[pipeline] ${item.name}: ${allDownloads.length} file(s) to download${forceDownloads.length > 0 ? ` (forced=${forceDownloads.length})` : ""}`
  );

  const allAssets = await getItemAssets(mondayItemId);
  const assetUrlMap = buildAssetUrlMap(allAssets);
  const itemDir = join(FILES_DIR, mondayItemId);
  ensureDir(itemDir);

  return downloadAssets(mondayItemId, itemDir, allDownloads, assetUrlMap);
}

/**
 * Check if an item has any file columns with content.
 * Used by the worker to decide whether to enqueue a download_files job.
 */
export function itemHasFiles(columnValues: FileColumnValue[]): boolean {
  for (const columnValue of columnValues) {
    if (!(columnValue.id in FILE_COLUMNS && columnValue.value)) {
      continue;
    }
    if (parseFileColumnValue(columnValue.value).length > 0) {
      return true;
    }
  }
  return false;
}
