export type DbClient = typeof import("@lib/db/client").db;
export type PermitClassification = "new" | "revision" | "renewal";

// ── Constants ────────────────────────────────────────────────────────────────

export const FROM_MAILBOX = "chi@desertservices.net";

export const BILLING_TO = ["eva@desertservices.net", "danielr@desertservices.net"];
export const BILLING_CC = ["don@desertservices.net", "francine@desertservices.net", "dawn@desertservices.net"];

export const CARDHOLDER = "Chibuzor Ejimofor";
export const CARD_LAST_FOUR = "8113";
export const PAYMENT_METHOD = "Credit Card";
export const VENDOR = "Maricopa County ADEQ";

/** County ADEQ fee → Desert Services schedule charge (includes our markup) */
export const FEE_TO_SCHEDULE: Record<number, number> = {
  570: 1070,
  1130: 1630,
  4120: 4870,
  6870: 7870,
  10310: 11_560,
  16490: 18_490,
};

// ── Extractors ───────────────────────────────────────────────────────────────

/** Extract IV number from a PointAndPay payment confirmation email */
export function extractInvoiceNumber(body: string): string | null {
  return body.match(/Account Number:\s*(IV\d+)/i)?.[1] ?? null;
}

/** Extract payment date from a PointAndPay payment confirmation email */
export function extractPaymentDate(body: string): string | null {
  return body.match(/Payment Date:\s*([^\r\n]+)/i)?.[1]?.trim() ?? null;
}

/** Look up our schedule charge from the county fee */
export function scheduleCharge(fee: number): string | null {
  const direct = FEE_TO_SCHEDULE[fee];
  if (direct != null) return `$${direct.toLocaleString("en-US")}`;

  // Expedited = 2x base fee, our markup stays the same
  for (const [baseStr, schedule] of Object.entries(FEE_TO_SCHEDULE)) {
    const base = Number.parseInt(baseStr, 10);
    if (fee === base * 2) {
      return `$${(fee + schedule - base).toLocaleString("en-US")}`;
    }
  }
  return null;
}

// ── Permit resolver ──────────────────────────────────────────────────────────

/**
 * Resolve a permit ID from one of three input modes.
 * Returns the permit ID and optionally the payment date (from the PointAndPay email).
 */
export async function resolvePermitId(
  db: DbClient,
  input: { mode: string; emailId?: number; permitId?: string; invoiceNumber?: string }
): Promise<{ permitId: string; paymentDate: string | null }> {
  if (input.mode === "payment-email") {
    if (!input.emailId) throw new Error("payment-email mode requires emailId");
    const email = await db
      .query<{ body_full: string | null; body_preview: string | null }, [number]>(
        "SELECT body_full, body_preview FROM emails WHERE id = $1"
      )
      .get(input.emailId);
    if (!email) throw new Error(`Email ${input.emailId} not found`);

    const body = email.body_full ?? email.body_preview;
    if (!body) throw new Error(`Email ${input.emailId} has no body content`);

    const invoiceNumber = extractInvoiceNumber(body);
    if (!invoiceNumber) throw new Error(`Email ${input.emailId} has no IV number`);
    const paymentDate = extractPaymentDate(body);

    const match = await db
      .query<{ id: string }, [string]>(
        "SELECT id FROM dust_permits_filed_by_desert_services WHERE invoice_number = $1 LIMIT 1"
      )
      .get(invoiceNumber);
    if (!match) throw new Error(`No permit found for invoice ${invoiceNumber}`);

    return { permitId: match.id, paymentDate };
  }

  if (input.mode === "invoice") {
    if (!input.invoiceNumber) throw new Error("invoice mode requires invoiceNumber");
    const match = await db
      .query<{ id: string; submitted_date: string | null }, [string]>(
        "SELECT id, submitted_date FROM dust_permits_filed_by_desert_services WHERE invoice_number = $1 LIMIT 1"
      )
      .get(input.invoiceNumber);
    if (!match) throw new Error(`No permit found for invoice ${input.invoiceNumber}`);
    return { permitId: match.id, paymentDate: match.submitted_date };
  }

  if (!input.permitId) throw new Error("manual mode requires permitId");
  return { permitId: input.permitId, paymentDate: null };
}

// ── PDF naming ───────────────────────────────────────────────────────────────

/** Format permit PDF filename: Dust-Permit_Project-Name_F######.pdf */
export function permitPdfName(projectName: string, facilityId: string | null): string {
  const sanitize = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "permit";
  return `Dust-Permit_${sanitize(projectName)}_${sanitize(facilityId ?? "pending")}.pdf`;
}

// ── Classification ───────────────────────────────────────────────────────────

const ELEVEN_MONTHS_MS = 11 * 30 * 24 * 60 * 60 * 1000;

/**
 * Classify a dust permit as new, revision, or renewal.
 *
 * Traces the `previous_app_id` chain back to the original permit
 * (the one with no predecessor). If the current permit was submitted
 * within 11 months of that original, it's a revision. After 11 months,
 * it's a renewal. No `previous_app_id` means it's new.
 */
export async function classifyPermit(db: DbClient, submittedDate: string | null, previousAppId: string | null): Promise<PermitClassification> {
  if (!previousAppId) return "new";
  if (!submittedDate) return "new";

  let originDate = submittedDate;
  let currentPrevId: string | null = previousAppId;

  while (currentPrevId) {
    const prev = await db
      .query<{ submitted_date: string | null; previous_app_id: string | null }, [string]>(
        "SELECT submitted_date, previous_app_id FROM dust_permits_filed_by_desert_services WHERE id = $1"
      )
      .get(currentPrevId);

    if (!prev) break;
    if (prev.submitted_date) originDate = prev.submitted_date;
    currentPrevId = prev.previous_app_id;
  }

  const currentMs = Date.parse(submittedDate);
  const originMs = Date.parse(originDate);

  if (!Number.isFinite(currentMs) || !Number.isFinite(originMs)) return "renewal";

  return (currentMs - originMs) < ELEVEN_MONTHS_MS ? "revision" : "renewal";
}
