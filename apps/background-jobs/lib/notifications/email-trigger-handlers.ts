/**
 * Email Trigger Handlers — Enrichment & Delivery
 *
 * Extracted from email-triggers.ts. Contains:
 *   - Enrichment functions (acreage, facility ID, PDF fetching)
 *   - Job handler implementations (handlePaymentEmail, handleIssuedEmail)
 *   - Delivery + DB helpers
 */
import type { GraphEmailClient } from "@email/client";
import { db } from "@lib/db/hub";
import { getAttachmentsForEmail } from "@lib/db/repositories";
import { getPermitById, upsertPermit } from "@lib/db/repositories/dust-permit";
import type { Permit } from "@lib/db/types";
import { PermitClient } from "@permits/client";
import { createDraftClientFromEnv, createNotificationDraft } from "./delivery";
import {
  computeCostBreakdown,
  parseMaricopaIssuedEmail,
  parsePointAndPayEmail,
} from "./email-triggers";
import { recordNotification } from "./events";
import { getStakeholders } from "./stakeholders";
import type {
  FeatureServerResponse,
  IssuedJobPayload,
  PaymentJobPayload,
  PdfAttachmentForDraft,
  PendingEvent,
} from "./types";

// ============================================================================
// Enrichment — Acreage, Facility ID, PDF
// ============================================================================

const FEATURE_SERVER_URL =
  "https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer";
const SQ_METERS_TO_ACRES = 0.000_247_105;

const permitClient = new PermitClient();

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

async function fetchPermitApplicationPdf(
  permitId: string
): Promise<PdfAttachmentForDraft | null> {
  try {
    const result = await permitClient.scrapePdf({ permitId });
    if (!result.pdfBase64) {
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

async function fetchInvoicePdf(
  invoiceNumber: string
): Promise<PdfAttachmentForDraft | null> {
  try {
    const result = await permitClient.invoicePdf({ invoiceNumber });
    if (!result.pdfBase64) {
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

// ============================================================================
// Job Handlers
// ============================================================================

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

  let invoicePdfAttachment = await fetchInvoicePdf(payment.invoiceNumber);
  if (!invoicePdfAttachment && payment.countyInvoiceNumber) {
    invoicePdfAttachment = await fetchInvoicePdf(payment.countyInvoiceNumber);
  }
  if (invoicePdfAttachment) {
    invoicePdfAttachment.name = `${payment.invoiceNumber}-Invoice.pdf`;
    console.log(
      `[email-trigger] Invoice PDF attached: ${invoicePdfAttachment.name}`
    );
  }

  const costBreakdown = computeCostBreakdown(
    payment.amount,
    permit.isAccelerated
  );
  if (costBreakdown) {
    console.log(
      `[email-trigger] Cost breakdown: permit=${costBreakdown.permitCost} admin=${costBreakdown.adminFee} schedule=${costBreakdown.scheduleValue} accelerated=${costBreakdown.isAccelerated}`
    );
  }

  const sharedMeta = {
    permitId: permit.id,
    projectName: permit.projectName,
    companyName: permit.companyName,
    address: permit.address,
    city: permit.city,
    invoiceNumber: payment.invoiceNumber,
    sourceEmailId: payload.emailId,
  };

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

  let permit = await getPermitById(issued.permitNumber);

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

  return getPermitById(row.id as string);
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
