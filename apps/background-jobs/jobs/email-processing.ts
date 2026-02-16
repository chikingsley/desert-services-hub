/**
 * Email notification processing -- thin wrapper over package implementation.
 */

import type { EmailNotificationAdapters } from "@email/handlers/webhook-notification-handler";
import {
  enrichSingleEmail as processEmail,
  processEmailNotification as processEmailNotificationWithAdapters,
} from "@email/handlers/webhook-notification-handler";
import { detectDustPermitEmailTrigger } from "../lib/notifications/email-triggers";
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
