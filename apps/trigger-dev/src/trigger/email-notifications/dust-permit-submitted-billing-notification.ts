import { createComposeClient } from "@lib/graph/compose";
import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { LOGO_ATTACHMENT, escapeHtml, signatureHtml, wrapHtml } from "./helpers/email-html";

// ── Constants ────────────────────────────────────────────────────────────────

const FROM_MAILBOX = "chi@desertservices.net";
const TO = ["eva@desertservices.net", "danielr@desertservices.net"];
const CC = ["don@desertservices.net", "francine@desertservices.net", "dawn@desertservices.net"];

const CARDHOLDER = "Chi Ejimofor";
const CARD_LAST_FOUR = "8113";
const PAYMENT_METHOD = "Credit Card";
const VENDOR = "Maricopa County ADEQ";

/** County ADEQ fee → Desert Services schedule charge (includes our markup) */
const FEE_TO_SCHEDULE: Record<number, number> = {
  570: 1070,
  1130: 1630,
  4120: 4870,
  6870: 7870,
  10310: 11_560,
  16490: 18_490,
};

// ── Schema ───────────────────────────────────────────────────────────────────

const inputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("payment-email"),
    emailId: z.number().int().positive(),
    draft: z.boolean().default(true),
    scheduleValue: z.string().trim().min(1).optional(),
  }),
  z.object({
    mode: z.literal("manual"),
    permitId: z.string().regex(/^D\d{7}$/),
    draft: z.boolean().default(true),
    scheduleValue: z.string().trim().min(1).optional(),
  }),
  z.object({
    mode: z.literal("invoice"),
    invoiceNumber: z.string().regex(/^IV\d+$/),
    draft: z.boolean().default(true),
    scheduleValue: z.string().trim().min(1).optional(),
  }),
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

type DbClient = typeof import("@lib/db/client").db;

interface Permit {
  address: string | null;
  city: string | null;
  company_name: string | null;
  facility_id: string | null;
  id: string;
  invoice_charges: number | null;
  invoice_number: string | null;
  is_accelerated: number;
  previous_app_id: string | null;
  project_name: string | null;
  submitted_date: string | null;
}

/** Extract IV number from a PointAndPay payment confirmation email */
function extractInvoiceNumber(body: string): string | null {
  return body.match(/Account Number:\s*(IV\d+)/i)?.[1] ?? null;
}

/** Extract payment date from a PointAndPay payment confirmation email */
function extractPaymentDate(body: string): string | null {
  return body.match(/Payment Date:\s*([^\r\n]+)/i)?.[1]?.trim() ?? null;
}

/** Look up our schedule charge from the county fee */
function scheduleCharge(fee: number): string | null {
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

/** Render a labeled list item (skips if value is empty) */
function li(label: string, value: string | null | undefined): string {
  return value ? `<li><div><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</div></li>` : "";
}

// ── Email template ───────────────────────────────────────────────────────────

function renderBillingEmail(permit: Permit, schedule: string, paymentDate: string | null, isRenewal: boolean) {
  const prefix = isRenewal ? "Dust Permit Billing (Renewal)" : "Dust Permit Billing";
  const intro = isRenewal
    ? "A dust permit renewal has been submitted to Maricopa County. Please prepare for billing."
    : "A dust permit application has been submitted to Maricopa County. Please prepare for billing.";
  if (permit.invoice_charges == null) throw new Error(`Permit ${permit.id} has no invoice_charges`);
  if (!permit.project_name) throw new Error(`Permit ${permit.id} has no project_name`);

  const cost = `$${permit.invoice_charges.toLocaleString("en-US")}`;
  const sep = "<li><div>----</div></li>";

  const body = wrapHtml(
    `<div>Team,</div><div><br></div>` +
    `<div>${escapeHtml(intro)}</div>` +
    `<div><br></div>` +
    `<ul style="margin-top:0; margin-bottom:0;">` +
      li("Customer", permit.company_name) +
      li("Project", permit.project_name) +
      li("Site Address", permit.address) +
      li("Application #", permit.id) +
      (isRenewal ? li("Superseded Application #", permit.previous_app_id) : "") +
      li("Permit # (Facility ID)", permit.facility_id) +
      li("Accelerated Processing", permit.is_accelerated ? "Yes" : "No") +
      sep +
      li("Vendor Paid", VENDOR) +
      li("Permit Cost", cost) +
      li("Schedule Charge", schedule) +
      li("Invoice #", permit.invoice_number) +
      sep +
      li("Payment Method", PAYMENT_METHOD) +
      li("Payment Date", paymentDate) +
      li("Cardholder", CARDHOLDER) +
      li("Card Last 4", CARD_LAST_FOUR) +
    `</ul>` +
    `<div><br></div><div>Let me know if you have any questions!</div>` +
    signatureHtml()
  );

  return { body, subject: `${prefix} - ${permit.project_name}` };
}

// ── Task ─────────────────────────────────────────────────────────────────────

export const dustPermitSubmittedBillingNotification = schemaTask({
  id: "dust-permit-submitted-billing-notification",
  maxDuration: 60,
  retry: { maxAttempts: 2 },
  schema: inputSchema,
  run: async (input) => {
    const { db } = await import("@lib/db/client");

    let permitId: string;
    let paymentDate: string | null = null;

    if (input.mode === "payment-email") {
      // Extract IV number and payment date from PointAndPay email
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
      paymentDate = extractPaymentDate(body);

      const match = await db
        .query<{ id: string }, [string]>(
          "SELECT id FROM dust_permits_filed_by_desert_services WHERE invoice_number = $1 LIMIT 1"
        )
        .get(invoiceNumber);
      if (!match) throw new Error(`No permit found for invoice ${invoiceNumber}`);

      permitId = match.id;
    } else if (input.mode === "invoice") {
      const match = await db
        .query<{ id: string; submitted_date: string | null }, [string]>(
          "SELECT id, submitted_date FROM dust_permits_filed_by_desert_services WHERE invoice_number = $1 LIMIT 1"
        )
        .get(input.invoiceNumber);
      if (!match) throw new Error(`No permit found for invoice ${input.invoiceNumber}`);
      permitId = match.id;
      paymentDate = match.submitted_date;
    } else {
      permitId = input.permitId;
    }

    // Load permit
    const permit = await db
      .query<Permit, [string]>(
        `SELECT id, project_name, company_name, address, city, facility_id,
                invoice_number, invoice_charges, is_accelerated, previous_app_id, submitted_date
         FROM dust_permits_filed_by_desert_services WHERE id = $1`
      )
      .get(permitId);
    if (!permit) throw new Error(`Permit ${permitId} not found`);

    // Render email
    const isRenewal = Boolean(permit.previous_app_id);
    if (permit.invoice_charges == null) throw new Error(`Permit ${permitId} has no invoice_charges — run a permit sync`);

    const schedule = input.scheduleValue ?? scheduleCharge(permit.invoice_charges);
    if (!schedule) throw new Error(`No schedule charge mapped for fee $${permit.invoice_charges} — provide scheduleValue manually`);
    const template = renderBillingEmail(permit, schedule, paymentDate, isRenewal);

    // Create draft
    const compose = createComposeClient();
    const draft = await compose.createDraft({
      body: template.body,
      bodyType: "html",
      cc: CC.map((email) => ({ email })),
      subject: template.subject,
      to: TO.map((email) => ({ email })),
      userId: FROM_MAILBOX,
    });

    // Attach inline logo for cid:logo in signature
    await compose.addFileAttachment({
      ...LOGO_ATTACHMENT,
      draftId: draft.id,
      userId: FROM_MAILBOX,
    });

    if (!input.draft) {
      await compose.sendDraft(draft.id, FROM_MAILBOX);
    }

    return {
      draftId: draft.id,
      invoiceNumber: permit.invoice_number,
      mode: input.draft ? "draft" as const : "sent" as const,
      permitId,
      subject: template.subject,
      type: isRenewal ? "billing-renewed" as const : "billing" as const,
    };
  },
});
