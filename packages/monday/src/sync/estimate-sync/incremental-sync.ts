/**
 * Incremental estimate sync using Monday.com activity logs.
 *
 * Instead of fetching all ~4,780 items every cycle, queries the activity
 * log for items that changed since the last sync and syncs only those.
 * Falls back to a full sync if activity log returns too many changes
 * (e.g., after a long outage).
 */

import { db } from "@lib/db/client";
import { getChangedItemIds } from "@monday/client/activity-log";
import { BOARD_IDS } from "@monday/types/schema";
import { syncEstimateItem } from "./item-sync";

const SYNC_STATE_KEY = "monday_estimating_last_sync";

/**
 * Threshold: if the activity log returns more than this many changed items,
 * it's cheaper/safer to just do a full sync.
 */
const FULL_SYNC_THRESHOLD = 500;

interface IncrementalSyncResult {
  changedItemIds: number;
  errors: number;
  filesDetected: number;
  mode: "incremental" | "full_recommended";
  synced: number;
  totalEvents: number;
}

async function getLastSyncTimestamp(): Promise<Date> {
  const row = await db
    .query<{ value: string }>("SELECT value FROM sync_state WHERE key = $1")
    .get(SYNC_STATE_KEY);

  if (row?.value) {
    const parsed = new Date(row.value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // Default: 24 hours ago
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

async function updateLastSyncTimestamp(timestamp: Date): Promise<void> {
  await db.run(
    `INSERT INTO sync_state (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [SYNC_STATE_KEY, timestamp.toISOString()]
  );
}

/**
 * Run an incremental sync cycle.
 *
 * 1. Query activity log for changes since last sync
 * 2. If too many changes, recommend a full sync instead
 * 3. Otherwise, sync each changed item individually
 * 4. Update the last sync timestamp
 *
 * Returns file item IDs for downstream file download processing.
 */
export async function syncEstimatesIncremental(): Promise<{
  result: IncrementalSyncResult;
  estimateFileItemIds: string[];
}> {
  const since = await getLastSyncTimestamp();

  const { itemIds, latestTimestamp, totalEvents } = await getChangedItemIds(
    BOARD_IDS.ESTIMATING,
    since
  );

  // If too many changes, recommend falling back to full sync
  if (itemIds.length > FULL_SYNC_THRESHOLD) {
    return {
      result: {
        mode: "full_recommended",
        changedItemIds: itemIds.length,
        totalEvents,
        synced: 0,
        errors: 0,
        filesDetected: 0,
      },
      estimateFileItemIds: [],
    };
  }

  // If no changes, just update the timestamp and return
  if (itemIds.length === 0) {
    if (latestTimestamp) {
      await updateLastSyncTimestamp(latestTimestamp);
    }
    return {
      result: {
        mode: "incremental",
        changedItemIds: 0,
        totalEvents,
        synced: 0,
        errors: 0,
        filesDetected: 0,
      },
      estimateFileItemIds: [],
    };
  }

  // Sync each changed item
  let synced = 0;
  let errors = 0;
  const estimateFileItemIds: string[] = [];

  for (const itemId of itemIds) {
    try {
      const hasFiles = await syncEstimateItem(itemId);
      synced++;
      if (hasFiles) {
        estimateFileItemIds.push(itemId);
      }
    } catch {
      errors++;
    }
  }

  // Update timestamp to the latest event we processed
  const newTimestamp = latestTimestamp ?? new Date();
  await updateLastSyncTimestamp(newTimestamp);

  return {
    result: {
      mode: "incremental",
      changedItemIds: itemIds.length,
      totalEvents,
      synced,
      errors,
      filesDetected: estimateFileItemIds.length,
    },
    estimateFileItemIds,
  };
}
