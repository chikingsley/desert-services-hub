/**
 * Monday.com Activity Log API client.
 *
 * Queries board activity logs to discover which items changed since a given
 * timestamp. Used for incremental sync — instead of fetching all items,
 * we fetch only the ones that changed.
 */

import { readPositiveIntEnv } from "../env";
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

const MAX_LOGS_PER_PAGE = readPositiveIntEnv(
  "MONDAY_ACTIVITY_LOG_PAGE_SIZE",
  100
);
const MAX_PAGES = readPositiveIntEnv("MONDAY_ACTIVITY_LOG_MAX_PAGES", 20);
const MAX_RETRIES = readPositiveIntEnv("MONDAY_ACTIVITY_LOG_MAX_RETRIES", 2);
const REQUEST_TIMEOUT_MS = readPositiveIntEnv(
  "MONDAY_ACTIVITY_LOG_REQUEST_TIMEOUT_MS",
  30_000
);
const QUERY_TIMEOUT_SAFETY_SLACK_MS = 1_000;
const MIN_QUERY_TIMEOUT_MS = 1_000;

export interface ChangedItemLogOptions {
  /** Optional hard deadline for the scan, in epoch ms. */
  deadlineMs?: number;
  /** Early-stop once we collect this many unique pulse IDs. */
  maxItemIds?: number;
  /** Optional page cap override (for tests/emergency throttling). */
  maxPages?: number;
  /** Optional retry limit for activity-log calls. */
  maxQueryRetries?: number;
  /** Optional page-size override for activity log pages. */
  pageSize?: number;
  /** Optional query-time overrides for activity-log calls. */
  queryTimeoutMs?: number;
}

export interface ChangedItemLogResult {
  itemIds: string[];
  latestTimestamp: Date | null;
  metadata: ChangedItemLogMetadata;
  totalEvents: number;
}

export interface ChangedItemLogMetadata {
  /** Why the scan ended without exhausting available logs. */
  reason?: "max_pages" | "max_item_ids" | "deadline" | "error";
  /** True when the scan stopped before all available logs were consumed. */
  truncated: boolean;
}

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
  page: number,
  pageSize: number,
  timeoutMs: number,
  options: ChangedItemLogOptions
): Promise<RawLog[]> {
  const result = await query<ActivityLogResponse>(
    `
    query {
      boards(ids: ${boardId}) {
        activity_logs(
          from: "${fromISO}"
          limit: ${pageSize}
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
    `,
    {
      timeoutMs,
      maxRetries: options.maxQueryRetries ?? MAX_RETRIES,
    }
  );
  return result.boards[0]?.activity_logs ?? [];
}

function getRemainingQueryTimeout(
  deadlineMs: number | undefined,
  defaultTimeoutMs: number
): number {
  if (deadlineMs === undefined) {
    return Math.max(MIN_QUERY_TIMEOUT_MS, defaultTimeoutMs);
  }

  const remainingMs = deadlineMs - Date.now() - QUERY_TIMEOUT_SAFETY_SLACK_MS;
  if (remainingMs <= MIN_QUERY_TIMEOUT_MS) {
    return 0;
  }

  return Math.min(defaultTimeoutMs, remainingMs);
}

/**
 * Get item IDs that changed on a board since a given timestamp.
 *
 * Queries the activity_logs API with time-range filtering, extracts
 * unique pulse (item) IDs from item-related events.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: bounded loop with explicit deadline/page controls.
export async function getChangedItemIds(
  boardId: string,
  since: Date,
  options: ChangedItemLogOptions = {}
): Promise<ChangedItemLogResult> {
  const fromISO = since.toISOString();
  const allItemIds = new Set<string>();
  let latestTimestamp: Date | null = null;
  let totalEvents = 0;
  const maxItemIds = options.maxItemIds ?? Number.POSITIVE_INFINITY;
  const maxPages = Math.max(1, options.maxPages ?? MAX_PAGES);
  const pageSize = Math.min(
    Math.max(1, options.pageSize ?? MAX_LOGS_PER_PAGE),
    500
  );
  const deadlineMs = options.deadlineMs;
  let truncated = false;
  let truncatedReason: ChangedItemLogMetadata["reason"] | undefined;
  const stopAtMax =
    Number.isFinite(maxItemIds) &&
    maxItemIds > 0 &&
    maxItemIds !== Number.POSITIVE_INFINITY;

  for (let page = 1; page <= maxPages; page++) {
    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      truncated = true;
      truncatedReason = "deadline";
      break;
    }

    const timeoutMs = getRemainingQueryTimeout(
      deadlineMs,
      options.queryTimeoutMs ?? REQUEST_TIMEOUT_MS
    );
    if (timeoutMs <= 0) {
      truncated = true;
      truncatedReason = "deadline";
      break;
    }

    let logs: RawLog[];
    try {
      logs = await fetchActivityPage(
        boardId,
        fromISO,
        page,
        pageSize,
        timeoutMs,
        options
      );
    } catch (_error) {
      truncated = true;
      truncatedReason = "error";
      break;
    }

    if (logs.length === 0) {
      break;
    }

    const { count, latest } = processLogPage(logs, allItemIds);
    totalEvents += count;
    if (latest && (!latestTimestamp || latest > latestTimestamp)) {
      latestTimestamp = latest;
    }

    if (stopAtMax && allItemIds.size >= maxItemIds) {
      truncated = true;
      truncatedReason = "max_item_ids";
      break;
    }

    if (logs.length < pageSize) {
      break;
    }

    if (page === maxPages) {
      truncated = true;
      truncatedReason = "max_pages";
    }
  }

  return {
    itemIds: [...allItemIds],
    latestTimestamp,
    totalEvents,
    metadata: {
      truncated,
      reason: truncatedReason,
    },
  };
}
