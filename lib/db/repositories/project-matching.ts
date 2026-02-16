import { db } from "@lib/db/hub";
import {
  normalizeProjectAlias,
  normalizeProjectNameKey,
  tokenizeProjectText,
  tokenOverlap,
  uniqueStrings,
} from "@lib/db/repositories/project-matching-utils";

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
  const context = buildProjectMatchContext(input);
  if (!context) {
    return null;
  }

  const { rows, aliasMatchedIds } = await fetchProjectCandidateRows({
    nameKeys: context.nameKeys,
    aliasKeys: context.aliasKeys,
    primaryTokens: context.primaryTokens,
    accountIdHint: context.accountIdHint,
  });

  const rankingContext = buildProjectRankingContext(context, aliasMatchedIds);
  const candidates = rankProjectCandidates(rows, rankingContext);

  const limit = Math.max(1, Math.min(25, input.limit ?? 10));
  const top = candidates.slice(0, limit);
  const decision = buildMatchDecision(top);
  return { context, candidates: top, decision };
}

interface ProjectRankingContext {
  aliasMatchedIds: Set<number>;
  rawTexts: Set<string>;
  nameKeys: Set<string>;
  primaryTokens: Set<string>;
  contractorTokens: Set<string>;
  addressTokens: Set<string>;
  accountIdHint: number | null;
}

function buildProjectMatchContext(
  input: ProjectMatchInput
): ProjectMatchContext | null {
  const primaryText = (input.primaryText ?? "").trim();
  if (!primaryText) {
    return null;
  }

  const aliasHints = uniqueStrings(input.aliasHints ?? []);
  const contractorHint = (input.contractorHint ?? "").trim() || null;
  const addressHint = (input.addressHint ?? "").trim() || null;
  const accountIdHint =
    typeof input.accountIdHint === "number" ? input.accountIdHint : null;

  const searchableTexts = uniqueStrings([primaryText, ...aliasHints]);
  return {
    primaryText,
    aliasHints,
    contractorHint,
    addressHint,
    accountIdHint,
    primaryNameKey: normalizeProjectNameKey(primaryText),
    nameKeys: searchableTexts.map(normalizeProjectNameKey),
    aliasKeys: searchableTexts.map(normalizeProjectAlias),
    primaryTokens: [...tokenizeProjectText(searchableTexts.join(" "))],
    contractorTokens: contractorHint
      ? [...tokenizeProjectText(contractorHint)]
      : [],
    addressTokens: addressHint ? [...tokenizeProjectText(addressHint)] : [],
  };
}

function buildProjectRankingContext(
  context: ProjectMatchContext,
  aliasMatchedIds: Set<number>
): ProjectRankingContext {
  const rawTexts = uniqueStrings([
    context.primaryText,
    ...context.aliasHints,
  ]).map((text) => text.toLowerCase());

  return {
    aliasMatchedIds,
    rawTexts: new Set(rawTexts),
    nameKeys: new Set(context.nameKeys),
    primaryTokens: new Set(context.primaryTokens),
    contractorTokens: new Set(context.contractorTokens),
    addressTokens: new Set(context.addressTokens),
    accountIdHint: context.accountIdHint,
  };
}

function normalizedNameReason(
  row: ProjectCandidateRow,
  context: ProjectRankingContext
): ProjectMatchReason | null {
  const normalizedName = row.normalized_name ?? "";
  if (!(normalizedName && context.nameKeys.has(normalizedName))) {
    return null;
  }
  return {
    code: "normalized_name_exact",
    points: 230,
    detail: `normalized_name=${normalizedName}`,
  };
}

function aliasReason(
  row: ProjectCandidateRow,
  context: ProjectRankingContext
): ProjectMatchReason | null {
  if (!context.aliasMatchedIds.has(row.id)) {
    return null;
  }
  return {
    code: "project_alias_exact",
    points: 240,
    detail: "project_aliases.normalized_alias match",
  };
}

function outlookFolderReason(
  row: ProjectCandidateRow,
  context: ProjectRankingContext
): ProjectMatchReason | null {
  const outlookFolder = row.outlook_folder?.toLowerCase();
  if (!(outlookFolder && context.rawTexts.has(outlookFolder))) {
    return null;
  }
  return {
    code: "outlook_folder_exact",
    points: 210,
    detail: `outlook_folder=${row.outlook_folder}`,
  };
}

function accountReason(
  row: ProjectCandidateRow,
  context: ProjectRankingContext
): ProjectMatchReason | null {
  if (
    context.accountIdHint == null ||
    row.account_id !== context.accountIdHint
  ) {
    return null;
  }
  return {
    code: "account_exact",
    points: 80,
    detail: `account_id=${context.accountIdHint}`,
  };
}

function primaryTokenReason(
  row: ProjectCandidateRow,
  context: ProjectRankingContext
): ProjectMatchReason | null {
  const overlap = scoreFromTokenOverlap(
    context.primaryTokens,
    `${row.name ?? ""} ${row.outlook_folder ?? ""}`,
    95
  );
  if (overlap.points <= 0) {
    return null;
  }
  return {
    code: "primary_token_overlap",
    points: overlap.points,
    detail: overlap.common.slice(0, 8).join(", "),
  };
}

function contractorTokenReason(
  row: ProjectCandidateRow,
  context: ProjectRankingContext
): ProjectMatchReason | null {
  if (context.contractorTokens.size === 0) {
    return null;
  }
  const overlap = scoreFromTokenOverlap(
    context.contractorTokens,
    row.contractor ?? "",
    70
  );
  if (overlap.points <= 0) {
    return null;
  }
  return {
    code: "contractor_token_overlap",
    points: overlap.points,
    detail: overlap.common.slice(0, 6).join(", "),
  };
}

function addressTokenReason(
  row: ProjectCandidateRow,
  context: ProjectRankingContext
): ProjectMatchReason | null {
  if (context.addressTokens.size === 0) {
    return null;
  }
  const overlap = scoreFromTokenOverlap(
    context.addressTokens,
    row.address ?? "",
    70
  );
  if (overlap.points <= 0) {
    return null;
  }
  return {
    code: "address_token_overlap",
    points: overlap.points,
    detail: overlap.common.slice(0, 6).join(", "),
  };
}

function collectCandidateReasons(
  row: ProjectCandidateRow,
  context: ProjectRankingContext
): ProjectMatchReason[] {
  const reasons = [
    normalizedNameReason(row, context),
    aliasReason(row, context),
    outlookFolderReason(row, context),
    accountReason(row, context),
    primaryTokenReason(row, context),
    contractorTokenReason(row, context),
    addressTokenReason(row, context),
  ].filter((value): value is ProjectMatchReason => Boolean(value));

  return reasons.sort((a, b) => b.points - a.points);
}

function toProjectMatchCandidate(
  row: ProjectCandidateRow,
  reasons: ProjectMatchReason[]
): ProjectMatchCandidate | null {
  const score = reasons.reduce((sum, reason) => sum + reason.points, 0);
  if (score <= 0) {
    return null;
  }
  return {
    projectId: row.id,
    name: row.name,
    contractor: row.contractor,
    address: row.address,
    outlookFolder: row.outlook_folder,
    accountId: row.account_id,
    updatedAt: row.updated_at,
    score,
    confidence: candidateConfidence(score),
    reasons,
  };
}

function sortProjectCandidates(
  lhs: ProjectMatchCandidate,
  rhs: ProjectMatchCandidate
): number {
  if (rhs.score !== lhs.score) {
    return rhs.score - lhs.score;
  }
  return new Date(rhs.updatedAt).getTime() - new Date(lhs.updatedAt).getTime();
}

function rankProjectCandidates(
  rows: ProjectCandidateRow[],
  context: ProjectRankingContext
): ProjectMatchCandidate[] {
  const candidates: ProjectMatchCandidate[] = [];
  for (const row of rows) {
    const reasons = collectCandidateReasons(row, context);
    const candidate = toProjectMatchCandidate(row, reasons);
    if (!candidate) {
      continue;
    }
    candidates.push(candidate);
  }
  return candidates.sort(sortProjectCandidates);
}
