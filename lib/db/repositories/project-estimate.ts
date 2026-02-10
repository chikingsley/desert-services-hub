/**
 * Project ↔ Estimate linking (join table)
 */
import { db } from "@lib/db/hub";

export type ProjectEstimateLinkSource =
  | "manual"
  | "monday"
  | "projects.monday_item_id"
  | "projects.linked_estimate_ids"
  | string;

export async function linkEstimateToProject(
  projectId: number,
  estimateId: number,
  source: ProjectEstimateLinkSource = "manual"
): Promise<boolean> {
  try {
    await db.run(
      `INSERT INTO project_estimates (project_id, estimate_id, source)
       VALUES (?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [projectId, estimateId, source]
    );
    return true;
  } catch {
    return false;
  }
}

export async function getEstimatesForProject(projectId: number): Promise<
  Array<{
    estimateId: number;
    mondayItemId: string | null;
    sharepointUrl: string | null;
    bidStatus: string | null;
    source: string;
    createdAt: string;
  }>
> {
  const rows = await db
    .query<
      {
        estimate_id: number;
        monday_item_id: string | null;
        sharepoint_url: string | null;
        bid_status: string | null;
        source: string;
        created_at: string;
      },
      [number]
    >(
      `SELECT
         pe.estimate_id,
         e.monday_item_id,
         e.sharepoint_url,
         e.bid_status,
         pe.source,
         pe.created_at
       FROM project_estimates pe
       JOIN estimates e ON e.id = pe.estimate_id
       WHERE pe.project_id = ?
       ORDER BY pe.created_at DESC NULLS LAST, e.updated_at DESC`
    )
    .all(projectId);

  return rows.map((r) => ({
    estimateId: r.estimate_id,
    mondayItemId: r.monday_item_id,
    sharepointUrl: r.sharepoint_url,
    bidStatus: r.bid_status,
    source: r.source,
    createdAt: r.created_at,
  }));
}
