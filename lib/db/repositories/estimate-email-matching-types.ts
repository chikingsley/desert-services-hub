export interface EstimateMatchEmailRow {
  id: number;
  subject: string | null;
  body_preview: string | null;
  attachment_names: string | null;
  from_domain: string | null;
  contractor_name: string | null;
  project_name: string | null;
  monday_estimate_id: string | null;
}

export interface DocumentExtractionRow {
  raw_extraction: unknown;
  summary: string | null;
  file_name: string | null;
}

export interface EstimateCandidateRow {
  id: number;
  name: string | null;
  job_name: string | null;
  contractor: string | null;
  estimate_number: string | null;
  monday_item_id: string | null;
  account_domain: string | null;
  job_address: string | null;
  location: string | null;
  bid_status: string | null;
  updated_at: string;
}

type MatchReasonCode =
  | "estimate_number_exact"
  | "monday_item_id_exact"
  | "account_domain_exact"
  | "project_token_overlap"
  | "contractor_token_overlap"
  | "address_token_overlap"
  | "content_token_overlap"
  | "won_status_boost";

export interface EstimateMatchReason {
  code: MatchReasonCode;
  points: number;
  detail: string;
}

export interface EstimateMatchCandidate {
  estimateId: number;
  estimateNumber: string | null;
  mondayItemId: string | null;
  name: string | null;
  jobName: string | null;
  contractor: string | null;
  jobAddress: string | null;
  location: string | null;
  accountDomain: string | null;
  bidStatus: string | null;
  updatedAt: string;
  score: number;
  confidence: number;
  reasons: EstimateMatchReason[];
}

export interface EstimateMatchDecision {
  best: EstimateMatchCandidate | null;
  runnerUp: EstimateMatchCandidate | null;
  autoLink: boolean;
  gap: number;
  reason: string;
  thresholds: {
    minScore: number;
    minGap: number;
  };
}

export interface EstimateMatchContext {
  emailId: number;
  subject: string;
  bodyPreview: string;
  attachmentNames: string[];
  fromDomain: string | null;
  contractorHints: string[];
  projectHints: string[];
  addressHints: string[];
  estimateReferenceHints: string[];
  mondayItemHints: string[];
  queryHints: string[];
}

export interface EstimateMatchHintInput {
  contractorHints?: string[];
  projectHints?: string[];
  addressHints?: string[];
  estimateReferenceHints?: string[];
  mondayItemHints?: string[];
  queryHints?: string[];
  restrictEstimateIds?: number[];
  limit?: number;
}

export interface EstimateCandidateResult {
  context: EstimateMatchContext;
  candidates: EstimateMatchCandidate[];
  decision: EstimateMatchDecision;
}

const NON_ALPHA_NUMERIC_SPACE = /[^a-z0-9\s]/g;
const MULTI_SPACE = /\s+/g;
const HAS_DIGIT = /\d/;
const ESTIMATE_NUMBER_REGEX =
  /\b(?:est(?:imate)?(?:\s*(?:no|#|number))?[:\s-]*)?([0-9]{3,})\b/gi;
const MONDAY_ITEM_REGEX = /\b(?:pulse|item)?[-_\s#:]?([0-9]{5,})\b/gi;

export const COMMON_FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(NON_ALPHA_NUMERIC_SPACE, " ");
}

export function tokenize(value: string | null | undefined): Set<string> {
  const normalized = normalizeText(value).replace(MULTI_SPACE, " ").trim();
  if (!normalized) {
    return new Set<string>();
  }
  const tokens = new Set<string>();
  for (const token of normalized.split(" ")) {
    if (!token) {
      continue;
    }
    if (token.length < 3 && !HAS_DIGIT.test(token)) {
      continue;
    }
    if (
      token === "desert" ||
      token === "services" ||
      token === "estimate" ||
      token === "project" ||
      token === "job" ||
      token === "contract"
    ) {
      continue;
    }
    tokens.add(token);
  }
  return tokens;
}

export function uniqueStrings(
  values: Array<string | null | undefined>
): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (trimmed.length === 0) {
      continue;
    }
    out.add(trimmed);
  }
  return [...out];
}

export function uniquePositiveInts(
  values: Array<number | null | undefined>
): number[] {
  const out = new Set<number>();
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }
    const integer = Math.trunc(value);
    if (integer > 0) {
      out.add(integer);
    }
  }
  return [...out];
}

export function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.map((entry) => String(entry)));
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return uniqueStrings(parsed.map((entry) => String(entry)));
  } catch {
    return [];
  }
}

export function parseRawExtraction(
  value: unknown
): Record<string, unknown> | null {
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value);
      return asRecord(parsed);
    } catch {
      return null;
    }
  }
  return asRecord(value);
}

export function getNestedString(
  source: Record<string, unknown> | null,
  ...path: string[]
): string | null {
  let current: unknown = source;
  for (const segment of path) {
    const record = asRecord(current);
    if (!record) {
      return null;
    }
    current = record[segment];
  }
  if (typeof current !== "string") {
    return null;
  }
  const trimmed = current.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeEstimateNumberDigits(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 3) {
    return null;
  }
  return digits;
}

export function extractEstimateNumbers(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(ESTIMATE_NUMBER_REGEX)) {
    const value = match[1];
    if (!value) {
      continue;
    }
    const normalized = normalizeEstimateNumberDigits(value);
    if (normalized) {
      found.add(normalized);
    }
  }
  return [...found];
}

export function extractMondayItemIds(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(MONDAY_ITEM_REGEX)) {
    const value = match[1];
    if (value) {
      found.add(value);
    }
  }
  return [...found];
}

export function tokenOverlap(
  lhs: Set<string>,
  rhs: Set<string>
): { common: string[]; ratio: number } {
  if (lhs.size === 0 || rhs.size === 0) {
    return { common: [], ratio: 0 };
  }
  const common: string[] = [];
  for (const token of lhs) {
    if (rhs.has(token)) {
      common.push(token);
    }
  }
  if (common.length === 0) {
    return { common, ratio: 0 };
  }
  const base = Math.max(1, Math.min(lhs.size, rhs.size));
  return { common, ratio: common.length / base };
}

export function extractSearchTermsFromText(value: string, max = 6): string[] {
  return [...tokenize(value)].slice(0, max);
}
