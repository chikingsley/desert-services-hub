#!/usr/bin/env bun

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BOARD_IDS } from "../src/types/schema";

interface CliOptions {
  boardId: string;
  boardKey: string | null;
  concurrency: number;
  itemId: string | null;
  limit: number | null;
  outDir: string | null;
}

interface BackupTarget {
  assetId: number;
  columnId: string;
  fileName: string;
  groupTitle: string;
  itemId: string;
  itemName: string;
  mondayUrl: string;
}

interface BackupCounters {
  downloaded: number;
  errors: number;
  itemErrors: number;
  itemsProcessed: number;
  itemsWithFiles: number;
  skippedExisting: number;
}

interface MondayBoardMetadata {
  columns: Array<{
    id: string;
    title: string;
    type: string;
  }>;
  id: string;
  name: string;
}

interface MondayAsset {
  file_extension?: string | null;
  file_size?: number | null;
  id: string;
  name: string;
  public_url?: string | null;
}

interface MondayColumnValue {
  displayValue?: string;
  id: string;
  linkedItemIds?: string[];
  text: string | null;
  type: string;
  value: string | null;
}

interface MondayItemRich {
  columnValues: MondayColumnValue[];
  columns: Record<string, string | null>;
  groupId: string;
  groupTitle: string;
  id: string;
  name: string;
  url: string;
}

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;
const ITEM_PAGE_LIMIT = 10_000;
const PAGE_SIZE = 100;
const API_URL = "https://api.monday.com/v2";
const API_VERSION = "2026-01";
const MAX_API_RETRIES = 4;
const RETRY_DELAY_MS = 2_000;
const RELATION_COLUMN_TYPES = new Set(["board_relation", "mirror"]);

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "");
}

function defaultOutputDir(boardName: string): string {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return join(
    homedir(),
    "backups",
    "desert-services-hub",
    "monday-board-files",
    slugify(boardName),
    dateStamp
  );
}

function parseOptions(argv: string[]): CliOptions {
  let boardKey: string | null = null;
  let boardId = BOARD_IDS.ESTIMATING;
  let itemId: string | null = null;
  let limit: number | null = null;
  let outDir: string | null = process.env.MONDAY_BACKUP_DIR?.trim() || null;
  let concurrency = readPositiveInt(
    process.env.MONDAY_BACKUP_CONCURRENCY,
    DEFAULT_CONCURRENCY
  );

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--board-key") {
      boardKey = (argv[i + 1] ?? "").trim() || null;
      i += 1;
    } else if (arg === "--board-id") {
      boardId = (argv[i + 1] ?? "").trim() || boardId;
      i += 1;
    } else if (arg === "--item") {
      itemId = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--limit") {
      limit = readPositiveInt(argv[i + 1], 0) || null;
      i += 1;
    } else if (arg === "--out") {
      outDir = argv[i + 1] ?? outDir;
      i += 1;
    } else if (arg === "--concurrency") {
      concurrency = readPositiveInt(argv[i + 1], concurrency);
      i += 1;
    }
  }

  if (boardKey) {
    const key = boardKey.trim().toUpperCase();
    if (key in BOARD_IDS) {
      boardId = BOARD_IDS[key as keyof typeof BOARD_IDS];
      boardKey = key;
    } else {
      throw new Error(`Unknown board key: ${boardKey}`);
    }
  }

  return {
    boardId,
    boardKey,
    concurrency,
    itemId,
    limit,
    outDir,
  };
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readTimeoutMs(): number {
  return readPositiveInt(
    process.env.MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
}

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
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey(): string {
  const key = process.env.MONDAY_API_KEY?.trim();
  if (!key) {
    throw new Error("MONDAY_API_KEY environment variable is required");
  }
  return key;
}

async function mondayQuery<T>(graphqlQuery: string): Promise<T> {
  const timeoutMs = readPositiveInt(
    process.env.MONDAY_API_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS
  );
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_API_RETRIES; attempt += 1) {
    try {
      const response = await withTimeout(
        fetch(API_URL, {
          body: JSON.stringify({ query: graphqlQuery }),
          headers: {
            "API-Version": API_VERSION,
            Authorization: getApiKey(),
            "Content-Type": "application/json",
          },
          method: "POST",
        }),
        timeoutMs,
        `Monday API request timed out after ${timeoutMs}ms`
      );

      const text = await response.text();
      let payload: {
        data?: T;
        errors?: Array<{ message: string }>;
      };

      try {
        payload = JSON.parse(text) as {
          data?: T;
          errors?: Array<{ message: string }>;
        };
      } catch {
        const snippet = text.slice(0, 200).replaceAll(/\s+/g, " ").trim();
        throw new Error(
          `Monday API returned invalid JSON (status ${response.status}, attempt ${attempt}): ${snippet || "<empty>"}`
        );
      }

      const firstError = payload.errors?.[0];
      if (firstError) {
        throw new Error(`Monday API error: ${firstError.message}`);
      }

      if (!payload.data) {
        throw new Error("Monday API returned no data");
      }

      return payload.data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_API_RETRIES) {
        console.log(
          `[backup] retry monday api attempt=${attempt} ${lastError.message}`
        );
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("Monday API query failed");
}

function buildItemUrl(boardId: string, itemId: string): string {
  return `https://monday.com/boards/${boardId}/pulses/${itemId}`;
}

function getColumnDisplayValue(column: {
  display_value?: string;
  text: string | null;
  type: string;
}): string | null {
  const usesDisplayValue =
    RELATION_COLUMN_TYPES.has(column.type) && column.display_value;
  return usesDisplayValue ? (column.display_value ?? null) : column.text;
}

function mapRawColumn(column: {
  display_value?: string;
  id: string;
  linked_item_ids?: string[];
  text: string | null;
  type: string;
  value: string | null;
}): MondayColumnValue {
  return {
    displayValue: column.display_value,
    id: column.id,
    linkedItemIds: column.linked_item_ids,
    text: column.text,
    type: column.type,
    value: column.value,
  };
}

function mapRawItem(
  item: {
    board?: { id: string };
    column_values: Array<{
      display_value?: string;
      id: string;
      linked_item_ids?: string[];
      text: string | null;
      type: string;
      value: string | null;
    }>;
    group: { id: string; title: string };
    id: string;
    name: string;
  },
  boardId: string
): MondayItemRich {
  const columns: Record<string, string | null> = {};
  const columnValues: MondayColumnValue[] = [];

  for (const column of item.column_values) {
    columns[column.id] = getColumnDisplayValue(column);
    columnValues.push(mapRawColumn(column));
  }

  return {
    columnValues,
    columns,
    groupId: item.group.id,
    groupTitle: item.group.title,
    id: item.id,
    name: item.name,
    url: buildItemUrl(boardId, item.id),
  };
}

async function getBoardMetadata(boardId: string): Promise<MondayBoardMetadata> {
  const result = await mondayQuery<{
    boards: MondayBoardMetadata[];
  }>(`
    query {
      boards(ids: ${boardId}) {
        id
        name
        columns {
          id
          title
          type
        }
      }
    }
  `);

  const board = result.boards[0];
  if (!board) {
    throw new Error(`Board ${boardId} not found`);
  }

  return board;
}

async function getItemsRich(boardId: string): Promise<MondayItemRich[]> {
  const allItems: MondayItemRich[] = [];

  const firstResult = await mondayQuery<{
    boards: Array<{
      items_page: {
        cursor: string | null;
        items: Array<{
          column_values: Array<{
            display_value?: string;
            id: string;
            linked_item_ids?: string[];
            text: string | null;
            type: string;
            value: string | null;
          }>;
          group: { id: string; title: string };
          id: string;
          name: string;
        }>;
      };
    }>;
  }>(`
    query {
      boards(ids: ${boardId}) {
        items_page(limit: ${PAGE_SIZE}) {
          cursor
          items {
            id
            name
            group {
              id
              title
            }
            column_values {
              id
              type
              text
              value
              ... on BoardRelationValue {
                linked_item_ids
                display_value
              }
              ... on MirrorValue {
                display_value
              }
            }
          }
        }
      }
    }
  `);

  let cursor = firstResult.boards[0]?.items_page.cursor ?? null;
  let page = 1;
  for (const item of firstResult.boards[0]?.items_page.items ?? []) {
    allItems.push(mapRawItem(item, boardId));
  }
  console.log(`[backup] fetched page=${page} items=${allItems.length}`);

  while (cursor && allItems.length < ITEM_PAGE_LIMIT) {
    const nextResult = await mondayQuery<{
      next_items_page: {
        cursor: string | null;
        items: Array<{
          column_values: Array<{
            display_value?: string;
            id: string;
            linked_item_ids?: string[];
            text: string | null;
            type: string;
            value: string | null;
          }>;
          group: { id: string; title: string };
          id: string;
          name: string;
        }>;
      };
    }>(`
      query {
        next_items_page(limit: ${PAGE_SIZE}, cursor: "${cursor}") {
          cursor
          items {
            id
            name
            group {
              id
              title
            }
            column_values {
              id
              type
              text
              value
              ... on BoardRelationValue {
                linked_item_ids
                display_value
              }
              ... on MirrorValue {
                display_value
              }
            }
          }
        }
      }
    `);

    for (const item of nextResult.next_items_page.items ?? []) {
      allItems.push(mapRawItem(item, boardId));
    }
    cursor = nextResult.next_items_page.cursor ?? null;
    page += 1;
    if (page % 5 === 0 || !cursor) {
      console.log(`[backup] fetched page=${page} items=${allItems.length}`);
    }
  }

  return allItems;
}

async function getItemRich(itemId: string): Promise<MondayItemRich | null> {
  const result = await mondayQuery<{
    items: Array<{
      board: { id: string };
      column_values: Array<{
        display_value?: string;
        id: string;
        linked_item_ids?: string[];
        text: string | null;
        type: string;
        value: string | null;
      }>;
      group: { id: string; title: string };
      id: string;
      name: string;
    }>;
  }>(`
    query {
      items(ids: [${itemId}]) {
        id
        name
        board {
          id
        }
        group {
          id
          title
        }
        column_values {
          id
          type
          text
          value
          ... on BoardRelationValue {
            linked_item_ids
            display_value
          }
          ... on MirrorValue {
            display_value
          }
        }
      }
    }
  `);

  const item = result.items[0];
  if (!item) {
    return null;
  }

  return mapRawItem(item, item.board.id);
}

async function getItemAssets(itemId: string): Promise<MondayAsset[]> {
  const result = await mondayQuery<{
    items: Array<{ assets: MondayAsset[] }>;
  }>(`
    query {
      items(ids: [${itemId}]) {
        assets(assets_source: all) {
          id
          name
          public_url
          file_extension
          file_size
        }
      }
    }
  `);

  return result.items[0]?.assets ?? [];
}

function parseFileColumnValue(rawValue: string | null): Array<{
  assetId: number;
  name: string;
}> {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as {
      files?: Array<{ assetId?: number; name?: string }>;
    };
    const files = parsed.files ?? [];
    return files
      .filter((file) => typeof file.assetId === "number")
      .map((file) => ({
        assetId: file.assetId as number,
        name:
          typeof file.name === "string" && file.name.trim().length > 0
            ? file.name
            : String(file.assetId),
      }));
  } catch {
    return [];
  }
}

function collectTargetsForItem(
  item: MondayItemRich,
  fileColumns: Map<string, string>
): BackupTarget[] {
  const targets: BackupTarget[] = [];

  for (const columnValue of item.columnValues) {
    if (!fileColumns.has(columnValue.id)) {
      continue;
    }

    const assets = parseFileColumnValue(columnValue.value);
    if (assets.length === 0) {
      continue;
    }

    for (const asset of assets) {
      targets.push({
        assetId: asset.assetId,
        columnId: columnValue.id,
        fileName: asset.name,
        groupTitle: item.groupTitle,
        itemId: item.id,
        itemName: item.name,
        mondayUrl: item.url,
      });
    }
  }

  return targets;
}

function buildAssetUrlMap(
  assets: MondayAsset[]
): Map<string, { public_url?: string | null }> {
  return new Map(
    assets.map((asset) => [asset.id, { public_url: asset.public_url }])
  );
}

function appendManifest(manifestPath: string, payload: Record<string, unknown>): void {
  appendFileSync(manifestPath, `${JSON.stringify(payload)}\n`);
}

async function downloadAssetToPath(
  publicUrl: string,
  outputPath: string,
  timeoutMs: number
): Promise<number> {
  const response = await withTimeout(
    fetch(publicUrl),
    timeoutMs,
    `Asset request timed out after ${timeoutMs}ms`
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const bytes = await withTimeout(
    response.arrayBuffer(),
    timeoutMs,
    `Asset body read timed out after ${timeoutMs}ms`
  );
  const buffer = new Uint8Array(bytes);
  writeFileSync(outputPath, buffer);
  return buffer.length;
}

async function backupItem(
  itemTargets: BackupTarget[],
  outDir: string,
  manifestPath: string,
  timeoutMs: number,
  boardId: string,
  boardName: string,
  fileColumns: Map<string, string>
): Promise<Pick<BackupCounters, "downloaded" | "errors" | "skippedExisting">> {
  const first = itemTargets[0];
  if (!first) {
    return { downloaded: 0, errors: 0, skippedExisting: 0 };
  }

  const itemDir = join(outDir, first.itemId);
  ensureDir(itemDir);

  const assets = await getItemAssets(first.itemId);
  const assetUrlMap = buildAssetUrlMap(assets);

  let downloaded = 0;
  let errors = 0;
  let skippedExisting = 0;

  for (const target of itemTargets) {
    const outputPath = join(itemDir, `${target.assetId}_${target.fileName}`);
    const columnTitle = fileColumns.get(target.columnId) ?? target.columnId;

    if (existsSync(outputPath)) {
      skippedExisting += 1;
      appendManifest(manifestPath, {
        assetId: String(target.assetId),
        boardId,
        boardName,
        columnId: target.columnId,
        columnTitle,
        itemId: target.itemId,
        itemName: target.itemName,
        mondayUrl: target.mondayUrl,
        outputPath,
        status: "skipped_existing",
      });
      continue;
    }

    const assetData = assetUrlMap.get(String(target.assetId));
    const publicUrl = assetData?.public_url;
    if (!publicUrl) {
      errors += 1;
      appendManifest(manifestPath, {
        assetId: String(target.assetId),
        boardId,
        boardName,
        columnId: target.columnId,
        columnTitle,
        error: "missing_public_url",
        itemId: target.itemId,
        itemName: target.itemName,
        mondayUrl: target.mondayUrl,
        outputPath,
        status: "error",
      });
      continue;
    }

    try {
      const bytes = await downloadAssetToPath(publicUrl, outputPath, timeoutMs);
      downloaded += 1;
      appendManifest(manifestPath, {
        assetId: String(target.assetId),
        boardId,
        boardName,
        bytes,
        columnId: target.columnId,
        columnTitle,
        fileName: target.fileName,
        groupTitle: target.groupTitle,
        itemId: target.itemId,
        itemName: target.itemName,
        mondayUrl: target.mondayUrl,
        outputPath,
        status: "downloaded",
      });
    } catch (error) {
      errors += 1;
      appendManifest(manifestPath, {
        assetId: String(target.assetId),
        boardId,
        boardName,
        columnId: target.columnId,
        columnTitle,
        error: error instanceof Error ? error.message : String(error),
        fileName: target.fileName,
        groupTitle: target.groupTitle,
        itemId: target.itemId,
        itemName: target.itemName,
        mondayUrl: target.mondayUrl,
        outputPath,
        status: "error",
      });
    }
  }

  return { downloaded, errors, skippedExisting };
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const timeoutMs = readTimeoutMs();
  const options = parseOptions(process.argv.slice(2));
  const board = await getBoardMetadata(options.boardId);
  const fileColumns = new Map(
    board.columns
      .filter((column) => column.type === "file")
      .map((column) => [column.id, column.title])
  );

  if (fileColumns.size === 0) {
    throw new Error(`Board ${board.name} (${board.id}) has no file columns`);
  }

  const outDir = options.outDir ?? defaultOutputDir(board.name);
  ensureDir(outDir);

  const summaryPath = join(outDir, "summary.json");
  const manifestPath = join(outDir, "manifest.ndjson");

  console.log(
    `[backup] board=${board.id} name=${JSON.stringify(board.name)} key=${options.boardKey ?? "custom"} out=${outDir} concurrency=${options.concurrency} item=${options.itemId ?? "all"} limit=${options.limit ?? "none"}`
  );
  console.log(
    `[backup] file_columns=${JSON.stringify([...fileColumns.entries()])}`
  );

  const items = options.itemId
    ? [await getItemRich(options.itemId)].filter(
        (item): item is MondayItemRich => item !== null
      )
    : await getItemsRich(board.id);

  const allTargets = items
    .flatMap((item) => collectTargetsForItem(item, fileColumns))
    .reduce<Map<string, BackupTarget[]>>((map, target) => {
      const list = map.get(target.itemId) ?? [];
      list.push(target);
      map.set(target.itemId, list);
      return map;
    }, new Map());

  let itemTargetEntries = [...allTargets.entries()];
  if (options.limit !== null) {
    itemTargetEntries = itemTargetEntries.slice(0, options.limit);
  }

  const counters: BackupCounters = {
    downloaded: 0,
    errors: 0,
    itemErrors: 0,
    itemsProcessed: 0,
    itemsWithFiles: itemTargetEntries.length,
    skippedExisting: 0,
  };

  let cursor = 0;

  async function worker(workerId: number): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= itemTargetEntries.length) {
        return;
      }

      const [, itemTargets] = itemTargetEntries[index] as [string, BackupTarget[]];
      const itemId = itemTargets[0]?.itemId ?? "unknown";
      const itemName = itemTargets[0]?.itemName ?? "unknown";

      try {
        const result = await backupItem(
          itemTargets,
          outDir,
          manifestPath,
          timeoutMs,
          board.id,
          board.name,
          fileColumns
        );
        counters.itemsProcessed += 1;
        counters.downloaded += result.downloaded;
        counters.errors += result.errors;
        counters.skippedExisting += result.skippedExisting;
        if (
          result.downloaded > 0 ||
          result.errors > 0 ||
          counters.itemsProcessed % 25 === 0
        ) {
          console.log(
            `[backup] progress ${counters.itemsProcessed}/${itemTargetEntries.length} worker=${workerId} item=${itemId} name=${JSON.stringify(itemName)} downloaded=${result.downloaded} skipped=${result.skippedExisting} errors=${result.errors}`
          );
        }
      } catch (error) {
        counters.itemsProcessed += 1;
        counters.itemErrors += 1;
        counters.errors += 1;
        console.log(
          `[backup] item_error ${counters.itemsProcessed}/${itemTargetEntries.length} worker=${workerId} item=${itemId} ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: options.concurrency }, (_, index) => worker(index + 1))
  );

  const finishedAt = Date.now();
  const summary = {
    boardId: board.id,
    boardName: board.name,
    downloaded: counters.downloaded,
    elapsedSec: Math.round((finishedAt - startedAt) / 1000),
    errors: counters.errors,
    fileColumns: [...fileColumns.entries()].map(([id, title]) => ({ id, title })),
    itemErrors: counters.itemErrors,
    itemsProcessed: counters.itemsProcessed,
    itemsWithFiles: counters.itemsWithFiles,
    outDir,
    skippedExisting: counters.skippedExisting,
    startedAt: new Date(startedAt).toISOString(),
  };

  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`[backup] done ${JSON.stringify(summary)}`);
}

main().catch((error) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[backup] fatal ${message}`);
  process.exit(1);
});
