import { db } from "@lib/db/client";
import {
  normalizeProjectAlias,
  normalizeProjectNameKey,
  tokenizeProjectText,
  tokenOverlap,
  uniqueStrings,
} from "@lib/db/repositories/project-matching-utils";
import type {
  ProjectMatchCandidate,
  ProjectMatchContext,
  ProjectMatchDecision,
  ProjectMatchInput,
  ProjectMatchReason,
  ProjectMatchReasonCode,
  ProjectMatchResult,
} from "@lib/db/repositories/types";

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
  primaryTokens: string[];
  accountIdHint: number | null;
}): Promise<ProjectCandidateRow[]> {
  const rowsById = new Map<number, ProjectCandidateRow>();

  if (context.nameKeys.length > 0) {
    const placeholders = context.nameKeys
      .map((_, i) => `$${i + 1}`)
      .join(", ");
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

  if (context.primaryTokens.length > 0 || context.accountIdHint != null) {
    const whereParts: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (context.accountIdHint != null) {
      whereParts.push(`account_id = $${paramIndex++}`);
      params.push(context.accountIdHint);
    }

    if (context.primaryTokens.length > 0) {
      const tokenClauses = context.primaryTokens.slice(0, 6).map(() => {
        const p1 = paramIndex++;
        const p2 = paramIndex++;
        const p3 = paramIndex++;
        const p4 = paramIndex++;
        return `(name ILIKE $${p1} OR contractor ILIKE $${p2} OR address ILIKE $${p3} OR outlook_folder ILIKE $${p4})`;
      });
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

  return [...rowsById.values()];
}

export async function findProjectCandidates(
  input: ProjectMatchInput
): Promise<ProjectMatchResult | null> {
  const context = buildProjectMatchContext(input);
  if (!context) {
    return null;
  }

  const rows = await fetchProjectCandidateRows({
    nameKeys: context.nameKeys,
    primaryTokens: context.primaryTokens,
    accountIdHint: context.accountIdHint,
  });

  const rankingContext = buildProjectRankingContext(context);
  const candidates = rankProjectCandidates(rows, rankingContext);

  const limit = Math.max(1, Math.min(25, input.limit ?? 10));
  const top = candidates.slice(0, limit);
  const decision = buildMatchDecision(top);
  return { context, candidates: top, decision };
}

interface ProjectRankingContext {
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
  context: ProjectMatchContext
): ProjectRankingContext {
  const rawTexts = uniqueStrings([
    context.primaryText,
    ...context.aliasHints,
  ]).map((text) => text.toLowerCase());

  return {
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
