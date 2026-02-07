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
export async function linkMessages(
  hubProjectId: number,
  messages: MessageForLinking[]
): Promise<{ directLinks: number; threadExpanded: number; notFound: number }> {
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
      email = await db
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
      email = await db
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

    await db.run("UPDATE emails SET project_id = ? WHERE id = ?", [
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
    const result = await db.run(
      "UPDATE emails SET project_id = ? WHERE conversation_id = ? AND project_id IS NULL",
      [hubProjectId, convId]
    );
    threadExpanded += result.count;
  }

  // Update project stats
  await db.run(
    `UPDATE projects SET
       email_count = (SELECT COUNT(*) FROM emails WHERE project_id = ?),
       first_seen = (SELECT MIN(received_at) FROM emails WHERE project_id = ?),
       last_seen = (SELECT MAX(received_at) FROM emails WHERE project_id = ?),
       updated_at = now()
     WHERE id = ?`,
    [hubProjectId, hubProjectId, hubProjectId, hubProjectId]
  );

  return { directLinks, threadExpanded, notFound };
}

const PERMIT_ID_RE = /application (D0\d{6})/;

/**
 * Scan hub.db for Maricopa "Dust Permit Issued" emails linked to this project.
 * Extracts permit ID, links permit to project, marks project as Issued.
 */
export async function checkDustPermitIssued(
  hubProjectId: number
): Promise<number> {
  const emails = await db
    .query<{ body_preview: string }, [number]>(
      `SELECT body_preview FROM emails
       WHERE project_id = ?
         AND subject = 'Dust Permit Issued'
         AND from_email LIKE '%maricopa.gov%'
         AND body_preview LIKE '%application D0%'`
    )
    .all(hubProjectId);

  let updated = 0;

  for (const email of emails) {
    const match = PERMIT_ID_RE.exec(email.body_preview);
    if (!match) {
      continue;
    }

    const permitId = match[1];

    // Link permit to project
    await db.run(
      `UPDATE dust_permits_filed_by_desert_services
       SET project_id = ?, updated_at = unixepoch()
       WHERE id = ? AND (project_id IS NULL OR project_id != ?)`,
      [hubProjectId, permitId, hubProjectId]
    );

    // Mark project as Issued
    const result = await db.run(
      `UPDATE projects SET dust_permit_status = 'Issued', updated_at = now()
       WHERE id = ? AND dust_permit_status NOT IN ('Issued', 'Closed', 'Billing Sent')`,
      [hubProjectId]
    );

    if (result.count > 0) {
      console.log(
        `[DustPermit] ${permitId} → project #${hubProjectId} marked Issued`
      );
      updated++;
    } else {
      console.log(
        `[DustPermit] ${permitId} → linked to project #${hubProjectId}`
      );
    }
  }

  return updated;
}
