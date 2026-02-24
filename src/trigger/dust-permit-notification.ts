/**
 * Dust Permit Notification — Trigger.dev on-demand task
 *
 * Single task for ALL Maricopa County dust permit email notifications.
 * Creates drafts in chi@'s Outlook via Graph API.
 *
 * Two trigger modes:
 *
 * 1. Billing from email — pass a Point and Pay confirmation email ID:
 *    { "emailId": 231875 }
 *    Auto-extracts payment details, looks up permit, derives schedule value.
 *
 * 2. Other notifications — pass permit ID + type:
 *    { "permitId": "D0063827", "type": "issued" }
 *
 * API: POST /api/v1/tasks/dust-permit-notification/trigger
 *      Authorization: Bearer <env-api-key>
 */

import { createComposeClient } from "@lib/graph/client";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

// ── Constants ───────────────────────────────────────────────────

const FROM_MAILBOX = "chi@desertservices.net";
const BILLING_TO = ["eva@desertservices.net", "jayson@desertservices.net"];
const BILLING_CC = [
  "don@desertservices.net",
  "francine@desertservices.net",
  "kendra@desertservices.net",
];

const DEFAULT_VENDOR_NAME = "Maricopa County ADEQ";

// ── ADEQ fee → schedule value lookup ────────────────────────────
// From packages/estimates/catalog/definitions/category-dust-control-maricopa.ts
// ADEQ fee tier → full catalog price (ADEQ + admin).
const ADEQ_FEE_TO_SCHEDULE: Record<number, number> = {
  570: 1070, // <1 acre
  1130: 1630, // 1-10 acres
  4120: 4870, // 10-50 acres
  6870: 7870, // 50-100 acres
  10310: 11_560, // 100-500 acres
  16490: 18_490, // 500+ acres
};

function parseDollarAmount(amount: string): number | null {
  const cleaned = amount.replace(/[$,]/g, "");
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function lookupScheduleValue(permitCostStr: string): string | null {
  const adeqCost = parseDollarAmount(permitCostStr);
  if (adeqCost == null) {
    return null;
  }
  const schedule = ADEQ_FEE_TO_SCHEDULE[adeqCost];
  if (schedule == null) {
    return null;
  }
  return `$${schedule.toLocaleString("en-US")}`;
}

// ── Point and Pay email parsing ─────────────────────────────────

const PAP_ACCOUNT_RE = /Account Number:\s*(IV\d+)/i;
const PAP_AMOUNT_RE = /Amount:\s*(\$[\d,]+\.\d{2})/i;
const PAP_CONFIRMATION_RE = /Confirmation ID:\s*(\d+)/i;
const PAP_PAYMENT_DATE_RE = /Payment Date:\s*(\d{2}\/\d{2}\/\d{4})/i;
const PAP_CARD_LAST_FOUR_RE = /Account Last Four:\s*(\d{4})/i;

// ── HTML template helpers ───────────────────────────────────────
// Outlook-safe HTML: <b> not <strong>, no <p> tags, skipSignature: true.

function wrap(content: string): string {
  return `<html>
<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head>
<body>${content}</body>
</html>`;
}

function li(label: string, value: string | null | undefined): string {
  if (value == null || value === "") {
    return "";
  }
  return `<li><div><b>${label}:</b> ${value}</div></li>`;
}

function liPlain(text: string): string {
  return `<li><div>${text}</div></li>`;
}

function separator(): string {
  return "<li><div>----</div></li>";
}

function ul(items: string): string {
  return `<ul style="margin-top:0; margin-bottom:0;">${items}</ul>`;
}

function greeting(name: string): string {
  return `<div>${name},</div><div><br></div>`;
}

function closing(): string {
  return "<div><br></div><div>Let me know if you have any questions!</div>";
}

function dustPermitInfoBlock(): string {
  return `<div><br></div>
<div>Important Information About Your Dust Permit:</div>
<div><br></div>
${ul(
  liPlain(
    "<b>Annual Renewal:</b> We will reach out 2\u20134 weeks before expiration to discuss renewal or closeout."
  ) +
    liPlain(
      "<b>Revisions:</b> If there are site changes (added acreage, new parking lots, new superintendent, etc.), the permit may need revision. Revisions are free unless acreage increases into a higher disturbance threshold."
    ) +
    liPlain(
      "<b>Closeout:</b> When your project is complete and fully stabilized, let us know and we\u2019ll close out the permit with the County at no charge."
    )
)}`;
}

// ── Template types & functions ──────────────────────────────────

interface EmailTemplate {
  body: string;
  subject: string;
}

// -- Issued --

function issuedEmail(v: {
  accountName: string;
  acreage: string;
  applicationNumber: string;
  expirationDate: string;
  issueDate: string;
  permitNumber: string;
  permitStatus: string;
  projectName: string;
  recipientName: string;
  showPermitInfo?: boolean;
  siteAddress: string;
}): EmailTemplate {
  return {
    subject: `Dust Permit Issued \u2014 ${v.projectName} (${v.applicationNumber})`,
    body: wrap(
      greeting(v.recipientName) +
        `<div>The dust control permit for <b>${v.accountName}</b> on project \u201c<b>${v.projectName}</b>\u201d has been issued (see attached).</div>
<div><br></div>
<div>Here are the key details:</div>
${ul(
  liPlain(`Permit Status: ${v.permitStatus}`) +
    liPlain(`Application #: ${v.applicationNumber}`) +
    liPlain(`Permit # (Facility ID): ${v.permitNumber}`) +
    liPlain(`Project Name: ${v.projectName}`) +
    liPlain(`Site Address: ${v.siteAddress}`) +
    liPlain(`Project Acreage: ${v.acreage} acres`) +
    liPlain(`Issue Date: ${v.issueDate}`) +
    liPlain(`Expiration Date: ${v.expirationDate}`)
)}` +
        (v.showPermitInfo !== false ? dustPermitInfoBlock() : "") +
        closing()
    ),
  };
}

// -- Renewed --

function renewedEmail(v: {
  accountName: string;
  acreage: string;
  applicationNumber: string;
  expirationDate: string;
  issueDate: string;
  permitNumber: string;
  projectName: string;
  recipientName: string;
  siteAddress: string;
  supersededApplicationNumber: string;
}): EmailTemplate {
  return {
    subject: `Dust Permit Renewed \u2014 ${v.projectName} (${v.applicationNumber})`,
    body: wrap(
      greeting(v.recipientName) +
        `<div>The dust control permit for <b>${v.accountName}</b> on project \u201c<b>${v.projectName}</b>\u201d has been renewed (see attached).</div>
<div><br></div>
<div>Here are the key details:</div>
${ul(
  liPlain("Permit Status: Renewed") +
    liPlain(`Application #: ${v.applicationNumber}`) +
    liPlain(`Superseded Application #: ${v.supersededApplicationNumber}`) +
    liPlain(`Permit # (Facility ID): ${v.permitNumber}`) +
    liPlain(`Project Name: ${v.projectName}`) +
    liPlain(`Site Address: ${v.siteAddress}`) +
    liPlain(`Project Acreage: ${v.acreage} acres`) +
    liPlain(`Issue Date: ${v.issueDate}`) +
    liPlain(`Expiration Date: ${v.expirationDate}`)
)}` +
        dustPermitInfoBlock() +
        closing()
    ),
  };
}

// -- Submitted --

function submittedEmail(v: {
  accountName: string;
  acreage: string;
  applicationNumber: string;
  facilityId?: string | null;
  projectName: string;
  recipientName: string;
  siteAddress: string;
}): EmailTemplate {
  const facilityDisplay = v.facilityId
    ? `${v.facilityId} (Renewal)`
    : '<span style="color:red">Pending</span>';

  return {
    subject: `Dust Permit Submitted \u2014 ${v.projectName} (${v.applicationNumber})`,
    body: wrap(
      greeting(v.recipientName) +
        `<div>A dust permit application for <b>${v.accountName}</b> on project \u201c<b>${v.projectName}</b>\u201d has been submitted to Maricopa County (see attached).</div>
<div><br></div>
<div>Here are the key details:</div>
${ul(
  liPlain("Permit Status: Submitted") +
    liPlain(`Application #: ${v.applicationNumber}`) +
    liPlain(`Permit # (Facility ID): ${facilityDisplay}`) +
    liPlain(`Project Name: ${v.projectName}`) +
    liPlain(`Site Address: ${v.siteAddress}`) +
    liPlain(`Project Acreage: ${v.acreage} acres`)
)}` +
        `<div><br></div>
<div>Processing typically takes 5-10 business days. If you need expedited processing, please reach out immediately.</div>` +
        closing()
    ),
  };
}

// -- Revised --

function revisedEmail(v: {
  accountName: string;
  acreage: string;
  applicationNumber: string;
  changesHtml?: string;
  expirationDate: string;
  issueDate: string;
  permitNumber: string;
  projectName: string;
  recipientName: string;
  siteAddress: string;
}): EmailTemplate {
  return {
    subject: `Dust Permit Revised \u2014 ${v.projectName} (${v.applicationNumber})`,
    body: wrap(
      greeting(v.recipientName) +
        `<div>The dust control permit for <b>${v.accountName}</b> on project \u201c<b>${v.projectName}</b>\u201d has been revised (see attached).</div>
<div><br></div>
<div>Here are the key details:</div>
${ul(
  liPlain("Permit Status: Revised") +
    liPlain(`Application #: ${v.applicationNumber}`) +
    liPlain(`Permit # (Facility ID): ${v.permitNumber}`) +
    liPlain(`Project Name: ${v.projectName}`) +
    liPlain(`Site Address: ${v.siteAddress}`) +
    liPlain(`Project Acreage: ${v.acreage} acres`) +
    liPlain(`Issue Date: ${v.issueDate}`) +
    liPlain(`Expiration Date: ${v.expirationDate}`)
)}` +
        (v.changesHtml
          ? `<div><br></div><div>Changes Made:</div>${ul(v.changesHtml)}`
          : "") +
        closing()
    ),
  };
}

// -- Reminder --

function reminderEmail(v: {
  accountName: string;
  applicationNumber: string;
  expirationDate: string;
  permitNumber: string;
  projectName: string;
  recipientName: string;
  siteAddress: string;
}): EmailTemplate {
  return {
    subject: `Dust Permit Expiring \u2014 ${v.projectName} (${v.applicationNumber})`,
    body: wrap(
      greeting(v.recipientName) +
        `<div>This is a friendly reminder that the dust control permit for <b>${v.accountName}</b> on project \u201c<b>${v.projectName}</b>\u201d is approaching its expiration date.</div>
<div><br></div>
<div>Here are the key details:</div>
${ul(
  liPlain(`Application #: ${v.applicationNumber}`) +
    liPlain(`Permit # (Facility ID): ${v.permitNumber}`) +
    liPlain(`Project Name: ${v.projectName}`) +
    liPlain(`Site Address: ${v.siteAddress}`) +
    liPlain(`Expiration Date: ${v.expirationDate}`)
)}` +
        `<div><br></div>
<div>Is the project still active? Please let us know if you\u2019d like us to:</div>
${ul(
  liPlain("<b>Renew</b> the permit for another year") +
    liPlain("<b>Close out</b> the permit (if the site is fully stabilized)")
)}`
    ),
  };
}

// -- Billing --

interface BillingVars {
  acceleratedFee?: string | null;
  acceleratedProcessing: string;
  accountName: string;
  address: string;
  adminFee?: string | null;
  applicationNumber: string;
  cardholderName: string;
  cardLastFour?: string;
  changesHtml?: string;
  confirmationId?: string | null;
  invoiceDate?: string | null;
  invoiceNumber: string;
  paymentDate?: string | null;
  paymentMethod: string;
  permitCost: string;
  permitNumber?: string | null;
  projectName: string;
  recipientName: string;
  scheduleValue: string;
  supersededApplicationNumber?: string;
  vendorName: string;
}

function billingNewEmail(v: BillingVars): EmailTemplate {
  return {
    subject: `Dust Permit Billing - ${v.projectName}`,
    body: wrap(
      greeting(v.recipientName) +
        `<div>A dust permit application has been submitted to Maricopa County. Please prepare for billing.</div>
<ul style="margin-top:0; margin-bottom:0;">
${li("Customer", v.accountName)}
${li("Project", v.projectName)}
${li("Site Address", v.address)}
${li("Application #", v.applicationNumber)}
${v.permitNumber ? li("Permit # (Facility ID)", v.permitNumber) : ""}
${li("Accelerated Processing", v.acceleratedProcessing)}
${separator()}
${li("Vendor Paid", v.vendorName)}
${li("Permit Cost (ADEQ)", v.permitCost)}
${v.adminFee ? li("Admin Fee", v.adminFee) : ""}
${li("Schedule Charge", v.scheduleValue)}
${v.confirmationId ? li("Confirmation #", v.confirmationId) : ""}
${li("Invoice #", v.invoiceNumber)}
${separator()}
${li("Payment Method", v.paymentMethod)}
${li("Cardholder", v.cardholderName)}
${v.paymentDate ? li("Payment Date", v.paymentDate) : ""}
${v.invoiceDate ? li("Invoice Date", v.invoiceDate) : ""}
</ul>` +
        closing()
    ),
  };
}

function billingRenewedEmail(v: BillingVars): EmailTemplate {
  return {
    subject: `Dust Permit Billing (Renewal) - ${v.projectName}`,
    body: wrap(
      greeting(v.recipientName) +
        `<div>A dust permit renewal has been submitted to Maricopa County. Please prepare for billing.</div>
<ul style="margin-top:0; margin-bottom:0;">
${li("Customer", v.accountName)}
${li("Project", v.projectName)}
${li("Site Address", v.address)}
${li("Application #", v.applicationNumber)}
${li("Superseded Application #", v.supersededApplicationNumber ?? "N/A")}
${li("Permit # (Facility ID)", v.permitNumber ?? "N/A")}
${li("Accelerated Processing", v.acceleratedProcessing)}
${li("Vendor Paid", v.vendorName)}
${li("Permit Cost", v.permitCost)}
${v.acceleratedFee ? li("Accelerated Fee", v.acceleratedFee) : ""}
${li("Schedule Value", v.scheduleValue)}
${li("Payment Method", v.paymentMethod)}
${v.paymentDate ? li("Payment Date", v.paymentDate) : ""}
${v.confirmationId ? li("Confirmation #", v.confirmationId) : ""}
${li("Card Last 4", v.cardLastFour ?? "N/A")}
${li("Cardholder", v.cardholderName)}
${li("Invoice #", v.invoiceNumber)}
${v.invoiceDate ? li("Invoice Date", v.invoiceDate) : ""}
</ul>` +
        closing()
    ),
  };
}

function billingRevisedEmail(v: BillingVars): EmailTemplate {
  return {
    subject: `Dust Permit Billing (Revision) - ${v.projectName}`,
    body: wrap(
      greeting(v.recipientName) +
        `<div>A dust permit revision has been submitted to Maricopa County. Please prepare for billing.</div>
<ul style="margin-top:0; margin-bottom:0;">
${li("Customer", v.accountName)}
${li("Project", v.projectName)}
${li("Site Address", v.address)}
${li("Application #", v.applicationNumber)}
${li("Superseded Application #", v.supersededApplicationNumber ?? "N/A")}
${li("Permit # (Facility ID)", v.permitNumber ?? "N/A")}
${li("Accelerated Processing", v.acceleratedProcessing)}
${li("Vendor Paid", v.vendorName)}
${li("Permit Cost", v.permitCost)}
${v.acceleratedFee ? li("Accelerated Fee", v.acceleratedFee) : ""}
${li("Schedule Value", v.scheduleValue)}
${li("Payment Method", v.paymentMethod)}
${v.paymentDate ? li("Payment Date", v.paymentDate) : ""}
${v.confirmationId ? li("Confirmation #", v.confirmationId) : ""}
${li("Card Last 4", v.cardLastFour ?? "N/A")}
${li("Cardholder", v.cardholderName)}
${li("Invoice #", v.invoiceNumber)}
${v.invoiceDate ? li("Invoice Date", v.invoiceDate) : ""}
</ul>` +
        (v.changesHtml
          ? `<div><b>Changes Made:</b></div>
<ul style="margin-top:0; margin-bottom:0;">${v.changesHtml}</ul>`
          : "") +
        closing()
    ),
  };
}

// ── Template registry ───────────────────────────────────────────

const NOTIFICATION_TYPES = [
  "issued",
  "renewed",
  "submitted",
  "revised",
  "reminder",
  "billing",
  "billing-renewed",
  "billing-revised",
] as const;

type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// biome-ignore lint/suspicious/noExplicitAny: template vars differ per type
const TEMPLATE_MAP: Record<NotificationType, (vars: any) => EmailTemplate> = {
  issued: issuedEmail,
  renewed: renewedEmail,
  submitted: submittedEmail,
  revised: revisedEmail,
  reminder: reminderEmail,
  billing: billingNewEmail,
  "billing-renewed": billingRenewedEmail,
  "billing-revised": billingRevisedEmail,
};

// ── Shared: look up permit + build base vars ────────────────────

// biome-ignore lint/suspicious/noExplicitAny: raw SQL row
function permitToBaseVars(permit: any, permitId: string) {
  return {
    acceleratedProcessing: permit.is_accelerated ? "Yes" : "No",
    accountName: (permit.company_name as string) ?? "Unknown",
    acreage: "N/A",
    address: (permit.address as string) ?? "N/A",
    applicationNumber: permitId,
    expirationDate: (permit.expiration_date as string) ?? "N/A",
    facilityId: permit.facility_id as string | null,
    issueDate: (permit.effective_date as string) ?? "N/A",
    permitNumber: (permit.facility_id as string) ?? permitId,
    permitStatus: (permit.status as string) ?? "Active",
    projectName: (permit.project_name as string) ?? "Unknown",
    recipientName: "Team",
    showPermitInfo: true,
    siteAddress: (permit.address as string) ?? "N/A",
    supersededApplicationNumber: (permit.previous_app_id as string) ?? "N/A",
  };
}

// ── Shared: create draft + optionally send ──────────────────────

async function createNotificationDraft(opts: {
  body: string;
  cc?: string[];
  draft: boolean;
  subject: string;
  to: string[];
}) {
  const compose = createComposeClient();

  const draftMsg = await compose.createDraft({
    userId: FROM_MAILBOX,
    subject: opts.subject,
    body: opts.body,
    bodyType: "html",
    to: opts.to.map((email) => ({ email })),
    cc: opts.cc?.map((email) => ({ email })),
    skipSignature: true,
  });

  if (!opts.draft) {
    await compose.sendDraft(draftMsg.id, FROM_MAILBOX);
  }

  return draftMsg;
}

// ── The task ────────────────────────────────────────────────────

export const dustPermitNotification = schemaTask({
  id: "dust-permit-notification",
  schema: z
    .object({
      // Billing from email — just the email ID
      emailId: z.number().int().positive().optional(),
      // Non-billing — permit ID + type
      permitId: z
        .string()
        .regex(/^D\d{7}$/, "Must be D0XXXXXX format")
        .optional(),
      type: z.enum(NOTIFICATION_TYPES).optional(),
      // Optional overrides
      billingType: z
        .enum(["billing", "billing-renewed", "billing-revised"])
        .optional(),
      cc: z.array(z.string().email()).optional(),
      draft: z.boolean().default(true),
      extraVars: z.record(z.string(), z.string()).optional(),
      recipients: z.array(z.string().email()).optional(),
      scheduleValue: z.string().optional(),
    })
    .refine((d) => d.emailId || (d.permitId && d.type), {
      message:
        "Provide emailId (billing) OR permitId + type (other notifications)",
    }),
  maxDuration: 60,
  retry: { maxAttempts: 2 },
  run: async (input) => {
    const { db } = await import("@lib/db/client");

    // ── Billing from email flow ─────────────────────────────
    if (input.emailId) {
      const email = await db
        .query<{
          id: number;
          subject: string;
          body_full: string | null;
          body_preview: string | null;
        }>(
          `SELECT id, subject, body_full, body_preview
         FROM emails WHERE id = $1`
        )
        .get(input.emailId);

      if (!email) {
        throw new Error(`Email ${input.emailId} not found`);
      }

      const bodyText =
        (email.body_full as string) || (email.body_preview as string) || "";

      logger.info("Parsing Point and Pay email", {
        emailId: input.emailId,
        subject: email.subject,
      });

      // Parse payment details
      const invoiceNumber = bodyText.match(PAP_ACCOUNT_RE)?.[1];
      if (!invoiceNumber) {
        throw new Error(
          `No invoice number (IV######) in email ${input.emailId}. Is this a Point and Pay confirmation?`
        );
      }

      const permitCost = bodyText.match(PAP_AMOUNT_RE)?.[1] ?? "Unknown";
      const confirmationId = bodyText.match(PAP_CONFIRMATION_RE)?.[1];
      const paymentDate = bodyText.match(PAP_PAYMENT_DATE_RE)?.[1];
      const cardLastFour = bodyText.match(PAP_CARD_LAST_FOUR_RE)?.[1];

      logger.info("Extracted payment details", {
        invoiceNumber,
        permitCost,
        confirmationId,
        paymentDate,
        cardLastFour,
        derivedScheduleValue: lookupScheduleValue(permitCost),
      });

      // Look up permit by invoice
      const permit = await db
        .query<Record<string, unknown>>(
          `SELECT * FROM dust_permits_filed_by_desert_services
         WHERE invoice_number = $1 LIMIT 1`
        )
        .get(invoiceNumber);

      if (!permit) {
        throw new Error(
          `No dust permit found for invoice ${invoiceNumber}. Run a permit sync first.`
        );
      }

      const permitId = permit.id as string;

      logger.info("Matched invoice to permit", {
        invoiceNumber,
        permitId,
        company: permit.company_name,
        project: permit.project_name,
      });

      // Auto-detect billing type
      const billingType: NotificationType =
        input.billingType ??
        (permit.previous_app_id ? "billing-renewed" : "billing");

      const vars: BillingVars = {
        ...permitToBaseVars(permit, permitId),
        cardLastFour: cardLastFour ?? "N/A",
        cardholderName: cardLastFour
          ? `Company Card (ending ${cardLastFour})`
          : "Company Card",
        confirmationId,
        invoiceDate: paymentDate,
        invoiceNumber,
        paymentDate,
        paymentMethod: "Credit Card",
        permitCost,
        scheduleValue:
          input.scheduleValue ?? lookupScheduleValue(permitCost) ?? "Unknown",
        vendorName: DEFAULT_VENDOR_NAME,
      };

      const templateFn = TEMPLATE_MAP[billingType];
      const { subject, body } = templateFn(vars);

      logger.info("Rendered billing notification", {
        permitId,
        type: billingType,
        subject,
      });

      const draftMsg = await createNotificationDraft({
        subject,
        body,
        to: input.recipients?.length ? input.recipients : BILLING_TO,
        cc: input.cc?.length ? input.cc : BILLING_CC,
        draft: input.draft,
      });

      logger.info("Created billing draft", {
        draftId: draftMsg.id,
        subject,
      });

      return {
        draftId: draftMsg.id,
        emailId: input.emailId,
        invoiceNumber,
        mode: input.draft ? ("draft" as const) : ("sent" as const),
        permitCost,
        permitId,
        scheduleValue: vars.scheduleValue,
        subject,
        to: input.recipients?.length ? input.recipients : BILLING_TO,
        type: billingType,
      };
    }

    // ── Generic notification flow ───────────────────────────
    const permitId = input.permitId!;
    const type = input.type!;

    const permit = await db
      .query<Record<string, unknown>>(
        "SELECT * FROM dust_permits_filed_by_desert_services WHERE id = $1"
      )
      .get(permitId);

    if (!permit) {
      throw new Error(`Dust permit ${permitId} not found`);
    }

    logger.info("Found dust permit", {
      permitId,
      company: permit.company_name,
      project: permit.project_name,
      status: permit.status,
    });

    const baseVars = {
      ...permitToBaseVars(permit, permitId),
      ...(input.extraVars ?? {}),
    };

    const templateFn = TEMPLATE_MAP[type];
    const { subject, body } = templateFn(baseVars);

    logger.info("Rendered notification", { permitId, type, subject });

    const isBillingType = type.startsWith("billing");
    const toAddrs = input.recipients?.length
      ? input.recipients
      : isBillingType
        ? BILLING_TO
        : [FROM_MAILBOX];
    const ccAddrs = input.cc?.length
      ? input.cc
      : isBillingType
        ? BILLING_CC
        : undefined;

    const draftMsg = await createNotificationDraft({
      subject,
      body,
      to: toAddrs,
      cc: ccAddrs,
      draft: input.draft,
    });

    logger.info("Created draft", { draftId: draftMsg.id, subject });

    return {
      draftId: draftMsg.id,
      mode: input.draft ? ("draft" as const) : ("sent" as const),
      permitId,
      subject,
      to: toAddrs,
      type,
    };
  },
});
