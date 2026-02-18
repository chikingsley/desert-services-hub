import type { ContractsEmailIntakePayload } from "@background-jobs/lib/intake/files-intake";
import type {
  ContractEmailJobPayload,
  IssuedJobPayload,
  PaymentJobPayload,
} from "@background-jobs/lib/notifications/types";
import { z } from "zod";

const NON_EMPTY_STRING_SCHEMA = z.string().trim().min(1);

export const EMAIL_NOTIFICATION_PAYLOAD_SCHEMA = z.object({
  messageId: NON_EMPTY_STRING_SCHEMA,
  mailboxEmail: NON_EMPTY_STRING_SCHEMA,
  changeType: NON_EMPTY_STRING_SCHEMA,
});

export const EMAIL_RESOLVE_PAYLOAD_SCHEMA = z.object({
  emailId: z.number().int().positive(),
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
