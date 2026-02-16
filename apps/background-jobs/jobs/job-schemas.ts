import { z } from "zod";
import type {
  IssuedJobPayload,
  PaymentJobPayload,
} from "@notifications/lib/email-triggers";
import type { ContractsEmailIntakePayload } from "../lib/files-intake";

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
