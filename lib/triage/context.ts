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
import { findProjectCandidates } from "@lib/db/repositories/project-matching";
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

  // Fetch thread, documents, attachments, and candidates concurrently
  const [thread, documents, attachments, projectResult, estimateResult] =
    await Promise.all([
      fetchThreadEmails(email.conversationId, email.id),
      fetchDocuments(email.conversationId, email.projectId),
      fetchAttachments(email.conversationId),
      gatherProjectCandidates(email.subject, email.fromDomain, email.accountId),
      gatherEstimateCandidates(emailId),
    ]);

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

async function gatherProjectCandidates(
  subject: string | null,
  fromDomain: string | null,
  accountId: number | null
): Promise<TriageProjectCandidate[]> {
  const primaryText = subject ?? "";
  if (!primaryText.trim()) {
    return [];
  }

  const result = await findProjectCandidates({
    primaryText,
    contractorHint: fromDomain,
    accountIdHint: accountId,
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

async function gatherEstimateCandidates(
  emailId: number
): Promise<TriageEstimateCandidate[]> {
  const result = await findEstimateCandidatesForEmail(emailId, {
    limit: MAX_ESTIMATE_CANDIDATES,
  });

  if (!result) {
    return [];
  }

  return result.candidates.map((candidate) => ({
    id: candidate.estimateId,
    estimateNumber: candidate.estimateNumber,
    jobName: candidate.name ?? candidate.jobName ?? "",
    contractor: candidate.contractor,
    jobAddress: candidate.jobAddress,
    projectId: null, // not returned by matching, available via join if needed
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

function formatSender(
  name: string | null,
  email: string | null
): string | null {
  if (name && email) {
    return `${name} <${email}>`;
  }
  return email ?? name ?? null;
}
