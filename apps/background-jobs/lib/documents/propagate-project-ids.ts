import { db } from "@lib/db/hub";

const LOG = "[documents:propagate-project-ids]";

/**
 * Propagate project_id to documents that are missing it but can be resolved
 * through their existing links:
 *
 *   1. email chain:    document.email_id    → emails.project_id
 *   2. estimate chain: document.estimate_id → project_estimates.project_id
 *      (only when email chain doesn't apply)
 *
 * Email chain is preferred — it reflects a human-confirmed folder assignment.
 * Never overwrites an existing project_id.
 *
 * Returns the number of documents updated.
 */
export async function propagateDocumentProjectIds(): Promise<number> {
  // Pass 1: via direct email link
  const emailResult = await db.run(`
    UPDATE documents
    SET project_id = e.project_id,
        updated_at = now()
    FROM emails e
    WHERE documents.email_id = e.id
      AND documents.project_id IS NULL
      AND e.project_id IS NOT NULL
    RETURNING documents.id
  `);
  const viaEmail = Array.isArray(emailResult) ? emailResult.length : 0;

  // Pass 2: via estimate → project_estimates (skip docs already handled above)
  // When multiple project_estimates rows exist for an estimate, prefer active/won projects.
  const estimateResult = await db.run(`
    UPDATE documents
    SET project_id = pe_best.project_id,
        updated_at = now()
    FROM (
      SELECT DISTINCT ON (pe.estimate_id)
        pe.estimate_id,
        pe.project_id
      FROM project_estimates pe
      JOIN projects p ON p.id = pe.project_id
      ORDER BY pe.estimate_id,
        CASE p.lifecycle_state
          WHEN 'active' THEN 0
          WHEN 'seed'   THEN 1
          WHEN 'lost'   THEN 2
          ELSE 3
        END ASC
    ) pe_best
    WHERE documents.estimate_id = pe_best.estimate_id
      AND documents.project_id IS NULL
    RETURNING documents.id
  `);
  const viaEstimate = Array.isArray(estimateResult) ? estimateResult.length : 0;

  const total = viaEmail + viaEstimate;
  if (total > 0) {
    console.log(
      `${LOG} propagated project_id to ${total} docs (${viaEmail} via email, ${viaEstimate} via estimate)`
    );
  }
  return total;
}
