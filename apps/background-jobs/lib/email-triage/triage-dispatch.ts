/**
 * Unified Email Triage — Dispatch
 *
 * Maps triage classification results to concrete actions:
 * - Persist classification on the email record
 * - Link to project/estimate if the LLM picked candidates
 * - Enqueue the appropriate job handler for action-triggering categories
 */

import { updateEmailClassification } from "@lib/db/repositories/email";
import { linkEmailToEstimate } from "@lib/db/repositories/estimate-email";
import { linkEmailToProject } from "@lib/db/repositories/project";
import { enqueueJob } from "../../jobs/queue";
import type {
  TriageEmailMeta,
  TriageJobType,
  TriageResult,
} from "./triage-types";

// ── Action mapping ──────────────────────────────────────────

interface DispatchAction {
  jobType: TriageJobType;
  buildPayload: (meta: TriageEmailMeta) => Record<string, unknown>;
}

const ACTION_MAP: Record<string, DispatchAction> = {
  "PAYMENT:payment_confirmation": {
    jobType: "dust_permit_payment",
    buildPayload: (meta) => ({
      emailId: meta.emailId,
      messageId: meta.messageId,
      mailboxEmail: meta.mailboxEmail,
      bodyText: meta.bodyText ?? "",
    }),
  },
  "DUST_PERMIT:permit_issued": {
    jobType: "dust_permit_issued_email",
    buildPayload: (meta) => ({
      emailId: meta.emailId,
      messageId: meta.messageId,
      mailboxEmail: meta.mailboxEmail,
      bodyText: meta.bodyText ?? "",
      subject: meta.subject ?? "",
    }),
  },
  "CONTRACT:new_contract": {
    jobType: "contract_email_received",
    buildPayload: (meta) => ({
      emailId: meta.emailId,
      messageId: meta.messageId,
      mailboxEmail: meta.mailboxEmail,
      subject: meta.subject ?? "",
      fromEmail: meta.fromEmail ?? "",
      bodyText: meta.bodyText ?? "",
      hasAttachments: meta.hasAttachments,
    }),
  },
  "CONTRACT:contract_revision": {
    jobType: "contract_email_received",
    buildPayload: (meta) => ({
      emailId: meta.emailId,
      messageId: meta.messageId,
      mailboxEmail: meta.mailboxEmail,
      subject: meta.subject ?? "",
      fromEmail: meta.fromEmail ?? "",
      bodyText: meta.bodyText ?? "",
      hasAttachments: meta.hasAttachments,
    }),
  },
  "CHANGE_ORDER:contract_revision": {
    jobType: "contract_email_received",
    buildPayload: (meta) => ({
      emailId: meta.emailId,
      messageId: meta.messageId,
      mailboxEmail: meta.mailboxEmail,
      subject: meta.subject ?? "",
      fromEmail: meta.fromEmail ?? "",
      bodyText: meta.bodyText ?? "",
      hasAttachments: meta.hasAttachments,
    }),
  },
};

// Also dispatch CONTRACT without subcategory if it has attachments
const CONTRACT_FALLBACK_KEY = "CONTRACT:general";

// ── Main dispatch ───────────────────────────────────────────

export interface DispatchResult {
  classified: boolean;
  jobEnqueued: TriageJobType | null;
  projectLinked: boolean;
  estimateLinked: boolean;
}

export async function dispatchTriageResult(
  result: TriageResult,
  meta: TriageEmailMeta
): Promise<DispatchResult> {
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

  // 2. Link to project if LLM picked one
  if (result.projectId) {
    try {
      await linkEmailToProject(meta.emailId, result.projectId);
      outcome.projectLinked = true;
    } catch (error) {
      console.warn(
        `[triage] failed to link email ${meta.emailId} to project ${result.projectId}:`,
        error
      );
    }
  }

  // 3. Link to estimate if LLM picked one
  if (result.estimateId) {
    try {
      const linked = await linkEmailToEstimate(
        result.estimateId,
        meta.emailId,
        "agent",
        `triage: ${result.reason}`
      );
      outcome.estimateLinked = linked;
    } catch (error) {
      console.warn(
        `[triage] failed to link email ${meta.emailId} to estimate ${result.estimateId}:`,
        error
      );
    }
  }

  // 4. Enqueue job if this classification triggers an action
  const actionKey = `${result.category}:${result.subcategory ?? "general"}`;
  let action = ACTION_MAP[actionKey];

  // Special case: CONTRACT with any subcategory + attachments → intake
  if (!action && result.category === "CONTRACT" && meta.hasAttachments) {
    action = ACTION_MAP[CONTRACT_FALLBACK_KEY] ?? {
      jobType: "contract_email_received",
      buildPayload: (m) => ({
        emailId: m.emailId,
        messageId: m.messageId,
        mailboxEmail: m.mailboxEmail,
        subject: m.subject ?? "",
        fromEmail: m.fromEmail ?? "",
        bodyText: m.bodyText ?? "",
        hasAttachments: m.hasAttachments,
      }),
    };
  }

  if (action) {
    const payload = action.buildPayload(meta);
    enqueueJob.run(action.jobType, null, JSON.stringify(payload));
    outcome.jobEnqueued = action.jobType;
  }

  return outcome;
}
