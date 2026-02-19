/**
 * Unified Email Triage — Dispatch
 *
 * Maps triage classification results to concrete actions:
 * - Persist classification on the email record
 * - Link to project/estimate if the LLM picked candidates
 * - Enqueue the appropriate job handler for action-triggering categories
 */

import { db } from "@lib/db/client";
import { updateEmailClassification } from "@lib/db/repositories/email";
import { linkEmailToEstimate } from "@lib/db/repositories/estimate-email";
import { linkEmailToProject } from "@lib/db/repositories/project";
import type {
  DispatchResult,
  TriageEmailMeta,
  TriageEnqueueJob,
  TriageJobType,
  TriageResult,
} from "./types";
import { TRIAGE_ACTION_JOB_MAP } from "./types";

const SPAM_AUTO_EXCLUDE_CONFIDENCE = 0.9;

const TRIAGE_ACTIONS = TRIAGE_ACTION_JOB_MAP;

// ── Payload builders ────────────────────────────────────────

const buildContractPayload = (
  meta: TriageEmailMeta
): Record<string, unknown> => ({
  emailId: meta.emailId,
  messageId: meta.messageId,
  mailboxEmail: meta.mailboxEmail,
  subject: meta.subject ?? "",
  fromEmail: meta.fromEmail ?? "",
  bodyText: meta.bodyText ?? "",
  hasAttachments: meta.hasAttachments,
});

const JOB_PAYLOAD_BUILDERS: Record<
  TriageJobType,
  (meta: TriageEmailMeta) => Record<string, unknown>
> = {
  dust_permit_payment: (meta) => ({
    emailId: meta.emailId,
    messageId: meta.messageId,
    mailboxEmail: meta.mailboxEmail,
    bodyText: meta.bodyText ?? "",
  }),
  dust_permit_issued_email: (meta) => ({
    emailId: meta.emailId,
    messageId: meta.messageId,
    mailboxEmail: meta.mailboxEmail,
    bodyText: meta.bodyText ?? "",
    subject: meta.subject ?? "",
  }),
  contract_email_received: buildContractPayload,
};

// ── Main dispatch ───────────────────────────────────────────

async function handleSpamAutoExclude(
  result: TriageResult,
  meta: TriageEmailMeta
): Promise<void> {
  if (
    result.category !== "SPAM" ||
    result.confidence < SPAM_AUTO_EXCLUDE_CONFIDENCE ||
    !meta.fromEmail
  ) {
    return;
  }

  const domain = meta.fromEmail.split("@")[1]?.toLowerCase();
  if (!domain) {
    return;
  }

  await db.run("UPDATE emails SET is_excluded = 1 WHERE id = $1", [
    meta.emailId,
  ]);
  await db.run(
    `INSERT INTO domain_rules (domain, classification, is_excluded)
     VALUES ($1, 'SPAM', true)
     ON CONFLICT (domain) DO NOTHING`,
    [domain]
  );

  const updated = await db.run(
    `UPDATE emails SET is_excluded = 1, classification = 'SPAM', classification_method = 'domain_rule'
     WHERE is_excluded = 0 AND lower(from_email) LIKE $1`,
    [`%@${domain}`]
  );
  const count = (updated as unknown as { count?: number })?.count ?? 0;
  console.log(
    `[triage:spam] auto-blocked domain=${domain} (${count} emails excluded)`
  );
}

async function tryLinkProjectFallback(
  result: TriageResult,
  meta: TriageEmailMeta
): Promise<boolean> {
  if (!result.projectId) {
    return false;
  }

  const existing = await db
    .query<{ project_id: number | null }, [number]>(
      "SELECT project_id FROM emails WHERE id = $1"
    )
    .get(meta.emailId);

  if (existing?.project_id) {
    return false;
  }

  try {
    await linkEmailToProject(meta.emailId, result.projectId);
    return true;
  } catch (error) {
    console.warn(
      `[triage] failed to link email ${meta.emailId} to project ${result.projectId}:`,
      error
    );
    return false;
  }
}

async function tryLinkEstimateFallback(
  result: TriageResult,
  meta: TriageEmailMeta
): Promise<boolean> {
  if (!result.estimateId) {
    return false;
  }

  const hasLink = await db
    .query<{ cnt: string }, [number]>(
      "SELECT COUNT(*) AS cnt FROM estimate_emails WHERE email_id = $1"
    )
    .get(meta.emailId);

  if (Number(hasLink?.cnt ?? 0) !== 0) {
    return false;
  }

  try {
    return await linkEmailToEstimate(
      result.estimateId,
      meta.emailId,
      "agent",
      `triage: ${result.reason}`
    );
  } catch (error) {
    console.warn(
      `[triage] failed to link email ${meta.emailId} to estimate ${result.estimateId}:`,
      error
    );
    return false;
  }
}

function resolveDispatchAction(
  result: TriageResult,
  meta: TriageEmailMeta
): TriageJobType | null {
  const actionKey = `${result.category}:${result.subcategory ?? "general"}`;
  const explicit = TRIAGE_ACTIONS[actionKey];
  if (explicit) {
    return explicit;
  }

  if (result.category === "CONTRACT" && meta.hasAttachments) {
    return "contract_email_received";
  }

  return null;
}

export async function dispatchTriageResult(
  result: TriageResult,
  meta: TriageEmailMeta,
  enqueueJobFn?: TriageEnqueueJob
): Promise<DispatchResult> {
  return await db.transaction(async () => {
    const outcome: DispatchResult = {
      classified: false,
      jobEnqueued: null,
      projectLinked: false,
      estimateLinked: false,
    };

    // 1. Persist classification
    await updateEmailClassification(
      meta.emailId,
      result.category,
      result.confidence,
      "llm"
    );
    outcome.classified = true;

    // 1b. SPAM with high confidence → auto-exclude email + block domain
    await handleSpamAutoExclude(result, meta);

    // 2. Link to project if LLM picked one (fallback — only if deterministic
    //    linkEmail() didn't already set project_id)
    outcome.projectLinked = await tryLinkProjectFallback(result, meta);

    // 3. Link to estimate if LLM picked one (fallback — only if deterministic
    //    linkEmail() didn't already create an estimate_emails link)
    outcome.estimateLinked = await tryLinkEstimateFallback(result, meta);

    // 4. Enqueue job if this classification triggers an action
    const jobType = resolveDispatchAction(result, meta);
    if (jobType && enqueueJobFn) {
      const payload = JOB_PAYLOAD_BUILDERS[jobType](meta);
      await enqueueJobFn(jobType, payload);
      outcome.jobEnqueued = jobType;
    }

    return outcome;
  });
}
