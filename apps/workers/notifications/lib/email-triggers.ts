/**
 * Email Trigger Detection for Dust Permit Notifications
 *
 * Detects incoming emails that should trigger notification workflows:
 * - PointAndPay payment confirmations → billing + submitted notifications
 * - Maricopa County "Dust Permit Issued" → issued notification
 */

import type { GraphEmailClient } from "@email/client";
import { getAllItems } from "@lib/catalog";
import { db } from "@lib/db/hub";
import { getAttachmentsForEmail } from "@lib/db/repositories";
import { getPermitById } from "@lib/db/repositories/dust-permit";
import type { Permit } from "@lib/db/types";
import {
  createDraftClientFromEnv,
  createNotificationDraft,
} from "@/apps/workers/notifications/lib/delivery";
import {
  type PendingEvent,
  recordNotification,
} from "@/apps/workers/notifications/lib/events";
import { getStakeholders } from "@/apps/workers/notifications/lib/stakeholders";

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
const POINT_AND_PAY_AMOUNT_RE = /Amount:\s*(\$[\d,]+\.\d{2})/i;
const POINT_AND_PAY_CONFIRMATION_RE = /Confirmation ID:\s*(\d+)/i;
const POINT_AND_PAY_CARD_RE = /Account Last Four:\s*(\d{4})/i;
const POINT_AND_PAY_DATE_RE = /Payment Date:\s*(.+?)(?:\n|Customer Phone)/i;
const POINT_AND_PAY_PHONE_RE = /Customer Phone Number:\s*\(?([\d() -]+)\)?/i;
const MARICOPA_PERMIT_NUMBER_RE = /application\s+(D\d{7})/i;
const MARICOPA_FACILITY_ID_RE = /Facility ID#?:\s*(\w+)/i;
const MARICOPA_FACILITY_NAME_RE = /Facility Name:\s*(.+?)(?:\n|$)/i;
const MARICOPA_SUBJECT_FACILITY_NAME_RE =
  /Dust Permit Issued\s*--\s*(.+?)(?:,|$)/i;
const MARICOPA_FACILITY_ADDRESS_RE = /Facility Address:\s*(.+?)(?:\n|$)/i;

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
  amount: string | null;
  confirmationId: string | null;
  cardLastFour: string | null;
  paymentDate: string | null;
  customerPhone: string | null;
}

export function parsePointAndPayEmail(body: string): PointAndPayData {
  const invoiceMatch = body.match(POINT_AND_PAY_INVOICE_RE);
  const amountMatch = body.match(POINT_AND_PAY_AMOUNT_RE);
  const confirmationMatch = body.match(POINT_AND_PAY_CONFIRMATION_RE);
  const cardMatch = body.match(POINT_AND_PAY_CARD_RE);
  const dateMatch = body.match(POINT_AND_PAY_DATE_RE);
  const phoneMatch = body.match(POINT_AND_PAY_PHONE_RE);

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

const ADMIN_FEE_RE = /Admin\s+\$([\d,]+)/;

interface CostBreakdown {
  permitCost: string; // ADEQ fee (what was paid to county)
  adminFee: string; // Desert Services admin fee
  scheduleValue: string; // Total customer charge
  isAccelerated: boolean;
}

function formatUSD(cents: number): string {
  return `$${cents.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

/**
 * Compute the customer cost breakdown for a dust permit billing notification.
 *
 * Uses the ADEQ fee (invoice_charges) + catalog to determine:
 * - permitCost: what was paid to the county
 * - adminFee: Desert Services' admin charge (parsed from catalog notes)
 * - scheduleValue: total customer charge (permitCost + adminFee)
 *
 * For expedited permits, the ADEQ fee is doubled so we halve it
 * to find the base tier in the catalog. Admin fee stays the same.
 */
function computeCostBreakdown(permit: Permit): CostBreakdown | null {
  const adeqFee = permit.invoiceCharges;
  if (adeqFee == null || adeqFee <= 0) return null;

  // For accelerated permits, the ADEQ fee is doubled — halve to find base tier
  const baseFee = permit.isAccelerated ? adeqFee / 2 : adeqFee;

  // Find matching catalog item by base ADEQ fee in the notes field
  // Notes format: "ADEQ $4,120 + Admin $750"
  const dustItems = getAllItems().filter((item) => item.code.startsWith("DUST-"));
  const feeStr = `$${baseFee.toLocaleString("en-US")}`;

  for (const item of dustItems) {
    if (!item.notes) continue;
    if (!item.notes.includes(feeStr)) continue;

    // Parse admin fee from notes — it's constant regardless of expedited
    const adminMatch = item.notes.match(ADMIN_FEE_RE);
    if (!adminMatch) continue;

    const adminFee = Number(adminMatch[1].replace(/,/g, ""));
    return {
      permitCost: formatUSD(adeqFee),
      adminFee: formatUSD(adminFee),
      scheduleValue: formatUSD(adeqFee + adminFee),
      isAccelerated: permit.isAccelerated,
    };
  }

  return null;
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

  // Cost breakdown from catalog
  const costBreakdown = computeCostBreakdown(permit);
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
    },
  };

  await createAndDeliverNotification(billingEvent, payload.mailboxEmail);

  // 2. Submitted stakeholder notification — enrich with acreage, facility ID, PDF
  console.log(
    `[email-trigger] Enriching submitted notification for ${permit.id}...`
  );

  // Fetch acreage, facility ID (renewals), and PDF in parallel
  const isRenewal = !!permit.previousAppId;
  const [acreage, facilityId, pdfAttachment] = await Promise.all([
    fetchAcreage(permit.id),
    isRenewal && permit.previousAppId
      ? lookupFacilityIdForRenewal(permit.previousAppId)
      : Promise.resolve(null),
    fetchPermitApplicationPdf(permit.id),
  ]);

  if (acreage != null) {
    console.log(
      `[email-trigger] Acreage: ${acreage.toFixed(2)} acres`
    );
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

// ============================================================================
// Enrichment — Acreage, Facility ID, PDF
// ============================================================================

const FEATURE_SERVER_URL =
  "https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer";
const SQ_METERS_TO_ACRES = 0.000_247_105;

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
    if (typeof area !== "number" || area <= 0) return null;
    return area * SQ_METERS_TO_ACRES;
  } catch (err) {
    console.error("[email-trigger] Failed to fetch acreage:", err);
    return null;
  }
}

/**
 * Look up the facility ID for a renewal by checking the previous permit's
 * "dust_permit_issued" notification metadata.
 */
async function lookupFacilityIdForRenewal(
  previousAppId: string
): Promise<string | null> {
  try {
    const row = await db
      .query<{ metadata: string | null }, [string]>(
        `SELECT metadata FROM notifications
         WHERE event_type = 'dust_permit_issued'
           AND ref_id = ?
           AND status IN ('drafted', 'sent')
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(previousAppId);

    if (!row?.metadata) return null;
    const meta = JSON.parse(row.metadata) as Record<string, unknown>;
    return typeof meta.facilityId === "string" ? meta.facilityId : null;
  } catch (err) {
    console.error("[email-trigger] Failed to look up facility ID:", err);
    return null;
  }
}

const PERMIT_WORKER_URL = "http://permit-worker:47822";

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
    if (!result.success || !result.pdfBase64) return null;

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
