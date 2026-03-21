import { createComposeClient } from "@lib/graph/compose";
import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import {
  BILLING_CC,
  BILLING_TO,
  CARD_LAST_FOUR,
  CARDHOLDER,
  FROM_MAILBOX,
  PAYMENT_METHOD,
  VENDOR,
  classifyPermit,
  resolvePermitId,
  scheduleCharge,
  type DbClient,
  type PermitClassification,
} from "./helpers/dust-permit-notif-helper";
import { LOGO_ATTACHMENT, escapeHtml, li, signatureHtml, wrapHtml } from "./helpers/email-html";

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

// ── Types ────────────────────────────────────────────────────────────────────

interface BillingPermit {
  address: string | null;
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

// ── Email template ───────────────────────────────────────────────────────────

function renderBillingEmail(permit: BillingPermit, schedule: string, paymentDate: string | null, classification: PermitClassification) {
  const prefix = {
    new: "Dust Permit Billing",
    revision: "Dust Permit Billing (Revision)",
    renewal: "Dust Permit Billing (Renewal)",
  }[classification];
  const intro = {
    new: "A dust permit application has been submitted to Maricopa County. Please prepare for billing.",
    revision: "A dust permit revision has been submitted to Maricopa County. Please prepare for billing.",
    renewal: "A dust permit renewal has been submitted to Maricopa County. Please prepare for billing.",
  }[classification];

  if (permit.invoice_charges == null) throw new Error(`Permit ${permit.id} has no invoice_charges`);
  if (!permit.project_name) throw new Error(`Permit ${permit.id} has no project_name`);

  const cost = `$${permit.invoice_charges.toLocaleString("en-US")}`;
  const showSuperseded = classification !== "new";
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
      (showSuperseded ? li("Superseded Application #", permit.previous_app_id) : "") +
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

    const { permitId, paymentDate } = await resolvePermitId(db, input);

    const permit = await db
      .query<BillingPermit, [string]>(
        `SELECT id, project_name, company_name, address, facility_id,
                invoice_number, invoice_charges, is_accelerated, previous_app_id, submitted_date
         FROM dust_permits_filed_by_desert_services WHERE id = $1`
      )
      .get(permitId);
    if (!permit) throw new Error(`Permit ${permitId} not found`);

    const classification = await classifyPermit(db, permit.submitted_date, permit.previous_app_id);
    if (permit.invoice_charges == null) throw new Error(`Permit ${permitId} has no invoice_charges — run a permit sync`);

    const schedule = input.scheduleValue ?? scheduleCharge(permit.invoice_charges);
    if (!schedule) throw new Error(`No schedule charge mapped for fee $${permit.invoice_charges} — provide scheduleValue manually`);
    const template = renderBillingEmail(permit, schedule, paymentDate, classification);

    const compose = createComposeClient();
    const draft = await compose.createDraft({
      body: template.body,
      bodyType: "html",
      cc: BILLING_CC.map((email) => ({ email })),
      subject: template.subject,
      to: BILLING_TO.map((email) => ({ email })),
      userId: FROM_MAILBOX,
    });

    await compose.addFileAttachment({ ...LOGO_ATTACHMENT, draftId: draft.id, userId: FROM_MAILBOX });

    if (!input.draft) {
      await compose.sendDraft(draft.id, FROM_MAILBOX);
    }

    return {
      draftId: draft.id,
      invoiceNumber: permit.invoice_number,
      mode: input.draft ? "draft" as const : "sent" as const,
      permitId,
      subject: template.subject,
      type: classification,
    };
  },
});
