/**
 * Permit sync helpers for the payment email flow.
 *
 * Ensures dust permit data is fresh before processing payment
 * notifications by triggering a company-level sync via permit-worker.
 */

import { db } from "@lib/db/client";
import {
  PermitClient,
  PermitWorkerError,
} from "@/apps/dust-permits-mcp/client";
import {
  PAYMENT_PERMIT_SYNC_COOLDOWN_MS,
  PAYMENT_PERMIT_SYNC_TIMEOUT_MS,
  POINT_AND_PAY_INVOICE_RE,
} from "./config";

const paymentClient = new PermitClient();

let syncInFlight: Promise<void> | null = null;
let lastPermitSyncCompletedAt = 0;

const permitSyncWatermark = db.query<{ updated_at: number }>(
  "SELECT COALESCE(MAX(updated_at), 0) as updated_at FROM dust_permits_filed_by_desert_services"
);

export const permitIdByInvoice = db.query<{ id: string }, [string]>(
  "SELECT id FROM dust_permits_filed_by_desert_services WHERE invoice_number = $1 LIMIT 1"
);

export function extractPointAndPayInvoiceNumber(
  bodyText: string
): string | null {
  const match = bodyText.match(POINT_AND_PAY_INVOICE_RE);
  return match?.[1] ?? null;
}

async function getPermitSyncWatermark(): Promise<number> {
  const row = await permitSyncWatermark.get();
  return Number(row?.updated_at ?? 0);
}

async function waitForPermitSyncWatermarkAdvance(
  previousWatermark: number,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const currentWatermark = await getPermitSyncWatermark();
    if (currentWatermark > previousWatermark) {
      return true;
    }
    await Bun.sleep(2000);
  }
  return false;
}

async function runCompanySyncNow(): Promise<void> {
  const startedAt = Date.now();
  const previousWatermark = await getPermitSyncWatermark();
  const fetchTimeoutMs = Math.min(60_000, PAYMENT_PERMIT_SYNC_TIMEOUT_MS);

  try {
    await paymentClient.syncCompany({ timeoutMs: fetchTimeoutMs });
    lastPermitSyncCompletedAt = Date.now();
    return;
  } catch (error) {
    const isTimeout = error instanceof PermitWorkerError && error.status === 0;
    if (isTimeout) {
      console.warn(
        "[permit-sync] Company sync request timed out; waiting for watermark..."
      );
    } else {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[permit-sync] Company sync request failed: ${msg}`);
      throw error;
    }
  }

  const remainingMs = Math.max(
    0,
    PAYMENT_PERMIT_SYNC_TIMEOUT_MS - (Date.now() - startedAt)
  );
  const advanced = await waitForPermitSyncWatermarkAdvance(
    previousWatermark,
    remainingMs
  );

  if (!advanced) {
    throw new Error("Permit sync did not complete in time");
  }

  lastPermitSyncCompletedAt = Date.now();
}

/**
 * Ensure a company-level permit sync has run before processing a payment email.
 * If a sync is already in flight, awaits it rather than starting a duplicate.
 */
export async function ensurePermitSyncForPayment(options?: {
  force?: boolean;
}): Promise<void> {
  const force = options?.force ?? false;

  if (
    !force &&
    lastPermitSyncCompletedAt > 0 &&
    Date.now() - lastPermitSyncCompletedAt < PAYMENT_PERMIT_SYNC_COOLDOWN_MS
  ) {
    return;
  }

  if (!syncInFlight) {
    syncInFlight = runCompanySyncNow().finally(() => {
      syncInFlight = null;
    });
  }

  await syncInFlight;
}
