/**
 * Project Repository
 */
import { db } from "../connection";
import type { Email, Project } from "../types";
import { parseEmailRow } from "./email";

function parseProjectRow(row: Record<string, unknown>): Project {
  return {
    id: row.id as number,
    accountId: row.account_id as number | null,
    name: row.name as string,
    normalizedName: row.normalized_name as string | null,
    address: row.address as string | null,
    emailCount: (row.email_count as number) ?? 0,
    firstSeen: row.first_seen as string | null,
    lastSeen: row.last_seen as string | null,
    mondayItemId: row.monday_item_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function createProject(
  name: string,
  accountId?: number,
  address?: string
): Project {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");

  db.run(
    `INSERT INTO projects (name, normalized_name, account_id, address)
     VALUES (?, ?, ?, ?)`,
    [name, normalized, accountId ?? null, address ?? null]
  );

  const row = db
    .query<Record<string, unknown>, []>(
      "SELECT * FROM projects WHERE id = last_insert_rowid()"
    )
    .get();

  if (!row) {
    throw new Error(`Failed to create project: ${name}`);
  }
  return parseProjectRow(row);
}

export function getProjectById(id: number): Project | null {
  const row = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM projects WHERE id = ?"
    )
    .get(id);

  return row ? parseProjectRow(row) : null;
}

export function getProjectsForAccount(accountId: number): Project[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM projects WHERE account_id = ? ORDER BY last_seen DESC"
    )
    .all(accountId);

  return rows.map(parseProjectRow);
}

export function getAllProjects(): Project[] {
  const rows = db
    .query<Record<string, unknown>, []>(
      "SELECT * FROM projects ORDER BY last_seen DESC"
    )
    .all();

  return rows.map(parseProjectRow);
}

export function linkEmailToProject(emailId: number, projectId: number): void {
  db.run("UPDATE emails SET project_id = ? WHERE id = ?", [projectId, emailId]);

  db.run(
    `
    UPDATE projects SET
      email_count = (SELECT COUNT(*) FROM emails WHERE project_id = projects.id),
      first_seen = (SELECT MIN(received_at) FROM emails WHERE project_id = projects.id),
      last_seen = (SELECT MAX(received_at) FROM emails WHERE project_id = projects.id),
      updated_at = datetime('now')
    WHERE id = ?
  `,
    [projectId]
  );
}

export function getEmailsForProject(projectId: number): Email[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM emails WHERE project_id = ? ORDER BY received_at ASC"
    )
    .all(projectId);

  return rows.map(parseEmailRow);
}

export function getEmailsForAccount(accountId: number): Email[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM emails WHERE account_id = ? ORDER BY received_at DESC"
    )
    .all(accountId);

  return rows.map(parseEmailRow);
}

// ============================================
// Project Alias Functions
// ============================================

export function addProjectAlias(
  projectId: number,
  alias: string,
  source: "manual" | "monday" | "learned" = "manual"
): boolean {
  const normalized = alias
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();
  if (!normalized) {
    return false;
  }

  try {
    db.run(
      `INSERT OR IGNORE INTO project_aliases (project_id, alias, normalized_alias, source)
       VALUES (?, ?, ?, ?)`,
      [projectId, alias, normalized, source]
    );
    return true;
  } catch {
    return false;
  }
}

export function getProjectByAlias(alias: string): Project | null {
  const normalized = alias
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();
  const row = db
    .query<{ project_id: number }, [string]>(
      "SELECT project_id FROM project_aliases WHERE normalized_alias = ?"
    )
    .get(normalized);

  if (!row) {
    return null;
  }
  return getProjectById(row.project_id);
}

export function getAliasesForProject(projectId: number): string[] {
  const rows = db
    .query<{ alias: string }, [number]>(
      "SELECT alias FROM project_aliases WHERE project_id = ?"
    )
    .all(projectId);
  return rows.map((r) => r.alias);
}

export function findProjectByText(text: string): Project | null {
  const byAlias = getProjectByAlias(text);
  if (byAlias) {
    return byAlias;
  }

  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "");
  const row = db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM projects WHERE normalized_name = ?"
    )
    .get(normalized);

  if (row) {
    return parseProjectRow(row);
  }
  return null;
}
