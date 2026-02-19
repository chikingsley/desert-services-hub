/**
 * Permit sync orchestration — watermark tracking, cooldown, dedup.
 *
 * Coordinates with the permit-worker Docker container to ensure
 * dust permit data is fresh before processing payment notifications,
 * and runs full syncs (company + marketing) on a schedule.
 *
 * All permit-worker requests share a single in-flight gate because the
 * permit-worker runs one Playwright browser that can only handle one
 * operation at a time.
 */

import { db } from "@lib/db/client";
import {
  getPermitsNeedingScrape,
  markPermitScraped,
} from "@lib/db/repositories/dust-permit";
import { PermitClient, PermitWorkerError } from "@permits/client";
import type { SyncResponse } from "@permits/types";
import {
  PAYMENT_PERMIT_SYNC_COOLDOWN_MS,
  PAYMENT_PERMIT_SYNC_TIMEOUT_MS,
  PERMIT_SYNC_TIMEOUT_MS,
  POINT_AND_PAY_INVOICE_RE,
} from "./config";

// -- Clients --

// Short timeout for payment-triggered company sync (time-sensitive)
const paymentClient = new PermitClient();

// Longer timeout for scheduled full sync (company + marketing, slower)
const scheduledClient = new PermitClient({ timeoutMs: PERMIT_SYNC_TIMEOUT_MS });

// -- Shared gate --
// Only one permit-worker sync can run at a time (single Playwright browser).
// All callers (payment flow, scheduled timer) share this promise.

let syncInFlight: Promise<void> | null = null;
let lastPermitSyncCompletedAt = 0;

// -- Queries --

const permitSyncWatermark = db.query<{ updated_at: number }>(
  "SELECT COALESCE(MAX(updated_at), 0) as updated_at FROM dust_permits_filed_by_desert_services"
);

export const permitIdByInvoice = db.query<{ id: string }, [string]>(
  "SELECT id FROM dust_permits_filed_by_desert_services WHERE invoice_number = $1 LIMIT 1"
);

// -- Functions --

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

// Company-only sync for payment flows — fast, with watermark fallback on timeout.
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

  // Timeout fallback: poll DB watermark to detect if sync completed server-side
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

// Full sync (company + marketing) for the scheduled timer.
async function runFullSyncNow(): Promise<SyncResponse> {
  const result = await scheduledClient.sync();
  lastPermitSyncCompletedAt = Date.now();
  return result;
}

// -- Public API --

/**
 * Ensure a company-level permit sync has run before processing a payment email.
 * If a sync (company or full) is already in flight, awaits it rather than
 * starting a duplicate browser session.
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

  // If a full sync is already running (scheduled timer), just wait for it —
  // company data will be fresh when it completes.
  if (!syncInFlight) {
    syncInFlight = runCompanySyncNow().finally(() => {
      syncInFlight = null;
    });
  }

  await syncInFlight;
}

/**
 * Run a full permit sync (company + marketing) for the scheduled timer.
 * Returns null if another sync is already in flight (skip this tick).
 */
export async function runScheduledPermitSync(): Promise<SyncResponse | null> {
  if (syncInFlight) {
    return null;
  }

  let syncResult: SyncResponse | null = null;

  syncInFlight = (async () => {
    syncResult = await runFullSyncNow();
  })().finally(() => {
    syncInFlight = null;
  });

  await syncInFlight;
  return syncResult;
}

/**
 * Scrape detail pages for company permits that were synced but not yet enriched.
 * (Permits where updated_at == created_at have never been scraped.)
 * Independent of the sync gate — runs against the portal directly.
 */
export async function runPermitDetailScrape(
  batchSize: number
): Promise<{ scraped: number; failed: number; skipped: number }> {
  const permits = await getPermitsNeedingScrape(batchSize);

  let scraped = 0;
  let failed = 0;
  let skipped = 0;

  for (const permit of permits) {
    try {
      const resp = await paymentClient.scrape(permit.id);

      if (resp.success && resp.data) {
        const d = resp.data;
        const loc = d.locations?.[0];
        await markPermitScraped(permit.id, {
          projectName: d.projectName || undefined,
          status: d.status || undefined,
          effectiveDate: d.issueDate || undefined,
          expirationDate: d.expirationDate || undefined,
          projectStartDate: d.project?.startDate || undefined,
          projectEndDate: d.project?.endDate || undefined,
          address: loc?.address || undefined,
          city: loc?.city || undefined,
          parcel: loc?.parcel || undefined,
        });
        scraped++;
      } else {
        // Sync returned success=false — bump updatedAt so we don't retry endlessly
        await markPermitScraped(permit.id);
        skipped++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[permit-sync] Scrape failed for ${permit.id}: ${msg}`);
      failed++;
    }
  }

  return { scraped, failed, skipped };
}
