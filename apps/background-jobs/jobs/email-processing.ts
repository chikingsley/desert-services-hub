/**
 * Email notification processing -- thin wrapper over package implementation.
 */

import type { EmailNotificationAdapters } from "@email/jobs/email-notification-processing";
import {
  enrichSingleEmail as processEmail,
  processEmailNotification as processEmailNotificationWithAdapters,
} from "@email/jobs/email-notification-processing";
import { detectDustPermitEmailTrigger } from "@/apps/notifications/lib/email-triggers";
import { FWD_RE, INTERNAL_DOMAINS } from "./config";
import { enqueueEmailResolve, enqueueJob } from "./queue";

const adapters: EmailNotificationAdapters = {
  enqueueEmailResolve,
  enqueueDustPermitJob: (jobType, payload) =>
    enqueueJob.run(jobType, null, payload),
  detectDustPermitEmailTrigger,
  forwardSubjectRegex: FWD_RE,
  internalDomains: INTERNAL_DOMAINS,
};

export async function enrichSingleEmail(emailId: number): Promise<void> {
  await processEmail(emailId, {
    internalDomains: INTERNAL_DOMAINS,
    forwardSubjectRegex: FWD_RE,
  });
}

export async function processEmailNotification(
  messageId: string,
  mailboxEmail: string,
  changeType = "created"
): Promise<void> {
  await processEmailNotificationWithAdapters(
    messageId,
    mailboxEmail,
    changeType,
    adapters
  );
}
