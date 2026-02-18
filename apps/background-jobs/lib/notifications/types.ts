import type { NotificationEventType } from "@lib/db/types";

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

export interface ContractEmailJobPayload {
  emailId: number;
  messageId: string;
  mailboxEmail: string;
  subject: string;
  fromEmail: string;
  bodyText: string;
  hasAttachments: boolean;
}

export interface PaymentJobPayload {
  emailId: number;
  messageId: string;
  mailboxEmail: string;
  bodyText: string;
}

export interface IssuedJobPayload {
  emailId: number;
  messageId: string;
  mailboxEmail: string;
  bodyText: string;
  subject: string;
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
