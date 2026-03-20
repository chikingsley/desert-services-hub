/**
 * GC Cleanup Job
 *
 * Finds estimates in Open/Sent groups that match a Won project name,
 * and updates them to "GC Not Awarded" status.
 *
 * Uses the shared packages/monday query client (reads MONDAY_API_KEY
 * from process.env, includes retry + rate-limit handling).
 */

import { query } from "@monday/client/query";
import { updateItem } from "@monday/client/search";
import {
  BOARD_IDS,
  ESTIMATING_COLUMNS,
  ESTIMATING_GROUPS,
} from "@monday/types/schema";
import type { CleanupResult } from "./types";
import { GC_NOT_AWARDED, getBaseName, sleep } from "./utils";

interface GroupItem {
  bidStatus: string | null;
  id: string;
  name: string;
}

interface ItemsPage {
  cursor: string | null;
  items: Array<{
    id: string;
    name: string;
    column_values: Array<{ label?: string }>;
  }>;
}

function collectGroupItems(page: ItemsPage | null, into: GroupItem[]) {
  for (const item of page?.items ?? []) {
    into.push({
      id: item.id,
      name: item.name,
      bidStatus: item.column_values?.[0]?.label ?? null,
    });
  }
}

async function getItemsFromGroup(groupId: string): Promise<GroupItem[]> {
  const items: GroupItem[] = [];

  const itemFields = `
    id
    name
    column_values(ids: ["${ESTIMATING_COLUMNS.BID_STATUS.id}"]) {
      ... on StatusValue { label }
    }
  `;

  // First page: nested in boards/groups
  const firstData = await query<{
    boards: Array<{ groups: Array<{ items_page: ItemsPage }> }>;
  }>(`
    query {
      boards(ids: ${BOARD_IDS.ESTIMATING}) {
        groups(ids: "${groupId}") {
          items_page(limit: 500) {
            cursor
            items { ${itemFields} }
          }
        }
      }
    }
  `);

  const firstPage = firstData.boards?.[0]?.groups?.[0]?.items_page ?? null;
  collectGroupItems(firstPage, items);
  let cursor = firstPage?.cursor ?? null;

  // Subsequent pages: next_items_page at root level
  while (cursor) {
    const nextData = await query<{ next_items_page: ItemsPage }>(`
      query {
        next_items_page(limit: 500, cursor: "${cursor}") {
          cursor
          items { ${itemFields} }
        }
      }
    `);

    collectGroupItems(nextData.next_items_page, items);
    cursor = nextData.next_items_page?.cursor ?? null;
  }

  return items;
}

export async function runCleanup(dryRun = false): Promise<CleanupResult> {
  const result: CleanupResult = {
    wonCount: 0,
    openSentCount: 0,
    toUpdateCount: 0,
    updatedCount: 0,
    errors: [],
  };

  try {
    console.log("[GC Cleanup] Fetching Won items...");
    const wonItems = await getItemsFromGroup(ESTIMATING_GROUPS.WON);
    result.wonCount = wonItems.length;
    console.log(`[GC Cleanup] Found ${wonItems.length} Won items`);

    const wonBaseNames = new Set(wonItems.map((i) => getBaseName(i.name)));

    console.log("[GC Cleanup] Fetching Open + Sent items...");
    const openItems = await getItemsFromGroup(ESTIMATING_GROUPS.OPEN);
    const sentItems = await getItemsFromGroup(ESTIMATING_GROUPS.SENT);
    const openSentItems = [...openItems, ...sentItems];
    result.openSentCount = openSentItems.length;
    console.log(`[GC Cleanup] Found ${openSentItems.length} Open/Sent items`);

    const toUpdate = openSentItems.filter((item) => {
      const baseName = getBaseName(item.name);
      return wonBaseNames.has(baseName) && item.bidStatus !== GC_NOT_AWARDED;
    });

    result.toUpdateCount = toUpdate.length;
    console.log(`[GC Cleanup] ${toUpdate.length} items match Won projects`);

    if (dryRun) {
      console.log("[GC Cleanup] Dry run - not updating");
      return result;
    }

    for (const item of toUpdate) {
      try {
        await updateItem({
          boardId: BOARD_IDS.ESTIMATING,
          itemId: item.id,
          columnValues: {
            [ESTIMATING_COLUMNS.BID_STATUS.id]: { label: GC_NOT_AWARDED },
          },
        });
        result.updatedCount++;
        console.log(`[GC Cleanup] Updated: ${item.name}`);
        await sleep(200);
      } catch (error) {
        const msg = `Failed to update ${item.name}: ${error}`;
        result.errors.push(msg);
        console.error(`[GC Cleanup] ${msg}`);
      }
    }

    return result;
  } catch (error) {
    result.errors.push(`Cleanup failed: ${error}`);
    console.error(`[GC Cleanup] ${error}`);
    return result;
  }
}
