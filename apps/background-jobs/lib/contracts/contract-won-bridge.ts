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

/** Max documents to LLM-extract per bridge cycle (rate limit) */
const LLM_EXTRACT_BATCH_SIZE = 10;

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
// Pass 1.5: LLM-based document extraction and project matching
// ============================================================================

/**
 * For CONTRACT emails that still have no project link after Pass 1:
 * use an LLM to extract structured fields (project name, contractor,
 * address, PO number) from document summaries, then match against
 * projects and accounts in Postgres.
 *
 * This catches DocuSign completions and other emails where the subject
 * is generic ("Completed: Subcontract Work Order for Desert Services")
 * but the actual contract PDF contains the project name and contractor.
 *
 * Extractions are cached in documents.raw_extraction.contract_fields
 * so each document is only processed once by the LLM.
 *
 * Processed in small batches (LLM_EXTRACT_BATCH_SIZE per cycle) to
 * avoid overwhelming the LLM API.
 */

interface DocCandidate {
  email_id: number;
  doc_id: number;
  summary: string;
  has_cached_fields: boolean;
  cached_fields: string | null;
}

/** Find unlinked CONTRACT emails with documents, preferring uncached ones.
 *  Note: uses jsonb_exists() instead of `?` operator to avoid conflict
 *  with the `?` parameter placeholder in the SQLite-compat db driver. */
const getUnlinkedContractDocsForExtraction = db.query<DocCandidate>(
  `SELECT DISTINCT ON (e.id)
     e.id AS email_id,
     d.id AS doc_id,
     left(d.summary, 3000) AS summary,
     jsonb_exists(
       CASE WHEN jsonb_typeof(d.raw_extraction::jsonb) = 'object'
            THEN d.raw_extraction::jsonb ELSE '{}'::jsonb END,
       'contract_fields'
     ) AS has_cached_fields,
     CASE WHEN jsonb_typeof(d.raw_extraction::jsonb) = 'object'
          THEN d.raw_extraction::jsonb ->> 'contract_fields'
          ELSE NULL END AS cached_fields
   FROM emails e
   JOIN documents d ON d.email_id = e.id
   WHERE e.classification = 'CONTRACT'
     AND e.project_id IS NULL
     AND e.has_attachments = 1
     AND e.received_at >= now() - interval '180 days'
     AND d.summary IS NOT NULL
     AND length(d.summary) > 50
     -- Prefer documents that haven't been extracted yet
   ORDER BY e.id,
     jsonb_exists(
       CASE WHEN jsonb_typeof(d.raw_extraction::jsonb) = 'object'
            THEN d.raw_extraction::jsonb ELSE '{}'::jsonb END,
       'contract_fields'
     ) ASC,
     length(d.summary) DESC
   LIMIT $1`
);

interface ContractFields {
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
  ) || jsonb_build_object('contract_fields', $1::jsonb),
      updated_at = now()
  WHERE id = $2
`);

interface ProjectMatch {
  project_id: number;
  project_name: string;
}

/** Match extracted project name against projects that have estimates */
const matchProjectByName = db.query<ProjectMatch>(
  `SELECT p.id AS project_id, p.name AS project_name
   FROM projects p
   WHERE p.name ILIKE '%' || $1 || '%'
     AND length($1) >= 5
     AND EXISTS (SELECT 1 FROM project_estimates pe WHERE pe.project_id = p.id)
   ORDER BY length(p.name) ASC, p.id DESC
   LIMIT 10`
);

/** Match extracted contractor name against accounts to narrow candidates */
const matchAccountByName = db.query<{
  account_id: number;
  account_name: string;
}>(
  `SELECT id AS account_id, name AS account_name
   FROM accounts
   WHERE name ILIKE '%' || $1 || '%'
     AND length($1) >= 4
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
 * Extract meaningful tokens from an LLM-extracted project name.
 * Strips project numbers, parenthesized portions become separate tokens.
 * E.g. "25-1-025 Estrella (Elliot Crossing)" → ["Estrella", "Elliot Crossing"]
 */
function extractNameTokens(name: string): string[] {
  const tokens: string[] = [];
  // Extract parenthesized segments
  const parenRe = /\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = parenRe.exec(name)) !== null) {
    const inner = m[1].trim();
    if (inner.length >= 5) {
      tokens.push(inner);
    }
  }
  // Strip project numbers (like "25-1-025") and parens, keep the rest
  const cleaned = name
    .replace(/\([^)]*\)/g, "")
    .replace(/\b\d[\d-]+\b/g, "")
    .trim();
  if (cleaned.length >= 5) {
    tokens.push(cleaned);
  }
  return tokens;
}

/**
 * Attempt to match extracted fields to a project.
 * Uses two strategies:
 *   1. Project-first: ILIKE match project name, disambiguate with account
 *   2. Account-first: Match account, scan their projects for name overlap
 *
 * Returns project_id if a confident match is found, null otherwise.
 */
async function matchFieldsToProject(
  fields: ContractFields
): Promise<number | null> {
  // Skip closeout/lien waiver documents — not Won signals
  if (
    fields.document_type &&
    /closeout|lien_waiver/.test(fields.document_type)
  ) {
    return null;
  }

  // Need at least a project name to match
  if (!fields.project_name || fields.project_name.length < 5) {
    return null;
  }

  // === Strategy 1: Project-first ===
  // Try full extracted name first
  const nameVariants = [
    fields.project_name,
    ...extractNameTokens(fields.project_name),
  ];
  const seen = new Set<string>();

  for (const variant of nameVariants) {
    if (variant.length < 5 || seen.has(variant.toUpperCase())) {
      continue;
    }
    seen.add(variant.toUpperCase());

    const projectMatches = await matchProjectByName.all(variant);

    if (projectMatches.length === 1) {
      return projectMatches[0].project_id;
    }

    if (
      projectMatches.length > 1 &&
      fields.contractor_name &&
      fields.contractor_name.length >= 4
    ) {
      const accountMatches = await matchAccountByName.all(
        fields.contractor_name
      );
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
  }

  // === Strategy 2: Account-first ===
  // If we have a contractor name, find their projects and fuzzy-match
  if (fields.contractor_name && fields.contractor_name.length >= 4) {
    const accountMatches = await matchAccountByName.all(fields.contractor_name);
    for (const account of accountMatches) {
      const accountProjects = await getProjectsForAccount.all(
        account.account_id
      );
      if (accountProjects.length === 0) {
        continue;
      }

      // Check each name variant against this account's projects
      const nameUpper = fields.project_name.toUpperCase();
      const tokenVariants = nameVariants.map((v) => v.toUpperCase());

      for (const project of accountProjects) {
        const projUpper = project.project_name.toUpperCase();
        // Check if any extracted token appears in the project name OR vice versa
        for (const token of tokenVariants) {
          if (
            token.length >= 5 &&
            (projUpper.includes(token) || nameUpper.includes(projUpper))
          ) {
            return project.project_id;
          }
        }
      }
    }
  }

  // No confident match
  return null;
}

/**
 * Pass 1.5: Extract structured fields from documents via LLM and match to projects.
 * Returns the number of emails successfully linked.
 */
async function linkContractEmailsViaLlmExtraction(): Promise<number> {
  const candidates = await getUnlinkedContractDocsForExtraction.all(
    LLM_EXTRACT_BATCH_SIZE
  );
  if (candidates.length === 0) {
    return 0;
  }

  let linked = 0;

  for (const candidate of candidates) {
    let fields: ContractFields | null = null;

    // Use cached extraction if available
    if (candidate.has_cached_fields && candidate.cached_fields) {
      try {
        fields = JSON.parse(candidate.cached_fields) as ContractFields;
      } catch {
        fields = null;
      }
    }

    // Otherwise, extract via LLM
    if (!fields) {
      try {
        fields = await extractContractFields(candidate.summary);
        if (fields) {
          await cacheContractFields.run(
            JSON.stringify(fields),
            candidate.doc_id
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(
          `${LOG} LLM extraction failed for doc #${candidate.doc_id} (email #${candidate.email_id}): ${msg}`
        );
        // Cache empty extraction to avoid retrying
        await cacheContractFields.run(
          JSON.stringify({
            project_name: null,
            contractor_name: null,
            project_address: null,
            po_number: null,
            document_type: null,
          }),
          candidate.doc_id
        );
        continue;
      }
    }

    if (!fields) {
      continue;
    }

    // Try to match to a project
    const projectId = await matchFieldsToProject(fields);
    if (projectId) {
      await linkEmailToProject.run(projectId, candidate.email_id);
      linked++;
      console.log(
        `${LOG} Linked email #${candidate.email_id} to project #${projectId} via LLM extraction (project: "${fields.project_name}", contractor: "${fields.contractor_name}")`
      );
    }
  }

  return linked;
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
  contractsLinkedViaDocs: number;
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
    contractsLinkedViaDocs: 0,
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

  // Pass 1.5: LLM extraction → project matching for unlinked contract emails
  // (catches DocuSign emails with generic subjects but rich PDF content)
  try {
    result.contractsLinkedViaDocs = await linkContractEmailsViaLlmExtraction();
    if (result.contractsLinkedViaDocs > 0) {
      console.log(
        `${LOG} Linked ${result.contractsLinkedViaDocs} contract email(s) to projects via LLM extraction`
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Pass 1.5 LLM extraction: ${msg}`);
    console.error(`${LOG} Pass 1.5 LLM extraction error: ${msg}`);
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
