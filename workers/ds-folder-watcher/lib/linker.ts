/**
 * hub.db email linking for the folder watcher.
 * Links emails to projects when they appear in tracked Outlook folders.
 */

import { Database } from "bun:sqlite";
import { parseFolderName } from "@/workers/ds-folder-watcher/lib/projects.ts";

const HUB_DB_PATH =
  "/Users/chiejimofor/Documents/Github/desert-services-hub/apps/contract/hub.db";

let _db: InstanceType<typeof Database> | null = null;

function getDb(): InstanceType<typeof Database> {
  if (_db) {
    return _db;
  }
  _db = new Database(HUB_DB_PATH);
  _db.run("PRAGMA busy_timeout = 5000;");
  _db.run("PRAGMA journal_mode = WAL;");
  return _db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}

/**
 * Find or create a project in hub.db's projects table.
 * hub.db projects are for email-to-project linking (separate from projects.db).
 */
export function ensureHubProject(folderName: string): number {
  const db = getDb();
  const { projectName } = parseFolderName(folderName);
  const normalized = projectName.toLowerCase().replace(/[^a-z0-9]/g, "");

  const existing = db
    .query<{ id: number }, [string]>(
      "SELECT id FROM projects WHERE normalized_name = ?"
    )
    .get(normalized);

  if (existing) {
    return existing.id;
  }

  db.run("INSERT INTO projects (name, normalized_name) VALUES (?, ?)", [
    projectName,
    normalized,
  ]);

  const created = db
    .query<{ id: number }, []>(
      "SELECT id FROM projects WHERE rowid = last_insert_rowid()"
    )
    .get();

  if (!created) {
    throw new Error(`Failed to create hub project for: ${folderName}`);
  }

  return created.id;
}

interface MessageForLinking {
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
}

/**
 * Link messages to a hub.db project.
 *
 * 1. Match each message by internet_message_id
 * 2. Set project_id on matched emails
 * 3. Expand via conversation threads — all emails in same conversation get linked
 *
 * Returns stats on what was linked.
 */
export function linkMessages(
  hubProjectId: number,
  messages: MessageForLinking[]
): { directLinks: number; threadExpanded: number; notFound: number } {
  const db = getDb();
  let directLinks = 0;
  let notFound = 0;
  const conversationIds = new Set<string>();

  for (const msg of messages) {
    if (!msg.internetMessageId) {
      notFound++;
      continue;
    }

    const email = db
      .query<
        {
          id: number;
          project_id: number | null;
          conversation_id: string | null;
        },
        [string]
      >(
        "SELECT id, project_id, conversation_id FROM emails WHERE internet_message_id = ?"
      )
      .get(msg.internetMessageId);

    if (!email) {
      notFound++;
      continue;
    }

    // Already linked to this project
    if (email.project_id === hubProjectId) {
      continue;
    }

    // Linked to a different project — don't overwrite
    if (email.project_id !== null) {
      continue;
    }

    db.run("UPDATE emails SET project_id = ? WHERE id = ?", [
      hubProjectId,
      email.id,
    ]);
    directLinks++;

    if (email.conversation_id) {
      conversationIds.add(email.conversation_id);
    }
  }

  // Expand via conversation threads
  let threadExpanded = 0;
  for (const convId of conversationIds) {
    const result = db.run(
      "UPDATE emails SET project_id = ? WHERE conversation_id = ? AND project_id IS NULL",
      [hubProjectId, convId]
    );
    threadExpanded += result.changes;
  }

  // Update hub project email_count
  db.run(
    `UPDATE projects SET
       email_count = (SELECT COUNT(*) FROM emails WHERE project_id = ?),
       first_seen = (SELECT MIN(received_at) FROM emails WHERE project_id = ?),
       last_seen = (SELECT MAX(received_at) FROM emails WHERE project_id = ?),
       updated_at = datetime('now')
     WHERE id = ?`,
    [hubProjectId, hubProjectId, hubProjectId, hubProjectId]
  );

  return { directLinks, threadExpanded, notFound };
}
