/**
 * Supabase Postgres email linking for the folder watcher.
 * Links emails to projects when they appear in tracked Outlook folders.
 * Uses the shared Supabase Postgres connection — no separate DB handles.
 */

import { isSubjectCompatibleWithProject } from "@email/project-subject-guard";
import { db } from "@lib/db/client";

interface MessageForLinking {
  id?: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
}

const findConversationProjectAnchor = db.query<
  { id: number },
  [string, number]
>(
  "SELECT id FROM emails WHERE conversation_id = $1 AND project_id = $2 LIMIT 1"
);

/**
 * Link messages to a Supabase Postgres project.
 *
 * 1. Match each message by internet_message_id or Graph message_id
 * 2. Set project_id on matched emails
 * 3. Expand via conversation threads — all emails in same conversation get linked
 *
 * Safety guard:
 * - Never auto-link by folder membership alone when the message subject does not
 *   resemble the target project known names/aliases.
 */
interface EmailRecord {
  id: number;
  project_id: number | null;
  conversation_id: string | null;
  subject: string | null;
}

async function findEmailByMessage(
  msg: MessageForLinking
): Promise<EmailRecord | null> {
  if (msg.internetMessageId) {
    const found = await db
      .query<EmailRecord, [string]>(
        "SELECT id, project_id, conversation_id, subject FROM emails WHERE internet_message_id = $1"
      )
      .get(msg.internetMessageId);
    if (found) {
      return found;
    }
  }

  if (msg.id) {
    return (
      db
        .query<EmailRecord, [string]>(
          "SELECT id, project_id, conversation_id, subject FROM emails WHERE message_id = $1"
        )
        .get(msg.id) ?? null
    );
  }

  return null;
}

async function shouldLinkMessage(
  email: EmailRecord,
  msg: MessageForLinking,
  hubProjectId: number
): Promise<boolean> {
  if (email.project_id === hubProjectId || email.project_id !== null) {
    return false;
  }

  if (email.conversation_id) {
    const anchor = await findConversationProjectAnchor.get(
      email.conversation_id,
      hubProjectId
    );
    if (anchor) {
      return true;
    }
  }

  return isSubjectCompatibleWithProject({
    projectId: hubProjectId,
    subject: msg.subject ?? email.subject ?? "",
  });
}

export async function linkMessages(
  hubProjectId: number,
  messages: MessageForLinking[]
): Promise<{
  directLinks: number;
  threadExpanded: number;
  notFound: number;
  skippedSubjectMismatch: number;
  linkedEmailIds: number[];
}> {
  let directLinks = 0;
  let notFound = 0;
  let skippedSubjectMismatch = 0;
  const conversationIds = new Set<string>();
  const linkedEmailIds: number[] = [];

  for (const msg of messages) {
    const email = await findEmailByMessage(msg);

    if (!email) {
      notFound++;
      continue;
    }

    if (email.project_id === hubProjectId) {
      linkedEmailIds.push(email.id);
      continue;
    }

    const linkable = await shouldLinkMessage(email, msg, hubProjectId);
    if (!linkable) {
      if (email.project_id === null) {
        skippedSubjectMismatch++;
      }
      continue;
    }

    await db.run("UPDATE emails SET project_id = $1 WHERE id = $2", [
      hubProjectId,
      email.id,
    ]);
    directLinks++;
    linkedEmailIds.push(email.id);

    if (email.conversation_id) {
      conversationIds.add(email.conversation_id);
    }
  }

  // Expand via conversation threads
  let threadExpanded = 0;
  for (const convId of conversationIds) {
    const result = await db.run(
      "UPDATE emails SET project_id = $1 WHERE conversation_id = $2 AND project_id IS NULL",
      [hubProjectId, convId]
    );
    threadExpanded += result.count;
  }

  // Update project stats
  await db.run(
    `UPDATE projects SET
       email_count = (SELECT COUNT(*) FROM emails WHERE project_id = $1),
       first_seen = (SELECT MIN(received_at) FROM emails WHERE project_id = $2),
       last_seen = (SELECT MAX(received_at) FROM emails WHERE project_id = $3),
       updated_at = now()
     WHERE id = $4`,
    [hubProjectId, hubProjectId, hubProjectId, hubProjectId]
  );

  return {
    directLinks,
    threadExpanded,
    notFound,
    skippedSubjectMismatch,
    linkedEmailIds,
  };
}

const PERMIT_ID_RE = /application (D0\d{6})/;

/**
 * Scan Supabase Postgres for Maricopa "Dust Permit Issued" emails linked to this project.
 * Extracts permit ID, links permit to project, marks project as Issued.
 */
export async function checkDustPermitIssued(
  hubProjectId: number
): Promise<number> {
  const emails = await db
    .query<{ body_preview: string }, [number]>(
      `SELECT body_preview FROM emails
       WHERE project_id = $1
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
       SET project_id = $1, updated_at = (extract(epoch FROM now()))::bigint
       WHERE id = $2 AND (project_id IS NULL OR project_id != $3)`,
      [hubProjectId, permitId, hubProjectId]
    );

    // Mark project as Issued
    const result = await db.run(
      `UPDATE projects SET dust_permit_status = 'Issued', updated_at = now()
       WHERE id = $1 AND dust_permit_status NOT IN ('Issued', 'Closed', 'Billing Sent')`,
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
