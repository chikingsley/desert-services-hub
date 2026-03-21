import { db } from "@lib/db/client";
import { logger, type QueryTable, query, schedules } from "@trigger.dev/sdk";

const DB_SLOT_ERROR_FRAGMENT =
  "remaining connection slots are reserved for roles with the SUPERUSER attribute";
const TOO_MANY_CLIENTS_FRAGMENT = "too many clients already";
const MONITORED_TASK_IDENTIFIER = "monday-sync-item";
const LOOKBACK_WINDOW_MS = 75_000;
const QUERY_PERIOD = "5m";
const MAX_RUN_ROWS = 200;
const MAX_ALERT_ROWS = 30;
const FAILURE_STATUSES = new Set([
  "Failed",
  "Timed out",
  "System failure",
  "Crashed",
]);

type TriggerRunsRow = QueryTable<
  "runs",
  "run_id" | "task_identifier" | "status" | "error" | "triggered_at"
>;

interface RunErrorRow {
  errorMessage: string;
  runId: string;
  status: string;
  taskIdentifier: string;
  triggeredAt: string;
}

interface AlertChannelRow {
  type: "SLACK" | "WEBHOOK";
  url: string;
}

function normalizeDiscordSlackUrl(channel: AlertChannelRow): string | null {
  const raw = channel.url.trim();
  if (raw.length === 0) {
    return null;
  }

  if (channel.type === "SLACK") {
    return raw;
  }

  return raw.endsWith("/slack") ? raw : `${raw}/slack`;
}

async function getDiscordSlackWebhookUrl(): Promise<string | null> {
  const row = await db
    .query<AlertChannelRow>(
      `SELECT type, properties->>'url' AS url
       FROM "ProjectAlertChannel"
       WHERE enabled = true
         AND (
           (type = 'SLACK' AND properties->>'url' LIKE 'https://discord.com/api/webhooks/%')
           OR
           (type = 'WEBHOOK' AND properties->>'url' LIKE 'https://discord.com/api/webhooks/%')
         )
       ORDER BY "updatedAt" DESC
       LIMIT 1`
    )
    .get();

  if (!row?.url) {
    return null;
  }

  return normalizeDiscordSlackUrl(row);
}

export function getRunErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (!error || typeof error !== "object") {
    return "";
  }

  const directMessage = (error as { message?: unknown }).message;
  if (typeof directMessage === "string" && directMessage.trim().length > 0) {
    return directMessage;
  }

  const nestedError = (error as { error?: unknown }).error;
  if (nestedError && typeof nestedError === "object") {
    const nestedMessage = (nestedError as { message?: unknown }).message;
    if (typeof nestedMessage === "string" && nestedMessage.trim().length > 0) {
      return nestedMessage;
    }
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function hasDbSlotError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes(DB_SLOT_ERROR_FRAGMENT.toLowerCase()) ||
    normalized.includes(TOO_MANY_CLIENTS_FRAGMENT.toLowerCase())
  );
}

export function selectRecentDbSlotErrors(
  rows: TriggerRunsRow[],
  nowMs = Date.now()
): RunErrorRow[] {
  const cutoffMs = nowMs - LOOKBACK_WINDOW_MS;
  const selected: RunErrorRow[] = [];

  for (const row of rows) {
    if (!FAILURE_STATUSES.has(row.status)) {
      continue;
    }

    const triggeredAtMs = Date.parse(row.triggered_at);
    if (!Number.isFinite(triggeredAtMs) || triggeredAtMs < cutoffMs) {
      continue;
    }

    const errorMessage = getRunErrorMessage(row.error);
    if (!hasDbSlotError(errorMessage)) {
      continue;
    }

    selected.push({
      runId: row.run_id,
      taskIdentifier: row.task_identifier,
      status: row.status,
      errorMessage,
      triggeredAt: new Date(triggeredAtMs).toISOString(),
    });
  }

  return selected.slice(0, MAX_ALERT_ROWS);
}

async function getRecentDbSlotErrors(): Promise<RunErrorRow[]> {
  const result = await query.execute<TriggerRunsRow>(
    `SELECT run_id, task_identifier, status, error, triggered_at
     FROM runs
     WHERE task_identifier = '${MONITORED_TASK_IDENTIFIER}'
     ORDER BY triggered_at DESC
     LIMIT ${MAX_RUN_ROWS}`,
    { period: QUERY_PERIOD }
  );

  return selectRecentDbSlotErrors(result.results);
}

function formatDiscordText(rows: RunErrorRow[]): string {
  const header = `Trigger DB connection saturation detected: ${rows.length} run(s) in the last minute.`;
  const details = rows
    .slice(0, 6)
    .map(
      (row) =>
        `- ${row.triggeredAt} ${row.runId} (${row.status}) ${row.errorMessage || "<no error message>"}`
    )
    .join("\n");

  return `${header}\n${details}`;
}

async function postDiscordSlackMessage(
  url: string,
  text: string
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord webhook failed (${response.status}): ${body}`);
  }
}

export const dbSaturationAlertMonitor = schedules.task({
  id: "db-saturation-alert-monitor",
  cron: "*/1 * * * *",
  maxDuration: 60,
  retry: { maxAttempts: 1 },
  run: async () => {
    const rows = await getRecentDbSlotErrors();
    if (rows.length === 0) {
      return { alerted: false, matches: 0 };
    }

    const webhookUrl = await getDiscordSlackWebhookUrl();
    if (!webhookUrl) {
      logger.error("No enabled Discord alert channel found for DB saturation");
      return { alerted: false, matches: rows.length, reason: "no_channel" };
    }

    const text = formatDiscordText(rows);

    try {
      await postDiscordSlackMessage(webhookUrl, text);
      logger.info("Sent DB saturation alert to Discord", {
        matches: rows.length,
      });
      return { alerted: true, matches: rows.length };
    } catch (error) {
      logger.error("Failed to send DB saturation alert to Discord", {
        matches: rows.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});
