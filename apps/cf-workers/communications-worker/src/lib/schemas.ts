import { z } from "zod";
import { normalizeMailboxEmail } from "./mailboxes";

export const submittedBillingTriggerRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    draft: z.boolean().default(true),
    emailId: z.number().int().positive(),
    mode: z.literal("payment-email"),
    scheduleValue: z.string().trim().min(1).optional(),
  }),
  z.object({
    draft: z.boolean().default(true),
    mode: z.literal("manual"),
    permitId: z.string().regex(/^D\d{7}$/),
    scheduleValue: z.string().trim().min(1).optional(),
  }),
  z.object({
    draft: z.boolean().default(true),
    invoiceNumber: z.string().regex(/^IV\d+$/),
    mode: z.literal("invoice"),
    scheduleValue: z.string().trim().min(1).optional(),
  }),
]);

const recipientSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).optional(),
});

export const submittedBillingContextSchema = z.object({
  bodyHtml: z.string().min(1),
  cc: z.array(recipientSchema),
  classification: z.enum(["new", "revision", "renewal"]),
  invoiceNumber: z
    .string()
    .regex(/^IV\d+$/)
    .nullable(),
  kind: z.literal("dust-permit-submitted-billing"),
  mailbox: z.string().email(),
  paymentDate: z.string().nullable(),
  permitId: z.string().regex(/^D\d{7}$/),
  scheduleCharge: z.string().min(1),
  send: z.boolean(),
  subject: z.string().min(1),
  to: z.array(recipientSchema).min(1),
});

export const submittedBillingWorkflowResultSchema = z.object({
  classification: z.enum(["new", "revision", "renewal"]),
  draftId: z.string().min(1),
  invoiceNumber: z
    .string()
    .regex(/^IV\d+$/)
    .nullable(),
  mode: z.enum(["draft", "sent"]),
  permitId: z.string().regex(/^D\d{7}$/),
  subject: z.string().min(1),
});

const mailboxSourceSchema = z.enum(["manual", "supabase-outlook-webhook"]);

export const mailboxEventTriggerRequestSchema = z.object({
  changeType: z.enum(["created", "updated"]).default("created"),
  mailboxEmail: z
    .string()
    .email()
    .transform((value) => normalizeMailboxEmail(value)),
  messageId: z.string().trim().min(1),
  source: mailboxSourceSchema.default("supabase-outlook-webhook"),
});

export const mailboxQueueMessageSchema = z.object({
  changeType: z.enum(["created", "updated"]),
  kind: z.literal("message-event"),
  mailboxEmail: z
    .string()
    .email()
    .transform((value) => normalizeMailboxEmail(value)),
  messageId: z.string().trim().min(1),
  queuedAt: z.string().trim().min(1),
  source: mailboxSourceSchema,
});

export type SubmittedBillingTriggerRequest = z.infer<typeof submittedBillingTriggerRequestSchema>;
export type SubmittedBillingContext = z.infer<typeof submittedBillingContextSchema>;
export type SubmittedBillingWorkflowResult = z.infer<typeof submittedBillingWorkflowResultSchema>;
export type MailboxEventTriggerRequest = z.infer<typeof mailboxEventTriggerRequestSchema>;
export type MailboxQueueMessage = z.infer<typeof mailboxQueueMessageSchema>;
