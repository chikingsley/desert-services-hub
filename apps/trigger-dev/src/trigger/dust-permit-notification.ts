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
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";

import {
  resolveManualBillingPermitBaseVars,
  type ManualBillingPermitInput,
} from "./dust-permit-manual-billing";
import {
  dustPermitClosing,
  dustPermitGreeting,
  wrapDustPermitEmail,
} from "./dust-permit-email-template";
import {
  renderDustPermitBillingTemplate,
  type DustPermitBillingTemplateVars,
} from "./dust-permit-billing-template";
import {
  extractBillingEmailDetails,
  lookupBillingScheduleValue,
  resolveBillingDraftDetails,
  type ManualBillingDetailsInput,
} from "./dust-permit-billing-values";
import {
  DUST_PERMIT_BILLING_CC,
  DUST_PERMIT_BILLING_TO,
} from "./dust-permit-default-recipients";
import {
  extractReplyAllExternalRecipients,
} from "./dust-permit-notification-recipients";
import {
  buildReplyAllDraftRecipientsFromDraft,
  prependReplyDraftBodyHtml,
} from "./dust-permit-reply-values";
import {
  formatNotificationAcreage,
  formatNotificationSiteAddress,
} from "./dust-permit-notification-values";

// ── Constants ───────────────────────────────────────────────────

const FROM_MAILBOX = "chi@desertservices.net";

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

function buildPermitPdfName(projectName: string, facilityId: string): string {
  return `Dust-Permit_${sanitizeFilenamePart(projectName)}_${sanitizeFilenamePart(
    facilityId
  )}.pdf`;
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

// ── HTML template helpers ───────────────────────────────────────
// Outlook-safe HTML: <b> not <strong>, no <p> tags.

function liPlain(text: string): string {
  return `<li><div>${text}</div></li>`;
}

function ul(items: string): string {
  return `<ul style="margin-top:0; margin-bottom:0;">${items}</ul>`;
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
    body: wrapDustPermitEmail(
      dustPermitGreeting() +
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
        dustPermitClosing()
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
    body: wrapDustPermitEmail(
      dustPermitGreeting() +
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
        dustPermitClosing()
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
    body: wrapDustPermitEmail(
      dustPermitGreeting() +
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
        dustPermitClosing()
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
    body: wrapDustPermitEmail(
      dustPermitGreeting() +
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
        dustPermitClosing()
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
    body: wrapDustPermitEmail(
      dustPermitGreeting() +
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
)}${dustPermitClosing()}`
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
type BillingNotificationType = Extract<
  NotificationType,
  "billing" | "billing-renewed" | "billing-revised"
>;
type BillingBaseVars = Pick<
  DustPermitBillingTemplateVars,
  | "acceleratedProcessing"
  | "accountName"
  | "address"
  | "applicationNumber"
  | "permitNumber"
  | "projectName"
  | "recipientName"
  | "supersededApplicationNumber"
> &
  Partial<
    Pick<
      DustPermitBillingTemplateVars,
      | "applicationLabel"
      | "introText"
      | "invoiceLabel"
      | "permitCostLabel"
      | "permitLabel"
      | "scheduleLabel"
    >
  >;

const manualBillingDetailsSchema = z
  .object({
    cardLastFour: z.string().trim().min(1).optional(),
    cardholderName: z.string().trim().min(1).optional(),
    confirmationId: z.string().trim().min(1).optional(),
    invoiceDate: z.string().trim().min(1).optional(),
    invoiceNumber: z.string().trim().min(1).optional(),
    paymentDate: z.string().trim().min(1).optional(),
    paymentMethod: z.string().trim().min(1).optional(),
    paymentMovedFromInvoiceNumber: z.string().trim().min(1).optional(),
    permitCost: z.string().trim().min(1).optional(),
    vendorName: z.string().trim().min(1).optional(),
  })
  .partial();

const manualBillingPermitSchema = z.object({
  accountName: z.string().trim().min(1),
  acceleratedProcessing: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1),
  applicationLabel: z.string().trim().min(1).optional(),
  applicationNumber: z.string().trim().min(1),
  introText: z.string().trim().min(1).optional(),
  invoiceLabel: z.string().trim().min(1).optional(),
  permitNumber: z.string().trim().min(1).optional(),
  permitCostLabel: z.string().trim().min(1).optional(),
  permitLabel: z.string().trim().min(1).optional(),
  projectName: z.string().trim().min(1),
  recipientName: z.string().trim().min(1).optional(),
  scheduleLabel: z.string().trim().min(1).optional(),
  supersededApplicationNumber: z.string().trim().min(1).optional(),
});

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
  billing: (vars) => renderDustPermitBillingTemplate("billing", vars),
  "billing-renewed": (vars) =>
    renderDustPermitBillingTemplate("billing-renewed", vars),
  "billing-revised": (vars) =>
    renderDustPermitBillingTemplate("billing-revised", vars),
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

async function resolveReplyEmailContext(
  db: DbClient,
  replyToEmailId: number
): Promise<SourceEmailContext> {
  const email = await getEmailById(replyToEmailId);
  if (!email) {
    throw new Error(`Email ${replyToEmailId} not found`);
  }

  const mailboxEmail = await getMailboxEmailById(db, email.mailboxId);
  if (!mailboxEmail) {
    throw new Error(`Mailbox ${email.mailboxId} not found for email ${email.id}`);
  }

  if (mailboxEmail.toLowerCase() === FROM_MAILBOX) {
    return { email, mailboxEmail };
  }

  if (!email.internetMessageId) {
    throw new Error(
      `Email ${replyToEmailId} is not in ${FROM_MAILBOX} and has no internet_message_id to resolve a sibling copy`
    );
  }

  const sibling = await db
    .query<{ id: number; mailbox_id: number }, [string, string]>(
      `SELECT e.id, e.mailbox_id
       FROM emails e
       JOIN mailboxes m ON m.id = e.mailbox_id
       WHERE e.internet_message_id = $1
         AND lower(m.email) = lower($2)
       ORDER BY e.received_at DESC
       LIMIT 1`
    )
    .get(email.internetMessageId, FROM_MAILBOX);

  if (!sibling) {
    throw new Error(
      `Email ${replyToEmailId} does not have a copy in ${FROM_MAILBOX}`
    );
  }

  const siblingEmail = await getEmailById(sibling.id);
  if (!siblingEmail) {
    throw new Error(`Reply-all sibling email ${sibling.id} not found`);
  }

  return { email: siblingEmail, mailboxEmail: FROM_MAILBOX };
}

async function resolveNotificationRecipients(
  db: DbClient,
  params: {
    explicitRecipients?: string[];
    replySourceEmail?: Email | null;
    sourceEmail?: Email | null;
  }
): Promise<RecipientResolution> {
  if (params.explicitRecipients?.length) {
    const to = uniqueEmails(params.explicitRecipients);
    const recipientName =
      to.length === 1 ? (await getContactNameByEmail(db, to[0])) ?? "Team" : "Team";
    return { to, recipientName };
  }

  if (params.replySourceEmail) {
    const externalRecipients = extractReplyAllExternalRecipients(
      params.replySourceEmail
    );

    if (externalRecipients.length > 0) {
      const recipientName =
        externalRecipients.length === 1
          ? (await getContactNameByEmail(db, externalRecipients[0])) ?? "Team"
          : "Team";
      return { to: externalRecipients, recipientName };
    }
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
    facilityId?: string | null;
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
  const facilityId =
    coerceString(params.facilityId) ??
    extractFacilityId(getEmailText(params.sourceEmail.email)) ??
    params.permitId;

  return [
    {
      name: buildPermitPdfName(params.projectName, facilityId),
      contentType: "application/pdf",
      contentBytesBase64: bytes.toString("base64"),
    },
  ];
}

function billingNotificationToSourceType(
  billingType: BillingNotificationType
): NotificationType {
  switch (billingType) {
    case "billing-renewed":
      return "renewed";
    case "billing-revised":
      return "revised";
    default:
      return "submitted";
  }
}

async function parseBillingDetailsFromEmailId(
  db: DbClient,
  emailId: number
) {
  const email = await db
    .query<{
      body_full: string | null;
      body_preview: string | null;
      id: number;
      subject: string;
    }>(
      `SELECT id, subject, body_full, body_preview
       FROM emails
       WHERE id = $1`
    )
    .get(emailId);

  if (!email) {
    throw new Error(`Email ${emailId} not found`);
  }

  const bodyText =
    (email.body_full as string) || (email.body_preview as string) || "";

  logger.info("Parsing billing details from email", {
    emailId,
    subject: email.subject,
  });

  const paymentDetails = extractBillingEmailDetails(bodyText);
  if (!paymentDetails) {
    throw new Error(
      `Email ${emailId} does not contain recognizable billing details`
    );
  }

  return paymentDetails;
}

async function resolveAttachmentsFromEmailIds(
  db: DbClient,
  emailIds: number[]
): Promise<NotificationDraftAttachment[]> {
  if (emailIds.length === 0) {
    return [];
  }

  const graph = createGraphClient();
  const resolved: NotificationDraftAttachment[] = [];

  for (const emailId of emailIds) {
    const email = await getEmailById(emailId);
    if (!email) {
      throw new Error(`Attachment email ${emailId} not found`);
    }

    const mailboxEmail = await getMailboxEmailById(db, email.mailboxId);
    if (!mailboxEmail) {
      throw new Error(
        `Mailbox ${email.mailboxId} not found for attachment email ${emailId}`
      );
    }

    const { messageId, attachments } = await loadSourceEmailAttachments(graph, {
      email,
      mailboxEmail,
    });

    for (const attachment of attachments.filter((item) => !item.isInline)) {
      const bytes = await graph.downloadAttachment(
        messageId,
        attachment.id,
        mailboxEmail
      );
      resolved.push({
        name: attachment.name,
        contentType: attachment.contentType ?? "application/octet-stream",
        contentBytesBase64: bytes.toString("base64"),
      });
    }
  }

  return resolved;
}

async function resolveAttachmentsFromFilePaths(
  filePaths: string[]
): Promise<NotificationDraftAttachment[]> {
  const resolved: NotificationDraftAttachment[] = [];

  for (const filePath of filePaths) {
    const bytes = await readFile(filePath);
    resolved.push({
      name: basename(filePath),
      contentType: PDF_FILE_RE.test(filePath)
        ? "application/pdf"
        : "application/octet-stream",
      contentBytesBase64: bytes.toString("base64"),
    });
  }

  return resolved;
}

function dedupeAttachmentsByName(
  attachments: NotificationDraftAttachment[]
): NotificationDraftAttachment[] {
  const seen = new Set<string>();
  const deduped: NotificationDraftAttachment[] = [];

  for (const attachment of attachments) {
    const key = attachment.name.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(attachment);
  }

  return deduped;
}

async function loadReplyTargetMessageState(
  graph: ReturnType<typeof createGraphClient>,
  replyEmail: SourceEmailContext
): Promise<{ messageId: string; wasUnread: boolean }> {
  try {
    const isRead = await graph.getMessageReadState(
      replyEmail.email.messageId,
      replyEmail.mailboxEmail
    );
    return {
      messageId: replyEmail.email.messageId,
      wasUnread: !isRead,
    };
  } catch (error) {
    if (!isGraphItemNotFoundError(error) || !replyEmail.email.internetMessageId) {
      throw error;
    }

    const liveMessageId = await graph.findLatestMessageIdByInternetMessageId(
      replyEmail.email.internetMessageId,
      replyEmail.mailboxEmail
    );

    if (!(liveMessageId && liveMessageId !== replyEmail.email.messageId)) {
      throw error;
    }

    logger.warn("Resolved stale reply Graph message_id via internet_message_id", {
      emailId: replyEmail.email.id,
      liveMessageId,
      mailboxEmail: replyEmail.mailboxEmail,
      staleMessageId: replyEmail.email.messageId,
    });

    const isRead = await graph.getMessageReadState(
      liveMessageId,
      replyEmail.mailboxEmail
    );

    return {
      messageId: liveMessageId,
      wasUnread: !isRead,
    };
  }
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
  replyTo?: SourceEmailContext | null;
  subject: string;
  to: string[];
}) {
  const compose = createComposeClient();
  let draftMsg:
    | {
        "@odata.etag"?: string;
        id: string;
        subject: string;
      }
    | undefined;

  if (opts.replyTo) {
    const graph = createGraphClient();
    const { messageId, wasUnread } = await loadReplyTargetMessageState(
      graph,
      opts.replyTo
    );
    const replyDraft = await compose.createReplyAllDraft({
      userId: FROM_MAILBOX,
      messageId,
    });
    const replyDraftMessage = await graph.getMessage(replyDraft.id, FROM_MAILBOX);
    const replyRecipients = buildReplyAllDraftRecipientsFromDraft(
      {
        toEmails:
          replyDraftMessage.toRecipients
            ?.map((recipient) => recipient.emailAddress?.address ?? null)
            .filter((email): email is string => Boolean(email)) ?? [],
        ccEmails:
          replyDraftMessage.ccRecipients
            ?.map((recipient) => recipient.emailAddress?.address ?? null)
            .filter((email): email is string => Boolean(email)) ?? [],
      },
      FROM_MAILBOX,
      opts.to,
      opts.cc
    );
    const mergedBody = prependReplyDraftBodyHtml(
      opts.body,
      replyDraftMessage.body?.content ?? ""
    );

    draftMsg = await compose.updateDraft({
      userId: FROM_MAILBOX,
      draftId: replyDraft.id,
      ifMatch: replyDraft["@odata.etag"],
      body: mergedBody,
      bodyType: "html",
      to: replyRecipients.to.map((email) => ({ email })),
      cc: replyRecipients.cc.map((email) => ({ email })),
    });

    if (wasUnread) {
      await graph.setMessageReadState(messageId, FROM_MAILBOX, false);
    }
  } else {
    draftMsg = await compose.createDraft({
      userId: FROM_MAILBOX,
      subject: opts.subject,
      body: opts.body,
      bodyType: "html",
      to: opts.to.map((email) => ({ email })),
      cc: opts.cc?.map((email) => ({ email })),
    });
  }

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
      replyToEmailId: z.number().int().positive().optional(),
      sourceEmailId: z.number().int().positive().optional(),
      type: z.enum(NOTIFICATION_TYPES).optional(),
      // Optional overrides
      billingType: z
        .enum(["billing", "billing-renewed", "billing-revised"])
        .optional(),
      billingDetails: manualBillingDetailsSchema.optional(),
      manualPermit: manualBillingPermitSchema.optional(),
      cc: z.array(z.email()).optional(),
      draft: z.boolean().default(true),
      extraVars: z.record(z.string(), z.string()).optional(),
      attachmentEmailIds: z.array(z.number().int().positive()).optional(),
      attachmentFilePaths: z.array(z.string().trim().min(1)).optional(),
      paymentEmailId: z.number().int().positive().optional(),
      recipients: z.array(z.email()).optional(),
      scheduleValue: z.string().optional(),
    })
    .refine(
      (d) =>
        Boolean(d.emailId) ||
        Boolean(
          d.billingType &&
            (d.manualPermit || d.permitId || d.projectQuery) &&
            (d.paymentEmailId || d.billingDetails)
        ) ||
        Boolean(d.type && (d.permitId || d.projectQuery || d.sourceEmailId)),
      {
        message:
          "Provide emailId (billing), OR billingType + (manualPermit | permitId | projectQuery) + (paymentEmailId | billingDetails), OR type + (permitId | projectQuery | sourceEmailId)",
      }
    ),
  maxDuration: 60,
  retry: { maxAttempts: 2 },
  run: async (input) => {
    const { db } = await import("@lib/db/client");

    // ── Billing from email flow ─────────────────────────────
    if (input.emailId) {
      let paymentDetails;
      try {
        paymentDetails = await parseBillingDetailsFromEmailId(db, input.emailId);
      } catch (error) {
        logger.info("Not a Point and Pay confirmation — skipping", {
          emailId: input.emailId,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          status: "skipped",
          reason: "not_point_and_pay",
          emailId: input.emailId,
        };
      }

      const {
        cardLastFour,
        cardholderName,
        confirmationId,
        invoiceDate,
        invoiceNumber,
        paymentDate,
        paymentMovedFromInvoiceNumber,
        paymentMethod,
        permitCost,
        vendorName,
      } = resolveBillingDraftDetails({
        parsedPaymentDetails: paymentDetails,
      });

      logger.info("Extracted payment details", {
        invoiceNumber,
        permitCost,
        confirmationId,
        paymentDate,
        cardLastFour,
        derivedScheduleValue: lookupBillingScheduleValue(permitCost),
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

      const vars: DustPermitBillingTemplateVars = {
        ...baseVars,
        cardLastFour: cardLastFour ?? "N/A",
        cardholderName,
        confirmationId,
        invoiceDate: invoiceDate ?? paymentDate,
        invoiceNumber,
        paymentDate,
        paymentMethod,
        paymentMovedFromInvoiceNumber,
        permitCost,
        scheduleValue:
          input.scheduleValue ??
          lookupBillingScheduleValue(permitCost) ??
          "Unknown",
        vendorName,
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
        to: input.recipients?.length ? input.recipients : DUST_PERMIT_BILLING_TO,
        cc: input.cc?.length ? input.cc : DUST_PERMIT_BILLING_CC,
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
        to: input.recipients?.length ? input.recipients : DUST_PERMIT_BILLING_TO,
        type: billingType,
      };
    }

    // ── Manual billing flow ────────────────────────────────
    if (
      input.billingType &&
      (input.manualPermit || input.permitId || input.projectQuery) &&
      (input.paymentEmailId || input.billingDetails)
    ) {
      const billingType = input.billingType;
      const parsedPaymentDetails = input.paymentEmailId
        ? await parseBillingDetailsFromEmailId(db, input.paymentEmailId)
        : null;
      const resolvedBillingDetails = resolveBillingDraftDetails({
        parsedPaymentDetails,
        overrides: input.billingDetails as ManualBillingDetailsInput | undefined,
      });
      const manualPermit = input.manualPermit as ManualBillingPermitInput | undefined;
      let permit: Record<string, unknown> | null = null;
      let permitId = input.permitId ?? null;
      let sourceEmail: SourceEmailContext | null = null;
      let baseVars: BillingBaseVars;
      let permitAttachments: NotificationDraftAttachment[] = [];

      if (manualPermit) {
        baseVars = resolveManualBillingPermitBaseVars(manualPermit);
        permitId =
          manualPermit.permitNumber?.trim() || manualPermit.applicationNumber.trim();
      } else {
        if (permitId) {
          permit = await db
            .query<Record<string, unknown>>(
              "SELECT * FROM dust_permits_filed_by_desert_services WHERE id = $1"
            )
            .get(permitId);
        } else if (input.projectQuery) {
          permit = await resolvePermitByProjectQuery(db, input.projectQuery);
          permitId = coerceString(permit?.id) ?? null;
        }

        if (!(permit && permitId)) {
          throw new Error(
            `Could not resolve dust permit for billing type ${input.billingType}. Provide manualPermit, permitId, or projectQuery.`
          );
        }

        const billingSourceType = billingNotificationToSourceType(billingType);
        sourceEmail = await resolveSourceEmailContext(db, {
          permitId,
          projectName: coerceString(permit.project_name) ?? permitId,
          sourceEmailId: input.sourceEmailId,
          type: billingSourceType,
        });

        baseVars = await buildPermitBaseVars(db, permit, permitId, {
          recipientName: "Team",
          sourceEmail: sourceEmail?.email,
        });
        permitAttachments = await resolveNotificationAttachments({
          facilityId: coerceString(permit.facility_id),
          permitId,
          projectName: coerceString(permit.project_name) ?? permitId,
          sourceEmail,
        });
      }

      const vars: DustPermitBillingTemplateVars = {
        ...baseVars,
        cardLastFour: resolvedBillingDetails.cardLastFour ?? "N/A",
        cardholderName: resolvedBillingDetails.cardholderName,
        confirmationId: resolvedBillingDetails.confirmationId,
        invoiceDate:
          resolvedBillingDetails.invoiceDate ??
          resolvedBillingDetails.paymentDate,
        invoiceNumber: resolvedBillingDetails.invoiceNumber,
        paymentDate: resolvedBillingDetails.paymentDate,
        paymentMethod: resolvedBillingDetails.paymentMethod,
        paymentMovedFromInvoiceNumber:
          resolvedBillingDetails.paymentMovedFromInvoiceNumber,
        permitCost: resolvedBillingDetails.permitCost,
        scheduleValue:
          input.scheduleValue ??
          lookupBillingScheduleValue(resolvedBillingDetails.permitCost) ??
          "Unknown",
        vendorName: resolvedBillingDetails.vendorName,
      };

      const templateFn = TEMPLATE_MAP[billingType];
      const { subject, body } = templateFn(vars);

      const attachments = dedupeAttachmentsByName([
        ...permitAttachments,
        ...(await resolveAttachmentsFromEmailIds(db, input.attachmentEmailIds ?? [])),
        ...(await resolveAttachmentsFromFilePaths(input.attachmentFilePaths ?? [])),
      ]);

      logger.info("Rendered manual billing notification", {
        attachmentCount: attachments.length,
        billingType,
        invoiceNumber: vars.invoiceNumber,
        paymentEmailId: input.paymentEmailId ?? null,
        permitId,
        subject,
      });

      const draftResult = await createNotificationDraft({
        attachments,
        body,
        cc: input.cc?.length ? input.cc : DUST_PERMIT_BILLING_CC,
        draft: input.draft,
        subject,
        to: input.recipients?.length ? input.recipients : DUST_PERMIT_BILLING_TO,
      });

      logger.info("Created manual billing draft", {
        attachedFiles: draftResult.attachedFiles,
        draftId: draftResult.draftMsg.id,
        subject,
      });

      return {
        attachedFiles: draftResult.attachedFiles,
        draftId: draftResult.draftMsg.id,
        invoiceNumber: vars.invoiceNumber,
        mode: input.draft ? ("draft" as const) : ("sent" as const),
        paymentEmailId: input.paymentEmailId ?? null,
        permitCost: vars.permitCost,
        permitId,
        scheduleValue: vars.scheduleValue,
        subject,
        to: input.recipients?.length ? input.recipients : DUST_PERMIT_BILLING_TO,
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
    const replyToEmail = input.replyToEmailId
      ? await resolveReplyEmailContext(db, input.replyToEmailId)
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

    const replyExtraRecipients =
      replyToEmail && input.recipients?.length
        ? uniqueEmails(input.recipients)
        : [];
    const recipientResolution = await resolveNotificationRecipients(db, {
      explicitRecipients: replyToEmail ? undefined : input.recipients,
      replySourceEmail: replyToEmail?.email,
      sourceEmail: sourceEmail?.email,
    });
    const recipientName =
      replyToEmail?.email.fromEmail
        ? (await getContactNameByEmail(db, replyToEmail.email.fromEmail)) ??
          recipientResolution.recipientName
        : recipientResolution.recipientName;
    const attachments = await resolveNotificationAttachments({
      facilityId: coerceString(permit.facility_id),
      permitId,
      projectName: coerceString(permit.project_name) ?? permitId,
      sourceEmail,
    });
    const scrapedPermit = await resolveScrapedPermitData(permitId);
    const baseVars = {
      ...(await buildPermitBaseVars(db, permit, permitId, {
        recipientName,
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
      to: replyToEmail ? replyExtraRecipients : recipientResolution.to,
      cc: ccAddrs,
      draft: input.draft,
      attachments,
      replyTo: replyToEmail,
    });

    logger.info("Created draft", {
      draftId: draftResult.draftMsg.id,
      subject,
      attachedFiles: draftResult.attachedFiles,
      recipientCount: (
        replyToEmail ? replyExtraRecipients : recipientResolution.to
      ).length,
    });

    return {
      attachedFiles: draftResult.attachedFiles,
      draftId: draftResult.draftMsg.id,
      mode: input.draft ? ("draft" as const) : ("sent" as const),
      permitId,
      sourceEmailId: sourceEmail?.email.id ?? null,
      subject,
      to: replyToEmail ? replyExtraRecipients : recipientResolution.to,
      type,
    };
  },
});
