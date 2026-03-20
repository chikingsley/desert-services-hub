import { getEmailById } from "@email/db/email";
import type { Email } from "@lib/db/types";
import { createComposeClient } from "@lib/graph/compose";
import { createGraphClient } from "@lib/graph/mail";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";

const FROM_MAILBOX = "chi@desertservices.net";
const PDF_FILE_RE = /\.pdf$/i;
const MARICOPA_APPLICATION_RE =
  /dust control permit application\s*(D\d{7})/i;
const MARICOPA_FACILITY_ID_RE = /Facility ID#:\s*(F\d{6,})/i;
const MARICOPA_SOURCE_SENDERS = ["no-reply@maricopa.gov"] as const;
const DEFAULT_TO = ["eva@desertservices.net", "jayson@desertservices.net"];
const DEFAULT_CC = [
  "don@desertservices.net",
  "francine@desertservices.net",
  "dawn@desertservices.net",
];
const ADEQ_FEE_TO_SCHEDULE: Record<number, number> = {
  570: 1070,
  1130: 1630,
  4120: 4870,
  6870: 7870,
  10310: 11_560,
  16490: 18_490,
};

type DbClient = typeof import("@lib/db/client").db;
const BILLING_TYPES = [
  "billing",
  "billing-renewed",
  "billing-revised",
] as const;
type BillingType = (typeof BILLING_TYPES)[number];
type BillingSourceType = "submitted" | "renewed" | "revised";

interface EmailTemplate {
  body: string;
  subject: string;
}

interface BillingDraftAttachment {
  contentBytesBase64: string;
  contentType: string;
  name: string;
}

interface BillingEmailDetails {
  cardLastFour?: string;
  confirmationId?: string;
  invoiceNumber: string;
  paymentDate?: string;
  permitCost: string;
}

interface BillingDraftDetails {
  cardLastFour?: string;
  cardholderName: string;
  confirmationId?: string;
  invoiceDate?: string;
  invoiceNumber: string;
  paymentDate?: string;
  paymentMethod: string;
  paymentMovedFromInvoiceNumber?: string;
  permitCost: string;
  vendorName: string;
}

interface BillingBaseVars {
  acceleratedProcessing: string;
  accountName: string;
  address: string;
  applicationLabel?: string;
  applicationNumber: string;
  introText?: string;
  invoiceLabel?: string;
  permitCostLabel?: string;
  permitLabel?: string;
  permitNumber?: string;
  projectName: string;
  scheduleLabel?: string;
  supersededApplicationNumber?: string;
}

interface BillingTemplateVars extends BillingBaseVars {
  cardholderName: string;
  cardLastFour?: string;
  confirmationId?: string;
  invoiceDate?: string;
  invoiceNumber: string;
  paymentDate?: string;
  paymentMethod: string;
  paymentMovedFromInvoiceNumber?: string;
  permitCost: string;
  scheduleValue: string;
  vendorName: string;
}

interface SourceEmailContext {
  email: Email;
  mailboxEmail: string;
}

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
  permitCostLabel: z.string().trim().min(1).optional(),
  permitLabel: z.string().trim().min(1).optional(),
  permitNumber: z.string().trim().min(1).optional(),
  projectName: z.string().trim().min(1),
  scheduleLabel: z.string().trim().min(1).optional(),
  supersededApplicationNumber: z.string().trim().min(1).optional(),
});

const paymentEmailInputSchema = z.object({
  cc: z.array(z.email()).optional(),
  draft: z.boolean().default(true),
  emailId: z.number().int().positive(),
  mode: z.literal("payment-email"),
  recipients: z.array(z.email()).optional(),
  scheduleValue: z.string().trim().min(1).optional(),
});

const manualPermitSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("manual"),
    manualPermit: manualBillingPermitSchema,
  }),
  z.object({
    kind: z.literal("permit-id"),
    permitId: z.string().regex(/^D\d{7}$/, "Must be D0XXXXXX format"),
  }),
  z.object({
    kind: z.literal("project-query"),
    projectQuery: z.string().trim().min(1),
  }),
]);

const manualPaymentSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    billingDetails: manualBillingDetailsSchema.optional(),
    kind: z.literal("email"),
    paymentEmailId: z.number().int().positive(),
  }),
  z.object({
    billingDetails: manualBillingDetailsSchema.extend({
      invoiceNumber: z.string().trim().min(1),
      permitCost: z.string().trim().min(1),
    }),
    kind: z.literal("manual"),
  }),
]);

const manualInputSchema = z.object({
  attachmentEmailIds: z.array(z.number().int().positive()).default([]),
  attachmentFilePaths: z.array(z.string().trim().min(1)).default([]),
  billingType: z.enum(BILLING_TYPES),
  cc: z.array(z.email()).optional(),
  draft: z.boolean().default(true),
  mode: z.literal("manual"),
  payment: manualPaymentSourceSchema,
  permit: manualPermitSourceSchema,
  recipients: z.array(z.email()).optional(),
  scheduleValue: z.string().trim().min(1).optional(),
  sourceEmailId: z.number().int().positive().optional(),
});

const INPUT_SCHEMA = z.discriminatedUnion("mode", [
  paymentEmailInputSchema,
  manualInputSchema,
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wrapEmail(content: string): string {
  return `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>${content}</body></html>`;
}

function greeting(): string {
  return "<div>Team,</div><div><br></div>";
}

function signature(): string {
  return `<div><br></div>
<div>Best,</div>
<div><br></div>
<div>${escapeHtml("Chi Ejimofor")}</div>
<div>${escapeHtml("Project Coordinator")}</div>
<div>Desert Services LLC</div>
<div>E: ${escapeHtml("chi@desertservices.net")}</div>
<div>O: ${escapeHtml("(480) 513-8986")}</div>`;
}

function closing(): string {
  return `<div><br></div><div>Let me know if you have any questions!</div>${signature()}`;
}

function li(label: string, value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return `<li><div><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</div></li>`;
}

function separator(): string {
  return "<li><div>----</div></li>";
}

function ul(items: string): string {
  return `<ul style="margin-top:0; margin-bottom:0;">${items}</ul>`;
}

function renderFields(
  fields: Array<{ label: string; value: string | null | undefined }>
): string {
  return fields.map((field) => li(field.label, field.value)).join("");
}

function renderBillingEmail(
  type: BillingType,
  vars: BillingTemplateVars
): EmailTemplate {
  const config = {
    billing: {
      intro:
        "A dust permit application has been submitted to Maricopa County. Please prepare for billing.",
      scheduleLabel: "Schedule Charge",
      showSupersededApplication: false,
      subjectPrefix: "Dust Permit Billing",
    },
    "billing-renewed": {
      intro:
        "A dust permit renewal has been submitted to Maricopa County. Please prepare for billing.",
      scheduleLabel: "Schedule Value",
      showSupersededApplication: true,
      subjectPrefix: "Dust Permit Billing (Renewal)",
    },
    "billing-revised": {
      intro:
        "A dust permit revision has been submitted to Maricopa County. Please prepare for billing.",
      scheduleLabel: "Schedule Value",
      showSupersededApplication: true,
      subjectPrefix: "Dust Permit Billing (Revision)",
    },
  }[type];

  const detailsFields = [
    { label: "Customer", value: vars.accountName },
    { label: "Project", value: vars.projectName },
    { label: "Site Address", value: vars.address },
    {
      label: vars.applicationLabel ?? "Application #",
      value: vars.applicationNumber,
    },
    ...(config.showSupersededApplication
      ? [
          {
            label: "Superseded Application #",
            value: vars.supersededApplicationNumber ?? "N/A",
          },
        ]
      : []),
    {
      label: vars.permitLabel ?? "Permit # (Facility ID)",
      value: config.showSupersededApplication
        ? vars.permitNumber ?? "N/A"
        : vars.permitNumber,
    },
    {
      label: "Accelerated Processing",
      value: vars.acceleratedProcessing,
    },
  ];

  const chargesFields = [
    { label: "Vendor Paid", value: vars.vendorName },
    {
      label: vars.permitCostLabel ?? "Permit Cost",
      value: vars.permitCost,
    },
    {
      label: vars.scheduleLabel ?? config.scheduleLabel,
      value: vars.scheduleValue,
    },
    { label: "Confirmation #", value: vars.confirmationId },
    { label: vars.invoiceLabel ?? "Invoice #", value: vars.invoiceNumber },
  ];

  const paymentFields = [
    { label: "Payment Method", value: vars.paymentMethod },
    { label: "Payment Date", value: vars.paymentDate },
    { label: "Card Last 4", value: vars.cardLastFour },
    { label: "Cardholder", value: vars.cardholderName },
    { label: "Invoice Date", value: vars.invoiceDate },
    {
      label: "Payment Moved From Invoice #",
      value: vars.paymentMovedFromInvoiceNumber,
    },
  ];

  const body = wrapEmail(
    greeting() +
      `<div>${escapeHtml(vars.introText ?? config.intro)}</div>` +
      ul(
        renderFields(detailsFields) +
          separator() +
          renderFields(chargesFields) +
          separator() +
          renderFields(paymentFields)
      ) +
      closing()
  );

  return {
    body,
    subject: `${config.subjectPrefix} - ${vars.projectName}`,
  };
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

function sanitizeFilenamePart(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "permit";
}

function buildPermitPdfName(projectName: string, facilityId: string): string {
  return `Dust-Permit_${sanitizeFilenamePart(projectName)}_${sanitizeFilenamePart(
    facilityId
  )}.pdf`;
}

function parseDollarAmount(value: string): number | null {
  const cleaned = value.replace(/[$,]/g, "");
  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function lookupBillingScheduleValue(permitCost: string): string | null {
  const countyFee = parseDollarAmount(permitCost);
  if (countyFee == null) {
    return null;
  }

  const direct = ADEQ_FEE_TO_SCHEDULE[countyFee];
  if (direct != null) {
    return `$${direct.toLocaleString("en-US")}`;
  }

  for (const [baseFeeText, baseSchedule] of Object.entries(ADEQ_FEE_TO_SCHEDULE)) {
    const baseFee = Number.parseInt(baseFeeText, 10);
    if (countyFee !== baseFee * 2) {
      continue;
    }

    const desertServicesFee = baseSchedule - baseFee;
    return `$${(countyFee + desertServicesFee).toLocaleString("en-US")}`;
  }

  return null;
}

function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function extractBillingEmailDetails(bodyText: string): BillingEmailDetails | null {
  const invoiceNumber =
    bodyText.match(/Account Number:\s*(IV\d+)/i)?.[1] ??
    bodyText.match(/record number\s+([A-Z0-9-]+)/i)?.[1];

  if (!invoiceNumber) {
    return null;
  }

  const subtotal = bodyText.match(/(?:^|[\r\n])Sub Total:\s*(\$[\d,]+\.\d{2})/im)?.[1];
  const total = bodyText.match(/(?:^|[\r\n])Total:\s*(\$[\d,]+\.\d{2})/im)?.[1];
  const amount =
    bodyText.match(/Amount:\s*(\$[\d,]+\.\d{2})/i)?.[1] ??
    bodyText.match(
      /one-time payment of\s*(\$[\d,]+\.\d{2})\s+that was scheduled/i
    )?.[1];

  return {
    cardLastFour:
      bodyText.match(/Account Last Four:\s*(\d{4})/i)?.[1] ??
      bodyText.match(/ending\s*X{0,4}(\d{4})/i)?.[1],
    confirmationId:
      bodyText.match(/Confirmation ID:\s*([A-Z0-9]+)/i)?.[1] ??
      bodyText.match(/confirmation number for this payment is\s*([A-Z0-9]+)/i)?.[1],
    invoiceNumber,
    paymentDate:
      bodyText.match(/Payment Date:\s*([^\r\n]+)/i)?.[1]?.trim() ??
      bodyText.match(/scheduled with a date of\s*([0-9/]+)/i)?.[1]?.trim(),
    permitCost: subtotal ?? total ?? amount ?? "Unknown",
  };
}

function resolveBillingDraftDetails(params: {
  overrides?: z.infer<typeof manualBillingDetailsSchema>;
  parsedPaymentDetails?: BillingEmailDetails | null;
}): BillingDraftDetails {
  const parsed = params.parsedPaymentDetails;
  const overrides = params.overrides ?? {};
  const invoiceNumber =
    nonEmpty(overrides.invoiceNumber) ?? nonEmpty(parsed?.invoiceNumber);
  const permitCost =
    nonEmpty(overrides.permitCost) ?? nonEmpty(parsed?.permitCost);

  if (!invoiceNumber) {
    throw new Error("billing draft requires invoiceNumber");
  }

  if (!permitCost) {
    throw new Error("billing draft requires permitCost");
  }

  const cardLastFour =
    nonEmpty(overrides.cardLastFour) ?? nonEmpty(parsed?.cardLastFour);

  return {
    cardLastFour,
    cardholderName:
      nonEmpty(overrides.cardholderName) ??
      (cardLastFour
        ? `Company Card (ending ${cardLastFour})`
        : "Company Card"),
    confirmationId:
      nonEmpty(overrides.confirmationId) ?? nonEmpty(parsed?.confirmationId),
    invoiceDate: nonEmpty(overrides.invoiceDate),
    invoiceNumber,
    paymentDate:
      nonEmpty(overrides.paymentDate) ?? nonEmpty(parsed?.paymentDate),
    paymentMethod: nonEmpty(overrides.paymentMethod) ?? "Credit Card",
    paymentMovedFromInvoiceNumber: nonEmpty(
      overrides.paymentMovedFromInvoiceNumber
    ),
    permitCost,
    vendorName: nonEmpty(overrides.vendorName) ?? "Maricopa County ADEQ",
  };
}

function normalizeManualPermit(
  input: z.infer<typeof manualBillingPermitSchema>
): BillingBaseVars {
  return {
    acceleratedProcessing: input.acceleratedProcessing?.trim() || "No",
    accountName: input.accountName.trim(),
    address: input.address.trim(),
    applicationLabel: input.applicationLabel?.trim() || undefined,
    applicationNumber: input.applicationNumber.trim(),
    introText: input.introText?.trim() || undefined,
    invoiceLabel: input.invoiceLabel?.trim() || undefined,
    permitCostLabel: input.permitCostLabel?.trim() || undefined,
    permitLabel: input.permitLabel?.trim() || undefined,
    permitNumber: input.permitNumber?.trim() || undefined,
    projectName: input.projectName.trim(),
    scheduleLabel: input.scheduleLabel?.trim() || undefined,
    supersededApplicationNumber:
      input.supersededApplicationNumber?.trim() || "N/A",
  };
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
    .query<{ id: string }, [string, string, string, string | null]>(
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
    type: BillingSourceType;
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

  const subjectHint =
    params.type === "renewed"
      ? "Dust Permit Issued"
      : params.type === "revised"
        ? "Dust Permit"
        : "Dust Permit";

  const row = await db
    .query<{ id: number; mailbox_id: number }, [string, string, string]>(
      `SELECT id, mailbox_id
       FROM emails
       WHERE lower(COALESCE(from_email, '')) = ANY (ARRAY[
         'no-reply@maricopa.gov'
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
    .get(`%${subjectHint}%`, `%${params.permitId}%`, `%${params.projectName}%`);

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
  }>;
  messageId: string;
}> {
  try {
    return {
      attachments: await graph.getAttachments(
        sourceEmail.email.messageId,
        sourceEmail.mailboxEmail
      ),
      messageId: sourceEmail.email.messageId,
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

    logger.warn("resolved stale Graph message_id via internet_message_id", {
      emailId: sourceEmail.email.id,
      liveMessageId,
      mailboxEmail: sourceEmail.mailboxEmail,
      staleMessageId: sourceEmail.email.messageId,
    });

    return {
      attachments: await graph.getAttachments(
        liveMessageId,
        sourceEmail.mailboxEmail
      ),
      messageId: liveMessageId,
    };
  }
}

async function resolvePermitAttachments(params: {
  facilityId?: string | null;
  permitId: string;
  projectName: string;
  sourceEmail: SourceEmailContext | null;
}): Promise<BillingDraftAttachment[]> {
  if (!params.sourceEmail) {
    return [];
  }

  const graph = createGraphClient();
  const { attachments, messageId } = await loadSourceEmailAttachments(
    graph,
    params.sourceEmail
  );
  const target =
    attachments.find(isPdfLikeAttachment) ??
    attachments.find((attachment) => !attachment.isInline);

  if (!target) {
    return [];
  }

  const bytes = await graph.downloadAttachment(
    messageId,
    target.id,
    params.sourceEmail.mailboxEmail
  );
  const facilityId =
    coerceString(params.facilityId) ??
    extractFacilityId(getEmailText(params.sourceEmail.email)) ??
    params.permitId;

  return [
    {
      contentBytesBase64: bytes.toString("base64"),
      contentType: "application/pdf",
      name: buildPermitPdfName(params.projectName, facilityId),
    },
  ];
}

async function resolveAttachmentsFromEmailIds(
  db: DbClient,
  emailIds: number[]
): Promise<BillingDraftAttachment[]> {
  if (emailIds.length === 0) {
    return [];
  }

  const graph = createGraphClient();
  const resolved: BillingDraftAttachment[] = [];

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

    const { attachments, messageId } = await loadSourceEmailAttachments(graph, {
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
        contentBytesBase64: bytes.toString("base64"),
        contentType: attachment.contentType ?? "application/octet-stream",
        name: attachment.name,
      });
    }
  }

  return resolved;
}

async function resolveAttachmentsFromFilePaths(
  filePaths: string[]
): Promise<BillingDraftAttachment[]> {
  const resolved: BillingDraftAttachment[] = [];

  for (const filePath of filePaths) {
    const bytes = await readFile(filePath);
    resolved.push({
      contentBytesBase64: bytes.toString("base64"),
      contentType: PDF_FILE_RE.test(filePath)
        ? "application/pdf"
        : "application/octet-stream",
      name: basename(filePath),
    });
  }

  return resolved;
}

function dedupeAttachmentsByName(
  attachments: BillingDraftAttachment[]
): BillingDraftAttachment[] {
  const seen = new Set<string>();
  const deduped: BillingDraftAttachment[] = [];

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

async function parseBillingDetailsFromEmailId(
  db: DbClient,
  emailId: number
): Promise<BillingEmailDetails> {
  const email = await db
    .query<{
      body_full: string | null;
      body_preview: string | null;
      subject: string | null;
    }, [number]>(
      `SELECT subject, body_full, body_preview
       FROM emails
       WHERE id = $1`
    )
    .get(emailId);

  if (!email) {
    throw new Error(`Email ${emailId} not found`);
  }

  const paymentDetails = extractBillingEmailDetails(
    email.body_full ?? email.body_preview ?? ""
  );

  if (!paymentDetails) {
    throw new Error(
      `Email ${emailId} does not contain recognizable billing details`
    );
  }

  return paymentDetails;
}

async function buildPermitBillingBaseVars(
  db: DbClient,
  permit: Record<string, unknown>,
  permitId: string,
  sourceEmail: SourceEmailContext | null
): Promise<BillingBaseVars> {
  const sourceText = getEmailText(sourceEmail?.email);
  const permitNumber =
    coerceString(permit.facility_id) ?? extractFacilityId(sourceText) ?? permitId;

  return {
    acceleratedProcessing: permit.is_accelerated ? "Yes" : "No",
    accountName: coerceString(permit.company_name) ?? "Unknown",
    address: coerceString(permit.address) ?? coerceString(permit.city) ?? "N/A",
    applicationNumber: extractApplicationNumber(sourceText) ?? permitId,
    permitNumber,
    projectName: coerceString(permit.project_name) ?? permitId,
    supersededApplicationNumber: await resolveSupersededApplicationNumber(
      db,
      permit,
      permitId
    ),
  };
}

function billingTypeToSourceType(type: BillingType): BillingSourceType {
  switch (type) {
    case "billing-renewed":
      return "renewed";
    case "billing-revised":
      return "revised";
    default:
      return "submitted";
  }
}

function defaultBillingType(vars: BillingBaseVars): BillingType {
  return vars.supersededApplicationNumber &&
    vars.supersededApplicationNumber !== "N/A"
    ? "billing-renewed"
    : "billing";
}

async function createBillingDraft(params: {
  attachments?: BillingDraftAttachment[];
  body: string;
  cc: string[];
  draft: boolean;
  subject: string;
  to: string[];
}): Promise<{ attachedFiles: string[]; draftId: string }> {
  const compose = createComposeClient();
  const draft = await compose.createDraft({
    body: params.body,
    bodyType: "html",
    cc: params.cc.map((email) => ({ email })),
    subject: params.subject,
    to: params.to.map((email) => ({ email })),
    userId: FROM_MAILBOX,
  });

  const attachedFiles: string[] = [];
  for (const attachment of params.attachments ?? []) {
    const result = await compose.addFileAttachment({
      contentBytesBase64: attachment.contentBytesBase64,
      contentType: attachment.contentType,
      draftId: draft.id,
      name: attachment.name,
      userId: FROM_MAILBOX,
    });
    attachedFiles.push(result.name ?? attachment.name);
  }

  if (!params.draft) {
    await compose.sendDraft(draft.id, FROM_MAILBOX);
  }

  return {
    attachedFiles,
    draftId: draft.id,
  };
}

export const dustPermitSubmittedBillingNotification = schemaTask({
  id: "dust-permit-submitted-billing-notification",
  maxDuration: 60,
  retry: { maxAttempts: 2 },
  schema: INPUT_SCHEMA,
  run: async (input) => {
    const { db } = await import("@lib/db/client");

    if (input.mode === "payment-email") {
      const paymentDetails = await parseBillingDetailsFromEmailId(db, input.emailId);
      const details = resolveBillingDraftDetails({
        parsedPaymentDetails: paymentDetails,
      });

      const permit = await db
        .query<Record<string, unknown>, [string]>(
          `SELECT *
           FROM dust_permits_filed_by_desert_services
           WHERE invoice_number = $1
           LIMIT 1`
        )
        .get(details.invoiceNumber);

      if (!permit) {
        throw new Error(
          `No dust permit found for invoice ${details.invoiceNumber}. Run a permit sync first.`
        );
      }

      const permitId = coerceString(permit.id);
      if (!permitId) {
        throw new Error(`Permit row for invoice ${details.invoiceNumber} is missing id`);
      }

      const sourceEmail = await resolveSourceEmailContext(db, {
        permitId,
        projectName: coerceString(permit.project_name) ?? permitId,
        type: permit.previous_app_id ? "renewed" : "submitted",
      });
      const baseVars = await buildPermitBillingBaseVars(
        db,
        permit,
        permitId,
        sourceEmail
      );
      const billingType = defaultBillingType(baseVars);
      const template = renderBillingEmail(billingType, {
        ...baseVars,
        ...details,
        cardLastFour: details.cardLastFour ?? "N/A",
        invoiceDate: details.invoiceDate ?? details.paymentDate,
        scheduleValue:
          input.scheduleValue ??
          lookupBillingScheduleValue(details.permitCost) ??
          "Unknown",
      });

      const draftResult = await createBillingDraft({
        body: template.body,
        cc: input.cc?.length ? input.cc : DEFAULT_CC,
        draft: input.draft,
        subject: template.subject,
        to: input.recipients?.length ? input.recipients : DEFAULT_TO,
      });

      return {
        attachedFiles: draftResult.attachedFiles,
        draftId: draftResult.draftId,
        emailId: input.emailId,
        invoiceNumber: details.invoiceNumber,
        mode: input.draft ? ("draft" as const) : ("sent" as const),
        permitId,
        subject: template.subject,
        type: billingType,
      };
    }

    const parsedPaymentDetails =
      input.payment.kind === "email"
        ? await parseBillingDetailsFromEmailId(db, input.payment.paymentEmailId)
        : null;
    const details = resolveBillingDraftDetails({
      overrides: input.payment.billingDetails,
      parsedPaymentDetails,
    });

    let permitId: string | null = null;
    let baseVars: BillingBaseVars;
    let sourceEmail: SourceEmailContext | null = null;
    let permitAttachments: BillingDraftAttachment[] = [];

    if (input.permit.kind === "manual") {
      baseVars = normalizeManualPermit(input.permit.manualPermit);
      permitId =
        input.permit.manualPermit.permitNumber?.trim() ||
        input.permit.manualPermit.applicationNumber.trim();
    } else {
      const permit =
        input.permit.kind === "permit-id"
          ? await db
              .query<Record<string, unknown>, [string]>(
                "SELECT * FROM dust_permits_filed_by_desert_services WHERE id = $1"
              )
              .get(input.permit.permitId)
          : await resolvePermitByProjectQuery(db, input.permit.projectQuery);

      permitId = coerceString(permit?.id);
      if (!(permit && permitId)) {
        throw new Error("Could not resolve dust permit for manual billing draft");
      }

      sourceEmail = await resolveSourceEmailContext(db, {
        permitId,
        projectName: coerceString(permit.project_name) ?? permitId,
        sourceEmailId: input.sourceEmailId,
        type: billingTypeToSourceType(input.billingType),
      });
      baseVars = await buildPermitBillingBaseVars(db, permit, permitId, sourceEmail);
      permitAttachments = await resolvePermitAttachments({
        facilityId: coerceString(permit.facility_id),
        permitId,
        projectName: coerceString(permit.project_name) ?? permitId,
        sourceEmail,
      });
    }

    const template = renderBillingEmail(input.billingType, {
      ...baseVars,
      ...details,
      cardLastFour: details.cardLastFour ?? "N/A",
      invoiceDate: details.invoiceDate ?? details.paymentDate,
      scheduleValue:
        input.scheduleValue ??
        lookupBillingScheduleValue(details.permitCost) ??
        "Unknown",
    });
    const attachments = dedupeAttachmentsByName([
      ...permitAttachments,
      ...(await resolveAttachmentsFromEmailIds(db, input.attachmentEmailIds)),
      ...(await resolveAttachmentsFromFilePaths(input.attachmentFilePaths)),
    ]);

    const draftResult = await createBillingDraft({
      attachments,
      body: template.body,
      cc: input.cc?.length ? input.cc : DEFAULT_CC,
      draft: input.draft,
      subject: template.subject,
      to: input.recipients?.length ? input.recipients : DEFAULT_TO,
    });

    return {
      attachedFiles: draftResult.attachedFiles,
      draftId: draftResult.draftId,
      invoiceNumber: details.invoiceNumber,
      mode: input.draft ? ("draft" as const) : ("sent" as const),
      permitId,
      subject: template.subject,
      type: input.billingType,
    };
  },
});
