import type { ContractsEmailIntakePayload } from "@documents-intake/types";
import type { ContractEmailJobPayload } from "@email/contracts/types";
import type {
  IssuedJobPayload,
  PaymentJobPayload,
} from "@email/notifications/types";
import { z } from "zod";

const NON_EMPTY_STRING_SCHEMA = z.string().trim().min(1);

export const EMAIL_NOTIFICATION_PAYLOAD_SCHEMA = z.object({
  messageId: NON_EMPTY_STRING_SCHEMA,
  mailboxEmail: NON_EMPTY_STRING_SCHEMA,
  changeType: NON_EMPTY_STRING_SCHEMA,
});

export const INTAKE_PAYLOAD_SCHEMA: z.ZodType<ContractsEmailIntakePayload> =
  z.object({
    originalSubject: z.string(),
    originalFrom: z.string(),
    bodyText: z.string(),
    attachmentPaths: z.array(NON_EMPTY_STRING_SCHEMA),
    forwarderEmail: z.string(),
  });

export const PAYMENT_PAYLOAD_SCHEMA: z.ZodType<PaymentJobPayload> = z.object({
  emailId: z.number().int().positive(),
  messageId: NON_EMPTY_STRING_SCHEMA,
  mailboxEmail: NON_EMPTY_STRING_SCHEMA,
  bodyText: z.string(),
});

export const ISSUED_PAYLOAD_SCHEMA: z.ZodType<IssuedJobPayload> = z.object({
  emailId: z.number().int().positive(),
  messageId: NON_EMPTY_STRING_SCHEMA,
  mailboxEmail: NON_EMPTY_STRING_SCHEMA,
  bodyText: z.string(),
  subject: NON_EMPTY_STRING_SCHEMA,
});

export const CONTRACT_EMAIL_PAYLOAD_SCHEMA: z.ZodType<ContractEmailJobPayload> =
  z.object({
    emailId: z.number().int().positive(),
    messageId: NON_EMPTY_STRING_SCHEMA,
    mailboxEmail: NON_EMPTY_STRING_SCHEMA,
    subject: z.string(),
    fromEmail: z.string(),
    bodyText: z.string(),
    hasAttachments: z.boolean(),
  });

export const BODY_LINK_MANUAL_FOLLOWUP_PAYLOAD_SCHEMA = z.object({
  emailId: z.number().int().positive(),
  mailboxEmail: NON_EMPTY_STRING_SCHEMA,
  reason: NON_EMPTY_STRING_SCHEMA,
  source: z.enum(["onedrive", "egnyte", "dropbox", "buildingconnected"]),
  url: NON_EMPTY_STRING_SCHEMA,
});

// -- Queue-driven LLM job schemas --

export const CONTACT_ENRICHMENT_PAYLOAD_SCHEMA = z.object({
  batchSize: z.number().int().positive(),
});

export const EMAIL_TRIAGE_BATCH_PAYLOAD_SCHEMA = z.object({
  batchSize: z.number().int().positive(),
  concurrency: z.number().int().positive(),
  provider: z.enum(["local", "gemini"]).default("local"),
});

export const ESTIMATE_TRIAGE_PAYLOAD_SCHEMA = z.object({
  maxRows: z.number().int().positive(),
});

export const MAILBOX_FALLBACK_SYNC_PAYLOAD_SCHEMA = z.object({
  enabled: z.boolean().optional(),
  lookbackHours: z
    .number()
    .int()
    .positive()
    .max(24 * 7)
    .optional(),
  maxPerMailbox: z.number().int().positive().max(5000).optional(),
  concurrency: z.number().int().positive().max(8).optional(),
  fetchBodies: z.boolean().optional(),
  fetchAttachments: z.boolean().optional(),
});

export const BODY_LINK_BACKFILL_PAYLOAD_SCHEMA = z.object({
  enabled: z.boolean().optional(),
  lookbackDays: z.number().int().positive().max(3650).optional(),
  limit: z.number().int().positive().max(10_000).optional(),
  mailbox: NON_EMPTY_STRING_SCHEMA.optional(),
  maxLinks: z.number().int().positive().max(50).optional(),
});

export const AQDATA_DETAIL_SCRAPE_PAYLOAD_SCHEMA = z.object({
  limit: z.number().int().positive().max(500).optional(),
});
