/**
 * Project Repository
 */
import { db } from "@lib/db/hub";
import { parseEmailRow } from "@lib/db/repositories/email";
import type { Email, Project } from "@lib/db/types";
import {
  normalizeProjectAlias,
  normalizeProjectNameKey,
  tokenizeProjectText,
  tokenOverlap,
  uniqueStrings,
} from "@lib/project-matching";

export type ProjectMatchReasonCode =
  | "normalized_name_exact"
  | "project_alias_exact"
  | "outlook_folder_exact"
  | "account_exact"
  | "primary_token_overlap"
  | "contractor_token_overlap"
  | "address_token_overlap";

export interface ProjectMatchReason {
  code: ProjectMatchReasonCode;
  points: number;
  detail: string;
}

export interface ProjectMatchCandidate {
  projectId: number;
  name: string;
  contractor: string | null;
  address: string | null;
  outlookFolder: string | null;
  accountId: number | null;
  updatedAt: string;
  score: number;
  confidence: number;
  reasons: ProjectMatchReason[];
}

export interface ProjectMatchDecision {
  best: ProjectMatchCandidate | null;
  runnerUp: ProjectMatchCandidate | null;
  autoLink: boolean;
  gap: number;
  reason: string;
  thresholds: {
    minScore: number;
    minGap: number;
  };
}

export interface ProjectMatchContext {
  primaryText: string;
  aliasHints: string[];
  contractorHint: string | null;
  addressHint: string | null;
  accountIdHint: number | null;
  primaryNameKey: string;
  nameKeys: string[];
  aliasKeys: string[];
  primaryTokens: string[];
  contractorTokens: string[];
  addressTokens: string[];
}

export interface ProjectMatchInput {
  primaryText: string;
  aliasHints?: string[];
  contractorHint?: string | null;
  addressHint?: string | null;
  accountIdHint?: number | null;
  limit?: number;
}

export interface ProjectMatchResult {
  context: ProjectMatchContext;
  candidates: ProjectMatchCandidate[];
  decision: ProjectMatchDecision;
}

interface ProjectCandidateRow {
  id: number;
  name: string;
  normalized_name: string | null;
  contractor: string | null;
  address: string | null;
  outlook_folder: string | null;
  account_id: number | null;
  updated_at: string;
}

const HARD_MATCH_CODES = new Set<ProjectMatchReasonCode>([
  "normalized_name_exact",
  "project_alias_exact",
  "outlook_folder_exact",
]);

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

// ============================================
// Project Alias Functions
// ============================================

export async function addProjectAlias(
  projectId: number,
  alias: string,
  source: "manual" | "monday" | "learned" = "manual"
): Promise<boolean> {
  const normalized = normalizeProjectAlias(alias);
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
  const normalized = normalizeProjectAlias(alias);
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

function scoreFromTokenOverlap(
  hintTokens: Set<string>,
  candidateText: string,
  maxPoints: number
): { points: number; common: string[] } {
  const overlap = tokenOverlap(hintTokens, tokenizeProjectText(candidateText));
  if (overlap.common.length === 0) {
    return { points: 0, common: [] };
  }
  const points = Math.max(5, Math.round(maxPoints * overlap.ratio));
  return { points, common: overlap.common };
}

function candidateConfidence(score: number): number {
  const clamped = Math.max(0, Math.min(1, score / 320));
  return Number(clamped.toFixed(3));
}

function buildMatchDecision(
  candidates: ProjectMatchCandidate[]
): ProjectMatchDecision {
  const best = candidates[0] ?? null;
  const runnerUp = candidates[1] ?? null;
  if (!best) {
    return {
      best: null,
      runnerUp: null,
      autoLink: false,
      gap: 0,
      reason: "no_project_candidates",
      thresholds: { minScore: 0, minGap: 0 },
    };
  }

  const hasHardAnchor = best.reasons.some((reason) =>
    HARD_MATCH_CODES.has(reason.code)
  );
  const minScore = hasHardAnchor ? 180 : 230;
  const minGap = hasHardAnchor ? 20 : 45;
  const gap = runnerUp ? best.score - runnerUp.score : best.score;
  const autoLink = best.score >= minScore && gap >= minGap;

  return {
    best,
    runnerUp,
    autoLink,
    gap,
    reason: autoLink ? "auto_link_threshold_met" : "manual_review_required",
    thresholds: { minScore, minGap },
  };
}

async function fetchProjectCandidateRows(context: {
  nameKeys: string[];
  aliasKeys: string[];
  primaryTokens: string[];
  accountIdHint: number | null;
}): Promise<{ rows: ProjectCandidateRow[]; aliasMatchedIds: Set<number> }> {
  const rowsById = new Map<number, ProjectCandidateRow>();
  const aliasMatchedIds = new Set<number>();

  if (context.nameKeys.length > 0) {
    const placeholders = context.nameKeys.map(() => "?").join(", ");
    const rows = await db
      .query<ProjectCandidateRow>(
        `SELECT
           id, name, normalized_name, contractor, address, outlook_folder,
           account_id, updated_at
         FROM projects
         WHERE normalized_name IN (${placeholders})`
      )
      .all(...context.nameKeys);
    for (const row of rows) {
      rowsById.set(row.id, row);
    }
  }

  if (context.aliasKeys.length > 0) {
    const placeholders = context.aliasKeys.map(() => "?").join(", ");
    const rows = await db
      .query<ProjectCandidateRow>(
        `SELECT
           p.id, p.name, p.normalized_name, p.contractor, p.address, p.outlook_folder,
           p.account_id, p.updated_at
         FROM project_aliases pa
         JOIN projects p ON p.id = pa.project_id
         WHERE pa.normalized_alias IN (${placeholders})`
      )
      .all(...context.aliasKeys);

    for (const row of rows) {
      rowsById.set(row.id, row);
      aliasMatchedIds.add(row.id);
    }
  }

  if (context.primaryTokens.length > 0 || context.accountIdHint != null) {
    const whereParts: string[] = [];
    const params: unknown[] = [];

    if (context.accountIdHint != null) {
      whereParts.push("account_id = ?");
      params.push(context.accountIdHint);
    }

    if (context.primaryTokens.length > 0) {
      const tokenClauses = context.primaryTokens
        .slice(0, 6)
        .map(
          () =>
            "(name ILIKE ? OR contractor ILIKE ? OR address ILIKE ? OR outlook_folder ILIKE ?)"
        );
      whereParts.push(tokenClauses.join(" OR "));
      for (const token of context.primaryTokens.slice(0, 6)) {
        const pattern = `%${token}%`;
        params.push(pattern, pattern, pattern, pattern);
      }
    }

    const rows = await db
      .query<ProjectCandidateRow>(
        `SELECT
           id, name, normalized_name, contractor, address, outlook_folder,
           account_id, updated_at
         FROM projects
         WHERE ${whereParts.join(" OR ")}
         ORDER BY updated_at DESC
         LIMIT 250`
      )
      .all(...params);

    for (const row of rows) {
      rowsById.set(row.id, row);
    }
  }

  return { rows: [...rowsById.values()], aliasMatchedIds };
}

export async function findProjectCandidates(
  input: ProjectMatchInput
): Promise<ProjectMatchResult | null> {
  const primaryText = (input.primaryText ?? "").trim();
  if (!primaryText) {
    return null;
  }

  const aliasHints = uniqueStrings(input.aliasHints ?? []);
  const contractorHint = (input.contractorHint ?? "").trim() || null;
  const addressHint = (input.addressHint ?? "").trim() || null;
  const accountIdHint =
    typeof input.accountIdHint === "number" ? input.accountIdHint : null;

  const nameKeys = uniqueStrings([primaryText, ...aliasHints]).map(
    normalizeProjectNameKey
  );
  const aliasKeys = uniqueStrings([primaryText, ...aliasHints]).map(
    normalizeProjectAlias
  );
  const primaryTokens = [
    ...tokenizeProjectText([primaryText, ...aliasHints].join(" ")),
  ];
  const contractorTokens = contractorHint
    ? [...tokenizeProjectText(contractorHint)]
    : [];
  const addressTokens = addressHint
    ? [...tokenizeProjectText(addressHint)]
    : [];

  const context: ProjectMatchContext = {
    primaryText,
    aliasHints,
    contractorHint,
    addressHint,
    accountIdHint,
    primaryNameKey: normalizeProjectNameKey(primaryText),
    nameKeys,
    aliasKeys,
    primaryTokens,
    contractorTokens,
    addressTokens,
  };

  const { rows, aliasMatchedIds } = await fetchProjectCandidateRows({
    nameKeys,
    aliasKeys,
    primaryTokens,
    accountIdHint,
  });

  const rawTexts = uniqueStrings([primaryText, ...aliasHints]).map((text) =>
    text.toLowerCase()
  );
  const nameKeySet = new Set(nameKeys);
  const primaryTokenSet = new Set(primaryTokens);
  const contractorTokenSet = new Set(contractorTokens);
  const addressTokenSet = new Set(addressTokens);

  const candidates: ProjectMatchCandidate[] = [];
  for (const row of rows) {
    const reasons: ProjectMatchReason[] = [];

    const normalizedName = row.normalized_name ?? "";
    if (normalizedName && nameKeySet.has(normalizedName)) {
      reasons.push({
        code: "normalized_name_exact",
        points: 230,
        detail: `normalized_name=${normalizedName}`,
      });
    }

    if (aliasMatchedIds.has(row.id)) {
      reasons.push({
        code: "project_alias_exact",
        points: 240,
        detail: "project_aliases.normalized_alias match",
      });
    }

    if (
      row.outlook_folder &&
      rawTexts.some((text) => text === row.outlook_folder?.toLowerCase())
    ) {
      reasons.push({
        code: "outlook_folder_exact",
        points: 210,
        detail: `outlook_folder=${row.outlook_folder}`,
      });
    }

    if (accountIdHint != null && row.account_id === accountIdHint) {
      reasons.push({
        code: "account_exact",
        points: 80,
        detail: `account_id=${accountIdHint}`,
      });
    }

    const projectOverlap = scoreFromTokenOverlap(
      primaryTokenSet,
      `${row.name ?? ""} ${row.outlook_folder ?? ""}`,
      95
    );
    if (projectOverlap.points > 0) {
      reasons.push({
        code: "primary_token_overlap",
        points: projectOverlap.points,
        detail: projectOverlap.common.slice(0, 8).join(", "),
      });
    }

    if (contractorTokenSet.size > 0) {
      const contractorOverlap = scoreFromTokenOverlap(
        contractorTokenSet,
        row.contractor ?? "",
        70
      );
      if (contractorOverlap.points > 0) {
        reasons.push({
          code: "contractor_token_overlap",
          points: contractorOverlap.points,
          detail: contractorOverlap.common.slice(0, 6).join(", "),
        });
      }
    }

    if (addressTokenSet.size > 0) {
      const addressOverlap = scoreFromTokenOverlap(
        addressTokenSet,
        row.address ?? "",
        70
      );
      if (addressOverlap.points > 0) {
        reasons.push({
          code: "address_token_overlap",
          points: addressOverlap.points,
          detail: addressOverlap.common.slice(0, 6).join(", "),
        });
      }
    }

    const score = reasons.reduce((sum, reason) => sum + reason.points, 0);
    if (score <= 0) {
      continue;
    }

    candidates.push({
      projectId: row.id,
      name: row.name,
      contractor: row.contractor,
      address: row.address,
      outlookFolder: row.outlook_folder,
      accountId: row.account_id,
      updatedAt: row.updated_at,
      score,
      confidence: candidateConfidence(score),
      reasons: reasons.sort((a, b) => b.points - a.points),
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const limit = Math.max(1, Math.min(25, input.limit ?? 10));
  const top = candidates.slice(0, limit);
  const decision = buildMatchDecision(top);

  return { context, candidates: top, decision };
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
