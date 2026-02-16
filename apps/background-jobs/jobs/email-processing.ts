/**
 * Email notification processing — wires unified triage into the webhook handler.
 */

import type { EmailNotificationAdapters } from "@email/handlers/webhook-notification-handler";
import {
  enrichSingleEmail as processEmail,
  processEmailNotification as processEmailNotificationWithAdapters,
} from "@email/handlers/webhook-notification-handler";
import { triageEmail } from "../lib/email-triage/triage";
import { FWD_RE, INTERNAL_DOMAINS } from "./config";

const adapters: EmailNotificationAdapters = {
  internalDomains: INTERNAL_DOMAINS,
  forwardSubjectRegex: FWD_RE,
  triageAndDispatch: async (emailId, meta) => {
    const outcome = await triageEmail(emailId, {
      emailId,
      messageId: meta.messageId,
      mailboxEmail: meta.mailboxEmail,
      subject: meta.subject,
      fromEmail: meta.fromEmail,
      bodyText: meta.bodyText,
      hasAttachments: meta.hasAttachments,
    });

    if (outcome.error) {
      console.error(
        `[email-processing] triage error for email ${emailId}: ${outcome.error}`
      );
    }
  },
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
