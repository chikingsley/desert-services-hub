/**
 * Database Queries for Project Tracking
 */
import { db, type ProjectTask, type ProjectTracking } from "./schema";

// Project view type - from projects table with aggregated estimate data + tracking
export type ProjectRow = {
  id: number;
  name: string;
  status: string;
  contractor: string | null;
  awarded_value: number | null;
  estimate_count: number;
  monday_url: string | null;
  // Tracking fields (for inline pills)
  tracking_id: number | null;
  has_contract: number;
  contract_signed: number;
  needs_dust_permit: number;
  dust_permit_filed: number;
  needs_noi: number;
  noi_filed: number;
  needs_swppp: number;
  swppp_plan_received: number;
  needs_grading_drainage: number;
  grading_drainage_received: number;
  certified_payroll_required: number;
  insurance_verified: number;
};

// Legacy type for compatibility
export type ProjectView = ProjectRow;

export type ProjectDetails = {
  project: ProjectView;
  tracking: ProjectTracking | null;
  tasks: ProjectTask[];
};

const ACTIVE_BID_STATUSES = ["Won", "Pending Won", "Add to Projects"];
const LOST_BID_STATUSES = ["Lost", "GC Not Awarded", "Duplicates"];

function buildStatusCase(): string {
  const activeList = ACTIVE_BID_STATUSES.map((s) => `'${s}'`).join(", ");
  const lostList = LOST_BID_STATUSES.map((s) => `'${s}'`).join(", ");
  return `
    CASE
      WHEN EXISTS (
        SELECT 1 FROM estimates e
        WHERE e.project_id = p.id AND e.bid_status IN (${activeList})
      ) THEN 'active'
      WHEN EXISTS (
        SELECT 1 FROM estimates e
        WHERE e.project_id = p.id AND e.bid_status IN (${lostList})
      ) THEN 'lost'
      ELSE 'open'
    END
  `;
}

function getPrimaryEstimateId(projectId: number): number | null {
  const activeList = ACTIVE_BID_STATUSES.map((s) => `'${s}'`).join(", ");
  const primary = db
    .query<{ id: number }, [number]>(
      `
      SELECT id
      FROM estimates
      WHERE project_id = ? AND bid_status IN (${activeList})
      ORDER BY (awarded_value IS NULL), awarded_value DESC, id ASC
      LIMIT 1
    `
    )
    .get(projectId);

  if (primary?.id) {
    return primary.id;
  }

  const fallback = db
    .query<{ id: number }, [number]>(
      `
      SELECT id
      FROM estimates
      WHERE project_id = ?
      ORDER BY id ASC
      LIMIT 1
    `
    )
    .get(projectId);

  return fallback?.id ?? null;
}

function getTrackingByProjectId(projectId: number): ProjectTracking | null {
  return (
    db
      .query<ProjectTracking, [number]>(
        `
        SELECT pt.*
        FROM project_tracking pt
        JOIN estimates e ON e.id = pt.estimate_id
        WHERE e.project_id = ?
        LIMIT 1
      `
      )
      .get(projectId) ?? null
  );
}

function ensureTracking(projectId: number): ProjectTracking | null {
  const existing = getTrackingByProjectId(projectId);
  if (existing) {
    if (existing.needs_noi === 0) {
      db.run(
        `UPDATE project_tracking SET needs_noi = 1, updated_at = datetime('now') WHERE id = ?`,
        [existing.id]
      );
      return getTrackingByProjectId(projectId);
    }
    return existing;
  }

  const estimateId = getPrimaryEstimateId(projectId);
  if (!estimateId) {
    return null;
  }

  db.run(
    `
    INSERT OR IGNORE INTO project_tracking (estimate_id, needs_noi)
    VALUES (?, 1)
  `,
    [estimateId]
  );

  return getTrackingByProjectId(projectId);
}

/**
 * Get all active projects (status = 'active')
 */
export function getActiveProjects(): ProjectRow[] {
  const statusCase = buildStatusCase();
  return db
    .query<ProjectRow, []>(
      `
      SELECT
        p.id,
        p.name,
        ${statusCase} as status,
        (SELECT e.contractor FROM estimates e WHERE e.project_id = p.id AND e.bid_status = 'Won' LIMIT 1) as contractor,
        (SELECT SUM(e.awarded_value) FROM estimates e WHERE e.project_id = p.id AND e.bid_status = 'Won') as awarded_value,
        (SELECT COUNT(*) FROM estimates e WHERE e.project_id = p.id) as estimate_count,
        (SELECT e.monday_url FROM estimates e WHERE e.project_id = p.id AND e.bid_status = 'Won' LIMIT 1) as monday_url,
        pt.id as tracking_id,
        COALESCE(pt.has_contract, 0) as has_contract,
        COALESCE(pt.contract_signed, 0) as contract_signed,
        COALESCE(pt.needs_dust_permit, 0) as needs_dust_permit,
        COALESCE(pt.dust_permit_filed, 0) as dust_permit_filed,
        COALESCE(pt.needs_noi, 0) as needs_noi,
        COALESCE(pt.noi_filed, 0) as noi_filed,
        COALESCE(pt.needs_swppp, 0) as needs_swppp,
        COALESCE(pt.swppp_plan_received, 0) as swppp_plan_received,
        COALESCE(pt.needs_grading_drainage, 0) as needs_grading_drainage,
        COALESCE(pt.grading_drainage_received, 0) as grading_drainage_received,
        COALESCE(pt.certified_payroll_required, 0) as certified_payroll_required,
        COALESCE(pt.insurance_verified, 0) as insurance_verified
      FROM projects p
      LEFT JOIN estimates e_primary ON e_primary.project_id = p.id AND e_primary.bid_status = 'Won'
      LEFT JOIN project_tracking pt ON pt.estimate_id = e_primary.id
      WHERE (${statusCase}) = 'active'
      GROUP BY p.id
      ORDER BY p.name
    `
    )
    .all();
}

/**
 * Get projects by status
 */
export function getProjectsByStatus(status: string): ProjectRow[] {
  const statusCase = buildStatusCase();
  return db
    .query<ProjectRow, [string]>(
      `
      SELECT
        p.id,
        p.name,
        ${statusCase} as status,
        (SELECT e.contractor FROM estimates e WHERE e.project_id = p.id LIMIT 1) as contractor,
        (SELECT SUM(e.awarded_value) FROM estimates e WHERE e.project_id = p.id) as awarded_value,
        (SELECT COUNT(*) FROM estimates e WHERE e.project_id = p.id) as estimate_count,
        (SELECT e.monday_url FROM estimates e WHERE e.project_id = p.id LIMIT 1) as monday_url,
        pt.id as tracking_id,
        COALESCE(pt.has_contract, 0) as has_contract,
        COALESCE(pt.contract_signed, 0) as contract_signed,
        COALESCE(pt.needs_dust_permit, 0) as needs_dust_permit,
        COALESCE(pt.dust_permit_filed, 0) as dust_permit_filed,
        COALESCE(pt.needs_noi, 0) as needs_noi,
        COALESCE(pt.noi_filed, 0) as noi_filed,
        COALESCE(pt.needs_swppp, 0) as needs_swppp,
        COALESCE(pt.swppp_plan_received, 0) as swppp_plan_received,
        COALESCE(pt.needs_grading_drainage, 0) as needs_grading_drainage,
        COALESCE(pt.grading_drainage_received, 0) as grading_drainage_received,
        COALESCE(pt.certified_payroll_required, 0) as certified_payroll_required,
        COALESCE(pt.insurance_verified, 0) as insurance_verified
      FROM projects p
      LEFT JOIN estimates e_primary ON e_primary.project_id = p.id
      LEFT JOIN project_tracking pt ON pt.estimate_id = e_primary.id
      WHERE (${statusCase}) = ?
      GROUP BY p.id
      ORDER BY p.name
    `
    )
    .all(status);
}

/**
 * Get ALL projects regardless of status
 */
export function getAllProjects(): ProjectRow[] {
  const statusCase = buildStatusCase();
  return db
    .query<ProjectRow, []>(
      `
      SELECT
        p.id,
        p.name,
        ${statusCase} as status,
        (SELECT e.contractor FROM estimates e WHERE e.project_id = p.id LIMIT 1) as contractor,
        (SELECT SUM(e.awarded_value) FROM estimates e WHERE e.project_id = p.id) as awarded_value,
        (SELECT COUNT(*) FROM estimates e WHERE e.project_id = p.id) as estimate_count,
        (SELECT e.monday_url FROM estimates e WHERE e.project_id = p.id LIMIT 1) as monday_url,
        pt.id as tracking_id,
        COALESCE(pt.has_contract, 0) as has_contract,
        COALESCE(pt.contract_signed, 0) as contract_signed,
        COALESCE(pt.needs_dust_permit, 0) as needs_dust_permit,
        COALESCE(pt.dust_permit_filed, 0) as dust_permit_filed,
        COALESCE(pt.needs_noi, 0) as needs_noi,
        COALESCE(pt.noi_filed, 0) as noi_filed,
        COALESCE(pt.needs_swppp, 0) as needs_swppp,
        COALESCE(pt.swppp_plan_received, 0) as swppp_plan_received,
        COALESCE(pt.needs_grading_drainage, 0) as needs_grading_drainage,
        COALESCE(pt.grading_drainage_received, 0) as grading_drainage_received,
        COALESCE(pt.certified_payroll_required, 0) as certified_payroll_required,
        COALESCE(pt.insurance_verified, 0) as insurance_verified
      FROM projects p
      LEFT JOIN estimates e_primary ON e_primary.project_id = p.id
      LEFT JOIN project_tracking pt ON pt.estimate_id = e_primary.id
      GROUP BY p.id
      ORDER BY p.name
    `
    )
    .all();
}

/**
 * Get a single project by ID
 */
export function getProject(projectId: number): ProjectView | null {
  const statusCase = buildStatusCase();
  return (
    db
      .query<ProjectView, [number]>(
        `
        SELECT
          p.id,
          p.name,
          ${statusCase} as status,
          (SELECT e.contractor FROM estimates e WHERE e.project_id = p.id AND e.bid_status = 'Won' LIMIT 1) as contractor,
          (SELECT SUM(e.awarded_value) FROM estimates e WHERE e.project_id = p.id AND e.bid_status = 'Won') as awarded_value,
          (SELECT COUNT(*) FROM estimates e WHERE e.project_id = p.id) as estimate_count,
          (SELECT e.monday_url FROM estimates e WHERE e.project_id = p.id AND e.bid_status = 'Won' LIMIT 1) as monday_url
        FROM projects p
        WHERE p.id = ?
      `
      )
      .get(projectId) ?? null
  );
}

/**
 * Update project status
 */
export function updateProjectStatus(projectId: number, status: string): void {
  const validStatuses = ["open", "active", "lost"];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  db.run(
    `UPDATE projects SET status = ?, updated_at = datetime('now') WHERE id = ?`,
    [status, projectId]
  );
}

/**
 * Get summary stats
 */
export function getStats() {
  const statusCase = buildStatusCase();
  const active = db
    .query<{ count: number }, []>(
      `SELECT COUNT(*) as count FROM projects p WHERE (${statusCase}) = 'active'`
    )
    .get()?.count;

  const open = db
    .query<{ count: number }, []>(
      `SELECT COUNT(*) as count FROM projects p WHERE (${statusCase}) = 'open'`
    )
    .get()?.count;

  const lost = db
    .query<{ count: number }, []>(
      `SELECT COUNT(*) as count FROM projects p WHERE (${statusCase}) = 'lost'`
    )
    .get()?.count;

  return { active, open, lost };
}

export function getProjectDetails(projectId: number): ProjectDetails | null {
  const project = getProject(projectId);
  if (!project) {
    return null;
  }

  const tracking = ensureTracking(projectId);

  const tasks = db
    .query<ProjectTask, [number]>(
      `
      SELECT t.*
      FROM project_tasks t
      JOIN project_tracking pt ON pt.id = t.tracking_id
      JOIN estimates e ON e.id = pt.estimate_id
      WHERE e.project_id = ?
      ORDER BY t.created_at DESC, t.id DESC
    `
    )
    .all(projectId);

  return { project, tracking, tasks };
}

export function updateProjectTracking(
  projectId: number,
  updates: Partial<ProjectTracking>
): ProjectTracking | null {
  const tracking = ensureTracking(projectId);
  if (!tracking) {
    return null;
  }

  const allowedFields = new Set([
    "has_contract",
    "contract_signed",
    "contract_file_path",
    "needs_dust_permit",
    "dust_permit_filed",
    "dust_permit_number",
    "dust_permit_expiry",
    "needs_noi",
    "noi_filed",
    "noi_file_path",
    "needs_swppp",
    "swppp_plan_received",
    "swppp_file_path",
    "needs_grading_drainage",
    "grading_drainage_received",
    "certified_payroll_required",
    "insurance_verified",
    "insurance_exception",
    "swppp_sign_ordered",
    "dust_sign_ordered",
    "status",
    "notes",
  ]);

  const fields: string[] = [];
  const params: Array<string | number | null> = [];

  for (const [key, value] of Object.entries(updates)) {
    if (!allowedFields.has(key)) {
      continue;
    }
    if (key === "needs_noi") {
      fields.push(`${key} = ?`);
      params.push(1);
      continue;
    }
    fields.push(`${key} = ?`);
    params.push(value as string | number | null);
  }

  if (fields.length === 0) {
    return getTrackingByProjectId(projectId);
  }

  fields.push("updated_at = datetime('now')");
  params.push(tracking.id);

  db.run(
    `UPDATE project_tracking SET ${fields.join(", ")} WHERE id = ?`,
    params
  );
  return getTrackingByProjectId(projectId);
}

export function createProjectTask(
  projectId: number,
  description: string
): ProjectTask | null {
  const tracking = ensureTracking(projectId);
  if (!tracking) {
    return null;
  }

  db.run(
    `
    INSERT INTO project_tasks (tracking_id, description, status)
    VALUES (?, ?, ?)
  `,
    [tracking.id, description, "todo"]
  );

  const row = db
    .query<{ id: number }, []>("SELECT last_insert_rowid() as id")
    .get();

  if (!row?.id) {
    return null;
  }

  return (
    db
      .query<ProjectTask, [number]>("SELECT * FROM project_tasks WHERE id = ?")
      .get(row.id) ?? null
  );
}

export function updateProjectTask(
  taskId: number,
  updates: Partial<ProjectTask>
): ProjectTask | null {
  const fields: string[] = [];
  const params: Array<string | number | null> = [];

  if (updates.description !== undefined) {
    fields.push("description = ?");
    params.push(updates.description);
  }

  if (updates.status !== undefined) {
    fields.push("status = ?");
    params.push(updates.status);
    fields.push(
      "completed_at = CASE WHEN ? = 'done' THEN datetime('now') ELSE NULL END"
    );
    params.push(updates.status);
  }

  if (updates.notes !== undefined) {
    fields.push("notes = ?");
    params.push(updates.notes);
  }

  if (fields.length === 0) {
    return (
      db
        .query<ProjectTask, [number]>(
          "SELECT * FROM project_tasks WHERE id = ?"
        )
        .get(taskId) ?? null
    );
  }

  params.push(taskId);
  db.run(`UPDATE project_tasks SET ${fields.join(", ")} WHERE id = ?`, params);

  return (
    db
      .query<ProjectTask, [number]>("SELECT * FROM project_tasks WHERE id = ?")
      .get(taskId) ?? null
  );
}
