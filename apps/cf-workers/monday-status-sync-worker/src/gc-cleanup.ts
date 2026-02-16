/**
 * GC Cleanup Job
 *
 * Finds estimates in Open/Sent groups that match a Won project name,
 * and updates them to "GC Not Awarded" status.
 */

import {
  getItemsFromGroup,
  OPEN_GROUP,
  SENT_GROUP,
  TARGET_STATUS,
  updateItemStatus,
  WON_GROUP,
} from "./monday-api";
import type { CleanupResult, Env } from "./types";
import { getBaseName, sleep } from "./utils";

export async function runCleanup(
  env: Env,
  dryRun = false
): Promise<CleanupResult> {
  const result: CleanupResult = {
    wonCount: 0,
    openSentCount: 0,
    toUpdateCount: 0,
    updatedCount: 0,
    errors: [],
  };

  try {
    // 1. Get all Won items
    console.log("[GC Cleanup] Fetching Won items...");
    const wonItems = await getItemsFromGroup(env, WON_GROUP);
    result.wonCount = wonItems.length;
    console.log(`[GC Cleanup] Found ${wonItems.length} Won items`);

    // Build set of base names from Won items
    const wonBaseNames = new Set(wonItems.map((i) => getBaseName(i.name)));

    // 2. Get Open + Sent items
    console.log("[GC Cleanup] Fetching Open + Sent items...");
    const openItems = await getItemsFromGroup(env, OPEN_GROUP);
    const sentItems = await getItemsFromGroup(env, SENT_GROUP);
    const openSentItems = [...openItems, ...sentItems];
    result.openSentCount = openSentItems.length;
    console.log(`[GC Cleanup] Found ${openSentItems.length} Open/Sent items`);

    // 3. Find items to update (matching Won base names, not already GC Not Awarded)
    const toUpdate = openSentItems.filter((item) => {
      const baseName = getBaseName(item.name);
      return wonBaseNames.has(baseName) && item.bidStatus !== TARGET_STATUS;
    });

    result.toUpdateCount = toUpdate.length;
    console.log(`[GC Cleanup] ${toUpdate.length} items match Won projects`);

    if (dryRun) {
      console.log("[GC Cleanup] Dry run - not updating");
      return result;
    }

    // 4. Update items to GC Not Awarded
    for (const item of toUpdate) {
      try {
        await updateItemStatus(env, item.id, TARGET_STATUS);
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
