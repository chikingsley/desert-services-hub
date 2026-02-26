import { isJsonRecord, parseJsonArray, parseJsonRecord } from "@lib/db/parsers";

export interface EstimateMatchEmailRow {
  attachment_names: string | null;
  body_preview: string | null;
  contractor_name: string | null;
  from_domain: string | null;
  id: number;
  monday_estimate_id: string | null;
  project_name: string | null;
  subject: string | null;
}

export interface DocumentExtractionRow {
  file_name: string | null;
  raw_extraction: unknown;
  summary: string | null;
}

export interface EstimateCandidateRow {
  account_domain: string | null;
  bid_status: string | null;
  contractor: string | null;
  estimate_number: string | null;
  id: number;
  job_address: string | null;
  job_name: string | null;
  location: string | null;
  monday_item_id: string | null;
  name: string | null;
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
  detail: string;
  points: number;
}

export interface EstimateMatchCandidate {
  accountDomain: string | null;
  bidStatus: string | null;
  confidence: number;
  contractor: string | null;
  estimateId: number;
  estimateNumber: string | null;
  jobAddress: string | null;
  jobName: string | null;
  location: string | null;
  mondayItemId: string | null;
  name: string | null;
  reasons: EstimateMatchReason[];
  score: number;
  updatedAt: string;
}

export interface EstimateMatchDecision {
  autoLink: boolean;
  best: EstimateMatchCandidate | null;
  gap: number;
  reason: string;
  runnerUp: EstimateMatchCandidate | null;
  thresholds: {
    minScore: number;
    minGap: number;
  };
}

export interface EstimateMatchContext {
  addressHints: string[];
  attachmentNames: string[];
  bodyPreview: string;
  contractorHints: string[];
  emailId: number;
  estimateReferenceHints: string[];
  fromDomain: string | null;
  mondayItemHints: string[];
  projectHints: string[];
  queryHints: string[];
  subject: string;
}

export interface EstimateMatchHintInput {
  addressHints?: string[];
  contractorHints?: string[];
  estimateReferenceHints?: string[];
  limit?: number;
  mondayItemHints?: string[];
  projectHints?: string[];
  queryHints?: string[];
  restrictEstimateIds?: number[];
}

export interface EstimateCandidateResult {
  candidates: EstimateMatchCandidate[];
  context: EstimateMatchContext;
  decision: EstimateMatchDecision;
}

export type ProjectMatchReasonCode =
  | "normalized_name_exact"
  | "outlook_folder_exact"
  | "account_exact"
  | "primary_token_overlap"
  | "contractor_token_overlap"
  | "address_token_overlap";

export interface ProjectMatchReason {
  code: ProjectMatchReasonCode;
  detail: string;
  points: number;
}

export interface ProjectMatchCandidate {
  accountId: number | null;
  address: string | null;
  confidence: number;
  contractor: string | null;
  name: string;
  outlookFolder: string | null;
  projectId: number;
  reasons: ProjectMatchReason[];
  score: number;
  updatedAt: string;
}

export interface ProjectMatchDecision {
  autoLink: boolean;
  best: ProjectMatchCandidate | null;
  gap: number;
  reason: string;
  runnerUp: ProjectMatchCandidate | null;
  thresholds: {
    minScore: number;
    minGap: number;
  };
}

export interface ProjectMatchContext {
  accountIdHint: number | null;
  addressHint: string | null;
  addressTokens: string[];
  aliasHints: string[];
  aliasKeys: string[];
  contractorHint: string | null;
  contractorTokens: string[];
  nameKeys: string[];
  primaryNameKey: string;
  primaryText: string;
  primaryTokens: string[];
}

export interface ProjectMatchInput {
  accountIdHint?: number | null;
  addressHint?: string | null;
  aliasHints?: string[];
  contractorHint?: string | null;
  limit?: number;
  primaryText: string;
}

export interface ProjectMatchResult {
  candidates: ProjectMatchCandidate[];
  context: ProjectMatchContext;
  decision: ProjectMatchDecision;
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
  return uniqueStrings(parseJsonArray(value).map((entry) => String(entry)));
}

export function parseRawExtraction(
  value: unknown
): Record<string, unknown> | null {
  return parseJsonRecord(value);
}

export function getNestedString(
  source: Record<string, unknown> | null,
  ...path: string[]
): string | null {
  let current: unknown = source;
  for (const segment of path) {
    if (!isJsonRecord(current)) {
      return null;
    }
    current = current[segment];
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
