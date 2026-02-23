/**
 * Dust permit email job handlers.
 *
 * Processes PointAndPay payment confirmation emails and Maricopa County
 * "permit issued" notification emails. Updates permit records in Postgres.
 *
 * NOTE: Auto-draft notification delivery was previously built here but
 * disabled. These handlers now only do parsing + DB updates.
 */

import { db } from "@lib/db/client";
import { getPermitById, upsertPermit } from "@lib/db/repositories/dust-permit";
import type { IssuedJobPayload, PaymentJobPayload } from "./job-schemas";
import {
  ensurePermitSyncForPayment,
  extractPointAndPayInvoiceNumber,
  permitIdByInvoice,
} from "./permit-sync";

// ── Parsing regexes ────────────────────────────────────────────

const MARICOPA_PERMIT_NUMBER_RE = /application\s+(D\d{7})/i;
const MARICOPA_FACILITY_ID_RE = /Facility ID#?:\s*(F\d+)/i;
const MARICOPA_FACILITY_NAME_RE =
  /Facility Name:\s*(.+?)(?=\s*Facility Address|\r?\n|$)/i;
const MARICOPA_FACILITY_ADDRESS_RE =
  /Facility Address:\s*(.+?)(?=\s*Dust control|\r?\n|$)/i;
const POINT_AND_PAY_INVOICE_RE = /Account Number:\s*(IV\d+)/i;
const POINT_AND_PAY_AMOUNT_RE = /Amount:\s*(\$[\d,]+\.\d{2})/i;
const POINT_AND_PAY_CONFIRMATION_RE = /Confirmation ID:\s*(\d+)/i;

// ── Payment handler ────────────────────────────────────────────

export async function processDustPermitPaymentJob(
  payload: PaymentJobPayload,
): Promise<void> {
  const invoiceNumber = extractPointAndPayInvoiceNumber(payload.bodyText);

  if (!invoiceNumber) {
    console.log(
      "[permit-email] PointAndPay email has no invoice number, skipping",
    );
    return;
  }

  const amountMatch = payload.bodyText.match(POINT_AND_PAY_AMOUNT_RE);
  const confirmationMatch = payload.bodyText.match(
    POINT_AND_PAY_CONFIRMATION_RE,
  );

  console.log(
    `[permit-email] PointAndPay payment: invoice=${invoiceNumber} amount=${amountMatch?.[1] ?? "?"} confirmation=${confirmationMatch?.[1] ?? "?"}`,
  );

  // Ensure permits are synced so we can match invoice → permit
  const preSyncPermit = await permitIdByInvoice.get(invoiceNumber);
  try {
    await ensurePermitSyncForPayment({ force: !preSyncPermit });
  } catch (error) {
    if (!preSyncPermit) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(
      `[permit-email] Permit sync failed (non-fatal; mapping already present): ${msg}`,
    );
  }

  const postSyncPermit = await permitIdByInvoice.get(invoiceNumber);
  if (!postSyncPermit) {
    console.warn(
      `[permit-email] No permit found for invoice ${invoiceNumber} after sync`,
    );
    return;
  }

  console.log(
    `[permit-email] Matched invoice ${invoiceNumber} → permit ${postSyncPermit.id}`,
  );

  // Post-payment re-sync to pick up status changes
  try {
    await ensurePermitSyncForPayment();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[permit-email] Post-payment permit sync failed: ${msg}`);
  }
}

// ── Issued handler ─────────────────────────────────────────────

export async function processDustPermitIssuedEmailJob(
  payload: IssuedJobPayload,
): Promise<void> {
  const permitMatch = payload.bodyText.match(MARICOPA_PERMIT_NUMBER_RE);
  const facilityIdMatch = payload.bodyText.match(MARICOPA_FACILITY_ID_RE);
  const facilityNameMatch = payload.bodyText.match(MARICOPA_FACILITY_NAME_RE);
  const facilityAddressMatch = payload.bodyText.match(
    MARICOPA_FACILITY_ADDRESS_RE,
  );

  const permitNumber = permitMatch?.[1] ?? null;
  const facilityId = facilityIdMatch?.[1] ?? null;
  const facilityName = facilityNameMatch?.[1]?.trim() ?? null;
  const facilityAddress = facilityAddressMatch?.[1]?.trim() ?? null;

  if (!permitNumber) {
    console.log(
      "[permit-email] Maricopa issued email has no permit number, skipping",
    );
    return;
  }

  console.log(
    `[permit-email] Maricopa issued: permit=${permitNumber} facility=${facilityName ?? "?"}`,
  );

  // Update permit with facility ID if present
  if (facilityId) {
    await upsertPermit({
      id: permitNumber,
      facilityId,
    });
    console.log(
      `[permit-email] Updated permit ${permitNumber} with facilityId=${facilityId}`,
    );
  }

  const permit = await getPermitById(permitNumber);
  if (permit) {
    console.log(
      `[permit-email] Permit ${permitNumber}: project=${permit.projectName ?? "?"} company=${permit.companyName ?? "?"} address=${facilityAddress ?? permit.address ?? "?"}`,
    );
  }
}
