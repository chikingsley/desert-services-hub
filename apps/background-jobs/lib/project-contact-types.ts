/**
 * Project Contact Resolver — Types, Constants & Utility Functions
 *
 * Shared types, regex constants, normalization utilities, and candidate
 * accumulation helpers used across the project-contact-resolver modules.
 */

// ============================================================================
// Constants
// ============================================================================

export const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
export const PHONE_RE =
  /(?:\+?1[\s().-]*)?(?:\(?\d{3}\)?[\s().-]*)\d{3}[\s().-]*\d{4}/g;
export const INTERNAL_DOMAIN_SUFFIXES = ["desertservices.net"];
export const DEFAULT_CREATE_THRESHOLD = 0.72;
const LOCAL_PART_SPLIT_RE = /[._-]+/;
const ANGLE_BRACKETS_RE = /[<>]/g;
const LIST_DELIM_RE = /[;,]/;

// ============================================================================
// Row Types (DB query results)
// ============================================================================

export interface ProjectRow {
  id: number;
  name: string;
  lifecycle_state: string | null;
  account_id: number | null;
}

export interface ProjectEstimateRow {
  estimate_id: number;
  is_canonical: boolean;
}

export interface EmailRow {
  id: number;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  to_emails: string | null;
  cc_emails: string | null;
  body_preview: string | null;
  body_full: string | null;
}

export interface DocumentRow {
  id: number;
  document_type: string;
  summary: string | null;
  file_name: string | null;
}

export interface AttachmentRow {
  id: number;
  email_id: number;
  name: string;
  extracted_text: string | null;
}

export interface ContactRow {
  id: number;
  monday_item_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  account_id: number | null;
}

export interface CoverageRow {
  estimate_contact_count: number;
  email_contact_count: number;
}

// ============================================================================
// Candidate & Proposal Types
// ============================================================================

export interface CandidateAccumulator {
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

export interface LlmContactRecord {
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

export interface ContactMatch {
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

// ============================================================================
// Normalization Utilities
// ============================================================================

export function clampConfidence(value: number): number {
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

export function normalizeWhitespace(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

export function normalizePhone(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }
  const digits = value.replaceAll(/\D/g, "");
  if (digits.length < 10) {
    return null;
  }
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function titleCaseFromLocalPart(localPart: string): string {
  return localPart
    .split(LOCAL_PART_SPLIT_RE)
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
  const trimmed = value.trim().replaceAll(ANGLE_BRACKETS_RE, "").toLowerCase();
  if (!trimmed?.includes("@")) {
    return null;
  }
  return trimmed;
}

export function isInternalEmail(email: string): boolean {
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
    .split(LIST_DELIM_RE)
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

export function normalizeName(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = normalizeWhitespace(value.replaceAll(/[<>]/g, ""));
  return normalized.length > 0 ? normalized : null;
}

// ============================================================================
// Candidate Accumulation Helpers
// ============================================================================

export function candidateKeyOf(
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

export function getOrCreateCandidate(
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

export function addCandidateEvidence(
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

export function finalizeCandidate(
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
