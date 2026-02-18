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

import type { ContractWonBridgeResult } from "@email/contracts/types";
import { db } from "@lib/db/hub";
import { enqueueContractDocExtractions } from "./contract-doc-extract-queue";
import { processLoserPhase, processWonPhase } from "./contract-won-detector";

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
// Public API
// ============================================================================

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

  // Passes 3 & 4: Find and mark Won/Lost candidates
  const hasMondayKey = Boolean(process.env.MONDAY_API_KEY?.trim());

  const wonPhase = await processWonPhase(hasMondayKey);
  result.estimatesMarkedWon = wonPhase.estimatesMarkedWon;
  result.mondayUpdates += wonPhase.mondayUpdates;
  result.errors.push(...wonPhase.errors);

  const loserPhase = await processLoserPhase(
    wonPhase.wonByProject,
    hasMondayKey
  );
  result.estimatesMarkedLost = loserPhase.estimatesMarkedLost;
  result.mondayUpdates += loserPhase.mondayUpdates;
  result.errors.push(...loserPhase.errors);

  return result;
}
