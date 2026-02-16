/**
 * State management for estimate poller.
 * Tracks sync timestamps and change events in Postgres.
 */
import { db } from "@lib/db/hub";

export async function getConfig(key: string): Promise<string | null> {
  const row = await db
    .query<{ value: string }, [string]>(
      "SELECT value FROM estimate_poller_config WHERE key = ?"
    )
    .get(key);
  return row?.value ?? null;
}

export async function setConfig(key: string, value: string): Promise<void> {
  await db.run(
    "INSERT INTO estimate_poller_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, value]
  );
}

export async function logEvent(
  eventType: string,
  estimateName: string | null,
  mondayItemId: string | null,
  details: Record<string, unknown>
): Promise<void> {
  await db.run(
    "INSERT INTO estimate_poller_events (event_type, estimate_name, monday_item_id, details) VALUES ($1, $2, $3, $4)",
    [eventType, estimateName, mondayItemId, JSON.stringify(details)]
  );
}

export async function getRecentEvents(limit = 20): Promise<
  Array<{
    id: number;
    event_type: string;
    estimate_name: string | null;
    monday_item_id: string | null;
    details: string;
    created_at: string;
  }>
> {
  return await db
    .query<
      {
        id: number;
        event_type: string;
        estimate_name: string | null;
        monday_item_id: string | null;
        details: string;
        created_at: string;
      },
      [number]
    >("SELECT * FROM estimate_poller_events ORDER BY id DESC LIMIT ?")
    .all(limit);
}
