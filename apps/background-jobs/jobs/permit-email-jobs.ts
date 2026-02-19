import {
  handleIssuedEmail,
  handlePaymentEmail,
} from "@email/notifications/email-trigger-handlers";
import type {
  IssuedJobPayload,
  PaymentJobPayload,
} from "@email/notifications/types";
import {
  ensurePermitSyncForPayment,
  extractPointAndPayInvoiceNumber,
  permitIdByInvoice,
} from "./permit-sync";

export async function processDustPermitPaymentJob(
  payload: PaymentJobPayload
): Promise<void> {
  const invoiceNumber = extractPointAndPayInvoiceNumber(payload.bodyText);

  if (invoiceNumber) {
    const preSyncPermit = await permitIdByInvoice.get(invoiceNumber);
    try {
      await ensurePermitSyncForPayment({ force: !preSyncPermit });
    } catch (error) {
      if (!preSyncPermit) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[worker] Permit company sync failed (non-fatal; mapping already present): ${msg}`
      );
    }

    const postSyncPermit = await permitIdByInvoice.get(invoiceNumber);
    if (!postSyncPermit) {
      throw new Error(
        `No permit found for invoice ${invoiceNumber} after permit sync`
      );
    }
  }

  await handlePaymentEmail(payload);

  if (!invoiceNumber) {
    return;
  }

  try {
    await ensurePermitSyncForPayment();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[worker] Post-payment permit sync failed: ${msg}`);
  }
}

export async function processDustPermitIssuedEmailJob(
  payload: IssuedJobPayload
): Promise<void> {
  await handleIssuedEmail(payload);
}
