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
import { getPermitById, upsertPermit } from "@lib/db/repositories/dust-permit";
import { DUST_PERMIT_TIERS, type Permit } from "@lib/db/types";
import {
  createDraftClientFromEnv,
  createNotificationDraft,
} from "@/apps/notifications/lib/delivery";
import {
  type PendingEvent,
  recordNotification,
} from "@/apps/notifications/lib/events";
import { getStakeholders } from "@/apps/notifications/lib/stakeholders";

// ============================================================================
// Detection
// ============================================================================

export type DustPermitEmailTrigger = "pointandpay_payment" | "maricopa_issued";

const SUBJECT_DUST_PERMIT_ISSUED_RE = /dust permit issued/i;
const BODY_POINT_AND_PAY_ACCOUNT_RE = /Account Number:\s*IV\d+/i;
const BODY_POINT_AND_PAY_CONFIRMATION_RE = /Confirmation ID:\s*\d+/i;
const BODY_MARICOPA_ISSUED_RE =
  /application\s+D\d{7}\s+has been processed and approved/i;
const POINT_AND_PAY_INVOICE_RE = /Account Number:\s*(IV\d+)/i;
const POINT_AND_PAY_COUNTY_INVOICE_NUMBER_RE = /Invoice Number:\s*(\d+)/i;
const POINT_AND_PAY_PRODUCT_LINE_RE =
  /Product:\s*Invoices\s*-\s*Account Number:\s*(IV\d+)\s*-\s*Amount:\s*(\$[\d,]+\.\d{2})/i;
const POINT_AND_PAY_SUBTOTAL_RE = /^[ \t]*Sub Total:\s*(\$[\d,]+\.\d{2})/im;
const POINT_AND_PAY_TOTAL_RE = /^[ \t]*Total:\s*(\$[\d,]+\.\d{2})/im;
const POINT_AND_PAY_AMOUNT_RE = /Amount:\s*(\$[\d,]+\.\d{2})/i;
const POINT_AND_PAY_CONFIRMATION_RE = /Confirmation ID:\s*(\d+)/i;
const POINT_AND_PAY_CARD_RE = /Account Last Four:\s*(\d{4})/i;
const POINT_AND_PAY_DATE_RE = /Payment Date:\s*([^\r\n]+)/i;
const POINT_AND_PAY_PHONE_RE = /Customer Phone Number:\s*\(?([\d() -]+)\)?/i;
const MARICOPA_PERMIT_NUMBER_RE = /application\s+(D\d{7})/i;
const MARICOPA_FACILITY_ID_RE = /Facility ID#?:\s*(F\d+)/i;
const MARICOPA_FACILITY_NAME_RE =
  /Facility Name:\s*(.+?)(?=\s*Facility Address|\r?\n|$)/i;
const MARICOPA_SUBJECT_FACILITY_NAME_RE =
  /Dust Permit Issued\s*--\s*(.+?)(?:,|$)/i;
const MARICOPA_FACILITY_ADDRESS_RE =
  /Facility Address:\s*(.+?)(?=\s*Dust control|\r?\n|$)/i;

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

  if (
    from === "no-reply@maricopa.gov" &&
    SUBJECT_DUST_PERMIT_ISSUED_RE.test(subject)
  ) {
    return "maricopa_issued";
  }

  // Forwarded email detection — check body for original sender patterns
  if (body) {
    if (
      BODY_POINT_AND_PAY_ACCOUNT_RE.test(body) &&
      BODY_POINT_AND_PAY_CONFIRMATION_RE.test(body)
    ) {
      return "pointandpay_payment";
    }

    if (BODY_MARICOPA_ISSUED_RE.test(body)) {
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
  countyInvoiceNumber: string | null;
  amount: string | null;
  confirmationId: string | null;
  cardLastFour: string | null;
  paymentDate: string | null;
  customerPhone: string | null;
}

export function parsePointAndPayEmail(body: string): PointAndPayData {
  const invoiceMatch = body.match(POINT_AND_PAY_INVOICE_RE);
  const countyInvoiceMatch = body.match(POINT_AND_PAY_COUNTY_INVOICE_NUMBER_RE);
  const confirmationMatch = body.match(POINT_AND_PAY_CONFIRMATION_RE);
  const cardMatch = body.match(POINT_AND_PAY_CARD_RE);
  const dateMatch = body.match(POINT_AND_PAY_DATE_RE);
  const phoneMatch = body.match(POINT_AND_PAY_PHONE_RE);

  const invoiceNumber = invoiceMatch?.[1] ?? null;
  const countyInvoiceNumber = countyInvoiceMatch?.[1] ?? null;

  // PointAndPay can list the same invoice multiple times (e.g., accelerated
  // processing shows two identical line items). Prefer summing Product lines
  // for the detected invoice; fall back to Sub Total / Total / first Amount.
  let amount: string | null = null;

  if (invoiceNumber) {
    const productLineRe = new RegExp(
      POINT_AND_PAY_PRODUCT_LINE_RE.source,
      "gi"
    );
    let sum = 0;
    let count = 0;
    for (const match of body.matchAll(productLineRe)) {
      if (match[1] !== invoiceNumber) {
        continue;
      }
      const parsed = parseDollarAmount(match[2] ?? null);
      if (parsed == null) {
        continue;
      }
      sum += parsed;
      count += 1;
    }

    if (count > 0) {
      // Avoid floating point artifacts for currency.
      amount = formatUSD(Math.round(sum * 100) / 100);
    }
  }

  if (!amount) {
    const subTotalMatch = body.match(POINT_AND_PAY_SUBTOTAL_RE);
    const totalMatch = body.match(POINT_AND_PAY_TOTAL_RE);
    const amountMatch = body.match(POINT_AND_PAY_AMOUNT_RE);
    amount = subTotalMatch?.[1] ?? totalMatch?.[1] ?? amountMatch?.[1] ?? null;
  }

  return {
    invoiceNumber,
    countyInvoiceNumber,
    amount,
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
  const permitMatch = body.match(MARICOPA_PERMIT_NUMBER_RE);

  // Facility ID
  const facilityIdMatch = body.match(MARICOPA_FACILITY_ID_RE);

  // Facility Name — from body or subject
  const facilityNameMatch = body.match(MARICOPA_FACILITY_NAME_RE);
  const subjectNameMatch = subject.match(MARICOPA_SUBJECT_FACILITY_NAME_RE);
  const facilityName =
    facilityNameMatch?.[1]?.trim() ?? subjectNameMatch?.[1]?.trim() ?? null;

  // Facility Address
  const addressMatch = body.match(MARICOPA_FACILITY_ADDRESS_RE);

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

// ============================================================================
// Cost Breakdown
// ============================================================================

export interface CostBreakdown {
  permitCost: string; // ADEQ fee (what was paid to county)
  adminFee: string; // Desert Services admin/filing fee
  scheduleValue: string; // Total customer charge
  isAccelerated: boolean;
}

function formatUSD(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function parseDollarAmount(str: string | null): number | null {
  if (!str) {
    return null;
  }
  const cleaned = str.replace(/[,$]/g, "");
  const num = Number.parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

/**
 * Compute the customer cost breakdown for a dust permit billing notification.
 *
 * Uses the ADEQ fee (from the PointAndPay email amount) + DUST_PERMIT_TIERS
 * to determine permitCost, adminFee, and scheduleValue.
 *
 * For accelerated permits, the ADEQ fee is doubled so we halve it
 * to find the base tier. The admin fee stays the same.
 */
export function computeCostBreakdown(
  adeqFeeStr: string | null,
  isAccelerated: boolean
): CostBreakdown | null {
  const adeqFee = parseDollarAmount(adeqFeeStr);
  if (adeqFee == null || adeqFee <= 0) {
    return null;
  }

  // For accelerated permits, the ADEQ fee is doubled — halve to find base tier
  const baseFee = isAccelerated ? adeqFee / 2 : adeqFee;

  // Match against the tier table by ADEQ fee
  const tier = DUST_PERMIT_TIERS.find((t) => t.adeqFee === baseFee);
  if (!tier) {
    return null;
  }

  return {
    permitCost: formatUSD(adeqFee),
    adminFee: formatUSD(tier.filingFee),
    scheduleValue: formatUSD(adeqFee + tier.filingFee),
    isAccelerated,
  };
}

// ============================================================================
// Enrichment — Acreage, Facility ID, PDF
// ============================================================================

const FEATURE_SERVER_URL =
  "https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer";
const SQ_METERS_TO_ACRES = 0.000_247_105;
const PERMIT_WORKER_URL = "http://permit-worker:47822";

interface FeatureServerResponse {
  features?: Array<{
    attributes?: Record<string, unknown>;
  }>;
}

/**
 * Fetch project acreage from Maricopa FeatureServer (public REST API).
 * Queries layer 3 (disturbed area polygons) for Shape__Area and converts to acres.
 */
async function fetchAcreage(permitId: string): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      where: `ImpactID='${permitId}'`,
      outFields: "Shape__Area",
      returnGeometry: "false",
      f: "json",
    });
    const url = `${FEATURE_SERVER_URL}/3/query?${params.toString()}`;
    const response = await fetch(url);
    const data = (await response.json()) as FeatureServerResponse;

    const area = data?.features?.[0]?.attributes?.Shape__Area;
    if (typeof area !== "number" || area <= 0) {
      return null;
    }
    return area * SQ_METERS_TO_ACRES;
  } catch (err) {
    console.error("[email-trigger] Failed to fetch acreage:", err);
    return null;
  }
}

// TODO: facility_id is sparsely populated (1/2040 permits as of Feb 2026).
// Currently only set when handleIssuedEmail() processes a Maricopa issued email.
// Future: bulk-sync facility IDs from the portal or FeatureServer.
/**
 * Look up the facility ID for a renewal from the previous permit's DB record.
 */
async function lookupFacilityIdForRenewal(
  previousAppId: string
): Promise<string | null> {
  try {
    const row = await db
      .query<{ facility_id: string | null }, [string]>(
        "SELECT facility_id FROM dust_permits_filed_by_desert_services WHERE id = ?"
      )
      .get(previousAppId);

    return row?.facility_id ?? null;
  } catch (err) {
    console.error("[email-trigger] Failed to look up facility ID:", err);
    return null;
  }
}

/**
 * Fetch the dust application PDF from the permit-worker API.
 * The permit-worker uses Playwright to scrape the portal and generate a PDF.
 */
async function fetchPermitApplicationPdf(
  permitId: string
): Promise<PdfAttachmentForDraft | null> {
  try {
    const response = await fetch(`${PERMIT_WORKER_URL}/api/scrape/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permitId }),
    });

    if (!response.ok) {
      console.error(
        `[email-trigger] Permit-worker PDF request failed: ${response.status}`
      );
      return null;
    }

    const result = (await response.json()) as {
      success: boolean;
      pdfBase64?: string;
    };
    if (!(result.success && result.pdfBase64)) {
      return null;
    }

    return {
      name: `${permitId}-Application.pdf`,
      contentType: "application/pdf",
      contentBytes: result.pdfBase64,
    };
  } catch (err) {
    console.error("[email-trigger] Failed to fetch permit PDF:", err);
    return null;
  }
}

/**
 * Fetch the invoice PDF from the permit-worker API.
 * The permit-worker uses Playwright to search invoices and download the PDF bytes.
 */
async function fetchInvoicePdf(
  invoiceNumber: string
): Promise<PdfAttachmentForDraft | null> {
  try {
    const response = await fetch(`${PERMIT_WORKER_URL}/api/invoices/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceNumber }),
    });

    if (!response.ok) {
      console.error(
        `[email-trigger] Permit-worker invoice PDF request failed: ${response.status}`
      );
      return null;
    }

    const result = (await response.json()) as {
      success: boolean;
      pdfBase64?: string;
    };
    if (!(result.success && result.pdfBase64)) {
      return null;
    }

    return {
      name: `${invoiceNumber}-Invoice.pdf`,
      contentType: "application/pdf",
      contentBytes: result.pdfBase64,
    };
  } catch (err) {
    console.error("[email-trigger] Failed to fetch invoice PDF:", err);
    return null;
  }
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

  // Fetch invoice PDF (attach to billing draft when available)
  let invoicePdfAttachment = await fetchInvoicePdf(payment.invoiceNumber);
  if (!invoicePdfAttachment && payment.countyInvoiceNumber) {
    invoicePdfAttachment = await fetchInvoicePdf(payment.countyInvoiceNumber);
  }
  if (invoicePdfAttachment) {
    // Always name the attachment using the portal account number (IV...) since
    // that's what our DB mapping uses, even if we had to search by numeric id.
    invoicePdfAttachment.name = `${payment.invoiceNumber}-Invoice.pdf`;
    console.log(
      `[email-trigger] Invoice PDF attached: ${invoicePdfAttachment.name}`
    );
  }

  // Cost breakdown from tier table
  const costBreakdown = computeCostBreakdown(
    payment.amount,
    permit.isAccelerated
  );
  if (costBreakdown) {
    console.log(
      `[email-trigger] Cost breakdown: permit=${costBreakdown.permitCost} admin=${costBreakdown.adminFee} schedule=${costBreakdown.scheduleValue} accelerated=${costBreakdown.isAccelerated}`
    );
  }

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
      acceleratedProcessing: permit.isAccelerated ? "Yes" : "No",
      permitCost: costBreakdown?.permitCost,
      adminFee: costBreakdown?.adminFee,
      scheduleValue: costBreakdown?.scheduleValue,
      attachments: invoicePdfAttachment ? [invoicePdfAttachment] : [],
    },
  };

  await createAndDeliverNotification(billingEvent, payload.mailboxEmail);

  // 2. Submitted stakeholder notification — enrich with acreage, facility ID, PDF
  console.log(
    `[email-trigger] Enriching submitted notification for ${permit.id}...`
  );

  const isRenewal = !!permit.previousAppId;
  const [acreage, facilityId, pdfAttachment] = await Promise.all([
    fetchAcreage(permit.id),
    isRenewal && permit.previousAppId
      ? lookupFacilityIdForRenewal(permit.previousAppId)
      : Promise.resolve(null),
    fetchPermitApplicationPdf(permit.id),
  ]);

  if (acreage != null) {
    console.log(`[email-trigger] Acreage: ${acreage.toFixed(2)} acres`);
  }
  if (facilityId) {
    console.log(`[email-trigger] Facility ID (renewal): ${facilityId}`);
  }
  if (pdfAttachment) {
    console.log(`[email-trigger] PDF attached: ${pdfAttachment.name}`);
  }

  const submittedEvent: PendingEvent = {
    eventType: "dust_permit_submitted",
    refType: "permit",
    refId: permit.id,
    subject: `Dust Permit Submitted - ${permit.projectName ?? permit.id}`,
    metadata: {
      ...sharedMeta,
      acreage: acreage != null ? acreage.toFixed(2) : null,
      facilityId,
      isRenewal,
      attachments: pdfAttachment ? [pdfAttachment] : [],
    },
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
  let permit = await getPermitById(issued.permitNumber);

  // Persist facility ID when present so resubmission chains can use it later.
  if (issued.facilityId) {
    await upsertPermit({
      id: issued.permitNumber,
      facilityId: issued.facilityId,
    });
    permit = await getPermitById(issued.permitNumber);
  }

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
      (a) => a.contentType === "application/pdf" || a.name.endsWith(".pdf")
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
