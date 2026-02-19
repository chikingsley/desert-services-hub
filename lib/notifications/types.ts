import type { NotificationEventType } from "@lib/db/types";
import { z } from "zod";

export type NotificationDeliveryMode = "log" | "draft";
export type DustPermitEmailTrigger = "pointandpay_payment" | "maricopa_issued";

export interface PendingEvent {
  eventType: NotificationEventType;
  refType: string;
  refId: string;
  subject: string;
  metadata: Record<string, unknown>;
}

export interface QueuedNotification {
  id: number;
  event: PendingEvent;
}

export interface StakeholderRecipient {
  email: string;
  name: string | null;
  role: string | null;
}

export interface RoutedRecipients {
  to: Array<{ email: string; name?: string }>;
  cc: Array<{ email: string; name?: string }>;
}

export interface DraftAttachment {
  name: string;
  contentType: string;
  contentBytes: string;
  contentId?: string;
  isInline?: boolean;
}

export interface DraftContent {
  body: string;
  bodyType: "html" | "text";
  skipSignature: boolean;
  attachments?: DraftAttachment[];
}

export interface PointAndPayData {
  invoiceNumber: string | null;
  countyInvoiceNumber: string | null;
  amount: string | null;
  confirmationId: string | null;
  cardLastFour: string | null;
  paymentDate: string | null;
  customerPhone: string | null;
}

export interface MaricopaIssuedData {
  permitNumber: string | null;
  facilityId: string | null;
  facilityName: string | null;
  facilityAddress: string | null;
}

export interface CostBreakdown {
  permitCost: string;
  adminFee: string;
  scheduleValue: string;
  isAccelerated: boolean;
}

export interface FeatureServerResponse {
  features?: Array<{
    attributes?: Record<string, unknown>;
  }>;
}

export interface PdfAttachmentForDraft {
  name: string;
  contentType: string;
  contentBytes: string;
}

// ── Job Payload Schemas ─────────────────────────────────────

const NON_EMPTY_STRING = z.string().trim().min(1);

export const PAYMENT_PAYLOAD_SCHEMA = z.object({
  emailId: z.number().int().positive(),
  messageId: NON_EMPTY_STRING,
  mailboxEmail: NON_EMPTY_STRING,
  bodyText: z.string(),
});
export type PaymentJobPayload = z.infer<typeof PAYMENT_PAYLOAD_SCHEMA>;

export const ISSUED_PAYLOAD_SCHEMA = z.object({
  emailId: z.number().int().positive(),
  messageId: NON_EMPTY_STRING,
  mailboxEmail: NON_EMPTY_STRING,
  bodyText: z.string(),
  subject: NON_EMPTY_STRING,
});
export type IssuedJobPayload = z.infer<typeof ISSUED_PAYLOAD_SCHEMA>;
