/**
 * Permit sync orchestration — watermark tracking, cooldown, dedup.
 *
 * Coordinates with the permit-worker Docker container to ensure
 * dust permit data is fresh before processing payment notifications.
 */

import { db } from "@lib/db/hub";
import {
  PAYMENT_PERMIT_SYNC_COOLDOWN_MS,
  PAYMENT_PERMIT_SYNC_TIMEOUT_MS,
  PERMIT_WORKER_URL,
  POINT_AND_PAY_INVOICE_RE,
} from "./config";

// -- State --

let permitSyncInFlight: Promise<void> | null = null;
let lastPermitSyncCompletedAt = 0;

// -- Queries --

const permitSyncWatermark = db.query<{ updated_at: number }>(
  "SELECT COALESCE(MAX(updated_at), 0) as updated_at FROM dust_permits_filed_by_desert_services"
);

export const permitIdByInvoice = db.query<{ id: string }, [string]>(
  "SELECT id FROM dust_permits_filed_by_desert_services WHERE invoice_number = ? LIMIT 1"
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

function parseSyncResponseBody(
  rawBody: string
): { success?: unknown; error?: unknown } | null {
  try {
    const parsed = rawBody ? (JSON.parse(rawBody) as unknown) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { success?: unknown; error?: unknown })
      : null;
  } catch {
    return null;
  }
}

function validateSyncResponse(
  response: Response,
  rawBody: string,
  payload: { success?: unknown; error?: unknown } | null
): void {
  if (!response.ok) {
    const snippet = rawBody.slice(0, 200);
    throw new Error(
      `Permit company sync HTTP ${response.status}: ${snippet || "(empty)"}`
    );
  }

  if (payload && typeof payload.success === "boolean" && !payload.success) {
    const err =
      typeof payload.error === "string" && payload.error.trim().length > 0
        ? payload.error.trim()
        : "unknown error";
    throw new Error(`Permit company sync failed: ${err}`);
  }
}

async function runPermitSyncNow(): Promise<void> {
  const startedAt = Date.now();
  const previousWatermark = await getPermitSyncWatermark();

  const fetchTimeoutMs = Math.min(60_000, PAYMENT_PERMIT_SYNC_TIMEOUT_MS);
  const controller = new AbortController();
  const fetchTimer = setTimeout(() => controller.abort(), fetchTimeoutMs);

  try {
    const response = await fetch(`${PERMIT_WORKER_URL}/api/sync/company`, {
      method: "POST",
      signal: controller.signal,
    });

    const rawBody = await response.text().catch(() => "");
    const payload = parseSyncResponseBody(rawBody);
    validateSyncResponse(response, rawBody, payload);

    lastPermitSyncCompletedAt = Date.now();
    return;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(
        "[worker] Permit company sync request timed out; waiting for watermark..."
      );
    } else {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[worker] Permit company sync request failed: ${msg}`);
      throw error;
    }
  } finally {
    clearTimeout(fetchTimer);
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

  if (!permitSyncInFlight) {
    permitSyncInFlight = runPermitSyncNow().finally(() => {
      permitSyncInFlight = null;
    });
  }

  await permitSyncInFlight;
}
