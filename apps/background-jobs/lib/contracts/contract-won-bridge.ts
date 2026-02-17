/**
 * Contract Won Bridge
 *
 * Detects when a real contract arrives for a project and marks the associated
 * estimate as Won in Postgres + Monday.com. When a winner is identified on a
 * multi-estimate project, other contractors' estimates are marked GC Not Awarded.
 *
 * 6-pass pipeline:
 *   Pass 0: Classify emails with attachments addressed to contracts@ as CONTRACT
 *   Pass 1: Link unlinked contracts@ emails to projects via subject matching
 *   Pass 1.5: LLM extraction from document content → project matching
 *             (catches DocuSign emails with generic subjects but rich PDFs)
 *   Pass 2: Backfill documents.estimate_id from estimate_emails
 *   Pass 3: Find Won candidates via two paths:
 *           A) Single-estimate project (unambiguous)
 *           B) Multi-estimate project with contractor name in email subject
 *           → Mark Won in Postgres + Monday.com
 *   Pass 4: Mark losing estimates as GC Not Awarded on newly-won projects
 */

import { db } from "@lib/db/hub";
import { query as mondayQuery } from "@monday/client/query";
import { updateItem } from "@monday/client/search";
import { BOARD_IDS, ESTIMATING_GROUPS } from "@monday/types/schema";

const LOG = "[contract-won-bridge]";
const CONTRACTS_MAILBOX = "contracts@desertservices.net";

// ============================================================================
// Pass 0: Classify emails with attachments addressed to contracts@ as CONTRACT
// ============================================================================

/**
 * Emails in the contracts@ mailbox (mailbox_id=3) or TO contracts@ that have
 * attachments but no classification yet → stamp as CONTRACT / mailbox_rule.
 *
 * Conservative: only emails with attachments, since the Won query also
 * requires has_attachments and documents.
 */
const classifyContractsEmails = db.query<{ updated: number }>(
  `WITH updated AS (
     UPDATE emails
     SET classification = 'CONTRACT',
         classification_method = 'mailbox_rule',
         classification_confidence = 1.0
     WHERE classification IS NULL
       AND has_attachments = 1
       AND (
         mailbox_id = 3
         OR to_emails::text ILIKE '%"${CONTRACTS_MAILBOX}"%'
       )
     RETURNING 1
   )
   SELECT count(*)::int AS updated FROM updated`
);

// ============================================================================
// Pass 1: Link contracts@ emails to projects via subject matching
// ============================================================================

/**
 * For CONTRACT emails addressed to contracts@ that have no project link:
 * try to match the email subject against project names.
 *
 * Safety guards:
 *   - Only projects with at least 1 estimate (bridge target population)
 *   - Project name must be >= 5 chars (avoid short-name false matches)
 *   - Picks longest project name match (most specific), then newest project
 *   - Only recent emails (60 days)
 */
const linkContractEmailsToProjects = db.query<{ linked: number }>(
  `WITH candidates AS (
     SELECT DISTINCT ON (e.id)
       e.id AS email_id,
       p.id AS project_id
     FROM emails e
     JOIN projects p
       ON e.subject ILIKE '%' || p.name || '%'
       AND length(p.name) >= 5
     WHERE e.classification = 'CONTRACT'
       AND e.project_id IS NULL
       AND e.has_attachments = 1
       AND e.received_at >= now() - interval '60 days'
       AND (
         e.mailbox_id = 3
         OR e.to_emails::text ILIKE '%"${CONTRACTS_MAILBOX}"%'
       )
       AND EXISTS (SELECT 1 FROM project_estimates pe WHERE pe.project_id = p.id)
     ORDER BY e.id, length(p.name) DESC, p.id DESC
   ),
   linked AS (
     UPDATE emails e
     SET project_id = c.project_id
     FROM candidates c
     WHERE e.id = c.email_id
       AND e.project_id IS NULL
     RETURNING 1
   )
   SELECT count(*)::int AS linked FROM linked`
);

// ============================================================================
// Pass 1.5: LLM-based document extraction and project matching (queue-driven)
// ============================================================================

/**
 * For CONTRACT emails that still have no project link after Pass 1:
 * enqueue jobs to extract structured fields via LLM from document summaries,
 * then match against projects and accounts in Postgres.
 *
 * The bridge timer only ENQUEUES — the actual LLM calls run through the
 * job queue workers (4 concurrent), giving us parallelism and retries.
 *
 * Extractions are cached in documents.raw_extraction.contract_fields
 * so each document is only processed once by the LLM.
 */

interface DocToEnqueue {
  email_id: number;
  doc_id: number;
}

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
       SELECT 1 FROM webhook_jobs wj
       WHERE wj.job_type = 'contract_doc_extract'
         AND wj.payload::jsonb->>'doc_id' = d.id::text
         AND wj.status IN ('pending', 'processing')
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
       SELECT 1 FROM webhook_jobs wj
       WHERE wj.job_type = 'contract_doc_extract'
         AND wj.payload::jsonb->>'doc_id' = d.id::text
         AND wj.status IN ('pending', 'processing')
     )
   ORDER BY e.id, length(d.summary) DESC
   LIMIT 50`
);

export interface ContractFields {
  project_name: string | null;
  contractor_name: string | null;
  project_address: string | null;
  po_number: string | null;
  document_type: string | null;
}

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

const cacheContractFields = db.prepare(`
  UPDATE documents
  SET raw_extraction = (
    CASE WHEN raw_extraction IS NOT NULL AND jsonb_typeof(raw_extraction::jsonb) = 'object'
         THEN raw_extraction::jsonb
         ELSE '{}'::jsonb END
  ) || jsonb_build_object('contract_fields', ($1::text)::jsonb),
      updated_at = now()
  WHERE id = $2
`);

interface ProjectMatch {
  project_id: number;
  project_name: string;
}

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

const linkEmailToProject = db.prepare(`
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

const GEMINI_MODEL = (
  process.env.GEMINI_FAST_MODEL ?? "gemini-2.5-flash-lite"
).trim();

async function extractContractFields(
  summary: string
): Promise<ContractFields | null> {
  const { runGeminiJsonPrompt } = await import("../llm");
  const result = await runGeminiJsonPrompt(
    EXTRACT_PROMPT + summary.slice(0, 3000),
    { model: GEMINI_MODEL }
  );
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

  // Gather candidate projects from the contractor's account(s)
  const candidates: ProjectMatch[] = [];
  if (fields.contractor_name && fields.contractor_name.length >= 4) {
    const accountMatches = await matchAccountByName.all(fields.contractor_name);
    for (const account of accountMatches) {
      const acctProjects = await getProjectsForAccount.all(account.account_id);
      for (const p of acctProjects) {
        candidates.push(p);
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Deduplicate by project_id
  const uniqueMap = new Map<number, string>();
  for (const c of candidates) {
    uniqueMap.set(c.project_id, c.project_name);
  }
  const candidateList = [...uniqueMap.entries()]
    .map(([id, name]) => `  ${id}: ${name}`)
    .join("\n");

  const { runGeminiJsonPrompt } = await import("../llm");
  const prompt = `You are matching a contract document to a project in our database.

The document references:
  Project: "${fields.project_name}"
  Contractor: "${fields.contractor_name ?? "unknown"}"
  Address: "${fields.project_address ?? "unknown"}"

Here are the contractor's known projects (id: name):
${candidateList}

Which project ID is this document for? Consider abbreviations, naming variations, and partial matches.
Return JSON: {"project_id": <number or null>, "confidence": "high"|"medium"|"low", "reason": "<brief explanation>"}
Return null for project_id if none of the projects match.`;

  const result = await runGeminiJsonPrompt(prompt, { model: GEMINI_MODEL });
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
export async function processContractDocExtractJob(payload: {
  email_id: number;
  doc_id: number;
}): Promise<void> {
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
async function enqueueContractDocExtractions(): Promise<number> {
  const { enqueueJob } = await import("../../jobs/queue");
  const needExtraction = await getDocsNeedingExtraction.all();
  const needRematch = await getExtractedButUnlinked.all();

  let enqueued = 0;
  for (const row of [...needExtraction, ...needRematch]) {
    await enqueueJob.run(
      "contract_doc_extract",
      null,
      JSON.stringify({ email_id: row.email_id, doc_id: row.doc_id })
    );
    enqueued++;
  }
  return enqueued;
}

// ============================================================================
// Pass 2: Backfill documents.estimate_id from estimate_emails
// ============================================================================

const backfillDocumentEstimateIds = db.query<{ updated: number }>(
  `WITH updated AS (
     UPDATE documents d
     SET estimate_id = ee.estimate_id,
         updated_at = now()
     FROM estimate_emails ee
     WHERE d.email_id = ee.email_id
       AND d.estimate_id IS NULL
       AND d.email_id IS NOT NULL
     RETURNING 1
   )
   SELECT count(*)::int AS updated FROM updated`
);

// ============================================================================
// Pass 3: Find Won candidates
// ============================================================================

interface WonCandidate {
  email_id: number;
  project_id: number;
  project_name: string;
  estimate_id: number;
  estimate_name: string;
  account_name: string | null;
  monday_item_id: string | null;
  match_type: "single_estimate" | "account_match";
}

/**
 * Find estimates that should be marked Won.
 *
 * Requires ALL of:
 *   - Email classified as CONTRACT with a project link
 *   - Email has attachments AND at least 1 parsed document
 *   - Email is addressed to contracts@ OR subject contains contract keywords
 *   - Estimate bid_status is promotable (Bid Sent, Pending Won, Default, draft, empty)
 *   - Subject does NOT indicate project closeout/termination/lien waiver
 *   - Email received in last 30 days
 *
 * Two match paths:
 *   A) Project has exactly 1 estimate (unambiguous — no contractor match needed)
 *   B) Project has multiple estimates, but the winning contractor's account name
 *      appears in the email subject (length >= 6 chars to avoid false matches)
 */
const findWonCandidates = db.query<WonCandidate>(
  `SELECT DISTINCT ON (est.id)
     e.id AS email_id,
     p.id AS project_id,
     p.name AS project_name,
     est.id AS estimate_id,
     est.name AS estimate_name,
     a.name AS account_name,
     est.monday_item_id,
     CASE
       WHEN (SELECT count(*) FROM project_estimates pe2 WHERE pe2.project_id = p.id) = 1
         THEN 'single_estimate'
       ELSE 'account_match'
     END AS match_type
   FROM emails e
   JOIN projects p ON p.id = e.project_id
   JOIN project_estimates pe ON pe.project_id = p.id
   JOIN estimates est ON est.id = pe.estimate_id
   LEFT JOIN accounts a ON a.id = est.account_id
   WHERE e.classification = 'CONTRACT'
     AND e.project_id IS NOT NULL
     AND e.has_attachments = 1
     -- Only promote from eligible pre-Won statuses
     AND coalesce(est.bid_status, '') IN ('Bid Sent', 'Pending Won', 'Default', 'draft', '')
     -- Require at least one parsed document on this email
     AND EXISTS (SELECT 1 FROM documents d WHERE d.email_id = e.id)
     -- Require contract signal: addressed to contracts@ OR contract keywords
     AND (
       e.to_emails::text ILIKE '%"${CONTRACTS_MAILBOX}"%'
       OR e.subject ~* '(subcontrac|work.?order|service.?agreement|\\mcontract\\M|letter.?of.?intent|\\mloi\\M|fully.?executed)'
     )
     -- Exclude project closeout/termination/lien waiver emails
     AND e.subject !~* '(site.?surrender|close.?out|termination|cancell?ation|voided|lien.?waiver)'
     -- Two match paths:
     AND (
       -- Path A: project has exactly 1 estimate (unambiguous)
       (SELECT count(*) FROM project_estimates pe2 WHERE pe2.project_id = p.id) = 1
       -- Path B: multi-estimate, contractor name in subject (min 6 chars to avoid false matches)
       OR (a.name IS NOT NULL AND length(a.name) >= 6 AND e.subject ILIKE '%' || a.name || '%')
     )
     -- Recent only (180 days covers full backlog)
     AND e.received_at >= now() - interval '180 days'
   ORDER BY est.id, e.received_at DESC
   LIMIT 50`
);

const markEstimateWon = db.prepare(`
  UPDATE estimates
  SET bid_status = 'Won',
      updated_at = now()
  WHERE id = $1
    AND coalesce(bid_status, '') <> 'Won'
`);

// ============================================================================
// Pass 4: Mark losing estimates as GC Not Awarded
// ============================================================================

interface LoserCandidate {
  estimate_id: number;
  estimate_name: string;
  account_name: string | null;
  monday_item_id: string | null;
}

/**
 * Find estimates on a project that should be marked as GC Not Awarded
 * because a different contractor won.
 *
 * Excludes all winner IDs (there may be multiple if same contractor has
 * multiple estimates on the project). Only targets estimates still in
 * promotable statuses (not already Won, Lost, or GC Not Awarded).
 */
function findLoserCandidatesForProject(
  projectId: number,
  winnerIds: number[]
): Promise<LoserCandidate[]> {
  const placeholders = winnerIds.map((_, i) => `$${i + 2}`).join(", ");
  return db
    .query<LoserCandidate>(
      `SELECT est.id AS estimate_id,
       est.name AS estimate_name,
       a.name AS account_name,
       est.monday_item_id
     FROM project_estimates pe
     JOIN estimates est ON est.id = pe.estimate_id
     LEFT JOIN accounts a ON a.id = est.account_id
     WHERE pe.project_id = $1
       AND est.id NOT IN (${placeholders})
       AND coalesce(est.bid_status, '') IN ('Bid Sent', 'Pending Won', 'Default', 'draft', '')
     ORDER BY est.id`
    )
    .all(projectId, ...winnerIds);
}

const markEstimateLost = db.prepare(`
  UPDATE estimates
  SET bid_status = 'GC Not Awarded',
      updated_at = now()
  WHERE id = $1
    AND coalesce(bid_status, '') NOT IN ('Won', 'Lost', 'GC Not Awarded')
`);

// ============================================================================
// Monday.com Write-Back
// ============================================================================

async function markWonOnMonday(mondayItemId: string): Promise<void> {
  await updateItem({
    boardId: BOARD_IDS.ESTIMATING,
    itemId: mondayItemId,
    columnValues: { deal_stage: { label: "Won" } },
  });

  await mondayQuery(`
    mutation {
      move_item_to_group(item_id: ${mondayItemId}, group_id: "${ESTIMATING_GROUPS.WON}") {
        id
      }
    }
  `);

  console.log(
    `${LOG} Monday item ${mondayItemId}: bid_status → Won, moved to Won group`
  );
}

async function markLostOnMonday(mondayItemId: string): Promise<void> {
  await updateItem({
    boardId: BOARD_IDS.ESTIMATING,
    itemId: mondayItemId,
    columnValues: { deal_stage: { label: "GC Not Awarded" } },
  });

  await mondayQuery(`
    mutation {
      move_item_to_group(item_id: ${mondayItemId}, group_id: "${ESTIMATING_GROUPS.LOST}") {
        id
      }
    }
  `);

  console.log(
    `${LOG} Monday item ${mondayItemId}: bid_status → GC Not Awarded, moved to Lost group`
  );
}

// ============================================================================
// Public API
// ============================================================================

export interface ContractWonBridgeResult {
  contractsClassified: number;
  contractsLinked: number;
  contractDocExtractsEnqueued: number;
  documentsBackfilled: number;
  estimatesMarkedWon: number;
  estimatesMarkedLost: number;
  mondayUpdates: number;
  errors: string[];
}

export async function runContractWonBridge(): Promise<ContractWonBridgeResult> {
  const result: ContractWonBridgeResult = {
    contractsClassified: 0,
    contractsLinked: 0,
    contractDocExtractsEnqueued: 0,
    documentsBackfilled: 0,
    estimatesMarkedWon: 0,
    estimatesMarkedLost: 0,
    mondayUpdates: 0,
    errors: [],
  };

  // Pass 0: Classify contracts@ emails with attachments as CONTRACT
  const classifyStats = await classifyContractsEmails.get();
  result.contractsClassified = classifyStats?.updated ?? 0;
  if (result.contractsClassified > 0) {
    console.log(
      `${LOG} Classified ${result.contractsClassified} contracts@ email(s) as CONTRACT`
    );
  }

  // Pass 1: Link contracts@ emails to projects via subject matching
  const linkStats = await linkContractEmailsToProjects.get();
  result.contractsLinked = linkStats?.linked ?? 0;
  if (result.contractsLinked > 0) {
    console.log(
      `${LOG} Linked ${result.contractsLinked} contract email(s) to projects`
    );
  }

  // Pass 1.5: Enqueue LLM extraction jobs for unlinked contract emails
  // (catches DocuSign emails with generic subjects but rich PDF content)
  try {
    result.contractDocExtractsEnqueued = await enqueueContractDocExtractions();
    if (result.contractDocExtractsEnqueued > 0) {
      console.log(
        `${LOG} Enqueued ${result.contractDocExtractsEnqueued} contract doc extraction job(s)`
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Pass 1.5 enqueue: ${msg}`);
    console.error(`${LOG} Pass 1.5 enqueue error: ${msg}`);
  }

  // Pass 2: Backfill documents.estimate_id (nice to have, not blocking)
  const docStats = await backfillDocumentEstimateIds.get();
  result.documentsBackfilled = docStats?.updated ?? 0;
  if (result.documentsBackfilled > 0) {
    console.log(
      `${LOG} Backfilled ${result.documentsBackfilled} document estimate_id(s)`
    );
  }

  // Pass 3: Find and mark Won candidates
  const candidates = await findWonCandidates.all();
  const hasMondayKey = Boolean(process.env.MONDAY_API_KEY?.trim());

  // Track all winner IDs per project so we can mark losers in Pass 4
  const wonByProject = new Map<number, number[]>();

  for (const candidate of candidates) {
    try {
      await markEstimateWon.run(candidate.estimate_id);
      result.estimatesMarkedWon++;

      const matchLabel =
        candidate.match_type === "account_match"
          ? ` [account: ${candidate.account_name}]`
          : "";
      console.log(
        `${LOG} Marked estimate #${candidate.estimate_id} "${candidate.estimate_name}" as Won (project "${candidate.project_name}", email #${candidate.email_id})${matchLabel}`
      );

      const existing = wonByProject.get(candidate.project_id) ?? [];
      existing.push(candidate.estimate_id);
      wonByProject.set(candidate.project_id, existing);

      if (candidate.monday_item_id && hasMondayKey) {
        await markWonOnMonday(candidate.monday_item_id);
        result.mondayUpdates++;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`estimate #${candidate.estimate_id}: ${msg}`);
      console.error(
        `${LOG} Error marking estimate #${candidate.estimate_id} as Won: ${msg}`
      );
    }
  }

  // Pass 4: Mark losing estimates on projects where a winner was just identified
  for (const [projectId, winnerIds] of wonByProject) {
    const losers = await findLoserCandidatesForProject(projectId, winnerIds);
    for (const loser of losers) {
      try {
        await markEstimateLost.run(loser.estimate_id);
        result.estimatesMarkedLost++;
        console.log(
          `${LOG} Marked estimate #${loser.estimate_id} "${loser.estimate_name}" as GC Not Awarded (project #${projectId}, account: ${loser.account_name ?? "unknown"})`
        );

        if (loser.monday_item_id && hasMondayKey) {
          await markLostOnMonday(loser.monday_item_id);
          result.mondayUpdates++;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result.errors.push(`loser estimate #${loser.estimate_id}: ${msg}`);
        console.error(
          `${LOG} Error marking estimate #${loser.estimate_id} as GC Not Awarded: ${msg}`
        );
      }
    }
  }

  return result;
}
