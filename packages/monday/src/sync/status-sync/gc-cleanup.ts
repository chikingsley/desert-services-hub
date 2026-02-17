/**
 * GC Cleanup Job
 *
 * Finds estimates in Open/Sent groups that match a Won project name,
 * and updates them to "GC Not Awarded" status.
 *
 * Uses the shared packages/monday query client (reads MONDAY_API_KEY
 * from process.env, includes retry + rate-limit handling).
 */

import { query } from "../../client/query";
import { updateItem } from "../../client/search";
import {
  BOARD_IDS,
  ESTIMATING_COLUMNS,
  ESTIMATING_GROUPS,
} from "../../types/schema";
import type { CleanupResult } from "./types";
import { GC_NOT_AWARDED, getBaseName, sleep } from "./utils";

interface GroupItem {
  id: string;
  name: string;
  bidStatus: string | null;
}

interface GroupItemsPageResponse {
  boards: Array<{
    groups: Array<{
      items_page: {
        cursor: string | null;
        items: Array<{
          id: string;
          name: string;
          column_values: Array<{ label?: string }>;
        }>;
      };
    }>;
  }>;
}

async function getItemsFromGroup(groupId: string): Promise<GroupItem[]> {
  const items: GroupItem[] = [];
  let cursor: string | null = null;

  do {
    const cursorPart: string = cursor ? `, cursor: "${cursor}"` : "";

    const data: GroupItemsPageResponse = await query<GroupItemsPageResponse>(`
      query {
        boards(ids: ${BOARD_IDS.ESTIMATING}) {
          groups(ids: "${groupId}") {
            items_page(limit: 500${cursorPart}) {
              cursor
              items {
                id
                name
                column_values(ids: ["${ESTIMATING_COLUMNS.BID_STATUS.id}"]) {
                  ... on StatusValue { label }
                }
              }
            }
          }
        }
      }
    `);

    const page = data.boards?.[0]?.groups?.[0]?.items_page ?? null;
    if (page?.items) {
      for (const item of page.items) {
        items.push({
          id: item.id,
          name: item.name,
          bidStatus: item.column_values?.[0]?.label ?? null,
        });
      }
    }
    cursor = page?.cursor ?? null;
  } while (cursor);

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
