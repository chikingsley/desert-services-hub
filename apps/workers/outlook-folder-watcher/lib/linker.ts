/**
 * hub.db email linking for the folder watcher.
 * Links emails to projects when they appear in tracked Outlook folders.
 * Uses the shared hub.db connection — no separate DB handles.
 */
import { db } from "@lib/db/hub";

interface MessageForLinking {
  id?: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
}

/**
 * Link messages to a hub.db project.
 *
 * 1. Match each message by internet_message_id or Graph message_id
 * 2. Set project_id on matched emails
 * 3. Expand via conversation threads — all emails in same conversation get linked
 */
export function linkMessages(
  hubProjectId: number,
  messages: MessageForLinking[]
): { directLinks: number; threadExpanded: number; notFound: number } {
  let directLinks = 0;
  let notFound = 0;
  const conversationIds = new Set<string>();

  for (const msg of messages) {
    let email: {
      id: number;
      project_id: number | null;
      conversation_id: string | null;
    } | null = null;

    // Try internet_message_id first (cross-mailbox, most reliable)
    if (msg.internetMessageId) {
      email = db
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
    }

    // Fallback to Graph message_id (mailbox-specific but higher coverage)
    if (!email && msg.id) {
      email = db
        .query<
          {
            id: number;
            project_id: number | null;
            conversation_id: string | null;
          },
          [string]
        >(
          "SELECT id, project_id, conversation_id FROM emails WHERE message_id = ?"
        )
        .get(msg.id);
    }

    if (!email) {
      notFound++;
      continue;
    }

    // Already linked to this project — skip
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

  // Update project stats
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
