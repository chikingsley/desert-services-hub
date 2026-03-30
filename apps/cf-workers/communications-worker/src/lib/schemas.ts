import { z } from "zod";

const normalizeMailboxEmail = (mailboxEmail: string): string => mailboxEmail.trim().toLowerCase();

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

const draftAttachmentSchema = z.object({
  contentBytesBase64: z.string().min(1),
  contentId: z.string().trim().min(1).optional(),
  contentType: z.string().trim().min(1),
  isInline: z.boolean().optional(),
  name: z.string().trim().min(1),
});

const composeNewRouteSchema = z.object({
  mode: z.literal("compose-new"),
  subject: z.string().min(1),
  to: z.array(recipientSchema).min(1),
});

const replyAllRouteSchema = z.object({
  mode: z.literal("reply-all"),
  replyToMessageId: z.string().trim().min(1),
  subject: z.string().min(1),
});

export const clientNotificationRouteSchema = z.discriminatedUnion("mode", [
  composeNewRouteSchema,
  replyAllRouteSchema,
]);

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

const clientNotificationContextBaseSchema = z.object({
  bodyHtml: z.string().min(1),
  mailbox: z.string().email(),
  permitId: z.string().regex(/^D\d{7}$/),
  route: clientNotificationRouteSchema,
  send: z.boolean(),
});

export const submittedClientContextSchema = clientNotificationContextBaseSchema.extend({
  kind: z.literal("dust-permit-submitted-client"),
});

export const issuedClientContextSchema = clientNotificationContextBaseSchema.extend({
  attachments: z.array(draftAttachmentSchema).default([]),
  kind: z.literal("dust-permit-issued-client"),
  type: z.enum(["issued", "renewed", "revised"]),
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

export const submittedClientWorkflowResultSchema = z.object({
  draftId: z.string().min(1),
  mode: z.enum(["draft", "sent"]),
  permitId: z.string().regex(/^D\d{7}$/),
  route: z.enum(["compose-new", "reply-all"]),
  subject: z.string().min(1),
});

export const issuedClientWorkflowResultSchema = z.object({
  draftId: z.string().min(1),
  hasAttachments: z.boolean(),
  mode: z.enum(["draft", "sent"]),
  permitId: z.string().regex(/^D\d{7}$/),
  route: z.enum(["compose-new", "reply-all"]),
  subject: z.string().min(1),
  type: z.enum(["issued", "renewed", "revised"]),
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
export type SubmittedClientContext = z.infer<typeof submittedClientContextSchema>;
export type SubmittedClientWorkflowResult = z.infer<typeof submittedClientWorkflowResultSchema>;
export type IssuedClientContext = z.infer<typeof issuedClientContextSchema>;
export type IssuedClientWorkflowResult = z.infer<typeof issuedClientWorkflowResultSchema>;
export type MailboxEventTriggerRequest = z.infer<typeof mailboxEventTriggerRequestSchema>;
export type MailboxQueueMessage = z.infer<typeof mailboxQueueMessageSchema>;
