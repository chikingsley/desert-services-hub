/**
 * Contract Won Bridge
 *
 * Detects when a real contract arrives for a project and marks the associated
 * estimate as Won in Postgres + Monday.com. When a winner is identified on a
 * multi-estimate project, other contractors' estimates are marked GC Not Awarded.
 *
 * 5-pass pipeline:
 *   Pass 0: Classify emails with attachments addressed to contracts@ as CONTRACT
 *   Pass 1: Link unlinked contracts@ emails to projects via subject matching
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
