/**
 * Project Contact Resolver — Data Layer
 *
 * LLM parsing/prompt building, database fetch functions,
 * and deterministic candidate collection from emails/documents/attachments.
 */

import { runGeminiJsonPrompt } from "@email/llm/json-runner";
import { db } from "@lib/db/hub";
import type {
  AttachmentRow,
  CoverageRow,
  DocumentRow,
  EmailRow,
  LlmContactRecord,
  ProjectContactCandidate,
  ProjectEstimateRow,
  ProjectRow,
  ResolveProjectContactsOptions,
} from "./types";
import {
  clampConfidence,
  normalizeEmailAddress,
  normalizeName,
  normalizePhone,
  normalizeWhitespace,
} from "./types";

const GEMINI_FAST_MODEL = (
  process.env.GEMINI_FAST_MODEL ?? "gemini-2.5-flash-lite"
).trim();

// ============================================================================
// LLM Contact Parsing
// ============================================================================

function parsePositiveIntIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function parseOneLlmRecord(entry: unknown): LlmContactRecord | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const email = normalizeEmailAddress(
    typeof record.email === "string" ? record.email : null
  );
  const name = normalizeName(
    typeof record.name === "string" ? record.name : null
  );

  if (!(email || name)) {
    return null;
  }

  return {
    company: normalizeName(
      typeof record.company === "string" ? record.company : null
    ),
    confidence: clampConfidence(
      typeof record.confidence === "number" ? record.confidence : 0
    ),
    email,
    evidenceAttachmentIds: parsePositiveIntIds(record.evidenceAttachmentIds),
    evidenceDocumentIds: parsePositiveIntIds(record.evidenceDocumentIds),
    evidenceEmailIds: parsePositiveIntIds(record.evidenceEmailIds),
    name,
    phone: normalizePhone(
      typeof record.phone === "string" ? record.phone : null
    ),
    reason:
      typeof record.reason === "string"
        ? normalizeWhitespace(record.reason)
        : "",
    title: normalizeName(
      typeof record.title === "string" ? record.title : null
    ),
  };
}

export function parseLlmContactRecords(raw: unknown): LlmContactRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const out: LlmContactRecord[] = [];
  for (const entry of raw) {
    const parsed = parseOneLlmRecord(entry);
    if (parsed) {
      out.push(parsed);
    }
  }

  return out;
}

// ============================================================================
// LLM Contact Prompt Builder
// ============================================================================

export function buildContactPrompt(payload: {
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

// ============================================================================
// Database Fetch Functions
// ============================================================================

export async function fetchProject(
  projectId: number
): Promise<ProjectRow | null> {
  return (await db
    .query<ProjectRow, [number]>(
      `SELECT id, name, lifecycle_state, account_id
       FROM projects
       WHERE id = ?`
    )
    .get(projectId)) as ProjectRow | null;
}

export async function fetchProjectEstimates(
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

export async function fetchCoverage(projectId: number): Promise<CoverageRow> {
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

export async function fetchLinkedEstimateContactIds(
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

export async function fetchEmails(
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

export async function fetchDocuments(
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

export async function fetchAttachments(
  projectId: number,
  limit: number
): Promise<AttachmentRow[]> {
  return (await db
    .query<AttachmentRow, [number, number]>(
      `SELECT d.id,
              d.email_id,
              d.file_name AS name,
              d.extracted_text
       FROM documents d
       JOIN emails e ON e.id = d.email_id
       WHERE e.project_id = ?
         AND d.source = 'email_attachment'
         AND d.extraction_status = 'success'
         AND COALESCE(length(d.extracted_text), 0) > 0
       ORDER BY d.extracted_at DESC NULLS LAST, d.id DESC
       LIMIT ?`
    )
    .all(projectId, limit)) as AttachmentRow[];
}

// ============================================================================
// LLM Contact Extraction Runner
// ============================================================================

export async function runLlmExtraction(
  project: ProjectRow,
  deterministicCandidates: ProjectContactCandidate[],
  emails: EmailRow[],
  documents: DocumentRow[],
  attachments: AttachmentRow[],
  options: ResolveProjectContactsOptions
): Promise<{
  records: LlmContactRecord[];
  error: string | null;
}> {
  if (options.skipLlm) {
    return { error: null, records: [] };
  }

  const model = (options.model ?? GEMINI_FAST_MODEL).trim();
  const prompt = buildContactPrompt({
    attachments,
    deterministicCandidates,
    documents,
    emails,
    project,
  });

  try {
    const parsed = await runGeminiJsonPrompt(prompt, { model });
    const contactsRaw = parsed?.contacts;
    return {
      error: null,
      records: parseLlmContactRecords(contactsRaw),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message, records: [] };
  }
}
