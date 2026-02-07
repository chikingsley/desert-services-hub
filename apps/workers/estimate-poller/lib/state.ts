/**
 * State DB for estimate poller.
 * Tracks sync timestamps and change events.
 */
import { Database } from "bun:sqlite";

const DB_PATH = `${import.meta.dir}/../estimate-poller.db`;

let _db: InstanceType<typeof Database> | null = null;

export function openStateDb(): InstanceType<typeof Database> {
  if (_db) {
    return _db;
  }

  _db = new Database(DB_PATH, { create: true });
  _db.run("PRAGMA busy_timeout = 5000;");
  _db.run("PRAGMA journal_mode = WAL;");

  _db.run(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      estimate_name TEXT,
      monday_item_id TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  return _db;
}

export function getConfig(
  db: InstanceType<typeof Database>,
  key: string
): string | null {
  const row = db
    .query<{ value: string }, [string]>(
      "SELECT value FROM config WHERE key = ?"
    )
    .get(key);
  return row?.value ?? null;
}

export function setConfig(
  db: InstanceType<typeof Database>,
  key: string,
  value: string
): void {
  db.run("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", [
    key,
    value,
  ]);
}

export function logEvent(
  db: InstanceType<typeof Database>,
  eventType: string,
  estimateName: string | null,
  mondayItemId: string | null,
  details: Record<string, unknown>
): void {
  db.run(
    "INSERT INTO events (event_type, estimate_name, monday_item_id, details) VALUES (?, ?, ?, ?)",
    [eventType, estimateName, mondayItemId, JSON.stringify(details)]
  );
}

export function getRecentEvents(
  db: InstanceType<typeof Database>,
  limit = 20
): Array<{
  id: number;
  event_type: string;
  estimate_name: string | null;
  monday_item_id: string | null;
  details: string;
  created_at: string;
}> {
  return db
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
    >("SELECT * FROM events ORDER BY id DESC LIMIT ?")
    .all(limit);
}
