/**
 * Project Repository
 */
import { db } from "@lib/db/client";
import type { Database } from "@lib/db/generated/database.types";
import { parseEmailRow } from "@email/db/email";
import { findProjectCandidates } from "@projects/db/project-matching";
import { normalizeProjectNameKey } from "@projects/db/project-matching-utils";
import type { ProjectMatchInput } from "@lib/db/repositories/types";
import type { Email, Project } from "@lib/db/types";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type EmailRow = Database["public"]["Tables"]["emails"]["Row"];

function parseProjectRow(row: ProjectRow): Project {
  return {
    id: row.id,
    projectNumber: row.project_number,
    accountId: row.account_id,
    name: row.name,
    normalizedName: row.normalized_name,
    contractor: row.contractor,
    awardedValue: row.awarded_value,
    address: row.address,
    locationCity: row.location_city,
    locationState: row.location_state,
    locationZip: row.location_zip,
    status: row.lifecycle_state ?? "active",
    contractStatus: row.contract_status ?? "Pending",
    dustPermitStatus: row.dust_permit_status ?? "Not Needed",
    noiStatus: row.noi_status ?? "Not Needed",
    swpppStatus: row.swppp_status ?? "Not Needed",
    signsStatus: row.signs_status ?? "Not Needed",
    outlookFolder: row.outlook_folder,
    notes: row.notes,
    emailCount: Number(row.email_count ?? 0),
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    mondayItemId: row.monday_item_id,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function createProject(
  name: string,
  accountId?: number,
  address?: string
): Promise<Project> {
  const normalized = normalizeProjectNameKey(name);

  const row = await db
    .query<ProjectRow, [string, string, number | null, string | null]>(
      `INSERT INTO projects (name, normalized_name, account_id, address)
       VALUES ($1, $2, $3, $4)
       RETURNING *`
    )
    .get(name, normalized, accountId ?? null, address ?? null);

  if (!row) {
    throw new Error(`Failed to create project: ${name}`);
  }
  return parseProjectRow(row);
}

export async function getProjectById(id: number): Promise<Project | null> {
  const row = await db
    .query<ProjectRow, [number]>("SELECT * FROM projects WHERE id = $1")
    .get(id);

  return row ? parseProjectRow(row) : null;
}

export async function getProjectsForAccount(
  accountId: number
): Promise<Project[]> {
  const rows = await db
    .query<ProjectRow, [number]>(
      "SELECT * FROM projects WHERE account_id = $1 ORDER BY last_seen DESC"
    )
    .all(accountId);

  return rows.map(parseProjectRow);
}

export async function getAllProjects(): Promise<Project[]> {
  const rows = await db
    .query<ProjectRow, []>("SELECT * FROM projects ORDER BY last_seen DESC")
    .all();

  return rows.map(parseProjectRow);
}

export async function linkEmailToProject(
  emailId: number,
  projectId: number
): Promise<void> {
  const existing = await db
    .query<{ project_id: number | null }, [number]>(
      "SELECT project_id FROM emails WHERE id = $1"
    )
    .get(emailId);

  if (!existing) {
    return;
  }

  if (existing.project_id === projectId) {
    return;
  }

  if (existing.project_id !== null) {
    console.warn(
      `[project-link] Skipping project overwrite for email #${emailId}: existing #${existing.project_id}, requested #${projectId}`
    );
    return;
  }

  const result = await db.run(
    "UPDATE emails SET project_id = $1 WHERE id = $2 AND project_id IS NULL",
    [projectId, emailId]
  );
  if (result.count === 0) {
    return;
  }

  await db.run(
    `
    UPDATE projects SET
      email_count = (SELECT COUNT(*) FROM emails WHERE project_id = projects.id),
      first_seen = (SELECT MIN(received_at) FROM emails WHERE project_id = projects.id),
      last_seen = (SELECT MAX(received_at) FROM emails WHERE project_id = projects.id),
      updated_at = now()
    WHERE id = $1
  `,
    [projectId]
  );
}

export async function getEmailsForProject(projectId: number): Promise<Email[]> {
  const rows = await db
    .query<EmailRow, [number]>(
      "SELECT * FROM emails WHERE project_id = $1 ORDER BY received_at ASC"
    )
    .all(projectId);

  return rows.map(parseEmailRow);
}

export async function getEmailsForAccount(accountId: number): Promise<Email[]> {
  const rows = await db
    .query<EmailRow, [number]>(
      "SELECT * FROM emails WHERE account_id = $1 ORDER BY received_at DESC"
    )
    .all(accountId);

  return rows.map(parseEmailRow);
}

export async function findProjectByText(text: string): Promise<Project | null> {
  const normalized = normalizeProjectNameKey(text);
  const row = await db
    .query<ProjectRow, [string]>(
      "SELECT * FROM projects WHERE normalized_name = $1"
    )
    .get(normalized);

  if (row) {
    return parseProjectRow(row);
  }
  return null;
}

export async function findBestProjectMatch(
  input: ProjectMatchInput
): Promise<Project | null> {
  const result = await findProjectCandidates(input);
  const best = result?.decision.best;
  if (!(best && result.decision.autoLink)) {
    return null;
  }
  return await getProjectById(best.projectId);
}

export async function getAllProjectNames(): Promise<[number, string][]> {
  const rows = await db
    .query<{ id: number; name: string }, []>("SELECT id, name FROM projects")
    .all();
  return rows.map((r) => [r.id, r.name]);
}

export async function updateProjectContractStatus(
  projectId: number,
  contractStatus: string
): Promise<Project | null> {
  return await updateProjectWorkflowStatus(projectId, "contract", contractStatus);
}

export type ProjectWorkflowStatusField =
  | "contract"
  | "dust_permit"
  | "safety"
  | "noi";

const PROJECT_WORKFLOW_STATUS_COLUMN: Record<ProjectWorkflowStatusField, string> = {
  contract: "contract_status",
  dust_permit: "dust_permit_status",
  safety: "swppp_status",
  noi: "noi_status",
};

export async function updateProjectWorkflowStatus(
  projectId: number,
  field: ProjectWorkflowStatusField,
  status: string
): Promise<Project | null> {
  const column = PROJECT_WORKFLOW_STATUS_COLUMN[field];
  const row = await db
    .query<ProjectRow, [string, number]>(
      `UPDATE projects
       SET ${column} = $1,
           updated_at = now()
       WHERE id = $2
       RETURNING *`
    )
    .get(status, projectId);

  return row ? parseProjectRow(row) : null;
}
