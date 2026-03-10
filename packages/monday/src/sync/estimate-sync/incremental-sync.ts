/**
 * Incremental estimate sync using Monday.com activity logs.
 *
 * Instead of fetching all ~4,780 items every cycle, queries the activity
 * log for items that changed since the last sync and syncs only those.
 * Falls back to a full sync if activity log returns too many changes
 * (e.g., after a long outage).
 */

import { db } from "@lib/db/client";
import {
  type ChangedItemLogResult,
  getChangedItemIds,
} from "@monday/client/activity-log";
import { BOARD_IDS } from "@monday/types/schema";
import { readPositiveIntEnv } from "../../env";

const SYNC_STATE_KEY = "monday_estimating_last_sync";

/**
 * Threshold: if the activity log returns more than this many changed items,
 * it's cheaper/safer to just do a full sync.
 */
const FULL_SYNC_THRESHOLD = readPositiveIntEnv(
  "MONDAY_INCREMENTAL_FULL_RECOMMENDED_THRESHOLD",
  500
);

interface IncrementalSyncResult {
  changedItemIds: number;
  errors: number;
  filesDetected: number;
  metadata: {
    truncated: boolean;
    reason?: "max_pages" | "max_item_ids" | "deadline" | "error";
  };
  mode: "incremental" | "full_recommended";
  synced: number;
  totalEvents: number;
}

interface IncrementalSyncOptions {
  maxDurationMs?: number;
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

export async function setIncrementalSyncCursor(timestamp: Date): Promise<void> {
  await updateLastSyncTimestamp(timestamp);
}

/**
 * Run an incremental sync cycle.
 *
 * 1. Query activity log for changes since last sync
 * 2. If too many changes, recommend a full sync instead
 * 3. Otherwise, return changed item IDs for downstream sync workers
 * 4. Update the last sync cursor is done in the caller after successful handoff
 *
 * Returns changed estimate item IDs for downstream item sync workers.
 */
export async function syncEstimatesIncremental(
  options: IncrementalSyncOptions = {}
): Promise<{
  result: IncrementalSyncResult;
  estimateItemIds: string[];
  latestTimestamp: Date | null;
}> {
  const since = await getLastSyncTimestamp();
  const deadlineMs =
    options.maxDurationMs === undefined
      ? undefined
      : Date.now() + options.maxDurationMs;

  let changedItems: ChangedItemLogResult;
  try {
    changedItems = await getChangedItemIds(BOARD_IDS.ESTIMATING, since, {
      maxItemIds: FULL_SYNC_THRESHOLD + 1,
      deadlineMs,
      maxQueryRetries: undefined,
    });
  } catch {
    return {
      result: {
        mode: "full_recommended",
        changedItemIds: 0,
        totalEvents: 0,
        synced: 0,
        errors: 0,
        filesDetected: 0,
        metadata: { truncated: true, reason: "error" },
      },
      estimateItemIds: [],
      latestTimestamp: null,
    };
  }

  const { itemIds, latestTimestamp, totalEvents, metadata } = changedItems;

  // If we didn't read the full activity log slice, fall back to full sync.
  if (metadata.truncated) {
    return {
      result: {
        mode: "full_recommended",
        changedItemIds: itemIds.length,
        totalEvents,
        synced: 0,
        errors: 0,
        filesDetected: 0,
        metadata,
      },
      estimateItemIds: itemIds,
      latestTimestamp,
    };
  }

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
        metadata,
      },
      estimateItemIds: itemIds,
      latestTimestamp,
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
        metadata: { truncated: false },
      },
      estimateItemIds: [],
      latestTimestamp,
    };
  }

  // Return candidate item IDs so the trigger pipeline can fan out work.
  const dedupedItemIds = [...new Set(itemIds)];

  return {
    result: {
      mode: "incremental",
      changedItemIds: dedupedItemIds.length,
      totalEvents,
      synced: dedupedItemIds.length,
      errors: 0,
      filesDetected: 0,
      metadata,
    },
    estimateItemIds: dedupedItemIds,
    latestTimestamp,
  };
}
