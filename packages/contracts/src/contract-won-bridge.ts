/**
 * Contract Won Bridge
 *
 * Detects when a real contract arrives for a project and marks the associated
 * estimate as Won in Postgres + Monday.com. When a winner is identified on a
 * multi-estimate project, other contractors' estimates are marked GC Not Awarded.
 */

import { db } from "@lib/db/client";
import { enqueueContractDocExtractions } from "./contract-doc-extract-queue";
import { processLoserPhase, processWonPhase } from "./contract-won-detector";
import type {
  ContractDocExtractEnqueueJob,
  ContractWonBridgeResult,
} from "./types";

const LOG = "[contract-won-bridge]";
const CONTRACTS_MAILBOX = "contracts@desertservices.net";

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

export async function runContractWonBridge(
  enqueueJob: ContractDocExtractEnqueueJob
): Promise<ContractWonBridgeResult> {
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

  const classifyStats = await classifyContractsEmails.get();
  result.contractsClassified = classifyStats?.updated ?? 0;
  if (result.contractsClassified > 0) {
    console.log(
      `${LOG} Classified ${result.contractsClassified} contracts@ email(s) as CONTRACT`
    );
  }

  const linkStats = await linkContractEmailsToProjects.get();
  result.contractsLinked = linkStats?.linked ?? 0;
  if (result.contractsLinked > 0) {
    console.log(
      `${LOG} Linked ${result.contractsLinked} contract email(s) to projects`
    );
  }

  try {
    result.contractDocExtractsEnqueued =
      await enqueueContractDocExtractions(enqueueJob);
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

  const docStats = await backfillDocumentEstimateIds.get();
  result.documentsBackfilled = docStats?.updated ?? 0;
  if (result.documentsBackfilled > 0) {
    console.log(
      `${LOG} Backfilled ${result.documentsBackfilled} document estimate_id(s)`
    );
  }

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
