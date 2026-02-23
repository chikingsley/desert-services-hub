/**
 * Event-driven job handlers for background-jobs worker.
 *
 * NOTE: processEmailNotificationJob has been removed — email notifications
 * are now handled by the Trigger.dev email-sync task (src/trigger/email-sync.ts).
 */

import { CONTRACT_EMAIL_PAYLOAD_SCHEMA } from "@contract/types";
import { processFilesIntake } from "@documents-intake/files-intake";
import { db } from "@lib/db/client";
import {
  BODY_LINK_MANUAL_FOLLOWUP_PAYLOAD_SCHEMA,
  INTAKE_PAYLOAD_SCHEMA,
  ISSUED_PAYLOAD_SCHEMA,
  PAYMENT_PAYLOAD_SCHEMA,
} from "./job-schemas";
import {
  processDustPermitIssuedEmailJob as processIssuedPayload,
  processDustPermitPaymentJob as processPaymentPayload,
} from "./permit-email-jobs";
import { parseJobPayload } from "./queue";
import type { WebhookJob } from "./types";

const upsertBodyLinkManualFollowup = db.query(
  `INSERT INTO body_link_manual_followups (
     email_id,
     mailbox_email,
     source,
     url,
     reason,
     status,
     occurrences,
     first_seen_at,
     last_seen_at,
     created_at,
     updated_at
   )
   VALUES (
     $1,
     $2,
     $3,
     $4,
     $5,
     'pending',
     1,
     now(),
     now(),
     now(),
     now()
   )
   ON CONFLICT (email_id, source, url)
   DO UPDATE SET
     mailbox_email = EXCLUDED.mailbox_email,
     reason = EXCLUDED.reason,
     occurrences = body_link_manual_followups.occurrences + 1,
     last_seen_at = now(),
     updated_at = now(),
     status = CASE
       WHEN body_link_manual_followups.status = 'pending'
       THEN 'pending'
       ELSE body_link_manual_followups.status
     END`
);

export async function processIntakeJob(job: WebhookJob): Promise<void> {
  const payload = parseJobPayload(job, INTAKE_PAYLOAD_SCHEMA);
  await processFilesIntake(payload);
}

export async function processDustPermitPaymentJob(
  job: WebhookJob
): Promise<void> {
  const payload = parseJobPayload(job, PAYMENT_PAYLOAD_SCHEMA);
  await processPaymentPayload(payload);
}

export async function processDustPermitIssuedEmailJob(
  job: WebhookJob
): Promise<void> {
  const payload = parseJobPayload(job, ISSUED_PAYLOAD_SCHEMA);
  await processIssuedPayload(payload);
}

export async function processContractEmailReceivedJob(
  job: WebhookJob
): Promise<void> {
  const { processContractEmailJob } = await import(
    "@contract/contract-email-handler"
  );
  const payload = parseJobPayload(job, CONTRACT_EMAIL_PAYLOAD_SCHEMA);
  await processContractEmailJob(payload);
}

export async function processBodyLinkManualFollowupJob(
  job: WebhookJob
): Promise<void> {
  const payload = parseJobPayload(
    job,
    BODY_LINK_MANUAL_FOLLOWUP_PAYLOAD_SCHEMA
  );

  await upsertBodyLinkManualFollowup.run(
    payload.emailId,
    payload.mailboxEmail,
    payload.source,
    payload.url,
    payload.reason
  );
}
