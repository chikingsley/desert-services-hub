/**
 * Unified Email Triage — Context Assembly
 *
 * Gathers ALL available context for an email: the email itself, conversation
 * thread, extracted documents, attachment text, and candidate projects/estimates.
 * This assembled context is what gets passed to the LLM.
 */

import { db } from "@lib/db/client";
import { getEmailById } from "@lib/db/repositories/email";
import { findEstimateCandidatesForEmail } from "@lib/db/repositories/estimate-email-matching";
import { findProjectCandidatesFts } from "@lib/db/repositories/project-matching-fts";
import type {
  AttachmentRow,
  DocumentRow,
  ThreadEmailRow,
  TriageAttachment,
  TriageContext,
  TriageDocument,
  TriageEmailContext,
  TriageEstimateCandidate,
  TriageProjectCandidate,
  TriageThreadEmail,
} from "./types";

// ── Limits ──────────────────────────────────────────────────

const MAX_BODY_CHARS = 8000;
const MAX_THREAD_EMAILS = 5;
const MAX_THREAD_PREVIEW_CHARS = 1000;
const MAX_DOCUMENTS = 3;
const MAX_DOCUMENT_SUMMARY_CHARS = 1000;
const MAX_DOCUMENT_FIELD_CHARS = 500;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_TEXT_CHARS = 2000;
const MAX_PROJECT_CANDIDATES = 5;
const MAX_ESTIMATE_CANDIDATES = 5;
const MAX_PROJECT_PRIMARY_TEXT_CHARS = 400;
const MAX_PROJECT_BODY_HINT_CHARS = 2000;
const MAX_PROJECT_HINT_CHARS = 220;
const MAX_PROJECT_ALIAS_HINTS = 12;
const MAX_PROJECT_ADDRESS_HINT_CHARS = 300;
const FILE_EXTENSION_RE = /\.[^.]+$/;

// ── Main ────────────────────────────────────────────────────

export async function gatherTriageContext(
  emailId: number,
  mailboxEmail: string
): Promise<TriageContext | null> {
  const email = await getEmailById(emailId);
  if (!email) {
    return null;
  }

  const emailCtx: TriageEmailContext = {
    id: email.id,
    subject: email.subject,
    body: truncate(email.bodyFull, MAX_BODY_CHARS),
    from: formatSender(email.fromName, email.fromEmail),
    fromDomain: email.fromDomain,
    to: email.toEmails,
    cc: email.ccEmails,
    mailbox: mailboxEmail,
    receivedAt: email.receivedAt,
    attachmentNames: email.attachmentNames,
    isForwarded: email.isForwarded,
    originalSender: email.originalSenderEmail,
    isPlatformEmail: email.isPlatformEmail,
    platformName: email.platformName,
    categories: email.categories,
    existingClassification: email.classification,
    existingProjectId: email.projectId,
  };

  // Fetch broad context first, then derive the strongest project matching hints.
  const [thread, documents, attachments, estimateResult] = await Promise.all([
    fetchThreadEmails(email.conversationId, email.id),
    fetchDocuments(email.conversationId, email.projectId),
    fetchAttachments(email.conversationId),
    gatherEstimateCandidates(emailId),
  ]);
  const accountIdHint = await resolveAccountIdHint(
    email.accountId,
    email.projectId,
    estimateResult
  );
  const projectResult = await gatherProjectCandidates({
    accountId: accountIdHint,
    attachmentNames: email.attachmentNames,
    attachments,
    body: email.bodyFull,
    documents,
    estimateCandidates: estimateResult,
    fromDomain: email.fromDomain,
    subject: email.subject,
    thread,
  });

  return {
    email: emailCtx,
    thread,
    documents,
    attachments,
    candidates: {
      projects: projectResult,
      estimates: estimateResult,
    },
  };
}

// ── Thread Emails ───────────────────────────────────────────

async function fetchThreadEmails(
  conversationId: string | null,
  currentEmailId: number
): Promise<TriageThreadEmail[]> {
  if (!conversationId) {
    return [];
  }

  const rows = await db
    .query<ThreadEmailRow>(
      `SELECT from_email, from_name, subject, body_preview, received_at,
              project_id, classification
       FROM emails
       WHERE conversation_id = $1 AND id != $2
       ORDER BY received_at ASC
       LIMIT $3`
    )
    .all(conversationId, currentEmailId, MAX_THREAD_EMAILS);

  return rows.map((row) => ({
    from: formatSender(row.from_name, row.from_email),
    subject: row.subject,
    bodyPreview: truncate(row.body_preview, MAX_THREAD_PREVIEW_CHARS),
    receivedAt: row.received_at,
    projectId: row.project_id,
    classification: row.classification as TriageThreadEmail["classification"],
  }));
}

// ── Documents ───────────────────────────────────────────────

async function fetchDocuments(
  conversationId: string | null,
  projectId: number | null
): Promise<TriageDocument[]> {
  if (!(conversationId || projectId)) {
    return [];
  }

  const whereParts: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (conversationId) {
    whereParts.push(
      `d.email_id IN (SELECT id FROM emails WHERE conversation_id = $${paramIdx})`
    );
    params.push(conversationId);
    paramIdx++;
  }

  if (projectId) {
    whereParts.push(`d.project_id = $${paramIdx}`);
    params.push(projectId);
    paramIdx++;
  }

  const rows = await db
    .query<DocumentRow>(
      `SELECT d.document_type, d.summary, d.file_name, d.raw_extraction
       FROM documents d
       WHERE d.extraction_status = 'success'
         AND (${whereParts.join(" OR ")})
       ORDER BY d.created_at DESC
       LIMIT $${paramIdx}`
    )
    .all(...params, MAX_DOCUMENTS);

  return rows.map((row) => ({
    documentType: row.document_type,
    summary: truncate(row.summary, MAX_DOCUMENT_SUMMARY_CHARS),
    fileName: row.file_name,
    keyFields: extractKeyFields(row.raw_extraction),
  }));
}

function extractKeyFields(
  rawExtraction: string | null
): Record<string, unknown> {
  if (!rawExtraction) {
    return {};
  }
  try {
    const parsed = JSON.parse(rawExtraction);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    // Include top-level string/number fields only (skip nested objects to save tokens)
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        result[key] = truncate(value, MAX_DOCUMENT_FIELD_CHARS);
      } else if (typeof value === "number") {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

// ── Attachments ─────────────────────────────────────────────

async function fetchAttachments(
  conversationId: string | null
): Promise<TriageAttachment[]> {
  if (!conversationId) {
    return [];
  }

  const rows = await db
    .query<AttachmentRow>(
      `SELECT d.file_name AS name, d.content_type, d.extracted_text
       FROM documents d
       JOIN emails e ON d.email_id = e.id
       WHERE e.conversation_id = $1
         AND d.source = 'email_attachment'
         AND d.extraction_status = 'success'
         AND d.extracted_text IS NOT NULL
         AND length(d.extracted_text) > 0
       ORDER BY d.created_at DESC
       LIMIT $2`
    )
    .all(conversationId, MAX_ATTACHMENTS);

  return rows.map((row) => ({
    name: row.name,
    contentType: row.content_type,
    extractedText:
      truncate(row.extracted_text, MAX_ATTACHMENT_TEXT_CHARS) ?? "",
  }));
}

// ── Project Candidates ──────────────────────────────────────

interface ProjectCandidateHintInput {
  accountId: number | null;
  attachmentNames: string[];
  attachments: TriageAttachment[];
  body: string | null;
  documents: TriageDocument[];
  estimateCandidates: TriageEstimateCandidate[];
  fromDomain: string | null;
  subject: string | null;
  thread: TriageThreadEmail[];
}

async function gatherProjectCandidates(
  input: ProjectCandidateHintInput
): Promise<TriageProjectCandidate[]> {
  const primaryText = pickProjectPrimaryText(input.subject, input.body);
  if (!primaryText) {
    return [];
  }

  const aliasHints = collectProjectAliasHints(input);
  const addressHint = collectProjectAddressHint(input);

  const result = await findProjectCandidatesFts({
    accountIdHint: input.accountId,
    addressHint,
    aliasHints,
    contractorHint: input.fromDomain,
    primaryText,
    limit: MAX_PROJECT_CANDIDATES,
  });

  if (!result) {
    return [];
  }

  return result.candidates.map((candidate) => ({
    id: candidate.projectId,
    name: candidate.name,
    contractor: candidate.contractor,
    address: candidate.address,
    lifecycleState: "active", // project-matching doesn't return lifecycle, default
    score: candidate.score,
  }));
}

// ── Estimate Candidates ─────────────────────────────────────

interface EstimateProjectRow {
  estimate_id: number;
  project_count: number;
  project_id: number | null;
}

interface ProjectAccountRow {
  account_id: number | null;
}

async function gatherEstimateCandidates(
  emailId: number
): Promise<TriageEstimateCandidate[]> {
  const result = await findEstimateCandidatesForEmail(emailId, {
    limit: MAX_ESTIMATE_CANDIDATES,
  });

  if (!result) {
    return [];
  }

  const estimateIds = result.candidates.map(
    (candidate) => candidate.estimateId
  );
  const projectMap = await fetchEstimateProjectMap(estimateIds);

  return result.candidates.map((candidate) => ({
    id: candidate.estimateId,
    estimateNumber: candidate.estimateNumber,
    jobName: candidate.name ?? candidate.jobName ?? "",
    contractor: candidate.contractor,
    jobAddress: candidate.jobAddress,
    projectId: projectMap.get(candidate.estimateId) ?? null,
    score: candidate.score,
  }));
}

// ── Helpers ─────────────────────────────────────────────────

function truncate(
  text: string | null | undefined,
  maxChars: number
): string | null {
  if (!text) {
    return null;
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}…`;
}

function truncateForHint(
  text: string | null | undefined,
  maxChars: number
): string | null {
  return truncate(text, maxChars);
}

function pushHint(hints: string[], value: string | null | undefined): void {
  const trimmed = truncateForHint(value?.trim(), MAX_PROJECT_HINT_CHARS);
  if (trimmed) {
    hints.push(trimmed);
  }
}

function uniqueHints(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(value);
    if (deduped.length >= limit) {
      break;
    }
  }
  return deduped;
}

function stripFileExtension(name: string): string {
  return name.replace(FILE_EXTENSION_RE, "").trim();
}

function pickProjectPrimaryText(
  subject: string | null,
  body: string | null
): string | null {
  const primarySubject = truncateForHint(
    subject?.trim(),
    MAX_PROJECT_PRIMARY_TEXT_CHARS
  );
  if (primarySubject) {
    return primarySubject;
  }
  return truncateForHint(body?.trim(), MAX_PROJECT_PRIMARY_TEXT_CHARS);
}

function keyLooksLikeAddressHint(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.includes("address") ||
    lower.includes("location") ||
    lower.includes("site")
  );
}

function keyLooksLikeProjectHint(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.includes("project") ||
    lower.includes("job") ||
    lower.includes("site") ||
    lower.includes("name")
  );
}

function collectProjectAliasHints(input: ProjectCandidateHintInput): string[] {
  const hints: string[] = [];

  pushHint(hints, input.subject);
  pushHint(
    hints,
    truncateForHint(input.body?.trim(), MAX_PROJECT_BODY_HINT_CHARS)
  );

  for (const threadEmail of input.thread) {
    pushHint(hints, threadEmail.subject);
  }

  for (const name of input.attachmentNames) {
    pushHint(hints, stripFileExtension(name));
  }
  for (const attachment of input.attachments) {
    pushHint(hints, stripFileExtension(attachment.name));
  }

  for (const document of input.documents) {
    pushHint(hints, document.summary);
    pushHint(hints, document.fileName);
    for (const [key, value] of Object.entries(document.keyFields)) {
      if (!(typeof value === "string" && keyLooksLikeProjectHint(key))) {
        continue;
      }
      pushHint(hints, value);
    }
  }

  for (const estimate of input.estimateCandidates) {
    pushHint(hints, estimate.jobName);
  }

  return uniqueHints(hints, MAX_PROJECT_ALIAS_HINTS);
}

function collectProjectAddressHint(
  input: ProjectCandidateHintInput
): string | null {
  const hints: string[] = [];

  for (const document of input.documents) {
    for (const [key, value] of Object.entries(document.keyFields)) {
      if (!(typeof value === "string" && keyLooksLikeAddressHint(key))) {
        continue;
      }
      pushHint(hints, value);
    }
  }

  for (const estimate of input.estimateCandidates) {
    pushHint(hints, estimate.jobAddress);
  }

  const first = uniqueHints(hints, 1)[0];
  return truncateForHint(first, MAX_PROJECT_ADDRESS_HINT_CHARS);
}

async function fetchEstimateProjectMap(
  estimateIds: number[]
): Promise<Map<number, number | null>> {
  const uniqueIds = [...new Set(estimateIds)].filter(
    (id) => Number.isInteger(id) && id > 0
  );
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const placeholders = uniqueIds.map((_, idx) => `$${idx + 1}`).join(", ");
  const rows = await db
    .query<EstimateProjectRow>(
      `SELECT estimate_id,
              MIN(project_id) AS project_id,
              COUNT(DISTINCT project_id)::int AS project_count
       FROM project_estimates
       WHERE estimate_id IN (${placeholders})
       GROUP BY estimate_id`
    )
    .all(...uniqueIds);

  const map = new Map<number, number | null>();
  for (const row of rows) {
    map.set(
      row.estimate_id,
      row.project_count === 1 ? (row.project_id ?? null) : null
    );
  }
  return map;
}

async function resolveAccountIdHint(
  accountId: number | null,
  projectId: number | null,
  estimateCandidates: TriageEstimateCandidate[]
): Promise<number | null> {
  if (typeof accountId === "number" && accountId > 0) {
    return accountId;
  }

  if (typeof projectId === "number" && projectId > 0) {
    const row = await db
      .query<ProjectAccountRow>(
        "SELECT account_id FROM projects WHERE id = $1 LIMIT 1"
      )
      .get(projectId);
    if (typeof row?.account_id === "number" && row.account_id > 0) {
      return row.account_id;
    }
  }

  const estimateIds = estimateCandidates
    .map((candidate) => candidate.id)
    .filter((id) => Number.isInteger(id) && id > 0);
  const uniqueEstimateIds = [...new Set(estimateIds)];
  if (uniqueEstimateIds.length === 0) {
    return null;
  }

  const placeholders = uniqueEstimateIds
    .map((_, idx) => `$${idx + 1}`)
    .join(", ");
  const rows = await db
    .query<ProjectAccountRow>(
      `SELECT DISTINCT account_id
       FROM estimates
       WHERE id IN (${placeholders})
         AND account_id IS NOT NULL
         AND account_id > 0`
    )
    .all(...uniqueEstimateIds);

  const accountIds = rows
    .map((row) => row.account_id)
    .filter((id): id is number => typeof id === "number" && id > 0);
  return accountIds.length === 1 ? accountIds[0] : null;
}

function formatSender(
  name: string | null,
  email: string | null
): string | null {
  if (name && email) {
    return `${name} <${email}>`;
  }
  return email ?? name ?? null;
}
