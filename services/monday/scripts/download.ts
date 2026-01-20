import { join } from "node:path";
import { query } from "../client";
import type { MondayItem } from "../types";

/**
 * Script to download estimate PDFs from Monday.com boards.
 * Uses native Bun APIs for file operations and fetching.
 */

interface BoardConfig {
  boardId: string;
  fileColumnId: string;
}

interface Asset {
  id: string;
  name: string;
  public_url: string;
}

interface MondayItemWithAssets extends MondayItem {
  assets?: Asset[];
}

interface BatchItem {
  id: string;
  name: string;
  column_values: Array<{ id: string; value: string | null }>;
}

interface MondayItemsPageResponse {
  boards: Array<{
    items_page: {
      cursor: string | null;
      items: BatchItem[];
    };
  }>;
}

async function fetchAssetDetails(itemIds: string[], columnId: string) {
  return await query<{ items: MondayItemWithAssets[] }>(`
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
}

async function downloadSingleAsset(
  asset: Asset,
  itemName: string,
  outputDir: string
): Promise<boolean> {
  const sanitizedItemName = itemName.replace(/[/\\?%*:|"<>]/g, "-");
  const fileName = `${sanitizedItemName}_${asset.name}`;
  const filePath = join(outputDir, fileName);

  if (await Bun.file(filePath).exists()) {
    console.log(`⏩ Skipping existing: ${fileName}`);
    return true;
  }

  console.log(`📥 Downloading: ${fileName}...`);
  try {
    const fileResponse = await fetch(asset.public_url);
    if (!fileResponse.ok) {
      throw new Error(`Status: ${fileResponse.status}`);
    }
    const arrayBuffer = await fileResponse.arrayBuffer();
    await Bun.write(filePath, arrayBuffer);
    console.log(`✅ Saved: ${fileName}`);
    return true;
  } catch (err) {
    console.error(
      `❌ Failed to download ${asset.name} from item ${itemName}:`,
      err
    );
    return false;
  }
}

async function processItemsBatch(
  items: BatchItem[],
  columnId: string,
  outputDir: string,
  targetCount: number,
  currentTotal: number
): Promise<number> {
  let downloadedInRange = 0;
  if (items.length === 0) {
    return 0;
  }

  const itemIds = items.map((i) => i.id);
  const assetResponse = await fetchAssetDetails(itemIds, columnId);

  for (const item of assetResponse.items) {
    if (!item.assets || item.assets.length === 0) {
      continue;
    }
    for (const asset of item.assets) {
      if (currentTotal + downloadedInRange >= targetCount) {
        break;
      }
      const success = await downloadSingleAsset(asset, item.name, outputDir);
      if (success) {
        downloadedInRange++;
      }
    }
    if (currentTotal + downloadedInRange >= targetCount) {
      break;
    }
  }
  return downloadedInRange;
}

async function downloadEstimates() {
  const config: BoardConfig = {
    boardId: "7943937851",
    fileColumnId: "file_mksebs2e",
  };
  const targetCount = 20;
  let totalDownloaded = 0;
  let cursor: string | null = null;
  const outputDir = join(process.cwd(), "estimates");

  const { mkdir } = await import("node:fs/promises");
  if (!(await Bun.file(outputDir).exists())) {
    await mkdir(outputDir, { recursive: true });
  }

  console.log(
    `🚀 Starting download of ${targetCount} estimates to ${outputDir}...`
  );

  while (totalDownloaded < targetCount) {
    const cursorParam = cursor ? `, cursor: "${cursor}"` : "";
    const response = await query<MondayItemsPageResponse>(`
      query {
        boards(ids: ${config.boardId}) {
          items_page(limit: 500${cursorParam}) {
            cursor
            items {
              id
              name
              column_values(ids: ["${config.fileColumnId}"]) {
                id
                value
              }
            }
          }
        }
      }
    `);

    const itemsPage = response.boards[0]?.items_page;
    if (!itemsPage) {
      break;
    }

    const itemsWithFiles = itemsPage.items.filter((item) => {
      const col = item.column_values[0];
      return col?.value && col.value !== "{}" && col.value !== "null";
    });

    console.log(
      `📦 Found ${itemsWithFiles.length} items with files in current batch.`
    );

    const remaining = targetCount - totalDownloaded;
    const batch = itemsWithFiles.slice(0, remaining);

    totalDownloaded += await processItemsBatch(
      batch,
      config.fileColumnId,
      outputDir,
      targetCount,
      totalDownloaded
    );

    cursor = itemsPage.cursor;
    if (!cursor) {
      break;
    }
  }

  console.log(`✨ Successfully processed ${totalDownloaded} estimates.`);
}

downloadEstimates().catch(console.error);
