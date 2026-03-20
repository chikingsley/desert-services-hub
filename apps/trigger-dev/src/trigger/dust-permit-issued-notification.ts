import { PermitClient } from "@/apps/dust-permits-mcp/client";
import type { PermitData } from "@/apps/dust-permits-mcp/types";
import { getEmailById } from "@email/db/email";
import { parseBoolInt, parseJsonArray } from "@lib/db/parsers";
import type { Email } from "@lib/db/types";
import { createComposeClient } from "@lib/graph/compose";
import { createGraphClient } from "@lib/graph/mail";
import {
  normalizeProjectAlias,
  normalizeProjectNameKey,
  tokenizeProjectText,
  tokenOverlap,
  uniqueStrings,
} from "@projects/db/project-matching-utils";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const FROM_MAILBOX = "chi@desertservices.net";
const INTERNAL_DOMAIN = "@desertservices.net";
const PDF_FILE_RE = /\.pdf$/i;
const MAX_CANDIDATES = 100;
const REPLY_SIGNAL_TERMS = [
  "dust permit",
  "dust control permit",
  "noi",
  "loi",
  "maricopa",
];
const BILLING_SIGNAL_TERMS = ["billing", "invoice", "point and pay", "pointandpay"];
const COUNTY_PERMIT_DOMAIN = "@maricopa.gov";
const HAS_DIGIT_RE = /\d/;
const MARICOPA_SOURCE_SENDERS = ["no-reply@maricopa.gov"] as const;
const MARICOPA_SOURCE_SENDERS_SET: ReadonlySet<string> = new Set(
  MARICOPA_SOURCE_SENDERS
);
const MARICOPA_APPLICATION_RE =
  /dust control permit application\s*(D\d{7})/i;
const MARICOPA_FACILITY_ID_RE = /Facility ID#:\s*(F\d{6,})/i;

type DbClient = typeof import("@lib/db/client").db;
const NOTIFICATION_TYPES = [
  "issued",
  "renewed",
  "revised",
  "reminder",
] as const;
type NotificationType = (typeof NOTIFICATION_TYPES)[number];

interface EmailTemplate {
  body: string;
  subject: string;
}

interface NotificationDraftAttachment {
  contentBytesBase64: string;
  contentType: string;
  name: string;
}

interface SourceEmailContext {
  email: Email;
  mailboxEmail: string;
}

interface PermitReplyRouteCandidate {
  bodyText: string | null;
  ccEmails: string[];
  chiEmailId: number | null;
  emailId: number;
  fromEmail: string | null;
  hasChiCopy: boolean;
  isForwarded: boolean;
  isInternal: boolean;
  mailboxEmail: string;
  receivedAt: string;
  subject: string | null;
  toEmails: string[];
}

interface RankedPermitReplyRouteCandidate
  extends PermitReplyRouteCandidate {
  reasons: string[];
  score: number;
}

interface PermitReplyRouteSelection {
  matchedRecipients: string[];
  mode: "compose-new" | "reply-all";
  rankedCandidates: RankedPermitReplyRouteCandidate[];
  reason: string;
  replyToEmailId: number | null;
  selectedCandidateEmailId: number | null;
}

const selectorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("permit-id"),
    permitId: z.string().regex(/^D\d{7}$/, "Must be D0XXXXXX format"),
  }),
  z.object({
    kind: z.literal("project-query"),
    projectQuery: z.string().trim().min(1),
  }),
  z.object({
    kind: z.literal("source-email"),
    permitId: z
      .string()
      .regex(/^D\d{7}$/, "Must be D0XXXXXX format")
      .optional(),
    projectQuery: z.string().trim().min(1).optional(),
    sourceEmailId: z.number().int().positive(),
  }),
]);

const INPUT_SCHEMA = z.object({
  cc: z.array(z.email()).optional(),
  draft: z.boolean().default(true),
  dryRun: z.boolean().default(false),
  extraVars: z.record(z.string(), z.string()).optional(),
  recipients: z.array(z.email()).optional(),
  replyToEmailId: z.number().int().positive().optional(),
  selector: selectorSchema,
  type: z.enum(NOTIFICATION_TYPES),
});

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
    "<b>Annual Renewal:</b> We will reach out 2-4 weeks before expiration to discuss renewal or closeout."
  ) +
    liPlain(
      "<b>Revisions:</b> If there are site changes (added acreage, new parking lots, new superintendent, etc.), the permit may need revision. Revisions are free unless acreage increases into a higher disturbance threshold."
    ) +
    liPlain(
      "<b>Closeout:</b> When your project is complete and fully stabilized, let us know and we'll close out the permit with the County at no charge."
    )
)}`;
}

function issuedEmail(v: {
  accountName: string;
  acreage: string;
  applicationNumber: string;
  expirationDate: string;
  issueDate: string;
  permitNumber: string;
  permitStatus: string;
  projectName: string;
  siteAddress: string;
}): EmailTemplate {
  return {
    body: wrapEmail(
      greeting() +
        `<div>The dust control permit for <b>${escapeHtml(v.accountName)}</b> on project "<b>${escapeHtml(v.projectName)}</b>" has been issued (see attached).</div>
<div><br></div>
<div>Here are the key details:</div>
${ul(
  liPlain(`Permit Status: ${escapeHtml(v.permitStatus)}`) +
    liPlain(`Application #: ${escapeHtml(v.applicationNumber)}`) +
    liPlain(`Permit # (Facility ID): ${escapeHtml(v.permitNumber)}`) +
    liPlain(`Project Name: ${escapeHtml(v.projectName)}`) +
    liPlain(`Site Address: ${escapeHtml(v.siteAddress)}`) +
    liPlain(`Project Acreage: ${escapeHtml(v.acreage)}`) +
    liPlain(`Issue Date: ${escapeHtml(v.issueDate)}`) +
    liPlain(`Expiration Date: ${escapeHtml(v.expirationDate)}`)
)}` +
        dustPermitInfoBlock() +
        closing()
    ),
    subject: `Dust Permit Issued — ${v.projectName} (${v.applicationNumber})`,
  };
}

function renewedEmail(v: {
  accountName: string;
  acreage: string;
  applicationNumber: string;
  expirationDate: string;
  issueDate: string;
  permitNumber: string;
  projectName: string;
  siteAddress: string;
  supersededApplicationNumber: string;
}): EmailTemplate {
  return {
    body: wrapEmail(
      greeting() +
        `<div>The dust control permit for <b>${escapeHtml(v.accountName)}</b> on project "<b>${escapeHtml(v.projectName)}</b>" has been renewed (see attached).</div>
<div><br></div>
<div>Here are the key details:</div>
${ul(
  liPlain("Permit Status: Renewed") +
    liPlain(`Application #: ${escapeHtml(v.applicationNumber)}`) +
    liPlain(
      `Superseded Application #: ${escapeHtml(v.supersededApplicationNumber)}`
    ) +
    liPlain(`Permit # (Facility ID): ${escapeHtml(v.permitNumber)}`) +
    liPlain(`Project Name: ${escapeHtml(v.projectName)}`) +
    liPlain(`Site Address: ${escapeHtml(v.siteAddress)}`) +
    liPlain(`Project Acreage: ${escapeHtml(v.acreage)}`) +
    liPlain(`Issue Date: ${escapeHtml(v.issueDate)}`) +
    liPlain(`Expiration Date: ${escapeHtml(v.expirationDate)}`)
)}` +
        dustPermitInfoBlock() +
        closing()
    ),
    subject: `Dust Permit Renewed — ${v.projectName} (${v.applicationNumber})`,
  };
}

function revisedEmail(v: {
  accountName: string;
  acreage: string;
  applicationNumber: string;
  expirationDate: string;
  issueDate: string;
  permitNumber: string;
  projectName: string;
  siteAddress: string;
}): EmailTemplate {
  return {
    body: wrapEmail(
      greeting() +
        `<div>The dust control permit for <b>${escapeHtml(v.accountName)}</b> on project "<b>${escapeHtml(v.projectName)}</b>" has been revised (see attached).</div>
<div><br></div>
<div>Here are the key details:</div>
${ul(
  liPlain("Permit Status: Revised") +
    liPlain(`Application #: ${escapeHtml(v.applicationNumber)}`) +
    liPlain(`Permit # (Facility ID): ${escapeHtml(v.permitNumber)}`) +
    liPlain(`Project Name: ${escapeHtml(v.projectName)}`) +
    liPlain(`Site Address: ${escapeHtml(v.siteAddress)}`) +
    liPlain(`Project Acreage: ${escapeHtml(v.acreage)}`) +
    liPlain(`Issue Date: ${escapeHtml(v.issueDate)}`) +
    liPlain(`Expiration Date: ${escapeHtml(v.expirationDate)}`)
)}` +
        closing()
    ),
    subject: `Dust Permit Revised — ${v.projectName} (${v.applicationNumber})`,
  };
}

function reminderEmail(v: {
  accountName: string;
  applicationNumber: string;
  expirationDate: string;
  permitNumber: string;
  projectName: string;
  siteAddress: string;
}): EmailTemplate {
  return {
    body: wrapEmail(
      greeting() +
        `<div>This is a friendly reminder that the dust control permit for <b>${escapeHtml(v.accountName)}</b> on project "<b>${escapeHtml(v.projectName)}</b>" is approaching its expiration date.</div>
<div><br></div>
<div>Here are the key details:</div>
${ul(
  liPlain(`Application #: ${escapeHtml(v.applicationNumber)}`) +
    liPlain(`Permit # (Facility ID): ${escapeHtml(v.permitNumber)}`) +
    liPlain(`Project Name: ${escapeHtml(v.projectName)}`) +
    liPlain(`Site Address: ${escapeHtml(v.siteAddress)}`) +
    liPlain(`Expiration Date: ${escapeHtml(v.expirationDate)}`)
)}
<div><br></div>
<div>Is the project still active? Please let us know if you'd like us to:</div>
${ul(
  liPlain("<b>Renew</b> the permit for another year") +
    liPlain("<b>Close out</b> the permit (if the site is fully stabilized)")
)}${closing()}`
    ),
    subject: `Dust Permit Expiring — ${v.projectName} (${v.applicationNumber})`,
  };
}

const TEMPLATE_MAP: Record<
  NotificationType,
  (vars: Record<string, string>) => EmailTemplate
> = {
  issued: (vars) =>
    issuedEmail({
      accountName: vars.accountName,
      acreage: vars.acreage,
      applicationNumber: vars.applicationNumber,
      expirationDate: vars.expirationDate,
      issueDate: vars.issueDate,
      permitNumber: vars.permitNumber,
      permitStatus: vars.permitStatus,
      projectName: vars.projectName,
      siteAddress: vars.siteAddress,
    }),
  reminder: (vars) =>
    reminderEmail({
      accountName: vars.accountName,
      applicationNumber: vars.applicationNumber,
      expirationDate: vars.expirationDate,
      permitNumber: vars.permitNumber,
      projectName: vars.projectName,
      siteAddress: vars.siteAddress,
    }),
  renewed: (vars) =>
    renewedEmail({
      accountName: vars.accountName,
      acreage: vars.acreage,
      applicationNumber: vars.applicationNumber,
      expirationDate: vars.expirationDate,
      issueDate: vars.issueDate,
      permitNumber: vars.permitNumber,
      projectName: vars.projectName,
      siteAddress: vars.siteAddress,
      supersededApplicationNumber: vars.supersededApplicationNumber,
    }),
  revised: (vars) =>
    revisedEmail({
      accountName: vars.accountName,
      acreage: vars.acreage,
      applicationNumber: vars.applicationNumber,
      expirationDate: vars.expirationDate,
      issueDate: vars.issueDate,
      permitNumber: vars.permitNumber,
      projectName: vars.projectName,
      siteAddress: vars.siteAddress,
    }),
};

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

function uniqueEmails(emails: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const email of emails) {
    const normalized = email?.trim().toLowerCase();
    if (!(normalized && !seen.has(normalized))) {
      continue;
    }
    seen.add(normalized);
    values.push(normalized);
  }

  return values;
}

function extractReplyAllExternalRecipients(email: {
  ccEmails: string[];
  fromEmail: string | null;
  toEmails: string[];
}): string[] {
  return uniqueEmails([email.fromEmail, ...email.toEmails, ...email.ccEmails]).filter(
    (recipient) =>
      !recipient.endsWith(INTERNAL_DOMAIN) &&
      !MARICOPA_SOURCE_SENDERS_SET.has(recipient)
  );
}

function buildReplyAllDraftRecipientsFromDraft(
  draft: { ccEmails: string[]; toEmails: string[] },
  explicitTo?: string[],
  explicitCc?: string[]
): { cc: string[]; to: string[] } {
  const to = uniqueEmails([...draft.toEmails, ...(explicitTo ?? [])]).filter(
    (recipient) => recipient !== FROM_MAILBOX
  );
  const cc = uniqueEmails([...draft.ccEmails, ...(explicitCc ?? [])]).filter(
    (recipient) => recipient !== FROM_MAILBOX && !to.includes(recipient)
  );
  return { cc, to };
}

function extractBodyInnerHtml(html: string): string {
  const match = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return (match?.[1] ?? html).trim();
}

function prependReplyDraftBodyHtml(
  permitHtml: string,
  existingReplyHtml: string
): string {
  const permitBody = extractBodyInnerHtml(permitHtml);

  if (permitBody.length === 0) {
    return existingReplyHtml;
  }

  if (existingReplyHtml.trim().length === 0) {
    return `<html><body>${permitBody}</body></html>`;
  }

  if (/<body\b[^>]*>/i.test(existingReplyHtml)) {
    return existingReplyHtml.replace(
      /<body\b([^>]*)>/i,
      `<body$1>${permitBody}<div><br></div>`
    );
  }

  return `<html><body>${permitBody}<div><br></div>${existingReplyHtml}</body></html>`;
}

function parseEmailArray(value: unknown): string[] {
  return parseJsonArray(value)
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0);
}

function normalizeText(value: string | null | undefined): string {
  return normalizeProjectAlias(value ?? "");
}

function parseDateMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildTextVariants(value: string | null | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }

  const dashSplit = trimmed
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean)[0];
  const words = trimmed.split(/\s+/).filter(Boolean);
  const prefixes: string[] = [];

  if (words.length >= 3) {
    const candidate = words.slice(0, 3).join(" ");
    if (candidate.length >= 6 || HAS_DIGIT_RE.test(candidate)) {
      prefixes.push(candidate);
    }
  }

  return uniqueStrings([trimmed, dashSplit, ...prefixes]);
}

function buildPermitReplySearchTerms(params: {
  companyName?: string | null;
  permitId?: string | null;
  projectName?: string | null;
}): string[] {
  return uniqueStrings([
    params.permitId,
    ...buildTextVariants(params.projectName),
    ...buildTextVariants(params.companyName),
  ]);
}

function subjectStartsReply(subject: string | null | undefined): boolean {
  return /^(re|fw|fwd):/i.test((subject ?? "").trim());
}

function isInternalSender(candidate: PermitReplyRouteCandidate): boolean {
  return (
    candidate.isInternal ||
    candidate.fromEmail?.toLowerCase().endsWith(INTERNAL_DOMAIN) === true
  );
}

function isCountyPermitSender(candidate: PermitReplyRouteCandidate): boolean {
  return candidate.fromEmail?.toLowerCase().endsWith(COUNTY_PERMIT_DOMAIN) === true;
}

function isSystemPermitSender(candidate: PermitReplyRouteCandidate): boolean {
  return MARICOPA_SOURCE_SENDERS_SET.has(candidate.fromEmail?.toLowerCase() ?? "");
}

function scorePermitReplyRouteCandidate(
  candidate: PermitReplyRouteCandidate,
  params: { permitId?: string | null; projectName?: string | null }
): RankedPermitReplyRouteCandidate {
  let score = 0;
  const reasons: string[] = [];
  const subjectText = normalizeText(candidate.subject);
  const bodyText = normalizeText(candidate.bodyText);
  const haystack = `${subjectText} ${bodyText}`.trim();

  if (candidate.hasChiCopy) {
    score += 45;
    reasons.push("chi-copy");
  } else {
    score -= 25;
    reasons.push("no-chi-copy");
  }

  if (
    !isInternalSender(candidate) &&
    !isSystemPermitSender(candidate) &&
    !isCountyPermitSender(candidate)
  ) {
    score += 60;
    reasons.push("external-sender");
  } else if (isSystemPermitSender(candidate)) {
    score -= 80;
    reasons.push("system-permit-sender");
  } else if (isCountyPermitSender(candidate)) {
    score -= 140;
    reasons.push("county-permit-sender");
  } else {
    score -= 120;
    reasons.push("internal-sender");
  }

  if (candidate.isForwarded) {
    score -= 60;
    reasons.push("forwarded");
  }

  if (subjectStartsReply(candidate.subject)) {
    score += 12;
    reasons.push("reply-subject");
  }

  if (params.permitId && haystack.includes(params.permitId.toLowerCase())) {
    score += 70;
    reasons.push("permit-id-match");
  }

  if (REPLY_SIGNAL_TERMS.some((term) => haystack.includes(term))) {
    score += 35;
    reasons.push("permit-signal");
  }

  if (BILLING_SIGNAL_TERMS.some((term) => haystack.includes(term))) {
    score -= 90;
    reasons.push("billing-signal");
  }

  const projectVariants = buildTextVariants(params.projectName);
  const phraseMatch = projectVariants.find((variant) =>
    haystack.includes(normalizeText(variant))
  );
  if (phraseMatch) {
    score += 45;
    reasons.push("project-phrase-match");
  } else if (params.projectName) {
    const overlap = tokenOverlap(
      tokenizeProjectText(params.projectName),
      tokenizeProjectText(`${candidate.subject ?? ""} ${candidate.bodyText ?? ""}`)
    );
    if (overlap.ratio >= 0.5) {
      score += 30;
      reasons.push("project-token-overlap");
    } else if (overlap.ratio > 0) {
      score += 12;
      reasons.push("weak-project-overlap");
    }
  }

  return {
    ...candidate,
    reasons,
    score,
  };
}

function selectPermitReplyRoute(
  candidates: PermitReplyRouteCandidate[],
  params: { permitId?: string | null; projectName?: string | null }
): PermitReplyRouteSelection {
  const rankedCandidates = [...candidates]
    .map((candidate) => scorePermitReplyRouteCandidate(candidate, params))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return parseDateMs(right.receivedAt) - parseDateMs(left.receivedAt);
    });

  const replyAllCandidate =
    rankedCandidates.find(
      (candidate) =>
        candidate.hasChiCopy &&
        candidate.chiEmailId &&
        !candidate.isForwarded &&
        !isInternalSender(candidate) &&
        !isSystemPermitSender(candidate) &&
        !isCountyPermitSender(candidate)
    ) ?? null;
  const selected =
    replyAllCandidate ??
    rankedCandidates.find(
      (candidate) =>
        !isInternalSender(candidate) &&
        !isSystemPermitSender(candidate) &&
        !isCountyPermitSender(candidate)
    ) ??
    rankedCandidates.find((candidate) => !isSystemPermitSender(candidate)) ??
    rankedCandidates[0] ??
    null;

  const matchedRecipients = selected
    ? extractReplyAllExternalRecipients({
        ccEmails: selected.ccEmails,
        fromEmail: selected.fromEmail,
        toEmails: selected.toEmails,
      })
    : [];

  if (!(selected && selected.score >= 50)) {
    return {
      matchedRecipients,
      mode: "compose-new",
      rankedCandidates,
      reason: selected ? "top candidate below reply-all threshold" : "no candidates found",
      replyToEmailId: null,
      selectedCandidateEmailId: selected?.emailId ?? null,
    };
  }

  if (!(replyAllCandidate?.hasChiCopy && replyAllCandidate.chiEmailId)) {
    return {
      matchedRecipients,
      mode: "compose-new",
      rankedCandidates,
      reason: "top candidate has no chi mailbox copy",
      replyToEmailId: null,
      selectedCandidateEmailId: selected.emailId,
    };
  }

  return {
    matchedRecipients,
    mode: "reply-all",
    rankedCandidates,
    reason: "selected external thread with chi mailbox copy",
    replyToEmailId: replyAllCandidate.chiEmailId,
    selectedCandidateEmailId: replyAllCandidate.emailId,
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

async function resolveProjectIdFromProjectName(
  db: DbClient,
  projectName: string
): Promise<number | null> {
  const normalizedName = normalizeProjectNameKey(projectName);
  const exactMatch = await db
    .query<{ id: number }, [string]>(
      `SELECT id
       FROM projects
       WHERE normalized_name = $1
       ORDER BY updated_at DESC NULLS LAST, id DESC
       LIMIT 1`
    )
    .get(normalizedName);

  if (exactMatch?.id) {
    return exactMatch.id;
  }

  const fuzzyMatch = await db
    .query<{ id: number }, [string]>(
      `SELECT id
       FROM projects
       WHERE COALESCE(name, '') ILIKE $1
       ORDER BY updated_at DESC NULLS LAST, id DESC
       LIMIT 1`
    )
    .get(`%${projectName.trim()}%`);

  return fuzzyMatch?.id ?? null;
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

  const subjectHint =
    params.type === "issued" || params.type === "renewed"
      ? "Dust Permit Issued"
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

async function queryReplyRouteCandidates(
  db: DbClient,
  params: {
    limit: number;
    projectId?: number | null;
    searchTerms?: string[];
  }
): Promise<
  Array<{
    body_text: string | null;
    cc_emails: string | null;
    chi_email_id: number | null;
    email_id: number;
    from_email: string | null;
    has_chi_copy: boolean | number;
    is_forwarded: boolean | number;
    is_internal: boolean | number;
    mailbox_email: string;
    received_at: string;
    subject: string | null;
    to_emails: string | null;
  }>
> {
  const clauses: string[] = [
    "COALESCE(e.is_excluded, 0) = 0",
    "e.received_at >= now() - interval '365 days'",
  ];
  const paramsList: unknown[] = [];

  if (typeof params.projectId === "number") {
    paramsList.push(params.projectId);
    clauses.push(`e.project_id = $${paramsList.length}`);
  } else if (params.searchTerms?.length) {
    const searchClauses = params.searchTerms.map((term) => {
      paramsList.push(`%${term}%`);
      const idx = paramsList.length;
      return `(
        COALESCE(e.subject, '') ILIKE $${idx}
        OR COALESCE(e.body_preview, '') ILIKE $${idx}
        OR COALESCE(e.body_full, '') ILIKE $${idx}
      )`;
    });
    clauses.push(`(${searchClauses.join(" OR ")})`);
  } else {
    return [];
  }

  paramsList.push(FROM_MAILBOX);
  const chiIdx = paramsList.length;
  paramsList.push(params.limit);
  const limitIdx = paramsList.length;

  return await db
    .query<{
      body_text: string | null;
      cc_emails: string | null;
      chi_email_id: number | null;
      email_id: number;
      from_email: string | null;
      has_chi_copy: boolean | number;
      is_forwarded: boolean | number;
      is_internal: boolean | number;
      mailbox_email: string;
      received_at: string;
      subject: string | null;
      to_emails: string | null;
    }>(
      `WITH matched AS (
         SELECT
           e.id,
           e.subject,
           e.from_email,
           e.to_emails,
           e.cc_emails,
           e.is_internal,
           e.is_forwarded,
           e.received_at,
           m.email AS mailbox_email,
           COALESCE(NULLIF(e.internet_message_id, ''), NULLIF(e.message_id, ''), 'id:' || e.id::text) AS message_key,
           COALESCE(NULLIF(e.body_full, ''), NULLIF(e.body_preview, ''), '') AS body_text
         FROM emails e
         JOIN mailboxes m ON m.id = e.mailbox_id
         WHERE ${clauses.join(" AND ")}
       ),
       ranked AS (
         SELECT
           matched.*,
           MAX(
             CASE WHEN lower(matched.mailbox_email) = lower($${chiIdx}) THEN matched.id END
           ) OVER (PARTITION BY matched.message_key) AS chi_email_id,
           CASE
             WHEN MAX(
               CASE WHEN lower(matched.mailbox_email) = lower($${chiIdx}) THEN matched.id END
             ) OVER (PARTITION BY matched.message_key) IS NOT NULL THEN true
             ELSE false
           END AS has_chi_copy,
           ROW_NUMBER() OVER (
             PARTITION BY matched.message_key
             ORDER BY
               CASE WHEN lower(matched.mailbox_email) = lower($${chiIdx}) THEN 0 ELSE 1 END,
               matched.received_at DESC,
               matched.id DESC
           ) AS rn
         FROM matched
       )
       SELECT
         id AS email_id,
         chi_email_id,
         mailbox_email,
         subject,
         from_email,
         to_emails,
         cc_emails,
         is_internal,
         is_forwarded,
         received_at::text,
         body_text,
         has_chi_copy
       FROM ranked
       WHERE rn = 1
       ORDER BY received_at DESC, email_id DESC
       LIMIT $${limitIdx}`
    )
    .all(...paramsList);
}

async function findReplyRouteCandidates(
  db: DbClient,
  params: {
    projectId?: number | null;
    searchTerms: string[];
  }
): Promise<PermitReplyRouteCandidate[]> {
  if (params.searchTerms.length === 0 && typeof params.projectId !== "number") {
    return [];
  }

  const projectRows =
    typeof params.projectId === "number"
      ? await queryReplyRouteCandidates(db, {
          limit: MAX_CANDIDATES,
          projectId: params.projectId,
        })
      : [];

  const rows =
    projectRows.length > 0
      ? projectRows
      : await queryReplyRouteCandidates(db, {
          limit: MAX_CANDIDATES,
          searchTerms: params.searchTerms,
        });

  return rows.map((row) => ({
    bodyText: row.body_text,
    ccEmails: parseEmailArray(row.cc_emails),
    chiEmailId: row.chi_email_id,
    emailId: row.email_id,
    fromEmail: row.from_email,
    hasChiCopy: parseBoolInt(row.has_chi_copy),
    isForwarded: parseBoolInt(row.is_forwarded),
    isInternal: parseBoolInt(row.is_internal),
    mailboxEmail: row.mailbox_email,
    receivedAt: row.received_at,
    subject: row.subject,
    toEmails: parseEmailArray(row.to_emails),
  }));
}

function abbreviateState(state: string | null): string | null {
  if (!state) {
    return null;
  }
  if (state.length === 2) {
    return state.toUpperCase();
  }
  return state.toLowerCase() === "arizona" ? "AZ" : state;
}

function joinAddressParts(parts: Array<string | null>): string {
  return parts.filter((part): part is string => Boolean(part)).join(", ");
}

function formatNotificationAcreage(
  disturbedArea: string | null | undefined
): string {
  return coerceString(disturbedArea) ?? "N/A";
}

function formatNotificationSiteAddress(
  permit: { address?: unknown; city?: unknown },
  scraped?: PermitData | null
): string {
  const selectedLocation =
    scraped?.locations?.find((location) => location.isSelected === true) ??
    scraped?.locations?.[0];

  if (selectedLocation) {
    const address = coerceString(selectedLocation.address);
    const city = coerceString(selectedLocation.city);
    const state = abbreviateState(coerceString(selectedLocation.state));
    const zip = coerceString(selectedLocation.zip);
    const stateZip = state && zip ? `${state} ${zip}` : state ?? zip ?? null;
    const full = joinAddressParts([address, city, stateZip]);
    if (full && (address || !coerceString(permit.address))) {
      return full;
    }
  }

  return joinAddressParts([
    coerceString(permit.address),
    coerceString(permit.city),
  ]) || "N/A";
}

async function resolveScrapedPermitData(
  permitId: string
): Promise<PermitData | null> {
  try {
    const client = new PermitClient();
    const result = await client.scrape(permitId);
    return result.success && result.data ? result.data : null;
  } catch (error) {
    logger.warn("permit scrape fallback failed for notification", {
      error: error instanceof Error ? error.message : String(error),
      permitId,
    });
    return null;
  }
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

async function resolveNotificationAttachments(params: {
  facilityId?: string | null;
  permitId: string;
  projectName: string;
  sourceEmail: SourceEmailContext | null;
}): Promise<NotificationDraftAttachment[]> {
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

async function buildPermitBaseVars(
  db: DbClient,
  permit: Record<string, unknown>,
  permitId: string,
  params: {
    scrapedPermit?: PermitData | null;
    sourceEmail?: Email | null;
  }
): Promise<Record<string, string>> {
  const sourceText = getEmailText(params.sourceEmail);
  const permitNumber =
    coerceString(permit.facility_id) ?? extractFacilityId(sourceText) ?? permitId;

  return {
    accountName: coerceString(permit.company_name) ?? "Unknown",
    acreage: formatNotificationAcreage(params.scrapedPermit?.disturbedArea),
    applicationNumber: extractApplicationNumber(sourceText) ?? permitId,
    expirationDate: coerceString(permit.expiration_date) ?? "N/A",
    issueDate: coerceString(permit.effective_date) ?? "N/A",
    permitNumber,
    permitStatus: coerceString(permit.status) ?? "Active",
    projectName: coerceString(permit.project_name) ?? permitId,
    siteAddress: formatNotificationSiteAddress(
      {
        address: permit.address,
        city: permit.city,
      },
      params.scrapedPermit
    ),
    supersededApplicationNumber: await resolveSupersededApplicationNumber(
      db,
      permit,
      permitId
    ),
  };
}

async function createNotificationDraft(params: {
  attachments?: NotificationDraftAttachment[];
  body: string;
  cc?: string[];
  draft: boolean;
  replyTo?: SourceEmailContext | null;
  subject: string;
  to: string[];
}): Promise<{ attachedFiles: string[]; draftId: string }> {
  const compose = createComposeClient();
  let draftId: string;

  if (params.replyTo) {
    const graph = createGraphClient();
    const { messageId, wasUnread } = await loadReplyTargetMessageState(
      graph,
      params.replyTo
    );
    const replyDraft = await compose.createReplyAllDraft({
      messageId,
      userId: FROM_MAILBOX,
    });
    const replyDraftMessage = await graph.getMessage(replyDraft.id, FROM_MAILBOX);
    const replyRecipients = buildReplyAllDraftRecipientsFromDraft(
      {
        ccEmails:
          replyDraftMessage.ccRecipients
            ?.map((recipient) => recipient.emailAddress?.address ?? null)
            .filter((email): email is string => Boolean(email)) ?? [],
        toEmails:
          replyDraftMessage.toRecipients
            ?.map((recipient) => recipient.emailAddress?.address ?? null)
            .filter((email): email is string => Boolean(email)) ?? [],
      },
      params.to,
      params.cc
    );
    const mergedBody = prependReplyDraftBodyHtml(
      params.body,
      replyDraftMessage.body?.content ?? ""
    );

    const updated = await compose.updateDraft({
      body: mergedBody,
      bodyType: "html",
      cc: replyRecipients.cc.map((email) => ({ email })),
      draftId: replyDraft.id,
      ifMatch: replyDraft["@odata.etag"],
      to: replyRecipients.to.map((email) => ({ email })),
      userId: FROM_MAILBOX,
    });

    draftId = updated.id;

    if (wasUnread) {
      await graph.setMessageReadState(messageId, FROM_MAILBOX, false);
    }
  } else {
    const draft = await compose.createDraft({
      body: params.body,
      bodyType: "html",
      cc: params.cc?.map((email) => ({ email })),
      subject: params.subject,
      to: params.to.map((email) => ({ email })),
      userId: FROM_MAILBOX,
    });
    draftId = draft.id;
  }

  const attachedFiles: string[] = [];
  for (const attachment of params.attachments ?? []) {
    const result = await compose.addFileAttachment({
      contentBytesBase64: attachment.contentBytesBase64,
      contentType: attachment.contentType,
      draftId,
      name: attachment.name,
      userId: FROM_MAILBOX,
    });
    attachedFiles.push(result.name ?? attachment.name);
  }

  if (!params.draft) {
    await compose.sendDraft(draftId, FROM_MAILBOX);
  }

  return {
    attachedFiles,
    draftId,
  };
}

export const dustPermitIssuedNotification = schemaTask({
  id: "dust-permit-issued-notification",
  maxDuration: 60,
  retry: { maxAttempts: 2 },
  schema: INPUT_SCHEMA,
  run: async (input) => {
    const { db } = await import("@lib/db/client");

    const sourceEmailId =
      input.selector.kind === "source-email" ? input.selector.sourceEmailId : undefined;
    let permitId =
      input.selector.kind === "permit-id"
        ? input.selector.permitId
        : input.selector.kind === "source-email"
          ? input.selector.permitId ?? null
          : null;
    let permit =
      permitId != null
        ? await db
            .query<Record<string, unknown>, [string]>(
              "SELECT * FROM dust_permits_filed_by_desert_services WHERE id = $1"
            )
            .get(permitId)
        : input.selector.kind === "project-query"
          ? await resolvePermitByProjectQuery(db, input.selector.projectQuery)
          : input.selector.kind === "source-email" && input.selector.projectQuery
            ? await resolvePermitByProjectQuery(db, input.selector.projectQuery)
            : null;

    let sourceEmail = sourceEmailId
      ? await resolveSourceEmailContext(db, {
          permitId: permitId ?? "",
          projectName:
            input.selector.kind === "project-query"
              ? input.selector.projectQuery
              : input.selector.kind === "source-email"
                ? input.selector.projectQuery ?? ""
                : "",
          sourceEmailId,
          type: input.type,
        })
      : null;

    if (!permitId && sourceEmail) {
      permitId = extractApplicationNumber(getEmailText(sourceEmail.email));
      if (permitId) {
        permit = await db
          .query<Record<string, unknown>, [string]>(
            "SELECT * FROM dust_permits_filed_by_desert_services WHERE id = $1"
          )
          .get(permitId);
      }
    }

    if (!(permit && permitId)) {
      throw new Error("Could not resolve dust permit for issued notification");
    }

    if (!sourceEmail) {
      sourceEmail = await resolveSourceEmailContext(db, {
        permitId,
        projectName: coerceString(permit.project_name) ?? permitId,
        type: input.type,
      });
    }

    const resolvedProjectId =
      typeof permit.project_id === "number"
        ? permit.project_id
        : coerceString(permit.project_name)
          ? await resolveProjectIdFromProjectName(
              db,
              coerceString(permit.project_name) ?? permitId
            )
          : null;
    const searchTerms = buildPermitReplySearchTerms({
      companyName: coerceString(permit.company_name),
      permitId,
      projectName: coerceString(permit.project_name),
    });
    const candidates = await findReplyRouteCandidates(db, {
      projectId: resolvedProjectId,
      searchTerms,
    });
    const route =
      input.replyToEmailId != null
        ? {
            matchedRecipients: input.recipients ?? [],
            mode: "reply-all" as const,
            rankedCandidates: [] as RankedPermitReplyRouteCandidate[],
            reason: "explicit replyToEmailId",
            replyToEmailId: input.replyToEmailId,
            selectedCandidateEmailId: input.replyToEmailId,
          }
        : selectPermitReplyRoute(candidates, {
            permitId,
            projectName: coerceString(permit.project_name),
          });

    const replyTo =
      route.mode === "reply-all" && route.replyToEmailId
        ? await resolveReplyEmailContext(db, route.replyToEmailId)
        : null;
    const fallbackRecipients = sourceEmail
      ? uniqueEmails([
          ...sourceEmail.email.toEmails,
          ...sourceEmail.email.ccEmails,
        ]).filter(
          (recipient) =>
            !recipient.endsWith(INTERNAL_DOMAIN) &&
            !MARICOPA_SOURCE_SENDERS_SET.has(recipient)
        )
      : [];
    const composeRecipients =
      input.recipients?.length
        ? uniqueEmails(input.recipients)
        : route.matchedRecipients.length
          ? route.matchedRecipients
          : fallbackRecipients.length
            ? fallbackRecipients
            : [FROM_MAILBOX];
    const scrapedPermit = await resolveScrapedPermitData(permitId);
    const baseVars = {
      ...(await buildPermitBaseVars(db, permit, permitId, {
        scrapedPermit,
        sourceEmail: sourceEmail?.email,
      })),
      ...(input.extraVars ?? {}),
    };
    const template = TEMPLATE_MAP[input.type](baseVars);
    const attachments = await resolveNotificationAttachments({
      facilityId: coerceString(permit.facility_id),
      permitId,
      projectName: coerceString(permit.project_name) ?? permitId,
      sourceEmail,
    });

    if (input.dryRun) {
      return {
        dryRun: true,
        permitId,
        route: {
          matchedRecipients: route.matchedRecipients,
          mode: route.mode,
          reason: route.reason,
          replyToEmailId: route.replyToEmailId,
          selectedCandidateEmailId: route.selectedCandidateEmailId,
        },
        subject: template.subject,
        to: composeRecipients,
        topCandidates: route.rankedCandidates.slice(0, 5).map((candidate) => ({
          chiEmailId: candidate.chiEmailId,
          emailId: candidate.emailId,
          fromEmail: candidate.fromEmail,
          hasChiCopy: candidate.hasChiCopy,
          reasons: candidate.reasons,
          receivedAt: candidate.receivedAt,
          score: candidate.score,
          subject: candidate.subject,
        })),
      };
    }

    const draftResult = await createNotificationDraft({
      attachments,
      body: template.body,
      cc: input.cc,
      draft: input.draft,
      replyTo,
      subject: template.subject,
      to: composeRecipients,
    });

    return {
      attachedFiles: draftResult.attachedFiles,
      draftId: draftResult.draftId,
      mode: input.draft ? ("draft" as const) : ("sent" as const),
      permitId,
      route: {
        matchedRecipients: route.matchedRecipients,
        mode: route.mode,
        reason: route.reason,
        replyToEmailId: route.replyToEmailId,
        selectedCandidateEmailId: route.selectedCandidateEmailId,
      },
      sourceEmailId: sourceEmail?.email.id ?? null,
      subject: template.subject,
      to: composeRecipients,
      type: input.type,
    };
  },
});
