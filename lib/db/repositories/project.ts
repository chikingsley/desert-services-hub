/**
 * Project Repository
 */
import { db } from "@lib/db/hub";
import { parseEmailRow } from "@lib/db/repositories/email";
import type { Email, Project } from "@lib/db/types";

function parseProjectRow(row: Record<string, unknown>): Project {
  return {
    id: row.id as number,
    projectNumber: row.project_number as string | null,
    accountId: row.account_id as number | null,
    name: row.name as string,
    normalizedName: row.normalized_name as string | null,
    contractor: row.contractor as string | null,
    awardedValue: row.awarded_value as number | null,
    address: row.address as string | null,
    locationCity: row.location_city as string | null,
    locationState: row.location_state as string | null,
    locationZip: row.location_zip as string | null,
    status: (row.status as string) ?? "active",
    contractStatus: (row.contract_status as string) ?? "Pending",
    dustPermitStatus: (row.dust_permit_status as string) ?? "Not Needed",
    noiStatus: (row.noi_status as string) ?? "Not Needed",
    swpppStatus: (row.swppp_status as string) ?? "Not Needed",
    signsStatus: (row.signs_status as string) ?? "Not Needed",
    outlookFolder: row.outlook_folder as string | null,
    notes: row.notes as string | null,
    emailCount: (row.email_count as number) ?? 0,
    firstSeen: row.first_seen as string | null,
    lastSeen: row.last_seen as string | null,
    mondayItemId: row.monday_item_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function createProject(
  name: string,
  accountId?: number,
  address?: string
): Promise<Project> {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");

  const row = await db
    .query<
      Record<string, unknown>,
      [string, string, number | null, string | null]
    >(
      `INSERT INTO projects (name, normalized_name, account_id, address)
       VALUES (?, ?, ?, ?)
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
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM projects WHERE id = ?"
    )
    .get(id);

  return row ? parseProjectRow(row) : null;
}

export async function getProjectsForAccount(
  accountId: number
): Promise<Project[]> {
  const rows = await db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM projects WHERE account_id = ? ORDER BY last_seen DESC"
    )
    .all(accountId);

  return rows.map(parseProjectRow);
}

export async function getAllProjects(): Promise<Project[]> {
  const rows = await db
    .query<Record<string, unknown>, []>(
      "SELECT * FROM projects ORDER BY last_seen DESC"
    )
    .all();

  return rows.map(parseProjectRow);
}

export async function linkEmailToProject(
  emailId: number,
  projectId: number
): Promise<void> {
  await db.run("UPDATE emails SET project_id = ? WHERE id = ?", [
    projectId,
    emailId,
  ]);

  await db.run(
    `
    UPDATE projects SET
      email_count = (SELECT COUNT(*) FROM emails WHERE project_id = projects.id),
      first_seen = (SELECT MIN(received_at) FROM emails WHERE project_id = projects.id),
      last_seen = (SELECT MAX(received_at) FROM emails WHERE project_id = projects.id),
      updated_at = now()
    WHERE id = ?
  `,
    [projectId]
  );
}

export async function getEmailsForProject(projectId: number): Promise<Email[]> {
  const rows = await db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM emails WHERE project_id = ? ORDER BY received_at ASC"
    )
    .all(projectId);

  return rows.map(parseEmailRow);
}

export async function getEmailsForAccount(accountId: number): Promise<Email[]> {
  const rows = await db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM emails WHERE account_id = ? ORDER BY received_at DESC"
    )
    .all(accountId);

  return rows.map(parseEmailRow);
}

// ============================================
// Project Alias Functions
// ============================================

export async function addProjectAlias(
  projectId: number,
  alias: string,
  source: "manual" | "monday" | "learned" = "manual"
): Promise<boolean> {
  const normalized = alias
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();
  if (!normalized) {
    return false;
  }

  try {
    await db.run(
      `INSERT INTO project_aliases (project_id, alias, normalized_alias, source)
       VALUES (?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [projectId, alias, normalized, source]
    );
    return true;
  } catch {
    return false;
  }
}

export async function getProjectByAlias(
  alias: string
): Promise<Project | null> {
  const normalized = alias
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();
  const row = await db
    .query<{ project_id: number }, [string]>(
      "SELECT project_id FROM project_aliases WHERE normalized_alias = ?"
    )
    .get(normalized);

  if (!row) {
    return null;
  }
  return getProjectById(row.project_id);
}

export async function getAliasesForProject(
  projectId: number
): Promise<string[]> {
  const rows = await db
    .query<{ alias: string }, [number]>(
      "SELECT alias FROM project_aliases WHERE project_id = ?"
    )
    .all(projectId);
  return rows.map((r) => r.alias);
}

export async function findProjectByText(text: string): Promise<Project | null> {
  const byAlias = await getProjectByAlias(text);
  if (byAlias) {
    return byAlias;
  }

  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "");
  const row = await db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM projects WHERE normalized_name = ?"
    )
    .get(normalized);

  if (row) {
    return parseProjectRow(row);
  }
  return null;
}
export async function getAllProjectNames(): Promise<[number, string][]> {
  const rows = await db
    .query<{ id: number; name: string }, []>("SELECT id, name FROM projects")
    .all();
  return rows.map((r) => [r.id, r.name]);
}
