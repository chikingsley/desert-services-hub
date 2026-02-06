/**
 * State DB for folder watcher.
 * Stores delta tokens, tracked folders, and event log.
 * Separate from hub.db and projects.db — operational state only.
 */

import { Database } from "bun:sqlite";

const DB_PATH = `${import.meta.dir}/../folder-watcher.db`;

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
    CREATE TABLE IF NOT EXISTS tracked_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      parent_folder_id TEXT NOT NULL,
      project_id INTEGER,
      messages_delta_link TEXT,
      message_count INTEGER DEFAULT 0,
      last_synced_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      folder_id TEXT,
      folder_name TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  return _db;
}

export interface TrackedFolder {
  id: number;
  folder_id: string;
  display_name: string;
  parent_folder_id: string;
  project_id: number | null;
  messages_delta_link: string | null;
  message_count: number;
  last_synced_at: string | null;
  created_at: string;
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

export function getTrackedFolders(
  db: InstanceType<typeof Database>
): TrackedFolder[] {
  return db
    .query<TrackedFolder, []>(
      "SELECT * FROM tracked_folders ORDER BY display_name"
    )
    .all();
}

export function addTrackedFolder(
  db: InstanceType<typeof Database>,
  folderId: string,
  displayName: string,
  parentFolderId: string,
  projectId: number | null
): void {
  db.run(
    `INSERT OR IGNORE INTO tracked_folders
     (folder_id, display_name, parent_folder_id, project_id)
     VALUES (?, ?, ?, ?)`,
    [folderId, displayName, parentFolderId, projectId]
  );
}

export function updateTrackedFolder(
  db: InstanceType<typeof Database>,
  folderId: string,
  updates: Partial<{
    display_name: string;
    messages_delta_link: string | null;
    message_count: number;
    last_synced_at: string;
    project_id: number;
  }>
): void {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  for (const [key, val] of Object.entries(updates)) {
    sets.push(`${key} = ?`);
    values.push(val);
  }

  if (sets.length === 0) {
    return;
  }

  values.push(folderId);
  db.run(
    `UPDATE tracked_folders SET ${sets.join(", ")} WHERE folder_id = ?`,
    values
  );
}

export function removeTrackedFolder(
  db: InstanceType<typeof Database>,
  folderId: string
): void {
  db.run("DELETE FROM tracked_folders WHERE folder_id = ?", [folderId]);
}

export function logEvent(
  db: InstanceType<typeof Database>,
  eventType: string,
  folderId: string | null,
  folderName: string | null,
  details: Record<string, unknown>
): void {
  db.run(
    "INSERT INTO events (event_type, folder_id, folder_name, details) VALUES (?, ?, ?, ?)",
    [eventType, folderId, folderName, JSON.stringify(details)]
  );
}

export function getRecentEvents(
  db: InstanceType<typeof Database>,
  limit = 20
): Array<{
  id: number;
  event_type: string;
  folder_name: string | null;
  details: string;
  created_at: string;
}> {
  return db
    .query<
      {
        id: number;
        event_type: string;
        folder_name: string | null;
        details: string;
        created_at: string;
      },
      [number]
    >("SELECT * FROM events ORDER BY id DESC LIMIT ?")
    .all(limit);
}
