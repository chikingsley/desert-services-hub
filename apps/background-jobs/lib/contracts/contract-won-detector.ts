/**
 * Contract Won Detector — Passes 3 & 4
 *
 * Finds estimates that should be marked Won and marks losing estimates as
 * GC Not Awarded on projects where another contractor just won.
 */

import type {
  LoserCandidate,
  LoserPhaseResult,
  WonCandidate,
  WonPhaseResult,
} from "@email/contracts/types";
import { db } from "@lib/db/hub";
import { query as mondayQuery } from "@monday/client/query";
import { updateItem } from "@monday/client/search";
import { BOARD_IDS, ESTIMATING_GROUPS } from "@monday/types/schema";

const LOG = "[contract-won-bridge]";
const CONTRACTS_MAILBOX = "contracts@desertservices.net";

// ============================================================================
// Pass 3: Find Won candidates
// ============================================================================

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

export async function processWonPhase(
  hasMondayKey: boolean
): Promise<WonPhaseResult> {
  const candidates = await findWonCandidates.all();
  const result = {
    estimatesMarkedWon: 0,
    mondayUpdates: 0,
    errors: [] as string[],
    wonByProject: new Map<number, number[]>(),
  };

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

      const existing = result.wonByProject.get(candidate.project_id) ?? [];
      existing.push(candidate.estimate_id);
      result.wonByProject.set(candidate.project_id, existing);

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

  return result;
}

export async function processLoserPhase(
  wonByProject: Map<number, number[]>,
  hasMondayKey: boolean
): Promise<LoserPhaseResult> {
  const result = {
    estimatesMarkedLost: 0,
    mondayUpdates: 0,
    errors: [] as string[],
  };

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
