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

import { PermitClient } from "@/apps/dust-permits-mcp/client";
import type { PermitData } from "@/apps/dust-permits-mcp/types";
import { getEmailById } from "@email/db/email";
import type { Email } from "@lib/db/types";
import { createComposeClient } from "@lib/graph/compose";
import { createGraphClient } from "@lib/graph/mail";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

import {
  formatNotificationAcreage,
  formatNotificationSiteAddress,
} from "./dust-permit-notification-values";

// ── Constants ───────────────────────────────────────────────────

const FROM_MAILBOX = "chi@desertservices.net";
const BILLING_TO = ["eva@desertservices.net", "jayson@desertservices.net"];
const BILLING_CC = [
  "don@desertservices.net",
  "francine@desertservices.net",
  "kendra@desertservices.net",
];

const DEFAULT_VENDOR_NAME = "Maricopa County ADEQ";
const INTERNAL_DOMAIN = "@desertservices.net";
const PDF_FILE_RE = /\.pdf$/i;
const MARICOPA_SOURCE_SENDERS = [
  "aqdimpact@maricopa.gov",
  "no-reply@maricopa.gov",
  "noreply@permitcenter.maricopa.gov",
] as const;
const MARICOPA_APPLICATION_RE =
  /dust control permit application\s*(D\d{7})/i;
const MARICOPA_FACILITY_ID_RE = /Facility ID#:\s*(F\d{6,})/i;

type DbClient = typeof import("@lib/db/client").db;

interface NotificationDraftAttachment {
  contentBytesBase64: string;
  contentType: string;
  name: string;
}

interface RecipientResolution {
  recipientName: string;
  to: string[];
}

interface SourceEmailContext {
  email: Email;
  mailboxEmail: string;
}

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

function coerceString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getEmailText(email: Email | null | undefined): string {
  return [email?.subject, email?.bodyFull, email?.bodyPreview]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function extractApplicationNumber(text: string): string | null {
  return text.match(MARICOPA_APPLICATION_RE)?.[1] ?? null;
}

function extractFacilityId(text: string): string | null {
  return text.match(MARICOPA_FACILITY_ID_RE)?.[1] ?? null;
}

function isInternalRecipient(email: string): boolean {
  const lower = email.trim().toLowerCase();
  return (
    lower.endsWith(INTERNAL_DOMAIN) ||
    MARICOPA_SOURCE_SENDERS.includes(
      lower as (typeof MARICOPA_SOURCE_SENDERS)[number]
    )
  );
}

function uniqueEmails(emails: string[]): string[] {
  return [...new Set(emails.map((email) => email.trim().toLowerCase()))].filter(
    (email) => email.length > 0
  );
}

function sanitizeFilenamePart(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "permit";
}

function buildPermitPdfName(permitId: string, projectName: string): string {
  return `${sanitizeFilenamePart(permitId)}-${sanitizeFilenamePart(projectName)}.pdf`;
}

async function getMailboxEmailById(
  db: DbClient,
  mailboxId: number
): Promise<string | null> {
  const row = await db
    .query<{ email: string }, [number]>(
      "SELECT email FROM mailboxes WHERE id = $1 LIMIT 1"
    )
    .get(mailboxId);
  return row?.email ?? null;
}

async function getContactNameByEmail(
  db: DbClient,
  email: string
): Promise<string | null> {
  const row = await db
    .query<{ name: string | null }, [string]>(
      `SELECT name FROM contacts
       WHERE lower(email) = lower($1)
       ORDER BY is_active DESC NULLS LAST, updated_at DESC
       LIMIT 1`
    )
    .get(email);
  return coerceString(row?.name);
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
    liPlain(`Project Acreage: ${v.acreage}`) +
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
    liPlain(`Project Acreage: ${v.acreage}`) +
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
    liPlain(`Project Acreage: ${v.acreage}`)
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
    liPlain(`Project Acreage: ${v.acreage}`) +
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

const SOURCE_SUBJECT_HINTS: Partial<Record<NotificationType, string>> = {
  issued: "Dust Permit Issued",
  renewed: "Dust Permit Issued",
  submitted: "Portal Submission Confirmation",
  revised: "Dust Permit",
};

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

async function resolvePermitByProjectQuery(
  db: DbClient,
  projectQuery: string
): Promise<Record<string, unknown> | null> {
  const query = `%${projectQuery.trim()}%`;
  return await db
    .query<Record<string, unknown>, [string]>(
      `SELECT *
       FROM dust_permits_filed_by_desert_services
       WHERE id ILIKE $1
          OR invoice_number ILIKE $1
          OR facility_id ILIKE $1
          OR project_name ILIKE $1
          OR company_name ILIKE $1
          OR address ILIKE $1
       ORDER BY
         CASE status
           WHEN 'Active' THEN 0
           WHEN 'Complete' THEN 1
           WHEN 'Closed' THEN 2
           WHEN 'Rejected' THEN 3
           ELSE 4
         END,
         COALESCE(effective_date, submitted_date, expiration_date) DESC NULLS LAST,
         id DESC
       LIMIT 1`
    )
    .get(query);
}

async function resolveSupersededApplicationNumber(
  db: DbClient,
  permit: Record<string, unknown>,
  permitId: string
): Promise<string> {
  const direct = coerceString(permit.previous_app_id);
  if (direct) {
    return direct;
  }

  const row = await db
    .query<{ id: string }, [string, string, string | null, string | null]>(
      `SELECT id
       FROM dust_permits_filed_by_desert_services
       WHERE id <> $1
         AND company_name = $2
         AND project_name = $3
         AND ($4::text IS NULL OR address = $4)
         AND COALESCE(status, '') <> 'Rejected'
       ORDER BY COALESCE(effective_date, submitted_date, expiration_date) DESC NULLS LAST,
                id DESC
       LIMIT 1`
    )
    .get(
      permitId,
      coerceString(permit.company_name) ?? "",
      coerceString(permit.project_name) ?? "",
      coerceString(permit.address)
    );

  return row?.id ?? "N/A";
}

async function resolveSourceEmailContext(
  db: DbClient,
  params: {
    permitId: string;
    projectName: string;
    sourceEmailId?: number;
    type: NotificationType;
  }
): Promise<SourceEmailContext | null> {
  if (params.sourceEmailId) {
    const email = await getEmailById(params.sourceEmailId);
    if (!email) {
      throw new Error(`Email ${params.sourceEmailId} not found`);
    }
    const mailboxEmail = await getMailboxEmailById(db, email.mailboxId);
    if (!mailboxEmail) {
      throw new Error(`Mailbox ${email.mailboxId} not found for email ${email.id}`);
    }
    return { email, mailboxEmail };
  }

  const subjectHint = SOURCE_SUBJECT_HINTS[params.type] ?? "Dust Permit";
  const permitPattern = `%${params.permitId}%`;
  const projectPattern = `%${params.projectName}%`;

  const row = await db
    .query<{ id: number; mailbox_id: number }, [string, string, string]>(
      `SELECT id, mailbox_id
       FROM emails
       WHERE lower(COALESCE(from_email, '')) = ANY (ARRAY[
         'aqdimpact@maricopa.gov',
         'no-reply@maricopa.gov',
         'noreply@permitcenter.maricopa.gov'
       ])
         AND subject ILIKE $1
         AND (
           subject ILIKE $2
           OR body_preview ILIKE $2
           OR body_full ILIKE $2
           OR body_preview ILIKE $3
           OR body_full ILIKE $3
         )
       ORDER BY received_at DESC
       LIMIT 1`
    )
    .get(`%${subjectHint}%`, permitPattern, projectPattern);

  if (!row) {
    return null;
  }

  const email = await getEmailById(row.id);
  const mailboxEmail = await getMailboxEmailById(db, row.mailbox_id);
  if (!(email && mailboxEmail)) {
    return null;
  }

  return { email, mailboxEmail };
}

async function resolveNotificationRecipients(
  db: DbClient,
  params: {
    explicitRecipients?: string[];
    sourceEmail?: Email | null;
  }
): Promise<RecipientResolution> {
  if (params.explicitRecipients?.length) {
    const to = uniqueEmails(params.explicitRecipients);
    const recipientName =
      to.length === 1 ? (await getContactNameByEmail(db, to[0])) ?? "Team" : "Team";
    return { to, recipientName };
  }

  if (params.sourceEmail) {
    const externalRecipients = uniqueEmails([
      ...params.sourceEmail.toEmails,
      ...params.sourceEmail.ccEmails,
    ]).filter((email) => !isInternalRecipient(email));

    if (externalRecipients.length > 0) {
      const recipientName =
        externalRecipients.length === 1
          ? (await getContactNameByEmail(db, externalRecipients[0])) ?? "Team"
          : "Team";
      return { to: externalRecipients, recipientName };
    }
  }

  return { to: [FROM_MAILBOX], recipientName: "Team" };
}

function isPdfLikeAttachment(att: {
  contentType?: string;
  isInline?: boolean;
  name: string;
}): boolean {
  if (att.isInline) {
    return false;
  }
  const contentType = att.contentType?.toLowerCase() ?? "";
  return PDF_FILE_RE.test(att.name) || contentType.includes("pdf");
}

function isGraphItemNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("graph api 404") ||
    normalized.includes("itemnotfound") ||
    normalized.includes("not found")
  );
}

async function loadSourceEmailAttachments(
  graph: ReturnType<typeof createGraphClient>,
  sourceEmail: SourceEmailContext
): Promise<{
  attachments: Array<{
    contentType?: string;
    id: string;
    isInline?: boolean;
    name: string;
    size?: number;
  }>;
  messageId: string;
}> {
  try {
    return {
      messageId: sourceEmail.email.messageId,
      attachments: await graph.getAttachments(
        sourceEmail.email.messageId,
        sourceEmail.mailboxEmail
      ),
    };
  } catch (error) {
    if (
      !isGraphItemNotFoundError(error) ||
      !sourceEmail.email.internetMessageId
    ) {
      throw error;
    }

    const liveMessageId = await graph.findLatestMessageIdByInternetMessageId(
      sourceEmail.email.internetMessageId,
      sourceEmail.mailboxEmail
    );

    if (!(liveMessageId && liveMessageId !== sourceEmail.email.messageId)) {
      throw error;
    }

    logger.warn("Resolved stale Graph message_id via internet_message_id", {
      emailId: sourceEmail.email.id,
      liveMessageId,
      mailboxEmail: sourceEmail.mailboxEmail,
      staleMessageId: sourceEmail.email.messageId,
    });

    return {
      messageId: liveMessageId,
      attachments: await graph.getAttachments(
        liveMessageId,
        sourceEmail.mailboxEmail
      ),
    };
  }
}

async function resolveNotificationAttachments(
  params: {
    permitId: string;
    projectName: string;
    sourceEmail: SourceEmailContext | null;
  }
): Promise<NotificationDraftAttachment[]> {
  if (!params.sourceEmail) {
    return [];
  }

  const graph = createGraphClient();
  const { messageId, attachments } = await loadSourceEmailAttachments(
    graph,
    params.sourceEmail
  );
  const targetAttachment =
    attachments.find(isPdfLikeAttachment) ??
    attachments.find((att) => !att.isInline);

  if (!targetAttachment) {
    return [];
  }

  const bytes = await graph.downloadAttachment(
    messageId,
    targetAttachment.id,
    params.sourceEmail.mailboxEmail
  );

  return [
    {
      name: buildPermitPdfName(params.permitId, params.projectName),
      contentType: "application/pdf",
      contentBytesBase64: bytes.toString("base64"),
    },
  ];
}

async function resolveScrapedPermitData(
  permitId: string
): Promise<PermitData | null> {
  try {
    const client = new PermitClient();
    const result = await client.scrape(permitId);
    if (result.success && result.data) {
      return result.data;
    }

    logger.warn("Permit scrape did not return structured data for notification", {
      permitId,
    });
    return null;
  } catch (error) {
    logger.warn("Permit scrape fallback failed for notification", {
      permitId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// biome-ignore lint/suspicious/noExplicitAny: raw SQL row
async function buildPermitBaseVars(
  db: DbClient,
  permit: any,
  permitId: string,
  params: {
    recipientName: string;
    scrapedPermit?: PermitData | null;
    sourceEmail?: Email | null;
  }
) {
  const sourceText = getEmailText(params.sourceEmail);
  const permitNumber =
    coerceString(permit.facility_id) ?? extractFacilityId(sourceText) ?? permitId;
  const supersededApplicationNumber = await resolveSupersededApplicationNumber(
    db,
    permit,
    permitId
  );

  return {
    acceleratedProcessing: permit.is_accelerated ? "Yes" : "No",
    accountName: (permit.company_name as string) ?? "Unknown",
    acreage: formatNotificationAcreage(params.scrapedPermit?.disturbedArea),
    address: formatNotificationSiteAddress(
      {
        address: permit.address,
        city: permit.city,
      },
      params.scrapedPermit
    ),
    applicationNumber: extractApplicationNumber(sourceText) ?? permitId,
    expirationDate: (permit.expiration_date as string) ?? "N/A",
    facilityId: permitNumber,
    issueDate: (permit.effective_date as string) ?? "N/A",
    permitNumber,
    permitStatus: (permit.status as string) ?? "Active",
    projectName: (permit.project_name as string) ?? "Unknown",
    recipientName: params.recipientName,
    showPermitInfo: true,
    siteAddress: formatNotificationSiteAddress(
      {
        address: permit.address,
        city: permit.city,
      },
      params.scrapedPermit
    ),
    supersededApplicationNumber,
  };
}

// ── Shared: create draft + optionally send ──────────────────────

async function createNotificationDraft(opts: {
  attachments?: NotificationDraftAttachment[];
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

  const attachedFiles: string[] = [];
  for (const attachment of opts.attachments ?? []) {
    const result = await compose.addFileAttachment({
      userId: FROM_MAILBOX,
      draftId: draftMsg.id,
      name: attachment.name,
      contentType: attachment.contentType,
      contentBytesBase64: attachment.contentBytesBase64,
    });
    attachedFiles.push(result.name ?? attachment.name);
  }

  if (!opts.draft) {
    await compose.sendDraft(draftMsg.id, FROM_MAILBOX);
  }

  return { attachedFiles, draftMsg };
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
      projectQuery: z.string().trim().min(1).optional(),
      sourceEmailId: z.number().int().positive().optional(),
      type: z.enum(NOTIFICATION_TYPES).optional(),
      // Optional overrides
      billingType: z
        .enum(["billing", "billing-renewed", "billing-revised"])
        .optional(),
      cc: z.array(z.email()).optional(),
      draft: z.boolean().default(true),
      extraVars: z.record(z.string(), z.string()).optional(),
      recipients: z.array(z.email()).optional(),
      scheduleValue: z.string().optional(),
    })
    .refine(
      (d) =>
        Boolean(d.emailId) ||
        Boolean(d.type && (d.permitId || d.projectQuery || d.sourceEmailId)),
      {
        message:
          "Provide emailId (billing) OR type + (permitId | projectQuery | sourceEmailId)",
      }
    ),
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

      // Parse payment details — only Point and Pay confirmations have IV###### format
      const invoiceNumber = bodyText.match(PAP_ACCOUNT_RE)?.[1];
      if (!invoiceNumber) {
        logger.info("Not a Point and Pay confirmation — skipping", {
          emailId: input.emailId,
          subject: email.subject,
        });
        return {
          status: "skipped",
          reason: "not_point_and_pay",
          emailId: input.emailId,
        };
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

      const sourceEmail = await resolveSourceEmailContext(db, {
        permitId,
        projectName: coerceString(permit.project_name) ?? "",
        type: "renewed",
      });

      const baseVars = await buildPermitBaseVars(db, permit, permitId, {
        recipientName: "Team",
        sourceEmail: sourceEmail?.email,
      });

      // Prefer the resolved superseded app over raw previous_app_id because
      // permit sync can lag or omit that column on newer renewals.
      const billingType: NotificationType =
        input.billingType ??
        (baseVars.supersededApplicationNumber !== "N/A"
          ? "billing-renewed"
          : "billing");

      const vars: BillingVars = {
        ...baseVars,
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

      const draftResult = await createNotificationDraft({
        subject,
        body,
        to: input.recipients?.length ? input.recipients : BILLING_TO,
        cc: input.cc?.length ? input.cc : BILLING_CC,
        draft: input.draft,
      });

      logger.info("Created billing draft", {
        draftId: draftResult.draftMsg.id,
        subject,
      });

      return {
        attachedFiles: draftResult.attachedFiles,
        draftId: draftResult.draftMsg.id,
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
    if (!input.type) {
      throw new Error("type is required for non-billing flow");
    }
    const type = input.type;

    let permitId = input.permitId ?? null;
    let sourceEmail = input.sourceEmailId
      ? await resolveSourceEmailContext(db, {
          permitId: input.permitId ?? "",
          projectName: input.projectQuery ?? "",
          sourceEmailId: input.sourceEmailId,
          type,
        })
      : null;

    if (!permitId && sourceEmail) {
      permitId = extractApplicationNumber(getEmailText(sourceEmail.email));
    }

    let permit: Record<string, unknown> | null = null;
    if (permitId) {
      permit = await db
        .query<Record<string, unknown>>(
          "SELECT * FROM dust_permits_filed_by_desert_services WHERE id = $1"
        )
        .get(permitId);
    } else if (input.projectQuery) {
      permit = await resolvePermitByProjectQuery(db, input.projectQuery);
      permitId = coerceString(permit?.id);
    }

    if (!(permit && permitId)) {
      throw new Error(
        `Could not resolve dust permit for type ${type}. Provide permitId, projectQuery, or sourceEmailId.`
      );
    }

    if (!sourceEmail) {
      sourceEmail = await resolveSourceEmailContext(db, {
        permitId,
        projectName: coerceString(permit.project_name) ?? permitId,
        type,
      });
    }

    logger.info("Found dust permit", {
      permitId,
      company: permit.company_name,
      project: permit.project_name,
      status: permit.status,
      sourceEmailId: sourceEmail?.email.id ?? null,
    });

    const recipientResolution = await resolveNotificationRecipients(db, {
      explicitRecipients: input.recipients,
      sourceEmail: sourceEmail?.email,
    });
    const attachments = await resolveNotificationAttachments({
      permitId,
      projectName: coerceString(permit.project_name) ?? permitId,
      sourceEmail,
    });
    const scrapedPermit = await resolveScrapedPermitData(permitId);
    const baseVars = {
      ...(await buildPermitBaseVars(db, permit, permitId, {
        recipientName: recipientResolution.recipientName,
        scrapedPermit,
        sourceEmail: sourceEmail?.email,
      })),
      ...(input.extraVars ?? {}),
    };

    const templateFn = TEMPLATE_MAP[type];
    const { subject, body } = templateFn(baseVars);

    logger.info("Rendered notification", { permitId, type, subject });

    const ccAddrs = input.cc?.length ? input.cc : undefined;

    const draftResult = await createNotificationDraft({
      subject,
      body,
      to: recipientResolution.to,
      cc: ccAddrs,
      draft: input.draft,
      attachments,
    });

    logger.info("Created draft", {
      draftId: draftResult.draftMsg.id,
      subject,
      attachedFiles: draftResult.attachedFiles,
      recipientCount: recipientResolution.to.length,
    });

    return {
      attachedFiles: draftResult.attachedFiles,
      draftId: draftResult.draftMsg.id,
      mode: input.draft ? ("draft" as const) : ("sent" as const),
      permitId,
      sourceEmailId: sourceEmail?.email.id ?? null,
      subject,
      to: recipientResolution.to,
      type,
    };
  },
});
