/**
 * Scoring and ranking logic for source-packet candidate matching.
 *
 * Split from build-source-packets.ts for maintainability.
 * Contains attachment scoring, email candidate scoring, and best-candidate selection.
 */

import { normalizeText } from "./shared";

// ============================================================================
// Types
// ============================================================================

export interface EmailRow {
  id: number;
  message_id: string;
  mailbox_email: string;
  received_at: string;
  internet_message_id: string | null;
  from_email: string;
  subject: string;
  attachment_names: string;
}

export interface Candidate {
  email: EmailRow;
  score: number;
  reason: string;
  selectedAttachment: string | null;
}

export interface AttachmentPick {
  name: string;
  score: number;
}

export type CandidateType = "noi" | "plan" | "estimate";

// ============================================================================
// Constants
// ============================================================================

const CGP_PERMIT_PATTERN = /(?:^|[^a-z0-9])cgp\d{2}(?:[^a-z0-9]|$)/;
const NOI_WORD_PATTERN = /\bnoi\b/;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "at",
  "of",
  "llc",
  "inc",
  "company",
  "construction",
  "build",
  "design",
  "phase",
  "project",
  "site",
  "park",
]);

// ============================================================================
// Attachment name classifiers
// ============================================================================

export function isNoiLikeAttachmentName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("noi") ||
    n.includes("summary_cor") ||
    n.includes("newpermit") ||
    CGP_PERMIT_PATTERN.test(n)
  );
}

export function isPlanLikeAttachmentName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("swppp") ||
    n.includes("swmp") ||
    n.includes("storm") ||
    n.includes("drainage") ||
    n.includes("erosion") ||
    n.includes("civil") ||
    n.includes("esc plan")
  );
}

// ============================================================================
// Project tokenization
// ============================================================================

export function tokeniseProject(projectName: string): string[] {
  const tokens = normalizeText(projectName)
    .split(" ")
    .filter((t) => t.length >= 4 && !STOP_WORDS.has(t));
  return [...new Set(tokens)].slice(0, 4);
}

// ============================================================================
// Attachment name parsing
// ============================================================================

export function parseAttachmentNames(raw: string): string[] {
  if (!raw || raw.trim() === "") {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((v) => String(v));
  } catch {
    return [];
  }
}

// ============================================================================
// Per-type attachment scoring
// ============================================================================

function scoreNoiAttachment(n: string, permit: string): number {
  let score = 0;
  if (permit && n.includes(permit)) {
    score += 60;
  }
  if (n.includes("noi")) {
    score += 80;
  }
  if (n.includes("summary_cor")) {
    score += 40;
  }
  if (n.includes("cgp")) {
    score += 20;
  }
  if (isPlanLikeAttachmentName(n) && !isNoiLikeAttachmentName(n)) {
    score -= 120;
  }
  return score;
}

function planAttachmentPenalty(n: string): number {
  let penalty = 0;
  if (n.includes("est_")) {
    penalty -= 40;
  }
  if (n.includes("inv_")) {
    penalty -= 40;
  }
  if (isNoiLikeAttachmentName(n) && !isPlanLikeAttachmentName(n)) {
    penalty -= 180;
  }
  if (n.includes("receipt")) {
    penalty -= 220;
  }
  if (n.includes("dust")) {
    penalty -= 150;
  }
  if (n.includes("certificate")) {
    penalty -= 170;
  }
  if (n.includes("masterpermit")) {
    penalty -= 220;
  }
  if (n.includes("summary_cor")) {
    penalty -= 200;
  }
  if (!(isPlanLikeAttachmentName(n) || n.includes("esc"))) {
    penalty -= 90;
  }
  return penalty;
}

function scorePlanAttachment(n: string, permit: string): number {
  let score = 0;
  if (permit && n.includes(permit)) {
    score += 60;
  }
  if (n.includes("swppp")) {
    score += 80;
  }
  if (n.includes("swmp")) {
    score += 65;
  }
  if (n.includes("storm")) {
    score += 45;
  }
  if (n.includes("drainage")) {
    score += 30;
  }
  if (n.includes("civil")) {
    score += 30;
  }
  if (n.includes("plan")) {
    score += 20;
  }
  if (n.includes("esc")) {
    score += 25;
  }
  if (n.includes("site map")) {
    score += 20;
  }
  return score + planAttachmentPenalty(n);
}

function scoreEstimateAttachment(n: string, permit: string): number {
  let score = 0;
  if (permit && n.includes(permit)) {
    score += 60;
  }
  if (n.includes("est_")) {
    score += 80;
  }
  if (n.includes("estimate")) {
    score += 40;
  }
  if (n.includes("inv_")) {
    score -= 30;
  }
  if (isNoiLikeAttachmentName(n) || isPlanLikeAttachmentName(n)) {
    score -= 60;
  }
  return score;
}

function scoreAttachment(
  name: string,
  type: CandidateType,
  permit: string
): number {
  const n = name.toLowerCase();
  switch (type) {
    case "noi":
      return scoreNoiAttachment(n, permit);
    case "plan":
      return scorePlanAttachment(n, permit);
    case "estimate":
      return scoreEstimateAttachment(n, permit);
    default:
      return 0;
  }
}

// ============================================================================
// Attachment picker
// ============================================================================

export function pickAttachment(
  names: string[],
  type: CandidateType,
  permitNumber: string,
  excludeNames = new Set<string>()
): AttachmentPick | null {
  const pdfs = names.filter(
    (n) =>
      n.toLowerCase().endsWith(".pdf") && !excludeNames.has(n.toLowerCase())
  );
  if (pdfs.length === 0) {
    return null;
  }

  const permit = permitNumber.trim().toLowerCase();
  const ranked = [...pdfs]
    .map((name) => ({ name, score: scoreAttachment(name, type, permit) }))
    .toSorted((a, b) => b.score - a.score);

  return ranked[0] ?? null;
}

// ============================================================================
// Email candidate scoring
// ============================================================================

function parseDate(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function scoreNoiCandidate(text: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (NOI_WORD_PATTERN.test(text)) {
    score += 70;
    reasons.push("noi");
  }
  if (text.includes("summary_cor")) {
    score += 25;
    reasons.push("summary");
  }
  if (text.includes("mydeq") || text.includes("azpdes")) {
    score += 20;
    reasons.push("deq");
  }
  return { reasons, score };
}

function scorePlanCandidate(text: string): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];
  if (text.includes("swppp")) {
    score += 70;
    reasons.push("swppp");
  }
  if (text.includes("swmp")) {
    score += 55;
    reasons.push("swmp");
  }
  if (text.includes("storm")) {
    score += 35;
    reasons.push("storm");
  }
  if (text.includes("plan")) {
    score += 20;
    reasons.push("plan");
  }
  return { reasons, score };
}

function scoreEstimateCandidate(text: string): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];
  if (text.includes("est_")) {
    score += 70;
    reasons.push("est_");
  }
  if (text.includes("estimate")) {
    score += 35;
    reasons.push("estimate");
  }
  return { reasons, score };
}

export function scoreCandidate(
  email: EmailRow,
  opts: {
    type: CandidateType;
    permitNumber: string;
    projectTokens: string[];
    narrativeReceivedAt: Date;
  }
): { score: number; reason: string } {
  const text = normalizeText(
    `${email.subject ?? ""} ${email.attachment_names ?? ""} ${email.from_email ?? ""}`
  );
  let score = 0;
  const reasons: string[] = [];

  if (opts.permitNumber && text.includes(opts.permitNumber.toLowerCase())) {
    score += 90;
    reasons.push("permit");
  }

  let tokenHits = 0;
  for (const token of opts.projectTokens) {
    if (text.includes(token)) {
      tokenHits += 1;
    }
  }
  if (tokenHits > 0) {
    score += tokenHits * 12;
    reasons.push(`tokens:${tokenHits}`);
  }

  let typeResult: { score: number; reasons: string[] };
  switch (opts.type) {
    case "noi":
      typeResult = scoreNoiCandidate(text);
      break;
    case "plan":
      typeResult = scorePlanCandidate(text);
      break;
    case "estimate":
      typeResult = scoreEstimateCandidate(text);
      break;
    default:
      typeResult = { reasons: [], score: 0 };
  }
  score += typeResult.score;
  reasons.push(...typeResult.reasons);

  const received = parseDate(email.received_at);
  if (received) {
    const dayDistance = Math.abs(
      Math.round(
        (received.getTime() - opts.narrativeReceivedAt.getTime()) / 86_400_000
      )
    );
    score -= Math.min(50, Math.floor(dayDistance / 15));
  }

  return {
    reason: reasons.length ? reasons.join("+") : "weak",
    score,
  };
}

// ============================================================================
// Best candidate chooser
// ============================================================================

export function chooseBestCandidate(params: {
  type: CandidateType;
  candidates: EmailRow[];
  permitNumber: string;
  projectTokens: string[];
  narrativeReceivedAt: Date;
  excludeAttachmentNames?: Set<string>;
}): Candidate | null {
  const scored: Candidate[] = [];
  for (const email of params.candidates) {
    const names = parseAttachmentNames(email.attachment_names);
    const attachment = pickAttachment(
      names,
      params.type,
      params.permitNumber,
      params.excludeAttachmentNames
    );
    if (!attachment) {
      continue;
    }
    let minAttachmentScore = -999;
    if (params.type === "plan") {
      minAttachmentScore = 45;
    } else if (params.type === "noi") {
      minAttachmentScore = 20;
    }
    if (attachment.score < minAttachmentScore) {
      continue;
    }

    const result = scoreCandidate(email, {
      narrativeReceivedAt: params.narrativeReceivedAt,
      permitNumber: params.permitNumber,
      projectTokens: params.projectTokens,
      type: params.type,
    });
    scored.push({
      email,
      reason: `${result.reason}+att:${attachment.score}`,
      score: result.score + Math.floor(attachment.score / 3),
      selectedAttachment: attachment.name,
    });
  }

  if (scored.length === 0) {
    return null;
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0] ?? null;
}
