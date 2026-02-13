/**
 * Supabase Postgres email linking for the folder watcher.
 * Links emails to projects when they appear in tracked Outlook folders.
 * Uses the shared Supabase Postgres connection — no separate DB handles.
 */
import { db } from "@lib/db/hub";
import {
  findEstimateCandidatesForEmail,
  linkEmailToEstimate,
} from "@lib/db/repositories/estimate-email";
import { isSubjectCompatibleWithProject } from "@lib/project-subject-guard";

interface MessageForLinking {
  id?: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  const dedup = new Set<string>();
  for (const value of values) {
    const normalized = (value ?? "").trim();
    if (normalized.length === 0) {
      continue;
    }
    dedup.add(normalized);
  }
  return [...dedup];
}

const findConversationProjectAnchor = db.query<
  { id: number },
  [string, number]
>("SELECT id FROM emails WHERE conversation_id = ? AND project_id = ? LIMIT 1");

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
export async function linkMessages(
  hubProjectId: number,
  messages: MessageForLinking[]
): Promise<{
  directLinks: number;
  threadExpanded: number;
  notFound: number;
  skippedSubjectMismatch: number;
}> {
  let directLinks = 0;
  let notFound = 0;
  let skippedSubjectMismatch = 0;
  const conversationIds = new Set<string>();

  for (const msg of messages) {
    let email: {
      id: number;
      project_id: number | null;
      conversation_id: string | null;
      subject: string | null;
    } | null = null;

    // Try internet_message_id first (cross-mailbox, most reliable)
    if (msg.internetMessageId) {
      email = await db
        .query<
          {
            id: number;
            project_id: number | null;
            conversation_id: string | null;
            subject: string | null;
          },
          [string]
        >(
          "SELECT id, project_id, conversation_id, subject FROM emails WHERE internet_message_id = ?"
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
            subject: string | null;
          },
          [string]
        >(
          "SELECT id, project_id, conversation_id, subject FROM emails WHERE message_id = ?"
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

    const subjectForGuard = msg.subject ?? email.subject ?? "";
    let hasConversationAnchor = false;
    if (email.conversation_id) {
      const conversationAnchor = await findConversationProjectAnchor.get(
        email.conversation_id,
        hubProjectId
      );
      hasConversationAnchor = Boolean(conversationAnchor);
    }

    if (!hasConversationAnchor) {
      const subjectCompatible = await isSubjectCompatibleWithProject({
        projectId: hubProjectId,
        subject: subjectForGuard,
      });
      if (!subjectCompatible) {
        skippedSubjectMismatch++;
        continue;
      }
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

  return { directLinks, threadExpanded, notFound, skippedSubjectMismatch };
}

export async function linkMessagesToProjectEstimates(
  hubProjectId: number,
  folderName: string,
  messages: MessageForLinking[]
): Promise<{
  candidateEmails: number;
  projectEstimateCount: number;
  linked: number;
  skippedAlreadyLinked: number;
  skippedManualReview: number;
  skippedOutOfProject: number;
  skippedNoProjectEstimates: number;
}> {
  const projectEstimateRows = await db
    .query<{ estimate_id: number }, [number]>(
      "SELECT estimate_id FROM project_estimates WHERE project_id = ?"
    )
    .all(hubProjectId);

  const projectEstimateIds = [
    ...new Set(projectEstimateRows.map((row) => row.estimate_id)),
  ];
  const projectEstimateSet = new Set(projectEstimateIds);

  const messageIds = uniqueNonEmpty(messages.map((m) => m.id));
  const internetMessageIds = uniqueNonEmpty(
    messages.map((m) => m.internetMessageId)
  );
  const conversationIds = uniqueNonEmpty(messages.map((m) => m.conversationId));

  const whereClauses: string[] = [];
  const params: unknown[] = [hubProjectId];

  if (messageIds.length > 0) {
    whereClauses.push(
      `message_id IN (${messageIds.map(() => "?").join(", ")})`
    );
    params.push(...messageIds);
  }
  if (internetMessageIds.length > 0) {
    whereClauses.push(
      `internet_message_id IN (${internetMessageIds.map(() => "?").join(", ")})`
    );
    params.push(...internetMessageIds);
  }
  if (conversationIds.length > 0) {
    whereClauses.push(
      `conversation_id IN (${conversationIds.map(() => "?").join(", ")})`
    );
    params.push(...conversationIds);
  }

  if (whereClauses.length === 0) {
    return {
      candidateEmails: 0,
      projectEstimateCount: projectEstimateIds.length,
      linked: 0,
      skippedAlreadyLinked: 0,
      skippedManualReview: 0,
      skippedOutOfProject: 0,
      skippedNoProjectEstimates: 0,
    };
  }

  const impactedRows = await db
    .query<{ id: number }>(
      `SELECT DISTINCT id
       FROM emails
       WHERE project_id = ?
         AND (${whereClauses.join(" OR ")})`
    )
    .all(...params);
  const impactedEmailIds = impactedRows.map((row) => row.id);

  if (impactedEmailIds.length === 0) {
    return {
      candidateEmails: 0,
      projectEstimateCount: projectEstimateIds.length,
      linked: 0,
      skippedAlreadyLinked: 0,
      skippedManualReview: 0,
      skippedOutOfProject: 0,
      skippedNoProjectEstimates: 0,
    };
  }

  if (projectEstimateIds.length === 0) {
    return {
      candidateEmails: impactedEmailIds.length,
      projectEstimateCount: 0,
      linked: 0,
      skippedAlreadyLinked: 0,
      skippedManualReview: 0,
      skippedOutOfProject: 0,
      skippedNoProjectEstimates: impactedEmailIds.length,
    };
  }

  const existingRows = await db
    .query<{ email_id: number; estimate_id: number }>(
      `SELECT email_id, estimate_id
       FROM estimate_emails
       WHERE email_id IN (${impactedEmailIds.map(() => "?").join(", ")})`
    )
    .all(...impactedEmailIds);
  const existingByEmail = new Map<number, Set<number>>();
  for (const row of existingRows) {
    const set = existingByEmail.get(row.email_id) ?? new Set<number>();
    set.add(row.estimate_id);
    existingByEmail.set(row.email_id, set);
  }

  let linked = 0;
  let skippedAlreadyLinked = 0;
  let skippedManualReview = 0;
  let skippedOutOfProject = 0;

  for (const emailId of impactedEmailIds) {
    const existing = existingByEmail.get(emailId) ?? new Set<number>();
    const alreadyLinkedToProjectEstimate = [...existing].some((estimateId) =>
      projectEstimateSet.has(estimateId)
    );
    if (alreadyLinkedToProjectEstimate) {
      skippedAlreadyLinked++;
      continue;
    }

    if (projectEstimateIds.length === 1) {
      const estimateId = projectEstimateIds[0];
      await linkEmailToEstimate(
        estimateId,
        emailId,
        "script",
        `folder_watcher project_single project_id=${hubProjectId}`
      );
      linked++;
      continue;
    }

    const match = await findEstimateCandidatesForEmail(emailId, {
      projectHints: [folderName],
      limit: 5,
    });
    const best = match?.decision.best;
    if (!(best && match.decision.autoLink)) {
      skippedManualReview++;
      continue;
    }
    if (!projectEstimateSet.has(best.estimateId)) {
      skippedOutOfProject++;
      continue;
    }

    await linkEmailToEstimate(
      best.estimateId,
      emailId,
      "script",
      `folder_watcher ranked_match score=${best.score} project_id=${hubProjectId}`
    );
    linked++;
  }

  return {
    candidateEmails: impactedEmailIds.length,
    projectEstimateCount: projectEstimateIds.length,
    linked,
    skippedAlreadyLinked,
    skippedManualReview,
    skippedOutOfProject,
    skippedNoProjectEstimates: 0,
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
       SET project_id = ?, updated_at = (extract(epoch FROM now()))::bigint
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
