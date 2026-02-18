/**
 * Project Repository
 */
import { db } from "@lib/db/hub";
import { parseEmailRow } from "@lib/db/repositories/email";
import type {
  ProjectMatchCandidate as ProjectMatchCandidateInternal,
  ProjectMatchContext as ProjectMatchContextInternal,
  ProjectMatchDecision as ProjectMatchDecisionInternal,
  ProjectMatchInput as ProjectMatchInputInternal,
  ProjectMatchReasonCode as ProjectMatchReasonCodeInternal,
  ProjectMatchReason as ProjectMatchReasonInternal,
  ProjectMatchResult as ProjectMatchResultInternal,
} from "@lib/db/repositories/project-matching";
import { findProjectCandidates as findProjectCandidatesInternal } from "@lib/db/repositories/project-matching";
import {
  normalizeProjectAlias as normalizeProjectAliasInternal,
  normalizeProjectNameKey as normalizeProjectNameKeyInternal,
  tokenizeProjectText as tokenizeProjectTextInternal,
  tokenOverlap as tokenOverlapInternal,
  uniqueStrings as uniqueStringsInternal,
} from "@lib/db/repositories/project-matching-utils";
import type { Email, Project } from "@lib/db/types";

export function normalizeProjectAlias(text: string): string {
  return normalizeProjectAliasInternal(text);
}

export function normalizeProjectNameKey(text: string): string {
  return normalizeProjectNameKeyInternal(text);
}

export function tokenizeProjectText(
  text: string,
  opts?: { stopWords?: Set<string>; minLen?: number }
): Set<string> {
  return tokenizeProjectTextInternal(text, opts);
}

export function tokenOverlap(
  lhs: Set<string>,
  rhs: Set<string>
): { common: string[]; ratio: number } {
  return tokenOverlapInternal(lhs, rhs);
}

export function uniqueStrings(
  values: Array<string | null | undefined>
): string[] {
  return uniqueStringsInternal(values);
}

export type ProjectMatchReasonCode = ProjectMatchReasonCodeInternal;
export type ProjectMatchReason = ProjectMatchReasonInternal;
export type ProjectMatchCandidate = ProjectMatchCandidateInternal;
export type ProjectMatchDecision = ProjectMatchDecisionInternal;
export type ProjectMatchContext = ProjectMatchContextInternal;
export type ProjectMatchInput = ProjectMatchInputInternal;
export type ProjectMatchResult = ProjectMatchResultInternal;

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
    status:
      (row.lifecycle_state as string) ?? (row.status as string) ?? "active",
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
  const normalized = normalizeProjectNameKey(name);

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
  const existing = await db
    .query<{ project_id: number | null }, [number]>(
      "SELECT project_id FROM emails WHERE id = ?"
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
    "UPDATE emails SET project_id = ? WHERE id = ? AND project_id IS NULL",
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

export async function findProjectByText(text: string): Promise<Project | null> {
  const normalized = normalizeProjectNameKey(text);
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

export function findProjectCandidates(
  input: ProjectMatchInput
): Promise<ProjectMatchResult | null> {
  return findProjectCandidatesInternal(input);
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
