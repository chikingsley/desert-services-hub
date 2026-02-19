/**
 * Contract Doc Extract Queue — Pass 1.5
 *
 * LLM-based document extraction and project matching for CONTRACT emails
 * that remain unlinked after Pass 1 (subject matching).
 *
 * The bridge timer calls enqueueContractDocExtractions() which enqueues jobs;
 * the job queue workers call processContractDocExtractJob() to run the actual work.
 * Extractions are cached in documents.raw_extraction.contract_fields.
 */

import { db } from "@lib/db/client";
import type {
  ContractDocExtractEnqueueJob,
  ContractDocExtractPayload,
  ContractFields,
  DocToEnqueue,
  ProjectMatch,
} from "./types";

const LOG = "[contract-won-bridge]";

// Top-level regex constants (avoids creating new regex instances in loops)
const WORD_SPLIT_RE = /[\s\-/,.:;()]+/;
const DIGITS_ONLY_RE = /^\d+$/;

// ============================================================================
// Queries
// ============================================================================

/** Find unlinked CONTRACT emails with documents that need LLM extraction.
 *  Excludes docs that already have cached contract_fields.
 *  Uses jsonb_exists() instead of `?` to avoid SQLite-compat placeholder conflict. */
const getDocsNeedingExtraction = db.query<DocToEnqueue>(
  `SELECT DISTINCT ON (e.id)
     e.id AS email_id,
     d.id AS doc_id
   FROM emails e
   JOIN documents d ON d.email_id = e.id
   WHERE e.classification = 'CONTRACT'
     AND e.project_id IS NULL
     AND e.has_attachments = 1
     AND e.received_at >= now() - interval '180 days'
     AND d.summary IS NOT NULL
     AND length(d.summary) > 50
     -- Skip docs already extracted
     AND NOT jsonb_exists(
       CASE WHEN d.raw_extraction IS NOT NULL AND jsonb_typeof(d.raw_extraction::jsonb) = 'object'
            THEN d.raw_extraction::jsonb ELSE '{}'::jsonb END,
       'contract_fields'
     )
     -- Skip docs already queued
     AND NOT EXISTS (
       SELECT 1
       FROM pgmq.q_background_jobs q
       WHERE q.message->>'job_type' = 'contract_doc_extract'
         AND q.message->'payload'->>'doc_id' = d.id::text
         AND q.read_ct < COALESCE((q.message->>'max_attempts')::int, 3)
     )
   ORDER BY e.id, length(d.summary) DESC
   LIMIT 200`
);

/** Find unlinked CONTRACT emails that have cached extractions but no project link yet.
 *  These need re-matching (e.g., new projects added since extraction).
 *  Skips lien_waiver/closeout docs to avoid queue churn. */
const getExtractedButUnlinked = db.query<DocToEnqueue>(
  `SELECT DISTINCT ON (e.id)
     e.id AS email_id,
     d.id AS doc_id
   FROM emails e
   JOIN documents d ON d.email_id = e.id
   WHERE e.classification = 'CONTRACT'
     AND e.project_id IS NULL
     AND e.has_attachments = 1
     AND e.received_at >= now() - interval '180 days'
     AND d.raw_extraction IS NOT NULL
     AND jsonb_typeof(d.raw_extraction::jsonb) = 'object'
     AND jsonb_exists(d.raw_extraction::jsonb, 'contract_fields')
     -- Must have a project name to match against
     AND length(coalesce(
       d.raw_extraction::jsonb->'contract_fields'->>'project_name',
       ''
     )) >= 5
     -- Skip docs already queued for re-match
     AND NOT EXISTS (
       SELECT 1
       FROM pgmq.q_background_jobs q
       WHERE q.message->>'job_type' = 'contract_doc_extract'
         AND q.message->'payload'->>'doc_id' = d.id::text
         AND q.read_ct < COALESCE((q.message->>'max_attempts')::int, 3)
     )
   ORDER BY e.id, length(d.summary) DESC
   LIMIT 50`
);

const EXTRACT_PROMPT = `You are extracting structured fields from a construction contract/subcontract document.

Given the document text below, extract these fields as JSON:
- project_name: The name of the construction project (e.g. "Estrella Elliot Crossing", "SR 260 Lion Springs"). NOT "Desert Services" — that's the subcontractor.
- contractor_name: The general contractor or prime company name (e.g. "A.R. Mays Construction", "Clayco", "Sundt"). NOT "Desert Services" or "SWPP Solutions" or "IDG" — those are the sub.
- project_address: Street address of the job site if present
- po_number: PO number, subcontract number, or work order number
- document_type: One of: contract, subcontract, change_order, work_order, loi, addendum, closeout, lien_waiver, other

Return ONLY valid JSON. Use null for any field you cannot confidently extract.

Document text:
`;

const cacheContractFields = db.query(`
  UPDATE documents
  SET raw_extraction = (
    CASE WHEN raw_extraction IS NOT NULL AND jsonb_typeof(raw_extraction::jsonb) = 'object'
         THEN raw_extraction::jsonb
         ELSE '{}'::jsonb END
  ) || jsonb_build_object('contract_fields', ($1::text)::jsonb),
      updated_at = now()
  WHERE id = $2
`);

/** Match extracted project name against all projects (not just those with estimates).
 *  Project linking is valuable regardless — Won detection is handled separately in Pass 3.
 *  Bidirectional: project contains extracted OR extracted contains project. */
const matchProjectByName = db.query<ProjectMatch>(
  `SELECT p.id AS project_id, p.name AS project_name
   FROM projects p
   WHERE (p.name ILIKE '%' || $1 || '%' OR $1 ILIKE '%' || p.name || '%')
     AND length($1) >= 5
     AND length(p.name) >= 5
   ORDER BY length(p.name) ASC, p.id DESC
   LIMIT 10`
);

/** Match extracted contractor name against accounts to narrow candidates.
 *  Bidirectional: account contains extracted OR extracted contains account. */
const matchAccountByName = db.query<{
  account_id: number;
  account_name: string;
}>(
  `SELECT id AS account_id, name AS account_name
   FROM accounts
   WHERE (name ILIKE '%' || $1 || '%' OR $1 ILIKE '%' || name || '%')
     AND length($1) >= 4
     AND length(name) >= 4
     AND name NOT ILIKE '%notification%'
   ORDER BY length(name) ASC
   LIMIT 5`
);

/** Check if a project has an estimate belonging to a specific account */
const projectHasAccountEstimate = db.query<{ match: boolean }>(
  `SELECT EXISTS(
     SELECT 1
     FROM project_estimates pe
     JOIN estimates est ON est.id = pe.estimate_id
     WHERE pe.project_id = $1 AND est.account_id = $2
   ) AS match`
);

/** Account-first strategy: find projects for a specific account, then match name */
const getProjectsForAccount = db.query<ProjectMatch>(
  `SELECT DISTINCT p.id AS project_id, p.name AS project_name
   FROM project_estimates pe
   JOIN estimates est ON est.id = pe.estimate_id
   JOIN projects p ON p.id = pe.project_id
   WHERE est.account_id = $1
   ORDER BY p.id DESC
   LIMIT 50`
);

const linkEmailToProject = db.query(`
  UPDATE emails SET project_id = $1 WHERE id = $2 AND project_id IS NULL
`);

const getDocSummary = db.query<{
  summary: string;
  raw_extraction: string | null;
}>(
  `SELECT left(summary, 3000) AS summary,
          CASE WHEN raw_extraction IS NOT NULL AND jsonb_typeof(raw_extraction::jsonb) = 'object'
               THEN raw_extraction::jsonb->>'contract_fields'
               ELSE NULL END AS raw_extraction
   FROM documents WHERE id = $1`
);

// ============================================================================
// Extraction & Matching
// ============================================================================

async function extractContractFields(
  summary: string
): Promise<ContractFields | null> {
  const { chat } = await import("@lib/pdf-analysis");
  const chatResult = await chat(
    EXTRACT_PROMPT + summary.slice(0, 3000),
    "gemini"
  );
  const result =
    Object.keys(chatResult.data).length > 0 ? chatResult.data : null;
  if (!result) {
    return null;
  }
  return {
    project_name:
      typeof result.project_name === "string"
        ? result.project_name.trim() || null
        : null,
    contractor_name:
      typeof result.contractor_name === "string"
        ? result.contractor_name.trim() || null
        : null,
    project_address:
      typeof result.project_address === "string"
        ? result.project_address.trim() || null
        : null,
    po_number:
      typeof result.po_number === "string"
        ? result.po_number.trim() || null
        : null,
    document_type:
      typeof result.document_type === "string"
        ? result.document_type.trim() || null
        : null,
  };
}

/**
 * Attempt to match extracted fields to a project.
 *
 * Simple deterministic pass: bidirectional ILIKE on project name.
 * If single match → return immediately.
 * If multi-match → disambiguate via contractor account.
 * If no match → return null (caller falls through to LLM matching).
 */
async function matchFieldsToProject(
  fields: ContractFields
): Promise<number | null> {
  if (!fields.project_name || fields.project_name.length < 5) {
    return null;
  }

  const projectMatches = await matchProjectByName.all(fields.project_name);

  if (projectMatches.length === 1) {
    return projectMatches[0].project_id;
  }

  // Multi-match: try to disambiguate via contractor account
  if (
    projectMatches.length > 1 &&
    fields.contractor_name &&
    fields.contractor_name.length >= 4
  ) {
    const accountMatches = await matchAccountByName.all(fields.contractor_name);
    for (const project of projectMatches) {
      for (const account of accountMatches) {
        const check = await projectHasAccountEstimate.get(
          project.project_id,
          account.account_id
        );
        if (check?.match) {
          return project.project_id;
        }
      }
    }
  }

  return null;
}

/**
 * LLM-based project matching fallback.
 *
 * When deterministic ILIKE matching fails, gather candidate projects
 * from the contractor's account and ask Gemini to pick the best match.
 * Handles abbreviations, naming variations, and fuzzy mismatches that
 * no amount of regex can solve.
 */
async function matchViaLlm(fields: ContractFields): Promise<number | null> {
  if (!fields.project_name || fields.project_name.length < 3) {
    return null;
  }

  // Gather candidates from two sources:
  // 1. Contractor's account projects (via estimates)
  // 2. Broad keyword search across ALL projects (catches no-account cases)
  const uniqueMap = new Map<number, string>();

  if (fields.contractor_name && fields.contractor_name.length >= 4) {
    const accountMatches = await matchAccountByName.all(fields.contractor_name);
    for (const account of accountMatches) {
      const acctProjects = await getProjectsForAccount.all(account.account_id);
      for (const p of acctProjects) {
        uniqueMap.set(p.project_id, p.project_name);
      }
    }
  }

  // Also search projects by significant words from the extracted name
  const words = fields.project_name
    .split(WORD_SPLIT_RE)
    .filter((w) => w.length >= 4)
    .filter((w) => !DIGITS_ONLY_RE.test(w))
    .slice(0, 3);
  for (const word of words) {
    const hits = await matchProjectByName.all(word);
    for (const h of hits) {
      uniqueMap.set(h.project_id, h.project_name);
    }
  }

  if (uniqueMap.size === 0) {
    return null;
  }

  const candidateList = [...uniqueMap.entries()]
    .map(([id, name]) => `  ${id}: ${name}`)
    .join("\n");

  const { chat } = await import("@lib/pdf-analysis");
  const prompt = `You are matching a contract document to a project in our database.

The document references:
  Project: "${fields.project_name}"
  Contractor: "${fields.contractor_name ?? "unknown"}"
  Address: "${fields.project_address ?? "unknown"}"

Candidate projects (id: name):
${candidateList}

Which project ID is this document for? Consider abbreviations, naming variations, partial matches, and word reordering.
Return JSON: {"project_id": <number or null>, "confidence": "high"|"medium"|"low", "reason": "<brief explanation>"}
Return null for project_id if none of the candidates are a match.`;

  const chatResult = await chat(prompt, "gemini");
  const result =
    Object.keys(chatResult.data).length > 0 ? chatResult.data : null;
  if (
    !result ||
    typeof result.project_id !== "number" ||
    result.confidence === "low"
  ) {
    return null;
  }

  // Verify the returned ID is actually in our candidate set
  if (!uniqueMap.has(result.project_id)) {
    return null;
  }

  console.log(
    `${LOG} LLM match: "${fields.project_name}" → #${result.project_id} "${uniqueMap.get(result.project_id)}" (${result.confidence}: ${result.reason})`
  );
  return result.project_id;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Job handler: process a single contract_doc_extract job.
 * Called from dispatch.ts via the job queue.
 *
 * 1. Load document summary (use cached extraction if present)
 * 2. Extract structured fields via Gemini LLM
 * 3. Cache extraction in documents.raw_extraction.contract_fields
 * 4. Match extracted fields to project
 * 5. Link email to project on confident match
 */
export async function processContractDocExtractJob(
  payload: ContractDocExtractPayload
): Promise<void> {
  const { email_id, doc_id } = payload;

  const doc = await getDocSummary.get(doc_id);
  if (!doc?.summary) {
    console.log(`${LOG} doc #${doc_id}: no summary, skipping`);
    return;
  }

  // Use cached extraction if available.
  // Handles both old format (JSON string scalar) and new format (nested object).
  let fields: ContractFields | null = null;
  if (doc.raw_extraction) {
    try {
      const parsed = JSON.parse(doc.raw_extraction);
      if (parsed && typeof parsed === "object" && "project_name" in parsed) {
        fields = parsed as ContractFields;
      }
    } catch {
      fields = null;
    }
  }

  // Otherwise, extract via LLM and cache
  if (!fields) {
    fields = await extractContractFields(doc.summary);
    const toCache = fields ?? {
      project_name: null,
      contractor_name: null,
      project_address: null,
      po_number: null,
      document_type: null,
    };
    await cacheContractFields.run(JSON.stringify(toCache), doc_id);
  }

  if (!fields) {
    return;
  }

  // Match to project: deterministic first, then LLM fallback
  const projectId =
    (await matchFieldsToProject(fields)) ?? (await matchViaLlm(fields));
  if (projectId) {
    await linkEmailToProject.run(projectId, email_id);
    console.log(
      `${LOG} Linked email #${email_id} → project #${projectId} (project: "${fields.project_name}", contractor: "${fields.contractor_name}")`
    );
  }
}

/**
 * Pass 1.5 enqueue: find unlinked CONTRACT emails with unextracted docs,
 * enqueue each as a contract_doc_extract job. Returns count enqueued.
 */
export async function enqueueContractDocExtractions(
  enqueueJob: ContractDocExtractEnqueueJob
): Promise<number> {
  const needExtraction = await getDocsNeedingExtraction.all();
  const needRematch = await getExtractedButUnlinked.all();

  let enqueued = 0;
  for (const row of [...needExtraction, ...needRematch]) {
    await enqueueJob({ email_id: row.email_id, doc_id: row.doc_id });
    enqueued++;
  }
  return enqueued;
}
