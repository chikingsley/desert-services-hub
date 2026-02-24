/**
 * Monday.com Activity Log API client.
 *
 * Queries board activity logs to discover which items changed since a given
 * timestamp. Used for incremental sync — instead of fetching all items,
 * we fetch only the ones that changed.
 */

import { query } from "./query";

/** Event types that indicate an item was modified and needs re-sync. */
const ITEM_CHANGE_EVENTS = new Set([
  "update_column_value",
  "update_name",
  "create_pulse",
]);

export interface ActivityLogEntry {
  /** 17-digit Unix timestamp (divide by 10_000_000 for seconds) */
  createdAt: string;
  data: string;
  entity: "board" | "pulse";
  event: string;
  id: string;
  userId: string;
}

interface ActivityLogResponse {
  boards: {
    activity_logs: Array<{
      created_at: string;
      data: string;
      entity: string;
      event: string;
      id: string;
      user_id: string;
    }>;
  }[];
}

const MAX_LOGS_PER_PAGE = 500;
const MAX_PAGES = 20; // Safety cap: 10,000 logs max

/**
 * Parse Monday's 17-digit timestamp to a JS Date.
 * Monday uses epoch * 10^10 (10 billion), so divide by 10_000_000 to get ms.
 */
function parseActivityTimestamp(raw: string): Date {
  const ms = Number(raw) / 10_000;
  return new Date(ms);
}

type RawLog = ActivityLogResponse["boards"][number]["activity_logs"][number];

/** Extract item IDs and track the latest timestamp from a page of logs. */
function processLogPage(
  logs: RawLog[],
  itemIds: Set<string>
): { count: number; latest: Date | null } {
  let latest: Date | null = null;
  let count = 0;

  for (const log of logs) {
    count++;
    const ts = parseActivityTimestamp(log.created_at);
    if (!latest || ts > latest) {
      latest = ts;
    }

    if (log.entity !== "pulse" || !ITEM_CHANGE_EVENTS.has(log.event)) {
      continue;
    }

    try {
      const data = JSON.parse(log.data) as { pulse_id?: number };
      if (data.pulse_id) {
        itemIds.add(String(data.pulse_id));
      }
    } catch {
      // Malformed data field — skip
    }
  }

  return { count, latest };
}

async function fetchActivityPage(
  boardId: string,
  fromISO: string,
  page: number
): Promise<RawLog[]> {
  const result = await query<ActivityLogResponse>(`
    query {
      boards(ids: ${boardId}) {
        activity_logs(
          from: "${fromISO}"
          limit: ${MAX_LOGS_PER_PAGE}
          page: ${page}
        ) {
          id
          event
          entity
          data
          created_at
          user_id
        }
      }
    }
  `);
  return result.boards[0]?.activity_logs ?? [];
}

/**
 * Get item IDs that changed on a board since a given timestamp.
 *
 * Queries the activity_logs API with time-range filtering, extracts
 * unique pulse (item) IDs from item-related events.
 */
export async function getChangedItemIds(
  boardId: string,
  since: Date
): Promise<{
  itemIds: string[];
  latestTimestamp: Date | null;
  totalEvents: number;
}> {
  const fromISO = since.toISOString();
  const allItemIds = new Set<string>();
  let latestTimestamp: Date | null = null;
  let totalEvents = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const logs = await fetchActivityPage(boardId, fromISO, page);
    if (logs.length === 0) {
      break;
    }

    const { count, latest } = processLogPage(logs, allItemIds);
    totalEvents += count;
    if (latest && (!latestTimestamp || latest > latestTimestamp)) {
      latestTimestamp = latest;
    }

    if (logs.length < MAX_LOGS_PER_PAGE) {
      break;
    }
  }

  return {
    itemIds: [...allItemIds],
    latestTimestamp,
    totalEvents,
  };
}
