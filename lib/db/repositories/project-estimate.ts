/**
 * Project ↔ Estimate linking (join table)
 */
import { db } from "@lib/db/client";

export type ProjectEstimateLinkSource =
  | "manual"
  | "monday"
  | "projects.monday_item_id"
  | "projects.linked_estimate_ids"
  | "estimate_editor_finalize"
  | string;

export interface ProjectEstimateLink {
  estimateId: number;
  mondayItemId: string | null;
  sharepointUrl: string | null;
  bidStatus: string | null;
  source: string;
  isCanonical: boolean;
  canonicalizedAt: string | null;
  createdAt: string;
}

export interface CanonicalProjectEstimate {
  projectId: number;
  estimateId: number;
  source: string;
  canonicalizedAt: string | null;
  mondayItemId: string | null;
  sharepointUrl: string | null;
  bidStatus: string | null;
  baseNumber: string | null;
  jobName: string;
  jobAddress: string | null;
  clientName: string | null;
  currentVersionId: string | null;
  currentVersionTotal: number | null;
}

export interface CanonicalProjectSovSection {
  id: string;
  name: string;
  title: string | null;
  showSubtotal: boolean;
  sortOrder: number;
}

export interface CanonicalProjectSovLineItem {
  id: string;
  sectionId: string | null;
  itemName: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  isExcluded: boolean;
  notes: string | null;
  sortOrder: number;
}

export interface CanonicalProjectSov {
  canonicalEstimate: CanonicalProjectEstimate;
  sections: CanonicalProjectSovSection[];
  lineItems: CanonicalProjectSovLineItem[];
}

export async function linkEstimateToProject(
  projectId: number,
  estimateId: number,
  source: ProjectEstimateLinkSource = "manual"
): Promise<boolean> {
  try {
    await db.run(
      `INSERT INTO project_estimates (project_id, estimate_id, source)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [projectId, estimateId, source]
    );
    return true;
  } catch {
    return false;
  }
}

export async function setCanonicalEstimateForProject(
  projectId: number,
  estimateId: number,
  source: ProjectEstimateLinkSource = "manual"
): Promise<boolean> {
  try {
    await db.transaction(async () => {
      await db.run(
        `INSERT INTO project_estimates (project_id, estimate_id, source)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id, estimate_id)
         DO UPDATE SET source = EXCLUDED.source`,
        [projectId, estimateId, source]
      );

      // Clear old canonical first (partial unique index allows only one TRUE per project)
      await db.run(
        `UPDATE project_estimates
         SET is_canonical = FALSE
         WHERE project_id = $1 AND is_canonical = TRUE`,
        [projectId]
      );

      await db.run(
        `UPDATE project_estimates
         SET is_canonical = TRUE, canonicalized_at = now()
         WHERE project_id = $1 AND estimate_id = $2`,
        [projectId, estimateId]
      );
    });

    return true;
  } catch {
    return false;
  }
}

export async function getEstimatesForProject(
  projectId: number
): Promise<ProjectEstimateLink[]> {
  const rows = await db
    .query<
      {
        estimate_id: number;
        monday_item_id: string | null;
        sharepoint_url: string | null;
        bid_status: string | null;
        source: string;
        is_canonical: boolean;
        canonicalized_at: string | null;
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
         pe.is_canonical,
         pe.canonicalized_at,
         pe.created_at
       FROM project_estimates pe
       JOIN estimates e ON e.id = pe.estimate_id
       WHERE pe.project_id = $1
       ORDER BY pe.is_canonical DESC,
                pe.canonicalized_at DESC NULLS LAST,
                pe.created_at DESC NULLS LAST,
                e.updated_at DESC`
    )
    .all(projectId);

  return rows.map((r) => ({
    estimateId: r.estimate_id,
    mondayItemId: r.monday_item_id,
    sharepointUrl: r.sharepoint_url,
    bidStatus: r.bid_status,
    source: r.source,
    isCanonical: r.is_canonical,
    canonicalizedAt: r.canonicalized_at,
    createdAt: r.created_at,
  }));
}

export async function getCanonicalEstimateForProject(
  projectId: number
): Promise<CanonicalProjectEstimate | null> {
  const row = await db
    .query<{
      project_id: number;
      estimate_id: number;
      source: string;
      canonicalized_at: string | null;
      monday_item_id: string | null;
      sharepoint_url: string | null;
      bid_status: string | null;
      base_number: string | null;
      job_name: string;
      job_address: string | null;
      client_name: string | null;
      current_version_id: string | null;
      current_version_total: number | null;
    }>(
      `SELECT
         pe.project_id,
         pe.estimate_id,
         pe.source,
         pe.canonicalized_at,
         e.monday_item_id,
         e.sharepoint_url,
         e.bid_status,
         e.base_number,
         COALESCE(e.job_name, e.name) AS job_name,
         e.job_address,
         e.contractor AS client_name,
         ev.id AS current_version_id,
         ev.total AS current_version_total
       FROM project_estimates pe
       JOIN estimates e ON e.id = pe.estimate_id
       LEFT JOIN LATERAL (
         SELECT id, total
         FROM estimate_versions
         WHERE estimate_id = e.id
         ORDER BY is_current DESC, version_number DESC, created_at DESC
         LIMIT 1
       ) ev ON true
       WHERE pe.project_id = $1
         AND pe.is_canonical = TRUE
       ORDER BY pe.canonicalized_at DESC NULLS LAST, pe.created_at DESC NULLS LAST
       LIMIT 1`
    )
    .get(projectId);

  if (!row) {
    return null;
  }

  return {
    projectId: row.project_id,
    estimateId: row.estimate_id,
    source: row.source,
    canonicalizedAt: row.canonicalized_at,
    mondayItemId: row.monday_item_id,
    sharepointUrl: row.sharepoint_url,
    bidStatus: row.bid_status,
    baseNumber: row.base_number,
    jobName: row.job_name,
    jobAddress: row.job_address,
    clientName: row.client_name,
    currentVersionId: row.current_version_id,
    currentVersionTotal: row.current_version_total,
  };
}

export async function getCanonicalProjectSov(
  projectId: number
): Promise<CanonicalProjectSov | null> {
  const canonicalEstimate = await getCanonicalEstimateForProject(projectId);
  if (!canonicalEstimate) {
    return null;
  }

  if (!canonicalEstimate.currentVersionId) {
    return {
      canonicalEstimate,
      sections: [],
      lineItems: [],
    };
  }

  const [sections, lineItems] = await Promise.all([
    db
      .query<{
        id: string;
        name: string;
        title: string | null;
        show_subtotal: number;
        sort_order: number;
      }>(
        `SELECT id, name, title, show_subtotal, sort_order
         FROM estimate_sections
         WHERE version_id = $1
         ORDER BY sort_order`
      )
      .all(canonicalEstimate.currentVersionId),
    db
      .query<{
        id: string;
        section_id: string | null;
        item_name: string | null;
        description: string;
        quantity: number;
        unit: string;
        unit_price: number;
        is_excluded: number;
        notes: string | null;
        sort_order: number;
      }>(
        `SELECT
           id,
           section_id,
           item_name,
           description,
           quantity,
           unit,
           unit_price,
           is_excluded,
           notes,
           sort_order
         FROM estimate_line_items
         WHERE version_id = $1
         ORDER BY sort_order`
      )
      .all(canonicalEstimate.currentVersionId),
  ]);

  return {
    canonicalEstimate,
    sections: sections.map((section) => ({
      id: section.id,
      name: section.name,
      title: section.title,
      showSubtotal: section.show_subtotal === 1,
      sortOrder: section.sort_order,
    })),
    lineItems: lineItems.map((item) => ({
      id: item.id,
      sectionId: item.section_id,
      itemName: item.item_name,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unit_price,
      isExcluded: item.is_excluded === 1,
      notes: item.notes,
      sortOrder: item.sort_order,
    })),
  };
}
