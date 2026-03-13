/**
 * Email Triage (deterministic)
 *
 * Keeps the email -> Monday -> triage path alive without LLM dependencies.
 * - Attempts deterministic estimate + project linking.
 * - Queues ambiguous project matches for manual review.
 * - Marks remaining unclassified emails as UNKNOWN so triage can progress.
 */

import { db } from "@lib/db/client";
import { updateEmailClassification } from "@email/db/email";
import { findEstimateCandidatesForEmail, linkEmailToEstimate } from "@estimates/db/estimate-email";
import { upsertProjectMatchReview } from "@projects/db/project-match-review";
import { findProjectCandidates } from "@projects/db/project-matching";
import { linkEmailToProject } from "@projects/db/project";
import { logger, schedules, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_BACKFILL_BATCH_SIZE = 100;
const GENERIC_FOLDER_NAMES = new Set([
  "archive",
  "contracts",
  "deleted items",
  "drafts",
  "dust permit",
  "inbox",
  "junk email",
  "sent items",
]);

interface TriageEmailRow {
  account_id: number | null;
  body_preview: string | null;
  classification: "ESTIMATE" | "UNKNOWN" | string | null;
  contractor_name: string | null;
  folder_name: string | null;
  id: number;
  project_name: string | null;
  subject: string | null;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getProjectFolderHint(folderName: string | null | undefined): string | null {
  const trimmed = nonEmpty(folderName);
  if (!trimmed) {
    return null;
  }

  if (GENERIC_FOLDER_NAMES.has(trimmed.toLowerCase())) {
    return null;
  }

  return trimmed;
}

function deriveProjectFolderAliases(
  folderName: string | null | undefined
): string[] {
  const folderHint = getProjectFolderHint(folderName);
  if (!folderHint) {
    return [];
  }

  const parts = folderHint
    .split(/\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const aliases = new Set<string>([folderHint]);

  if (parts.length >= 2) {
    const firstPartIsCode = /^[a-z0-9]+$/i.test(parts[0] ?? "");
    if (firstPartIsCode && (parts[1]?.match(/[a-z]/i) ?? false)) {
      aliases.add(parts[1]!);
    }
  }

  if (parts.length >= 3) {
    const middle = parts.slice(1, -1).join(" - ").trim();
    if (middle.length > 0) {
      aliases.add(middle);
    }
  }

  return [...aliases];
}

async function getUntriagedEmails(limit: number): Promise<TriageEmailRow[]> {
  return await db
    .query<TriageEmailRow, [number]>(
      `SELECT
         id,
         subject,
         body_preview,
         account_id,
         classification,
         folder_name,
         project_name,
         contractor_name
       FROM emails
       WHERE project_id IS NULL
         AND is_excluded = 0
         AND classification IS NULL
       ORDER BY received_at DESC
       LIMIT $1`
    )
    .all(limit);
}

export async function triageOneEmail(emailId: number): Promise<{
  classification: "ESTIMATE" | "UNKNOWN";
  estimateLinked: boolean;
  projectLinked: boolean;
  reviewQueued: boolean;
}> {
  const row = await db
    .query<TriageEmailRow, [number]>(
      `SELECT
         id,
         subject,
         body_preview,
         account_id,
         classification,
         folder_name,
         project_name,
         contractor_name
       FROM emails
       WHERE id = $1`
    )
    .get(emailId);

  if (!row) {
    return {
      classification: "UNKNOWN",
      estimateLinked: false,
      projectLinked: false,
      reviewQueued: false,
    };
  }

  let estimateLinked = false;
  let projectLinked = false;
  let reviewQueued = false;
  const folderAliases = deriveProjectFolderAliases(row.folder_name);
  const primaryFolderAlias = folderAliases[1] ?? folderAliases[0] ?? null;

  const estimateResult = await findEstimateCandidatesForEmail(row.id);
  if (estimateResult?.decision.autoLink && estimateResult.decision.best) {
    estimateLinked = await linkEmailToEstimate(
      estimateResult.decision.best.estimateId,
      row.id,
      "script",
      "email-triage:auto_link"
    );
  }

  const primaryText =
    nonEmpty(row.project_name) ??
    primaryFolderAlias ??
    nonEmpty(row.subject) ??
    nonEmpty(row.body_preview)?.slice(0, 200);

  const aliasHints = [
    ...folderAliases,
    row.project_name,
    row.subject,
  ].filter((value): value is string => Boolean(nonEmpty(value)));

  if (primaryText) {
    const projectResult = await findProjectCandidates({
      primaryText,
      aliasHints,
      contractorHint: row.contractor_name,
      accountIdHint: row.account_id,
      limit: 10,
    });

    if (projectResult) {
      if (projectResult.decision.autoLink && projectResult.decision.best) {
        await linkEmailToProject(row.id, projectResult.decision.best.projectId);
        projectLinked = true;
      } else if (projectResult.candidates.length > 0) {
        const reviewId = await upsertProjectMatchReview({
          source: "email_resolver",
          sourceKey: `email:${row.id}`,
          result: projectResult,
          note: "Queued by deterministic email-triage",
        });
        reviewQueued = Boolean(reviewId);
      }
    }
  }

  const classification = estimateLinked ? "ESTIMATE" : "UNKNOWN";
  const finalClassification = row.classification ?? classification;
  if (!row.classification) {
    await updateEmailClassification(
      row.id,
      classification,
      estimateLinked ? 0.85 : 0.2,
      "pattern"
    );
  }

  return {
    classification: finalClassification === "ESTIMATE" ? "ESTIMATE" : "UNKNOWN",
    estimateLinked,
    projectLinked,
    reviewQueued,
  };
}

interface BackfillCandidateRow {
  id: number;
}

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

async function getBackfillCandidateEmailIds(params: {
  batchSize: number;
  folderName?: string;
  mailboxEmails?: string[];
  projectQuery?: string;
  receivedSinceIso?: string;
}): Promise<number[]> {
  const clauses = [
    "e.project_id IS NULL",
    "COALESCE(e.is_excluded, 0) = 0",
  ];
  const values: unknown[] = [];

  const projectQuery = trimToNull(params.projectQuery);
  if (projectQuery) {
    values.push(`%${projectQuery}%`);
    const idx = values.length;
    clauses.push(`(
      COALESCE(e.folder_name, '') ILIKE $${idx}
      OR COALESCE(e.project_name, '') ILIKE $${idx}
      OR COALESCE(e.subject, '') ILIKE $${idx}
      OR COALESCE(e.body_preview, '') ILIKE $${idx}
    )`);
  }

  const folderName = trimToNull(params.folderName);
  if (folderName) {
    values.push(folderName);
    const idx = values.length;
    clauses.push(`LOWER(COALESCE(e.folder_name, '')) = LOWER($${idx})`);
  }

  const mailboxEmails = (params.mailboxEmails ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
  if (mailboxEmails.length > 0) {
    const placeholders = mailboxEmails.map((mailboxEmail) => {
      values.push(mailboxEmail);
      return `$${values.length}`;
    });
    clauses.push(`LOWER(m.email) IN (${placeholders.join(", ")})`);
  }

  const receivedSinceIso = trimToNull(params.receivedSinceIso);
  if (receivedSinceIso) {
    values.push(receivedSinceIso);
    clauses.push(`e.received_at >= $${values.length}`);
  }

  values.push(params.batchSize);
  const rows = await db
    .query<BackfillCandidateRow>(
      `SELECT e.id
       FROM emails e
       JOIN mailboxes m ON m.id = e.mailbox_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY e.received_at DESC, e.id DESC
       LIMIT $${values.length}`
    )
    .all(...values);

  return rows.map((row) => row.id);
}

export async function runEmailTriageBackfill(params: {
  batchSize: number;
  dryRun: boolean;
  folderName?: string;
  loops: number;
  mailboxEmails?: string[];
  projectQuery?: string;
  receivedSinceIso?: string;
}): Promise<{
  errors: number;
  estimateLinked: number;
  fetched: number;
  loops: number;
  processed: number;
  projectLinked: number;
  reviewQueued: number;
}> {
  let fetched = 0;
  let processed = 0;
  let errors = 0;
  let estimateLinked = 0;
  let projectLinked = 0;
  let reviewQueued = 0;

  for (let loop = 0; loop < params.loops; loop++) {
    const emailIds = await getBackfillCandidateEmailIds({
      batchSize: params.batchSize,
      folderName: params.folderName,
      mailboxEmails: params.mailboxEmails,
      projectQuery: params.projectQuery,
      receivedSinceIso: params.receivedSinceIso,
    });
    fetched += emailIds.length;

    if (emailIds.length === 0) {
      break;
    }

    if (params.dryRun) {
      break;
    }

    for (const emailId of emailIds) {
      try {
        const result = await triageOneEmail(emailId);
        processed++;
        if (result.estimateLinked) {
          estimateLinked++;
        }
        if (result.projectLinked) {
          projectLinked++;
        }
        if (result.reviewQueued) {
          reviewQueued++;
        }
      } catch (error) {
        errors++;
        logger.warn("Email triage backfill failed", {
          emailId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    errors,
    estimateLinked,
    fetched,
    loops: params.loops,
    processed,
    projectLinked,
    reviewQueued,
  };
}

export const emailTriageOne = schemaTask({
  id: "email-triage-one",
  schema: z.object({
    emailId: z.number().int().positive(),
  }),
  maxDuration: 120,
  retry: { maxAttempts: 2 },
  run: async ({ emailId }) => {
    const result = await triageOneEmail(emailId);
    logger.info("Email triaged (single)", { emailId, ...result });
    return { emailId, ...result };
  },
});

export const emailTriage = schedules.task({
  id: "email-triage",
  cron: "*/5 * * * *",
  maxDuration: 240,
  run: async () => {
    const emails = await getUntriagedEmails(DEFAULT_BATCH_SIZE);
    if (emails.length === 0) {
      return {
        fetched: 0,
        triaged: 0,
        estimateLinked: 0,
        projectLinked: 0,
        reviewQueued: 0,
      };
    }

    let triaged = 0;
    let estimateLinked = 0;
    let projectLinked = 0;
    let reviewQueued = 0;

    for (const email of emails) {
      try {
        const result = await triageOneEmail(email.id);
        triaged++;
        if (result.estimateLinked) {
          estimateLinked++;
        }
        if (result.projectLinked) {
          projectLinked++;
        }
        if (result.reviewQueued) {
          reviewQueued++;
        }
      } catch (error) {
        logger.warn("Email triage failed", {
          emailId: email.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const summary = {
      fetched: emails.length,
      triaged,
      estimateLinked,
      projectLinked,
      reviewQueued,
    };
    logger.info("Email triage batch complete", summary);
    return summary;
  },
});

export const emailTriageBackfill = schemaTask({
  id: "email-triage-backfill",
  schema: z.object({
    batchSize: z.number().int().min(1).max(500).default(DEFAULT_BACKFILL_BATCH_SIZE),
    dryRun: z.boolean().default(false),
    folderName: z.string().trim().min(1).optional(),
    loops: z.number().int().min(1).max(200).default(10),
    mailboxEmails: z.array(z.email()).optional(),
    projectQuery: z.string().trim().min(1).optional(),
    receivedSinceIso: z.string().trim().optional(),
  }),
  maxDuration: 3600,
  retry: { maxAttempts: 1 },
  run: async (params) => {
    const result = await runEmailTriageBackfill(params);
    logger.info("Email triage backfill complete", result);
    return result;
  },
});
