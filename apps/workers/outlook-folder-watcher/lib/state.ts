/**
 * State management for folder watcher.
 * Stores delta tokens, tracked folders, and event log in Postgres.
 */
import { db } from "@lib/db/hub";

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

export async function getConfig(key: string): Promise<string | null> {
  const row = await db
    .query<{ value: string }, [string]>(
      "SELECT value FROM folder_watcher_config WHERE key = ?"
    )
    .get(key);
  return row?.value ?? null;
}

export async function setConfig(key: string, value: string): Promise<void> {
  await db.run(
    "INSERT INTO folder_watcher_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, value]
  );
}

export async function getTrackedFolders(): Promise<TrackedFolder[]> {
  return await db
    .query<TrackedFolder, []>(
      "SELECT * FROM tracked_folders ORDER BY display_name"
    )
    .all();
}

export async function addTrackedFolder(
  folderId: string,
  displayName: string,
  parentFolderId: string,
  projectId: number | null
): Promise<void> {
  await db.run(
    `INSERT INTO tracked_folders (folder_id, display_name, parent_folder_id, project_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (folder_id) DO NOTHING`,
    [folderId, displayName, parentFolderId, projectId]
  );
}

export async function updateTrackedFolder(
  folderId: string,
  updates: Partial<{
    display_name: string;
    messages_delta_link: string | null;
    message_count: number;
    last_synced_at: string;
    project_id: number;
  }>
): Promise<void> {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  let i = 1;

  for (const [key, val] of Object.entries(updates)) {
    sets.push(`${key} = $${i}`);
    values.push(val);
    i++;
  }

  if (sets.length === 0) {
    return;
  }

  values.push(folderId);
  await db.run(
    `UPDATE tracked_folders SET ${sets.join(", ")} WHERE folder_id = $${i}`,
    values
  );
}

export async function removeTrackedFolder(folderId: string): Promise<void> {
  await db.run("DELETE FROM tracked_folders WHERE folder_id = $1", [folderId]);
}

export async function logEvent(
  eventType: string,
  folderId: string | null,
  folderName: string | null,
  details: Record<string, unknown>
): Promise<void> {
  await db.run(
    "INSERT INTO folder_watcher_events (event_type, folder_id, folder_name, details) VALUES ($1, $2, $3, $4)",
    [eventType, folderId, folderName, JSON.stringify(details)]
  );
}

export async function getRecentEvents(limit = 20): Promise<
  Array<{
    id: number;
    event_type: string;
    folder_name: string | null;
    details: string;
    created_at: string;
  }>
> {
  return await db
    .query<
      {
        id: number;
        event_type: string;
        folder_name: string | null;
        details: string;
        created_at: string;
      },
      [number]
    >("SELECT * FROM folder_watcher_events ORDER BY id DESC LIMIT ?")
    .all(limit);
}
