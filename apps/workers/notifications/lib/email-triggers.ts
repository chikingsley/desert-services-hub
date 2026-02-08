/**
 * Email Trigger Detection for Dust Permit Notifications
 *
 * Detects incoming emails that should trigger notification workflows:
 * - PointAndPay payment confirmations → billing + submitted notifications
 * - Maricopa County "Dust Permit Issued" → issued notification
 */

import type { GraphEmailClient } from "@email/client";
import { db } from "@lib/db/hub";
import { getAttachmentsForEmail } from "@lib/db/repositories";
import { getPermitById } from "@lib/db/repositories/dust-permit";
import type { Permit } from "@lib/db/types";
import {
  createDraftClientFromEnv,
  createNotificationDraft,
} from "@/apps/workers/notifications/lib/delivery";
import {
  recordNotification,
  type PendingEvent,
} from "@/apps/workers/notifications/lib/events";
import { getStakeholders } from "@/apps/workers/notifications/lib/stakeholders";

// ============================================================================
// Detection
// ============================================================================

export type DustPermitEmailTrigger = "pointandpay_payment" | "maricopa_issued";

export function detectDustPermitEmailTrigger(
  fromEmail: string,
  subject: string,
  body?: string
): DustPermitEmailTrigger | null {
  const from = fromEmail.toLowerCase().trim();

  // Direct match — original sender
  if (from === "noreply@pointandpay.com") {
    return "pointandpay_payment";
  }

  if (from === "no-reply@maricopa.gov" && /dust permit issued/i.test(subject)) {
    return "maricopa_issued";
  }

  // Forwarded email detection — check body for original sender patterns
  if (body) {
    if (/Account Number:\s*IV\d+/i.test(body) && /Confirmation ID:\s*\d+/i.test(body)) {
      return "pointandpay_payment";
    }

    if (/application\s+D\d{7}\s+has been processed and approved/i.test(body)) {
      return "maricopa_issued";
    }
  }

  return null;
}

// ============================================================================
// Parsers
// ============================================================================

export interface PointAndPayData {
  invoiceNumber: string | null;
  amount: string | null;
  confirmationId: string | null;
  cardLastFour: string | null;
  paymentDate: string | null;
  customerPhone: string | null;
}

export function parsePointAndPayEmail(body: string): PointAndPayData {
  const invoiceMatch = body.match(/Account Number:\s*(IV\d+)/i);
  const amountMatch = body.match(/Amount:\s*(\$[\d,]+\.\d{2})/i);
  const confirmationMatch = body.match(/Confirmation ID:\s*(\d+)/i);
  const cardMatch = body.match(/Account Last Four:\s*(\d{4})/i);
  const dateMatch = body.match(
    /Payment Date:\s*(.+?)(?:\n|Customer Phone)/i
  );
  const phoneMatch = body.match(
    /Customer Phone Number:\s*\(?([\d() -]+)\)?/i
  );

  return {
    invoiceNumber: invoiceMatch?.[1] ?? null,
    amount: amountMatch?.[1] ?? null,
    confirmationId: confirmationMatch?.[1] ?? null,
    cardLastFour: cardMatch?.[1] ?? null,
    paymentDate: dateMatch?.[1]?.trim() ?? null,
    customerPhone: phoneMatch?.[1]?.trim() ?? null,
  };
}

export interface MaricopaIssuedData {
  permitNumber: string | null;
  facilityId: string | null;
  facilityName: string | null;
  facilityAddress: string | null;
}

export function parseMaricopaIssuedEmail(
  body: string,
  subject: string
): MaricopaIssuedData {
  // Permit number from body (D followed by 7 digits)
  const permitMatch = body.match(/application\s+(D\d{7})/i);

  // Facility ID
  const facilityIdMatch = body.match(/Facility ID#?:\s*(\w+)/i);

  // Facility Name — from body or subject
  const facilityNameMatch = body.match(/Facility Name:\s*(.+?)(?:\n|$)/i);
  const subjectNameMatch = subject.match(
    /Dust Permit Issued\s*--\s*(.+?)(?:,|$)/i
  );
  const facilityName =
    facilityNameMatch?.[1]?.trim() ?? subjectNameMatch?.[1]?.trim() ?? null;

  // Facility Address
  const addressMatch = body.match(/Facility Address:\s*(.+?)(?:\n|$)/i);

  return {
    permitNumber: permitMatch?.[1] ?? null,
    facilityId: facilityIdMatch?.[1] ?? null,
    facilityName,
    facilityAddress: addressMatch?.[1]?.trim() ?? null,
  };
}

// ============================================================================
// Job Handlers
// ============================================================================

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

/**
 * Handle a PointAndPay payment email.
 *
 * 1. Parse invoice number and payment details
 * 2. Match to a permit via invoice_number
 * 3. Create billing notification (internal)
 * 4. Create submitted notification (stakeholders)
 */
export async function handlePaymentEmail(
  payload: PaymentJobPayload
): Promise<void> {
  const payment = parsePointAndPayEmail(payload.bodyText);

  if (!payment.invoiceNumber) {
    console.log(
      "[email-trigger] PointAndPay email has no invoice number, skipping"
    );
    return;
  }

  console.log(
    `[email-trigger] PointAndPay payment: invoice=${payment.invoiceNumber} amount=${payment.amount}`
  );

  // Match invoice to permit
  const permit = await findPermitByInvoice(payment.invoiceNumber);

  if (!permit) {
    console.log(
      `[email-trigger] No permit found for invoice ${payment.invoiceNumber}. Will be caught by next sync + polling detector.`
    );
    return;
  }

  console.log(
    `[email-trigger] Matched invoice ${payment.invoiceNumber} → permit ${permit.id} (${permit.projectName})`
  );

  // Build shared metadata
  const sharedMeta = {
    permitId: permit.id,
    projectName: permit.projectName,
    companyName: permit.companyName,
    address: permit.address,
    city: permit.city,
    invoiceNumber: payment.invoiceNumber,
    sourceEmailId: payload.emailId,
  };

  // 1. Billing notification
  const billingEvent: PendingEvent = {
    eventType: "dust_permit_billing",
    refType: "permit",
    refId: permit.id,
    subject: `Dust Permit Billing - ${permit.projectName ?? permit.id}`,
    metadata: {
      ...sharedMeta,
      amount: payment.amount,
      confirmationId: payment.confirmationId,
      cardLastFour: payment.cardLastFour,
      paymentDate: payment.paymentDate,
    },
  };

  await createAndDeliverNotification(billingEvent, payload.mailboxEmail);

  // 2. Submitted stakeholder notification
  const submittedEvent: PendingEvent = {
    eventType: "dust_permit_submitted",
    refType: "permit",
    refId: permit.id,
    subject: `Dust Permit Submitted - ${permit.projectName ?? permit.id}`,
    metadata: sharedMeta,
  };

  await createAndDeliverNotification(submittedEvent, payload.mailboxEmail);
}

/**
 * Handle a Maricopa "Dust Permit Issued" email.
 *
 * 1. Parse permit number and facility info
 * 2. Match to permit in DB
 * 3. Download email attachments (permit PDF)
 * 4. Create issued notification with PDF attached
 */
export async function handleIssuedEmail(
  payload: IssuedJobPayload
): Promise<void> {
  const issued = parseMaricopaIssuedEmail(payload.bodyText, payload.subject);

  if (!issued.permitNumber) {
    console.log(
      "[email-trigger] Maricopa issued email has no permit number, skipping"
    );
    return;
  }

  console.log(
    `[email-trigger] Maricopa issued: permit=${issued.permitNumber} facility=${issued.facilityName}`
  );

  // Look up permit in our DB
  const permit = await getPermitById(issued.permitNumber);

  const issuedEvent: PendingEvent = {
    eventType: "dust_permit_issued",
    refType: "permit",
    refId: issued.permitNumber,
    subject: `Dust Permit Issued - ${issued.facilityName ?? permit?.projectName ?? issued.permitNumber}`,
    metadata: {
      permitId: issued.permitNumber,
      projectName: permit?.projectName ?? issued.facilityName,
      companyName: permit?.companyName,
      facilityId: issued.facilityId,
      facilityName: issued.facilityName,
      facilityAddress: issued.facilityAddress,
      effectiveDate: permit?.effectiveDate,
      expirationDate: permit?.expirationDate,
      address: permit?.address ?? issued.facilityAddress,
      sourceEmailId: payload.emailId,
    },
  };

  // Try to get PDF attachments from the email to include in the notification
  const pdfAttachments = await getEmailPdfAttachments(
    payload.emailId,
    payload.messageId,
    payload.mailboxEmail
  );

  if (pdfAttachments.length > 0) {
    issuedEvent.metadata.attachments = pdfAttachments;
    console.log(
      `[email-trigger] Found ${pdfAttachments.length} PDF attachment(s) to include`
    );
  }

  await createAndDeliverNotification(issuedEvent, payload.mailboxEmail);
}

// ============================================================================
// Helpers
// ============================================================================

async function findPermitByInvoice(
  invoiceNumber: string
): Promise<Permit | null> {
  const row = await db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM dust_permits_filed_by_desert_services WHERE invoice_number = ?"
    )
    .get(invoiceNumber);

  if (!row) {
    return null;
  }

  // Reuse getPermitById to get the fully parsed Permit
  return getPermitById(row.id as string);
}

interface PdfAttachmentForDraft {
  name: string;
  contentType: string;
  contentBytes: string; // base64
}

async function getEmailPdfAttachments(
  emailId: number,
  messageId: string,
  mailboxEmail: string
): Promise<PdfAttachmentForDraft[]> {
  try {
    const attachments = await getAttachmentsForEmail(emailId);
    const pdfs = attachments.filter(
      (a) =>
        a.contentType === "application/pdf" || a.name.endsWith(".pdf")
    );

    if (pdfs.length === 0) {
      return [];
    }

    // Download the actual content from Graph
    const { createGraphClient } = await import("@email/sync/config");
    const client: GraphEmailClient = createGraphClient();

    const results: PdfAttachmentForDraft[] = [];
    for (const pdf of pdfs) {
      try {
        const content = await client.downloadAttachment(
          messageId,
          pdf.attachmentId,
          mailboxEmail
        );
        results.push({
          name: pdf.name,
          contentType: "application/pdf",
          contentBytes: content.toString("base64"),
        });
      } catch (err) {
        console.error(
          `[email-trigger] Failed to download attachment ${pdf.name}:`,
          err
        );
      }
    }

    return results;
  } catch (err) {
    console.error("[email-trigger] Failed to get email attachments:", err);
    return [];
  }
}

/**
 * Create a notification record and immediately create an Outlook draft.
 */
async function createAndDeliverNotification(
  event: PendingEvent,
  mailbox: string
): Promise<void> {
  const stakeholders = await getStakeholders(event.eventType);

  if (stakeholders.length === 0) {
    console.log(
      `[email-trigger] No stakeholders for ${event.eventType}, recording as failed`
    );
    await recordNotification(
      event,
      "failed",
      undefined,
      "No active stakeholders configured for event type"
    );
    return;
  }

  const recipientList = stakeholders.map((s) => s.email).join(", ");
  console.log(
    `[email-trigger] Creating draft: ${event.eventType} → ${recipientList}`
  );

  try {
    const client = createDraftClientFromEnv();
    const draft = await createNotificationDraft({
      client,
      event,
      stakeholders,
      mailbox,
    });
    await recordNotification(event, "drafted", draft.id);
    console.log(
      `[email-trigger] Draft created: ${event.subject} (draftId=${draft.id})`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[email-trigger] Draft creation failed: ${msg}`);
    await recordNotification(event, "failed", undefined, msg);
  }
}
