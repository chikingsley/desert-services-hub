import { createHash } from "node:crypto";
import { db } from "@lib/db/hub";
import { EMAIL_RESOLVER_SPARK_MODEL } from "../jobs/config";
import { runOpencodeJsonPrompt } from "./email-intent/opencode";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE =
  /(?:\+?1[\s().-]*)?(?:\(?\d{3}\)?[\s().-]*)\d{3}[\s().-]*\d{4}/g;
const INTERNAL_DOMAIN_SUFFIXES = ["desertservices.net"];
const DEFAULT_CREATE_THRESHOLD = 0.72;

interface ProjectRow {
  id: number;
  name: string;
  lifecycle_state: string | null;
  account_id: number | null;
}

interface ProjectEstimateRow {
  estimate_id: number;
  is_canonical: boolean;
}

interface EmailRow {
  id: number;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  to_emails: string | null;
  cc_emails: string | null;
  body_preview: string | null;
  body_full: string | null;
}

interface DocumentRow {
  id: number;
  document_type: string;
  summary: string | null;
  file_name: string | null;
}

interface AttachmentRow {
  id: number;
  email_id: number;
  name: string;
  extracted_text: string | null;
}

interface ContactRow {
  id: number;
  monday_item_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  account_id: number | null;
}

interface CoverageRow {
  estimate_contact_count: number;
  email_contact_count: number;
}

interface CandidateAccumulator {
  key: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  confidence: number;
  sources: Set<string>;
  notes: Set<string>;
  evidenceEmailIds: Set<number>;
  evidenceDocumentIds: Set<number>;
  evidenceAttachmentIds: Set<number>;
}

interface SparkContactRecord {
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  confidence: number;
  reason: string;
  evidenceEmailIds: number[];
  evidenceDocumentIds: number[];
  evidenceAttachmentIds: number[];
}

interface ContactMatch {
  contactId: number;
  contactName: string;
  contactEmail: string | null;
  contactAccountId: number | null;
}

export interface ProjectContactCandidate {
  key: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  confidence: number;
  sources: string[];
  notes: string[];
  evidenceEmailIds: number[];
  evidenceDocumentIds: number[];
  evidenceAttachmentIds: number[];
}

export interface ProjectContactProposal {
  action:
    | "already_linked"
    | "link_existing_contact"
    | "create_contact"
    | "skip_low_confidence";
  reason: string;
  confidence: number;
  candidate: ProjectContactCandidate;
  contactId: number | null;
  contactName: string | null;
  contactEmail: string | null;
}

export interface ResolveProjectContactsOptions {
  limitEmails?: number;
  limitDocuments?: number;
  limitAttachments?: number;
  model?: string;
  timeoutMs?: number;
  requireLlm?: boolean;
  skipLlm?: boolean;
  createThreshold?: number;
}

export interface ProjectContactResolutionResult {
  project: {
    id: number;
    name: string;
    lifecycleState: string | null;
    accountId: number | null;
  };
  targetEstimateId: number | null;
  existingCoverage: {
    estimateContacts: number;
    emailContacts: number;
  };
  llm: {
    attempted: boolean;
    succeeded: boolean;
    error: string | null;
    contactsReturned: number;
    model: string;
  };
  candidates: ProjectContactCandidate[];
  proposals: ProjectContactProposal[];
}

export interface ApplyProjectContactResolutionResult {
  contactsCreated: number;
  estimateLinksInserted: number;
  emailLinksInserted: number;
  contactsAccountAttached: number;
  estimatesAccountAttached: number;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function normalizeWhitespace(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const digits = value.replaceAll(/\D/g, "");
  if (digits.length < 10) {
    return null;
  }
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function titleCaseFromLocalPart(localPart: string): string {
  return localPart
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
    .trim();
}

export function normalizeEmailAddress(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().replaceAll(/[<>]/g, "").toLowerCase();
  if (!(trimmed && trimmed.includes("@"))) {
    return null;
  }
  return trimmed;
}

function isInternalEmail(email: string): boolean {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) {
    return false;
  }
  const domain = email.slice(atIndex + 1).toLowerCase();
  return INTERNAL_DOMAIN_SUFFIXES.some(
    (suffix) => domain === suffix || domain.endsWith(`.${suffix}`)
  );
}

export function parseEmailAddressList(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  const trim = raw.trim();
  if (!trim) {
    return [];
  }

  try {
    const parsed = JSON.parse(trim);
    if (Array.isArray(parsed)) {
      return parsed
        .map((value) => normalizeEmailAddress(String(value)))
        .filter((value): value is string => Boolean(value));
    }
  } catch {
    // fallback parser below
  }

  return trim
    .split(/[;,]/)
    .map((value) => normalizeEmailAddress(value))
    .filter((value): value is string => Boolean(value));
}

export function extractEmailAddresses(text: string): string[] {
  if (!text) {
    return [];
  }

  const set = new Set<string>();
  const matches = text.match(EMAIL_RE) ?? [];
  for (const match of matches) {
    const normalized = normalizeEmailAddress(match);
    if (normalized) {
      set.add(normalized);
    }
  }
  return [...set];
}

export function extractPhoneNumbers(text: string): string[] {
  if (!text) {
    return [];
  }

  const set = new Set<string>();
  const matches = text.match(PHONE_RE) ?? [];
  for (const match of matches) {
    const normalized = normalizePhone(match);
    if (normalized) {
      set.add(normalized);
    }
  }
  return [...set];
}

function normalizeName(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = normalizeWhitespace(value.replaceAll(/[<>]/g, ""));
  return normalized.length > 0 ? normalized : null;
}

function candidateKeyOf(
  email: string | null,
  name: string | null,
  phone: string | null
): string | null {
  if (email) {
    return `email:${email}`;
  }

  const normalizedName = name ? normalizeWhitespace(name).toLowerCase() : null;
  if (!normalizedName) {
    return null;
  }

  if (phone) {
    return `name_phone:${normalizedName}:${phone}`;
  }
  return `name:${normalizedName}`;
}

function chooseName(
  existing: string | null,
  incoming: string | null
): string | null {
  if (!incoming) {
    return existing;
  }
  if (!existing) {
    return incoming;
  }
  if (incoming.length > existing.length) {
    return incoming;
  }
  return existing;
}

function getOrCreateCandidate(
  map: Map<string, CandidateAccumulator>,
  email: string | null,
  name: string | null,
  phone: string | null
): CandidateAccumulator | null {
  const key = candidateKeyOf(email, name, phone);
  if (!key) {
    return null;
  }

  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const created: CandidateAccumulator = {
    company: null,
    confidence: 0,
    email,
    evidenceAttachmentIds: new Set<number>(),
    evidenceDocumentIds: new Set<number>(),
    evidenceEmailIds: new Set<number>(),
    key,
    name,
    notes: new Set<string>(),
    phone,
    sources: new Set<string>(),
    title: null,
  };
  map.set(key, created);
  return created;
}

function addCandidateEvidence(
  map: Map<string, CandidateAccumulator>,
  input: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
    title?: string | null;
    company?: string | null;
    confidence: number;
    source: string;
    note?: string | null;
    emailId?: number;
    documentId?: number;
    attachmentId?: number;
  }
): void {
  const email = normalizeEmailAddress(input.email ?? null);
  const name = normalizeName(input.name ?? null);
  const phone = normalizePhone(input.phone ?? null);

  const candidate = getOrCreateCandidate(map, email, name, phone);
  if (!candidate) {
    return;
  }

  if (email && !candidate.email) {
    candidate.email = email;
  }
  if (phone && !candidate.phone) {
    candidate.phone = phone;
  }
  candidate.name = chooseName(candidate.name, name);

  if (!candidate.title && input.title) {
    candidate.title = normalizeName(input.title);
  }
  if (!candidate.company && input.company) {
    candidate.company = normalizeName(input.company);
  }

  candidate.confidence = Math.max(
    candidate.confidence,
    clampConfidence(input.confidence)
  );
  candidate.sources.add(input.source);

  if (input.note) {
    candidate.notes.add(input.note);
  }
  if (typeof input.emailId === "number") {
    candidate.evidenceEmailIds.add(input.emailId);
  }
  if (typeof input.documentId === "number") {
    candidate.evidenceDocumentIds.add(input.documentId);
  }
  if (typeof input.attachmentId === "number") {
    candidate.evidenceAttachmentIds.add(input.attachmentId);
  }
}

function finalizeCandidate(
  candidate: CandidateAccumulator
): ProjectContactCandidate {
  const sourceBonus = (candidate.sources.size - 1) * 0.04;
  const confidence = clampConfidence(
    candidate.confidence + Math.max(0, sourceBonus)
  );

  return {
    company: candidate.company,
    confidence,
    email: candidate.email,
    evidenceAttachmentIds: [...candidate.evidenceAttachmentIds].sort(
      (a, b) => a - b
    ),
    evidenceDocumentIds: [...candidate.evidenceDocumentIds].sort(
      (a, b) => a - b
    ),
    evidenceEmailIds: [...candidate.evidenceEmailIds].sort((a, b) => a - b),
    key: candidate.key,
    name: candidate.name,
    notes: [...candidate.notes].sort(),
    phone: candidate.phone,
    sources: [...candidate.sources].sort(),
    title: candidate.title,
  };
}

function parseSparkContactRecords(raw: unknown): SparkContactRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const out: SparkContactRecord[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const email = normalizeEmailAddress(
      typeof record.email === "string" ? record.email : null
    );
    const name = normalizeName(
      typeof record.name === "string" ? record.name : null
    );
    const phone = normalizePhone(
      typeof record.phone === "string" ? record.phone : null
    );

    if (!(email || name)) {
      continue;
    }

    const confidence = clampConfidence(
      typeof record.confidence === "number" ? record.confidence : 0
    );
    const reason =
      typeof record.reason === "string"
        ? normalizeWhitespace(record.reason)
        : "";

    const emailIds = Array.isArray(record.evidenceEmailIds)
      ? record.evidenceEmailIds
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      : [];

    const documentIds = Array.isArray(record.evidenceDocumentIds)
      ? record.evidenceDocumentIds
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      : [];

    const attachmentIds = Array.isArray(record.evidenceAttachmentIds)
      ? record.evidenceAttachmentIds
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      : [];

    out.push({
      company: normalizeName(
        typeof record.company === "string" ? record.company : null
      ),
      confidence,
      email,
      evidenceAttachmentIds: attachmentIds,
      evidenceDocumentIds: documentIds,
      evidenceEmailIds: emailIds,
      name,
      phone,
      reason,
      title: normalizeName(
        typeof record.title === "string" ? record.title : null
      ),
    });
  }

  return out;
}

function buildSparkPrompt(payload: {
  project: ProjectRow;
  deterministicCandidates: ProjectContactCandidate[];
  emails: EmailRow[];
  documents: DocumentRow[];
  attachments: AttachmentRow[];
}): string {
  const emailSnippets = payload.emails.slice(0, 12).map((row) => ({
    body: normalizeWhitespace(
      (row.body_full ?? row.body_preview ?? "").slice(0, 700)
    ),
    emailId: row.id,
    from: row.from_email,
    fromName: row.from_name,
    subject: row.subject,
  }));

  const documentSnippets = payload.documents.slice(0, 10).map((row) => ({
    documentId: row.id,
    fileName: row.file_name,
    text: normalizeWhitespace((row.summary ?? "").slice(0, 600)),
    type: row.document_type,
  }));

  const attachmentSnippets = payload.attachments.slice(0, 10).map((row) => ({
    attachmentId: row.id,
    emailId: row.email_id,
    name: row.name,
    text: normalizeWhitespace((row.extracted_text ?? "").slice(0, 600)),
  }));

  const compactCandidates = payload.deterministicCandidates
    .slice(0, 60)
    .map((row) => ({
      confidence: row.confidence,
      email: row.email,
      evidenceAttachmentIds: row.evidenceAttachmentIds,
      evidenceDocumentIds: row.evidenceDocumentIds,
      evidenceEmailIds: row.evidenceEmailIds,
      key: row.key,
      name: row.name,
      phone: row.phone,
      sources: row.sources,
    }));

  const promptPayload = {
    deterministicCandidates: compactCandidates,
    evidence: {
      emailSnippets,
      documentSnippets,
      attachmentSnippets,
    },
    project: {
      id: payload.project.id,
      name: payload.project.name,
      lifecycleState: payload.project.lifecycle_state,
      accountId: payload.project.account_id,
    },
  };

  return [
    "You extract and normalize project contact candidates.",
    "Prioritize real human contacts that are relevant to project execution, estimating, contracts, billing, and field coordination.",
    "Ignore Desert Services internal recipients and generic distribution aliases when possible.",
    "Return JSON only with this shape:",
    '{"contacts":[{"name":"","email":"","phone":"","title":"","company":"","confidence":0.0,"reason":"","evidenceEmailIds":[1],"evidenceDocumentIds":[2],"evidenceAttachmentIds":[3]}]}',
    "Rules:",
    "- Keep confidence between 0 and 1.",
    "- Include evidence IDs only when directly supported by provided snippets.",
    "- Do not return markdown.",
    "",
    JSON.stringify(promptPayload),
  ].join("\n");
}

function deriveNameFromEmail(email: string | null, fallback: string): string {
  if (!email) {
    return fallback;
  }
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) {
    return fallback;
  }
  const localPart = email.slice(0, atIndex);
  const title = titleCaseFromLocalPart(localPart);
  return title || fallback;
}

function buildLocalMondayItemId(
  projectId: number,
  candidate: ProjectContactCandidate
): string {
  const seed = `${projectId}|${candidate.email ?? ""}|${candidate.name ?? ""}|${candidate.phone ?? ""}`;
  const digest = createHash("sha1").update(seed).digest("hex").slice(0, 16);
  return `local:${projectId}:${digest}`;
}

function selectTargetEstimateId(rows: ProjectEstimateRow[]): number | null {
  const canonical = rows.find((row) => row.is_canonical);
  if (canonical) {
    return canonical.estimate_id;
  }
  const first = rows[0];
  return first ? first.estimate_id : null;
}

function pickExternalEmailCandidates(emailList: string[]): string[] {
  return emailList.filter((email) => !isInternalEmail(email));
}

async function fetchProject(projectId: number): Promise<ProjectRow | null> {
  return (await db
    .query<ProjectRow, [number]>(
      `SELECT id, name, lifecycle_state, account_id
       FROM projects
       WHERE id = ?`
    )
    .get(projectId)) as ProjectRow | null;
}

async function fetchProjectEstimates(
  projectId: number
): Promise<ProjectEstimateRow[]> {
  return (await db
    .query<ProjectEstimateRow, [number]>(
      `SELECT estimate_id, is_canonical
       FROM project_estimates
       WHERE project_id = ?
       ORDER BY is_canonical DESC, estimate_id ASC`
    )
    .all(projectId)) as ProjectEstimateRow[];
}

async function fetchCoverage(projectId: number): Promise<CoverageRow> {
  const row = (await db
    .query<CoverageRow, [number, number]>(
      `SELECT
         (SELECT COUNT(DISTINCT ec.contact_id)
          FROM project_estimates pe
          JOIN estimate_contacts ec ON ec.estimate_id = pe.estimate_id
          WHERE pe.project_id = ?)::int AS estimate_contact_count,
         (SELECT COUNT(DISTINCT ce.contact_id)
          FROM emails e
          JOIN contact_emails ce ON ce.email_id = e.id
          WHERE e.project_id = ?)::int AS email_contact_count`
    )
    .get(projectId, projectId)) as CoverageRow | null;

  return {
    email_contact_count: row?.email_contact_count ?? 0,
    estimate_contact_count: row?.estimate_contact_count ?? 0,
  };
}

async function fetchLinkedEstimateContactIds(
  projectId: number
): Promise<Set<number>> {
  const rows = (await db
    .query<{ contact_id: number }, [number]>(
      `SELECT DISTINCT ec.contact_id
       FROM project_estimates pe
       JOIN estimate_contacts ec ON ec.estimate_id = pe.estimate_id
       WHERE pe.project_id = ?`
    )
    .all(projectId)) as { contact_id: number }[];

  return new Set(rows.map((row) => row.contact_id));
}

async function fetchEmails(
  projectId: number,
  limit: number
): Promise<EmailRow[]> {
  return (await db
    .query<EmailRow, [number, number]>(
      `SELECT id,
              subject,
              from_email,
              from_name,
              to_emails,
              cc_emails,
              body_preview,
              body_full
       FROM emails
       WHERE project_id = ?
       ORDER BY received_at DESC, id DESC
       LIMIT ?`
    )
    .all(projectId, limit)) as EmailRow[];
}

async function fetchDocuments(
  projectId: number,
  limit: number
): Promise<DocumentRow[]> {
  return (await db
    .query<DocumentRow, [number, number]>(
      `SELECT id,
              document_type,
              summary,
              file_name
       FROM documents
       WHERE project_id = ?
         AND extraction_status = 'success'
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`
    )
    .all(projectId, limit)) as DocumentRow[];
}

async function fetchAttachments(
  projectId: number,
  limit: number
): Promise<AttachmentRow[]> {
  return (await db
    .query<AttachmentRow, [number, number]>(
      `SELECT a.id,
              a.email_id,
              a.name,
              a.extracted_text
       FROM attachments a
       JOIN emails e ON e.id = a.email_id
       WHERE e.project_id = ?
         AND a.extraction_status = 'success'
         AND COALESCE(length(a.extracted_text), 0) > 0
       ORDER BY a.extracted_at DESC NULLS LAST, a.id DESC
       LIMIT ?`
    )
    .all(projectId, limit)) as AttachmentRow[];
}

async function fetchContactsByEmails(emails: string[]): Promise<ContactRow[]> {
  if (emails.length === 0) {
    return [];
  }

  const out: ContactRow[] = [];
  const batchSize = 200;

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const placeholders = batch.map(() => "?").join(", ");
    const rows = (await db
      .query<ContactRow>(
        `SELECT id, monday_item_id, name, email, phone, title, account_id
         FROM contacts
         WHERE lower(email) IN (${placeholders})`
      )
      .all(...batch)) as ContactRow[];
    out.push(...rows);
  }

  return out;
}

async function fetchContactsByNames(
  names: string[],
  accountId: number | null
): Promise<ContactRow[]> {
  if (names.length === 0) {
    return [];
  }

  const out: ContactRow[] = [];
  const batchSize = 200;

  for (let i = 0; i < names.length; i += batchSize) {
    const batch = names.slice(i, i + batchSize);
    const placeholders = batch.map(() => "?").join(", ");

    if (typeof accountId === "number") {
      const rows = (await db
        .query<ContactRow>(
          `SELECT id, monday_item_id, name, email, phone, title, account_id
           FROM contacts
           WHERE account_id = ?
             AND lower(name) IN (${placeholders})`
        )
        .all(accountId, ...batch)) as ContactRow[];
      out.push(...rows);
      continue;
    }

    const rows = (await db
      .query<ContactRow>(
        `SELECT id, monday_item_id, name, email, phone, title, account_id
         FROM contacts
         WHERE lower(name) IN (${placeholders})`
      )
      .all(...batch)) as ContactRow[];
    out.push(...rows);
  }

  return out;
}

function collectDeterministicCandidates(
  emails: EmailRow[],
  documents: DocumentRow[],
  attachments: AttachmentRow[]
): Map<string, CandidateAccumulator> {
  const map = new Map<string, CandidateAccumulator>();

  for (const row of emails) {
    const fromEmail = normalizeEmailAddress(row.from_email);
    const fromName = normalizeName(row.from_name);

    if (fromEmail && !isInternalEmail(fromEmail)) {
      addCandidateEvidence(map, {
        confidence: 0.95,
        email: fromEmail,
        emailId: row.id,
        name: fromName,
        note: row.subject,
        source: "email_from",
      });

      const bodyText = (row.body_full ?? row.body_preview ?? "").slice(0, 3500);
      const signaturePhones = extractPhoneNumbers(bodyText);
      if (signaturePhones[0]) {
        addCandidateEvidence(map, {
          confidence: 0.82,
          email: fromEmail,
          emailId: row.id,
          name: fromName,
          note: "phone_from_signature",
          phone: signaturePhones[0],
          source: "email_signature",
        });
      }
    }

    const toEmails = pickExternalEmailCandidates(
      parseEmailAddressList(row.to_emails)
    );
    for (const email of toEmails) {
      addCandidateEvidence(map, {
        confidence: 0.74,
        email,
        emailId: row.id,
        source: "email_to",
      });
    }

    const ccEmails = pickExternalEmailCandidates(
      parseEmailAddressList(row.cc_emails)
    );
    for (const email of ccEmails) {
      addCandidateEvidence(map, {
        confidence: 0.7,
        email,
        emailId: row.id,
        source: "email_cc",
      });
    }

    const bodyText = (row.body_full ?? row.body_preview ?? "").slice(0, 3500);
    const textEmails = pickExternalEmailCandidates(
      extractEmailAddresses(bodyText)
    );
    for (const email of textEmails) {
      addCandidateEvidence(map, {
        confidence: 0.68,
        email,
        emailId: row.id,
        source: "email_body",
      });
    }
  }

  for (const row of documents) {
    const sourceText = `${row.file_name ?? ""}\n${row.summary ?? ""}`;
    const foundEmails = pickExternalEmailCandidates(
      extractEmailAddresses(sourceText)
    );
    const foundPhones = extractPhoneNumbers(sourceText);

    if (foundEmails.length === 1 && foundPhones[0]) {
      addCandidateEvidence(map, {
        confidence: 0.72,
        documentId: row.id,
        email: foundEmails[0],
        phone: foundPhones[0],
        source: "document_text",
      });
      continue;
    }

    for (const email of foundEmails) {
      addCandidateEvidence(map, {
        confidence: 0.62,
        documentId: row.id,
        email,
        source: "document_text",
      });
    }
  }

  for (const row of attachments) {
    const sourceText = `${row.name}\n${row.extracted_text ?? ""}`.slice(
      0,
      5000
    );
    const foundEmails = pickExternalEmailCandidates(
      extractEmailAddresses(sourceText)
    );
    const foundPhones = extractPhoneNumbers(sourceText);

    if (foundEmails.length === 1 && foundPhones[0]) {
      addCandidateEvidence(map, {
        attachmentId: row.id,
        confidence: 0.7,
        email: foundEmails[0],
        emailId: row.email_id,
        phone: foundPhones[0],
        source: "attachment_text",
      });
      continue;
    }

    for (const email of foundEmails) {
      addCandidateEvidence(map, {
        attachmentId: row.id,
        confidence: 0.6,
        email,
        emailId: row.email_id,
        source: "attachment_text",
      });
    }
  }

  return map;
}

function buildContactMatchMaps(
  rows: ContactRow[],
  accountId: number | null
): {
  byEmail: Map<string, ContactMatch>;
  byName: Map<string, ContactMatch>;
} {
  const byEmail = new Map<string, ContactMatch>();
  const byName = new Map<string, ContactMatch>();

  for (const row of rows) {
    const match: ContactMatch = {
      contactAccountId: row.account_id,
      contactEmail: normalizeEmailAddress(row.email),
      contactId: row.id,
      contactName: row.name,
    };

    if (match.contactEmail && !byEmail.has(match.contactEmail)) {
      byEmail.set(match.contactEmail, match);
    }

    const normalizedName = normalizeName(row.name)?.toLowerCase();
    if (!normalizedName) {
      continue;
    }

    const existing = byName.get(normalizedName);
    if (!existing) {
      byName.set(normalizedName, match);
      continue;
    }

    const currentAccountMatch =
      typeof accountId === "number" && existing.contactAccountId === accountId;
    const incomingAccountMatch =
      typeof accountId === "number" && row.account_id === accountId;

    if (!currentAccountMatch && incomingAccountMatch) {
      byName.set(normalizedName, match);
    }
  }

  return { byEmail, byName };
}

async function runSparkExtraction(
  project: ProjectRow,
  deterministicCandidates: ProjectContactCandidate[],
  emails: EmailRow[],
  documents: DocumentRow[],
  attachments: AttachmentRow[],
  options: ResolveProjectContactsOptions
): Promise<{
  records: SparkContactRecord[];
  error: string | null;
}> {
  if (options.skipLlm) {
    return { error: null, records: [] };
  }

  const model = (options.model ?? EMAIL_RESOLVER_SPARK_MODEL).trim();
  const baseTimeoutMs = options.timeoutMs ?? 180_000;
  const retryTimeoutMs = Math.max(baseTimeoutMs, 300_000);
  const prompt = buildSparkPrompt({
    attachments,
    deterministicCandidates,
    documents,
    emails,
    project,
  });

  try {
    const parsed = await runOpencodeJsonPrompt(prompt, {
      model,
      timeoutMs: baseTimeoutMs,
    });

    const contactsRaw = parsed?.contacts;
    return {
      error: null,
      records: parseSparkContactRecords(contactsRaw),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryableTimeout =
      /timed out/i.test(message) && retryTimeoutMs > baseTimeoutMs;

    if (!retryableTimeout) {
      return { error: message, records: [] };
    }

    try {
      const parsed = await runOpencodeJsonPrompt(prompt, {
        model,
        timeoutMs: retryTimeoutMs,
      });
      const contactsRaw = parsed?.contacts;
      return {
        error: null,
        records: parseSparkContactRecords(contactsRaw),
      };
    } catch (retryError) {
      const retryMessage =
        retryError instanceof Error ? retryError.message : String(retryError);
      return { error: retryMessage, records: [] };
    }
  }
}

function sortCandidates(
  candidates: ProjectContactCandidate[]
): ProjectContactCandidate[] {
  return [...candidates].toSorted((lhs, rhs) => {
    if (rhs.confidence !== lhs.confidence) {
      return rhs.confidence - lhs.confidence;
    }

    const lhsEvidence =
      lhs.evidenceEmailIds.length +
      lhs.evidenceDocumentIds.length +
      lhs.evidenceAttachmentIds.length;
    const rhsEvidence =
      rhs.evidenceEmailIds.length +
      rhs.evidenceDocumentIds.length +
      rhs.evidenceAttachmentIds.length;
    if (rhsEvidence !== lhsEvidence) {
      return rhsEvidence - lhsEvidence;
    }

    return (lhs.email ?? lhs.name ?? lhs.key).localeCompare(
      rhs.email ?? rhs.name ?? rhs.key
    );
  });
}

export async function resolveProjectContacts(
  projectId: number,
  options: ResolveProjectContactsOptions = {}
): Promise<ProjectContactResolutionResult> {
  const project = await fetchProject(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const limitEmails = Math.max(1, options.limitEmails ?? 250);
  const limitDocuments = Math.max(1, options.limitDocuments ?? 140);
  const limitAttachments = Math.max(1, options.limitAttachments ?? 180);
  const createThreshold = clampConfidence(
    options.createThreshold ?? DEFAULT_CREATE_THRESHOLD
  );
  const requireLlm = options.requireLlm ?? true;

  if (requireLlm && options.skipLlm) {
    throw new Error(
      "project-contact-resolver requires Spark/LLM; skipLlm is disabled"
    );
  }

  const [
    projectEstimates,
    coverage,
    linkedEstimateContactIds,
    emails,
    documents,
    attachments,
  ] = await Promise.all([
    fetchProjectEstimates(projectId),
    fetchCoverage(projectId),
    fetchLinkedEstimateContactIds(projectId),
    fetchEmails(projectId, limitEmails),
    fetchDocuments(projectId, limitDocuments),
    fetchAttachments(projectId, limitAttachments),
  ]);

  const candidateMap = collectDeterministicCandidates(
    emails,
    documents,
    attachments
  );
  const deterministicCandidates = sortCandidates(
    [...candidateMap.values()].map(finalizeCandidate)
  );

  const spark = await runSparkExtraction(
    project,
    deterministicCandidates,
    emails,
    documents,
    attachments,
    options
  );

  if (requireLlm && spark.error) {
    throw new Error(
      `project-contact-resolver Spark extraction failed: ${spark.error}`
    );
  }

  for (const record of spark.records) {
    addCandidateEvidence(candidateMap, {
      company: record.company,
      confidence: Math.max(0.55, record.confidence),
      email: record.email,
      name: record.name,
      note: record.reason,
      phone: record.phone,
      source: "spark",
      title: record.title,
    });

    const key = candidateKeyOf(record.email, record.name, record.phone);
    if (!key) {
      continue;
    }

    const candidate = candidateMap.get(key);
    if (!candidate) {
      continue;
    }

    for (const emailId of record.evidenceEmailIds) {
      candidate.evidenceEmailIds.add(emailId);
    }
    for (const documentId of record.evidenceDocumentIds) {
      candidate.evidenceDocumentIds.add(documentId);
    }
    for (const attachmentId of record.evidenceAttachmentIds) {
      candidate.evidenceAttachmentIds.add(attachmentId);
    }
  }

  const candidates = sortCandidates(
    [...candidateMap.values()].map(finalizeCandidate)
  );

  const candidateEmails = [
    ...new Set(
      candidates
        .map((row) => normalizeEmailAddress(row.email))
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const candidateNames = [
    ...new Set(
      candidates
        .map((row) => normalizeName(row.name)?.toLowerCase())
        .filter((value): value is string => Boolean(value))
    ),
  ];

  const [contactsByEmail, contactsByName] = await Promise.all([
    fetchContactsByEmails(candidateEmails),
    fetchContactsByNames(candidateNames, project.account_id),
  ]);

  const contactMaps = buildContactMatchMaps(
    [...contactsByEmail, ...contactsByName],
    project.account_id
  );

  const targetEstimateId = selectTargetEstimateId(projectEstimates);
  const proposals: ProjectContactProposal[] = [];

  for (const candidate of candidates) {
    if (requireLlm && !candidate.sources.includes("spark")) {
      proposals.push({
        action: "skip_low_confidence",
        candidate,
        confidence: candidate.confidence,
        contactEmail: null,
        contactId: null,
        contactName: null,
        reason: "no_spark_evidence",
      });
      continue;
    }

    const hasLinkTarget =
      typeof targetEstimateId === "number" ||
      candidate.evidenceEmailIds.length > 0;
    if (!hasLinkTarget) {
      proposals.push({
        action: "skip_low_confidence",
        candidate,
        confidence: candidate.confidence,
        contactEmail: null,
        contactId: null,
        contactName: null,
        reason: "no_link_target",
      });
      continue;
    }

    const candidateEmail = normalizeEmailAddress(candidate.email);
    const candidateName = normalizeName(candidate.name)?.toLowerCase() ?? null;

    const emailMatch = candidateEmail
      ? contactMaps.byEmail.get(candidateEmail)
      : undefined;
    const nameMatch =
      !emailMatch && candidateName
        ? contactMaps.byName.get(candidateName)
        : undefined;
    const match = emailMatch ?? nameMatch;

    if (match) {
      if (linkedEstimateContactIds.has(match.contactId)) {
        proposals.push({
          action: "already_linked",
          candidate,
          confidence: candidate.confidence,
          contactEmail: match.contactEmail,
          contactId: match.contactId,
          contactName: match.contactName,
          reason: "already_linked_to_project_estimate",
        });
        continue;
      }

      proposals.push({
        action: "link_existing_contact",
        candidate,
        confidence: candidate.confidence,
        contactEmail: match.contactEmail,
        contactId: match.contactId,
        contactName: match.contactName,
        reason: emailMatch ? "matched_by_email" : "matched_by_name",
      });
      continue;
    }

    if (
      candidate.confidence >= createThreshold &&
      (candidate.email || candidate.name)
    ) {
      proposals.push({
        action: "create_contact",
        candidate,
        confidence: candidate.confidence,
        contactEmail: null,
        contactId: null,
        contactName: null,
        reason: "no_existing_contact_match",
      });
      continue;
    }

    proposals.push({
      action: "skip_low_confidence",
      candidate,
      confidence: candidate.confidence,
      contactEmail: null,
      contactId: null,
      contactName: null,
      reason: "insufficient_confidence_or_identity",
    });
  }

  return {
    candidates,
    existingCoverage: {
      estimateContacts: coverage.estimate_contact_count,
      emailContacts: coverage.email_contact_count,
    },
    llm: {
      attempted: !options.skipLlm,
      succeeded: !options.skipLlm && spark.error === null,
      error: spark.error,
      contactsReturned: spark.records.length,
      model: options.model ?? EMAIL_RESOLVER_SPARK_MODEL,
    },
    project: {
      id: project.id,
      name: project.name,
      lifecycleState: project.lifecycle_state,
      accountId: project.account_id,
    },
    proposals,
    targetEstimateId,
  };
}

async function upsertLocalContact(
  project: ProjectContactResolutionResult["project"],
  candidate: ProjectContactCandidate
): Promise<{ id: number; created: boolean }> {
  const mondayItemId = buildLocalMondayItemId(project.id, candidate);
  const existing = (await db
    .query<{ id: number }, [string]>(
      `SELECT id
       FROM contacts
       WHERE monday_item_id = ?`
    )
    .get(mondayItemId)) as { id: number } | null;

  const fallbackName = "Project Contact";
  const name =
    normalizeName(candidate.name) ??
    deriveNameFromEmail(candidate.email, fallbackName) ??
    fallbackName;

  const rows = (await db
    .query<
      { id: number },
      [
        string,
        string,
        string | null,
        string | null,
        string | null,
        number | null,
        string | null,
      ]
    >(
      `INSERT INTO contacts (
         monday_item_id,
         name,
         email,
         phone,
         title,
         account_id,
         imported_account_name,
         synced_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, now(), now())
       ON CONFLICT (monday_item_id) DO UPDATE SET
         name = EXCLUDED.name,
         email = COALESCE(EXCLUDED.email, contacts.email),
         phone = COALESCE(EXCLUDED.phone, contacts.phone),
         title = COALESCE(EXCLUDED.title, contacts.title),
         account_id = COALESCE(contacts.account_id, EXCLUDED.account_id),
         imported_account_name = COALESCE(EXCLUDED.imported_account_name, contacts.imported_account_name),
         synced_at = now(),
         updated_at = now()
       RETURNING id`
    )
    .all(
      mondayItemId,
      name,
      normalizeEmailAddress(candidate.email),
      normalizePhone(candidate.phone),
      normalizeName(candidate.title),
      project.accountId,
      normalizeName(candidate.company)
    )) as { id: number }[];

  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to upsert local contact");
  }

  return { created: !existing, id };
}

async function attachAccountIfMissing(
  contactId: number,
  accountId: number | null
): Promise<boolean> {
  if (typeof accountId !== "number") {
    return false;
  }

  const rows = (await db
    .query<{ id: number }, [number, number]>(
      `UPDATE contacts
       SET account_id = ?,
           updated_at = now()
       WHERE id = ?
         AND account_id IS NULL
       RETURNING id`
    )
    .all(accountId, contactId)) as { id: number }[];

  return rows.length > 0;
}

async function insertEstimateContactLink(
  estimateId: number | null,
  contactId: number
): Promise<boolean> {
  if (typeof estimateId !== "number") {
    return false;
  }

  const rows = (await db
    .query<{ estimate_id: number }, [number, number, string]>(
      `INSERT INTO estimate_contacts (estimate_id, contact_id, source)
       VALUES (?, ?, ?)
       ON CONFLICT (estimate_id, contact_id) DO NOTHING
       RETURNING estimate_id`
    )
    .all(estimateId, contactId, "project_contact_resolver")) as {
    estimate_id: number;
  }[];

  return rows.length > 0;
}

async function insertContactEmailLink(
  contactId: number,
  emailId: number
): Promise<boolean> {
  const rows = (await db
    .query<{ id: number }, [number, number, string]>(
      `INSERT INTO contact_emails (contact_id, email_id, relationship)
       VALUES (?, ?, ?)
       ON CONFLICT (contact_id, email_id, relationship) DO NOTHING
       RETURNING id`
    )
    .all(contactId, emailId, "project_contact_resolver")) as { id: number }[];

  return rows.length > 0;
}

async function attachProjectAccountToEstimates(
  projectId: number,
  accountId: number | null
): Promise<number> {
  if (typeof accountId !== "number") {
    return 0;
  }

  const rows = (await db
    .query<{ id: number }, [number, number]>(
      `UPDATE estimates e
       SET account_id = ?
       FROM project_estimates pe
       WHERE pe.project_id = ?
         AND pe.estimate_id = e.id
         AND e.account_id IS NULL
       RETURNING e.id`
    )
    .all(accountId, projectId)) as { id: number }[];

  return rows.length;
}

export async function applyProjectContactResolution(
  result: ProjectContactResolutionResult
): Promise<ApplyProjectContactResolutionResult> {
  const summary: ApplyProjectContactResolutionResult = {
    contactsAccountAttached: 0,
    contactsCreated: 0,
    emailLinksInserted: 0,
    estimateLinksInserted: 0,
    estimatesAccountAttached: 0,
  };

  for (const proposal of result.proposals) {
    if (proposal.action === "skip_low_confidence") {
      continue;
    }

    const hasLinkTarget =
      typeof result.targetEstimateId === "number" ||
      proposal.candidate.evidenceEmailIds.length > 0;
    if (!hasLinkTarget) {
      continue;
    }

    let { contactId } = proposal;

    if (proposal.action === "create_contact") {
      const upsert = await upsertLocalContact(
        result.project,
        proposal.candidate
      );
      contactId = upsert.id;
      if (upsert.created) {
        summary.contactsCreated += 1;
      }
    }

    if (typeof contactId !== "number") {
      continue;
    }

    const linked = await insertEstimateContactLink(
      result.targetEstimateId,
      contactId
    );
    if (linked) {
      summary.estimateLinksInserted += 1;
    }

    const accountAttached = await attachAccountIfMissing(
      contactId,
      result.project.accountId
    );
    if (accountAttached) {
      summary.contactsAccountAttached += 1;
    }

    const emailIds = proposal.candidate.evidenceEmailIds;
    for (const emailId of emailIds) {
      const inserted = await insertContactEmailLink(contactId, emailId);
      if (inserted) {
        summary.emailLinksInserted += 1;
      }
    }
  }

  summary.estimatesAccountAttached = await attachProjectAccountToEstimates(
    result.project.id,
    result.project.accountId
  );

  return summary;
}
