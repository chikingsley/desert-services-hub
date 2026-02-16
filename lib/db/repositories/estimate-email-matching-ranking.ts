import type {
  EstimateCandidateRow,
  EstimateMatchCandidate,
  EstimateMatchContext,
  EstimateMatchDecision,
  EstimateMatchReason,
} from "@lib/db/repositories/estimate-email-matching-types";
import {
  extractEstimateNumbers,
  extractMondayItemIds,
  normalizeEstimateNumberDigits,
  tokenize,
  tokenOverlap,
} from "@lib/db/repositories/estimate-email-matching-types";

function scoreFromTokenOverlap(
  hintSources: string[],
  candidateText: string,
  maxPoints: number
): { points: number; common: string[] } {
  const hintTokens = tokenize(hintSources.join(" "));
  const overlap = tokenOverlap(hintTokens, tokenize(candidateText));
  if (overlap.common.length === 0) {
    return { points: 0, common: [] };
  }
  const points = Math.max(5, Math.round(maxPoints * overlap.ratio));
  return { points, common: overlap.common };
}

function estimateCandidateConfidence(score: number): number {
  const clamped = Math.max(0, Math.min(1, score / 320));
  return Number(clamped.toFixed(3));
}

export function buildEstimateDecision(
  candidates: EstimateMatchCandidate[]
): EstimateMatchDecision {
  const best = candidates[0] ?? null;
  const runnerUp = candidates[1] ?? null;

  if (!best) {
    return {
      best: null,
      runnerUp: null,
      autoLink: false,
      gap: 0,
      reason: "no_estimate_candidates",
      thresholds: {
        minScore: 0,
        minGap: 0,
      },
    };
  }

  const hasStrongIdAnchor = best.reasons.some(
    (reason) =>
      reason.code === "estimate_number_exact" ||
      reason.code === "monday_item_id_exact"
  );
  const minScore = hasStrongIdAnchor ? 160 : 210;
  const minGap = hasStrongIdAnchor ? 20 : 45;
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

export function buildEstimateHintText(context: EstimateMatchContext): string {
  return [
    context.subject,
    context.bodyPreview,
    ...context.attachmentNames,
    ...context.projectHints,
    ...context.contractorHints,
    ...context.addressHints,
    ...context.queryHints,
    ...context.estimateReferenceHints,
    ...context.mondayItemHints,
  ]
    .filter(Boolean)
    .join("\n");
}

function estimateNumberReason(
  row: EstimateCandidateRow,
  estimateReferences: Set<string>
): EstimateMatchReason | null {
  const estimateNumberDigits = normalizeEstimateNumberDigits(
    row.estimate_number ?? ""
  );
  if (!(estimateNumberDigits && estimateReferences.has(estimateNumberDigits))) {
    return null;
  }
  return {
    code: "estimate_number_exact",
    points: 220,
    detail: `estimate_number=${estimateNumberDigits}`,
  };
}

function mondayItemReason(
  row: EstimateCandidateRow,
  mondayItemIds: Set<string>
): EstimateMatchReason | null {
  if (!(row.monday_item_id && mondayItemIds.has(row.monday_item_id))) {
    return null;
  }
  return {
    code: "monday_item_id_exact",
    points: 240,
    detail: `monday_item_id=${row.monday_item_id}`,
  };
}

function accountDomainReason(
  row: EstimateCandidateRow,
  context: EstimateMatchContext
): EstimateMatchReason | null {
  if (!(context.fromDomain && row.account_domain)) {
    return null;
  }
  if (context.fromDomain.toLowerCase() !== row.account_domain.toLowerCase()) {
    return null;
  }
  return {
    code: "account_domain_exact",
    points: 70,
    detail: `domain=${context.fromDomain}`,
  };
}

function projectOverlapReason(
  row: EstimateCandidateRow,
  context: EstimateMatchContext
): EstimateMatchReason | null {
  const overlap = scoreFromTokenOverlap(
    [context.subject, ...context.projectHints],
    `${row.name ?? ""} ${row.job_name ?? ""}`,
    90
  );
  if (overlap.points <= 0) {
    return null;
  }
  return {
    code: "project_token_overlap",
    points: overlap.points,
    detail: overlap.common.slice(0, 6).join(", "),
  };
}

function contractorOverlapReason(
  row: EstimateCandidateRow,
  context: EstimateMatchContext
): EstimateMatchReason | null {
  const overlap = scoreFromTokenOverlap(
    context.contractorHints,
    row.contractor ?? "",
    70
  );
  if (overlap.points <= 0) {
    return null;
  }
  return {
    code: "contractor_token_overlap",
    points: overlap.points,
    detail: overlap.common.slice(0, 5).join(", "),
  };
}

function addressOverlapReason(
  row: EstimateCandidateRow,
  context: EstimateMatchContext
): EstimateMatchReason | null {
  const overlap = scoreFromTokenOverlap(
    context.addressHints,
    `${row.job_address ?? ""} ${row.location ?? ""}`,
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

function contentOverlapReason(
  row: EstimateCandidateRow,
  context: EstimateMatchContext
): EstimateMatchReason | null {
  const overlap = scoreFromTokenOverlap(
    [context.subject, context.bodyPreview, ...context.attachmentNames],
    `${row.name ?? ""} ${row.job_name ?? ""} ${row.contractor ?? ""} ${
      row.job_address ?? ""
    } ${row.location ?? ""} ${row.estimate_number ?? ""}`,
    40
  );
  if (overlap.points <= 0) {
    return null;
  }
  return {
    code: "content_token_overlap",
    points: overlap.points,
    detail: overlap.common.slice(0, 5).join(", "),
  };
}

function wonStatusReason(
  row: EstimateCandidateRow
): EstimateMatchReason | null {
  if ((row.bid_status ?? "").toLowerCase() !== "won") {
    return null;
  }
  return {
    code: "won_status_boost",
    points: 10,
    detail: "bid_status=Won",
  };
}

function collectCandidateReasons(
  row: EstimateCandidateRow,
  context: EstimateMatchContext,
  estimateReferences: Set<string>,
  mondayItemIds: Set<string>
): EstimateMatchReason[] {
  return [
    estimateNumberReason(row, estimateReferences),
    mondayItemReason(row, mondayItemIds),
    accountDomainReason(row, context),
    projectOverlapReason(row, context),
    contractorOverlapReason(row, context),
    addressOverlapReason(row, context),
    contentOverlapReason(row, context),
    wonStatusReason(row),
  ]
    .filter((value): value is EstimateMatchReason => Boolean(value))
    .sort((lhs, rhs) => rhs.points - lhs.points);
}

function toEstimateCandidate(
  row: EstimateCandidateRow,
  reasons: EstimateMatchReason[]
): EstimateMatchCandidate | null {
  const score = reasons.reduce((sum, reason) => sum + reason.points, 0);
  if (score <= 0) {
    return null;
  }
  return {
    estimateId: row.id,
    estimateNumber: row.estimate_number,
    mondayItemId: row.monday_item_id,
    name: row.name,
    jobName: row.job_name,
    contractor: row.contractor,
    jobAddress: row.job_address,
    location: row.location,
    accountDomain: row.account_domain,
    bidStatus: row.bid_status,
    updatedAt: row.updated_at,
    score,
    confidence: estimateCandidateConfidence(score),
    reasons,
  };
}

function sortCandidates(
  lhs: EstimateMatchCandidate,
  rhs: EstimateMatchCandidate
): number {
  if (rhs.score !== lhs.score) {
    return rhs.score - lhs.score;
  }
  return new Date(rhs.updatedAt).getTime() - new Date(lhs.updatedAt).getTime();
}

export function rankEstimateCandidates(
  rows: EstimateCandidateRow[],
  context: EstimateMatchContext
): EstimateMatchCandidate[] {
  const hintText = buildEstimateHintText(context);
  const estimateReferences = new Set<string>([
    ...context.estimateReferenceHints
      .map((value) => normalizeEstimateNumberDigits(value))
      .filter((value): value is string => Boolean(value)),
    ...extractEstimateNumbers(hintText),
  ]);
  const mondayItemIds = new Set<string>([
    ...context.mondayItemHints,
    ...extractMondayItemIds(hintText),
  ]);

  const ranked: EstimateMatchCandidate[] = [];
  for (const row of rows) {
    const reasons = collectCandidateReasons(
      row,
      context,
      estimateReferences,
      mondayItemIds
    );
    const candidate = toEstimateCandidate(row, reasons);
    if (!candidate) {
      continue;
    }
    ranked.push(candidate);
  }

  return ranked.sort(sortCandidates);
}
