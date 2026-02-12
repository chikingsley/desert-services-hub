/**
 * Functions for linking emails to estimates.
 * Used by agents and scripts to associate emails with estimates.
 */
import { db } from "@lib/db/hub";
import { likeSearch } from "@lib/db/search";

/**
 * Link an email to an estimate.
 *
 * @param estimateId - The estimate ID (from estimates table)
 * @param emailId - The email ID (from emails table)
 * @param source - Who/what made this link: 'agent', 'script', 'manual'
 * @param detail - Optional detail about why this link was made
 */
export async function linkEmailToEstimate(
  estimateId: number,
  emailId: number,
  source: "agent" | "script" | "manual" = "manual",
  detail?: string
): Promise<boolean> {
  try {
    await db.run(
      `INSERT INTO estimate_emails (estimate_id, email_id, match_type, match_detail)
       VALUES (?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [estimateId, emailId, source, detail || null]
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Link multiple emails to an estimate.
 */
export async function linkEmailsToEstimate(
  estimateId: number,
  emailIds: number[],
  source: "agent" | "script" | "manual" = "manual",
  detail?: string
): Promise<number> {
  let linked = 0;
  for (const emailId of emailIds) {
    if (await linkEmailToEstimate(estimateId, emailId, source, detail)) {
      linked++;
    }
  }
  return linked;
}

/**
 * Remove a link between an email and estimate.
 */
export async function unlinkEmailFromEstimate(
  estimateId: number,
  emailId: number
): Promise<boolean> {
  const result = await db.run(
    "DELETE FROM estimate_emails WHERE estimate_id = ? AND email_id = ?",
    [estimateId, emailId]
  );
  return result.count > 0;
}

/**
 * Get all emails linked to an estimate.
 */
export async function getEstimateEmails(estimateId: number) {
  return await db
    .query<
      {
        email_id: number;
        subject: string;
        from_email: string;
        received_at: string;
        match_type: string;
        match_detail: string | null;
      },
      [number]
    >(`
    SELECT
      e.id as email_id,
      e.subject,
      e.from_email,
      e.received_at,
      ee.match_type,
      ee.match_detail
    FROM estimate_emails ee
    JOIN emails e ON ee.email_id = e.id
    WHERE ee.estimate_id = ?
    ORDER BY e.received_at ASC
  `)
    .all(estimateId);
}

/**
 * Get all estimates linked to an email.
 */
export async function getEmailEstimates(emailId: number) {
  return await db
    .query<
      {
        estimate_id: number;
        name: string;
        contractor: string | null;
        match_type: string;
      },
      [number]
    >(`
    SELECT
      est.id as estimate_id,
      est.name,
      est.contractor,
      ee.match_type
    FROM estimate_emails ee
    JOIN estimates est ON ee.estimate_id = est.id
    WHERE ee.email_id = ?
  `)
    .all(emailId);
}

/**
 * Find estimate by number or name pattern.
 */
export async function findEstimate(search: string) {
  return await likeSearch<{
    id: number;
    name: string;
    contractor: string | null;
    estimate_number: string | null;
    email_count: number;
  }>({
    table: "estimates e",
    select: `e.id, e.name, e.contractor, e.estimate_number,
      (SELECT COUNT(*) FROM estimate_emails ee WHERE ee.estimate_id = e.id) as email_count`,
    columns: ["e.estimate_number", "e.name"],
    query: search,
    limit: 20,
  });
}

/**
 * Find email by subject or ID.
 */
export async function findEmail(search: string | number) {
  if (typeof search === "number") {
    return await db
      .query<
        {
          id: number;
          subject: string;
          from_email: string;
          received_at: string;
        },
        [number]
      >("SELECT id, subject, from_email, received_at FROM emails WHERE id = ?")
      .get(search);
  }

  return await likeSearch<{
    id: number;
    subject: string;
    from_email: string;
    received_at: string;
  }>({
    table: "emails",
    select: "id, subject, from_email, received_at",
    columns: ["subject"],
    query: search,
    orderBy: "received_at DESC",
    limit: 20,
  });
}

interface EstimateMatchEmailRow {
  id: number;
  subject: string | null;
  body_preview: string | null;
  attachment_names: string | null;
  from_domain: string | null;
  contractor_name: string | null;
  project_name: string | null;
  monday_estimate_id: string | null;
}

interface DocumentExtractionRow {
  raw_extraction: unknown;
  summary: string | null;
  file_name: string | null;
}

interface EstimateCandidateRow {
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
  estimateReferenceHints?: string[];
  mondayItemHints?: string[];
  contractorHints?: string[];
  projectHints?: string[];
  addressHints?: string[];
  queryHints?: string[];
  limit?: number;
}

export interface EstimateCandidateResult {
  context: EstimateMatchContext;
  candidates: EstimateMatchCandidate[];
  decision: EstimateMatchDecision;
}

const COMMON_FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "aol.com",
  "protonmail.com",
  "live.com",
  "msn.com",
]);

const TOKEN_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "your",
  "you",
  "re",
  "fw",
  "fwd",
  "project",
  "site",
  "work",
  "estimate",
  "contract",
  "services",
  "service",
  "llc",
  "inc",
  "co",
]);

const NON_ALNUM_RE = /[^a-z0-9]+/g;
const TOKEN_HAS_DIGIT_RE = /\d/;
const TOKEN_LETTER_DIGIT_RE = /^[a-z]{2}\d+[a-z0-9]*$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(NON_ALNUM_RE, " ").trim();
}

function tokenize(value: string | null | undefined): Set<string> {
  const normalized = normalizeText(value);
  if (!normalized) {
    return new Set();
  }
  const out = new Set<string>();
  for (const rawToken of normalized.split(/\s+/g)) {
    if (!rawToken) {
      continue;
    }
    const keep =
      rawToken.length >= 3 ||
      TOKEN_HAS_DIGIT_RE.test(rawToken) ||
      TOKEN_LETTER_DIGIT_RE.test(rawToken);
    if (!keep) {
      continue;
    }
    if (TOKEN_STOP_WORDS.has(rawToken)) {
      continue;
    }
    out.add(rawToken);
  }
  return out;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const dedup = new Set<string>();
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (trimmed.length === 0) {
      continue;
    }
    dedup.add(trimmed);
  }
  return [...dedup];
}

function parseJsonStringArray(value: unknown): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((v) => String(v));
  }
  if (typeof value !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((v) => String(v));
  } catch {
    return [];
  }
}

function parseRawExtraction(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return asRecord(value);
}

function getNestedString(
  record: Record<string, unknown> | null,
  ...keys: string[]
): string | null {
  if (!record) {
    return null;
  }
  let cursor: unknown = record;
  for (const key of keys) {
    const obj = asRecord(cursor);
    if (!obj) {
      return null;
    }
    cursor = obj[key];
  }
  return typeof cursor === "string" ? cursor : null;
}

function normalizeEstimateNumberDigits(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 6 || digits.length > 8) {
    return null;
  }
  return digits;
}

function extractEstimateNumbers(text: string): string[] {
  const out = new Set<string>();

  for (const match of text.matchAll(
    /\bEst(?:imate)?[_\s-]*([0-9]{6,8})(?:\s*-?\s*R[0-9]+)?(?=$|[^0-9])/gi
  )) {
    const n = normalizeEstimateNumberDigits(match[1] ?? "");
    if (n) {
      out.add(n);
    }
  }

  for (const match of text.matchAll(/\bEstimate[:\s#]*([0-9]{6,8})\b/gi)) {
    const n = normalizeEstimateNumberDigits(match[1] ?? "");
    if (n) {
      out.add(n);
    }
  }

  return [...out];
}

function extractMondayItemIds(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/(?:pulses|items)\/(\d{6,})/gi)) {
    if (match[1]) {
      out.add(match[1]);
    }
  }
  return [...out];
}

function tokenOverlap(
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
  const minSize = Math.max(1, Math.min(lhs.size, rhs.size));
  return { common, ratio: common.length / minSize };
}

function extractSearchTermsFromText(value: string, max = 6): string[] {
  const terms = [...tokenize(value)];
  return terms.slice(0, Math.max(1, max));
}

function scoreFromTokenOverlap(
  hintValues: string[],
  candidateValue: string,
  maxPoints: number
): { points: number; common: string[] } {
  const hintTokens = tokenize(hintValues.join(" "));
  const candidateTokens = tokenize(candidateValue);
  const overlap = tokenOverlap(hintTokens, candidateTokens);
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

function buildDecision(
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
      thresholds: { minScore: 0, minGap: 0 },
    };
  }

  const hasHardAnchor = best.reasons.some(
    (reason) =>
      reason.code === "estimate_number_exact" ||
      reason.code === "monday_item_id_exact"
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

async function fetchEstimateRowsByRef(
  estimateNumbers: string[]
): Promise<EstimateCandidateRow[]> {
  if (estimateNumbers.length === 0) {
    return [];
  }
  const placeholders = estimateNumbers.map(() => "?").join(", ");
  return await db
    .query<EstimateCandidateRow, string[]>(
      `SELECT
         id, name, job_name, contractor, estimate_number,
         monday_item_id::text as monday_item_id, account_domain,
         job_address, location, bid_status, updated_at
       FROM estimates
       WHERE regexp_replace(coalesce(estimate_number, ''), '[^0-9]', '', 'g') IN (${placeholders})
       ORDER BY updated_at DESC`
    )
    .all(...estimateNumbers);
}

async function fetchEstimateRowsByMondayItemId(
  mondayItemIds: string[]
): Promise<EstimateCandidateRow[]> {
  if (mondayItemIds.length === 0) {
    return [];
  }
  const placeholders = mondayItemIds.map(() => "?").join(", ");
  return await db
    .query<EstimateCandidateRow, string[]>(
      `SELECT
         id, name, job_name, contractor, estimate_number,
         monday_item_id::text as monday_item_id, account_domain,
         job_address, location, bid_status, updated_at
       FROM estimates
       WHERE coalesce(monday_item_id::text, '') IN (${placeholders})
       ORDER BY updated_at DESC`
    )
    .all(...mondayItemIds);
}

async function fetchEstimateRowsByDomain(
  fromDomain: string
): Promise<EstimateCandidateRow[]> {
  if (COMMON_FREE_EMAIL_DOMAINS.has(fromDomain)) {
    return [];
  }
  return await db
    .query<EstimateCandidateRow, [string]>(
      `SELECT
         id, name, job_name, contractor, estimate_number,
         monday_item_id::text as monday_item_id, account_domain,
         job_address, location, bid_status, updated_at
       FROM estimates
       WHERE lower(coalesce(account_domain, '')) = lower(?)
       ORDER BY updated_at DESC
       LIMIT 120`
    )
    .all(fromDomain);
}

async function fetchEstimateRowsByFuzzySearch(
  query: string,
  limit = 30
): Promise<EstimateCandidateRow[]> {
  if (query.trim().length < 2) {
    return [];
  }
  const pattern = `%${query.toLowerCase()}%`;
  return await db
    .query<EstimateCandidateRow, [string, number]>(
      `SELECT
         id, name, job_name, contractor, estimate_number,
         monday_item_id::text as monday_item_id, account_domain,
         job_address, location, bid_status, updated_at
       FROM estimates
       WHERE lower(
         coalesce(name, '') || ' ' ||
         coalesce(job_name, '') || ' ' ||
         coalesce(contractor, '') || ' ' ||
         coalesce(job_address, '') || ' ' ||
         coalesce(location, '') || ' ' ||
         coalesce(estimate_number, '')
       ) ILIKE ?
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(pattern, limit);
}

async function resolveEmailMatchContext(
  emailId: number,
  hints: EstimateMatchHintInput = {}
): Promise<EstimateMatchContext | null> {
  const email = await db
    .query<EstimateMatchEmailRow, [number]>(
      `SELECT
         id, subject, body_preview, attachment_names, from_domain,
         contractor_name, project_name, monday_estimate_id
       FROM emails
       WHERE id = ?`
    )
    .get(emailId);
  if (!email) {
    return null;
  }

  const docRows = await db
    .query<DocumentExtractionRow, [number]>(
      `SELECT raw_extraction, summary, file_name
       FROM documents
       WHERE email_id = ?
       ORDER BY created_at DESC
       LIMIT 12`
    )
    .all(emailId);

  const attachmentNames = parseJsonStringArray(email.attachment_names);
  const contractorHints: string[] = [];
  const projectHints: string[] = [];
  const addressHints: string[] = [];
  const estimateReferenceHints: string[] = [];
  const mondayItemHints: string[] = [];
  const queryHints: string[] = [];

  if (email.contractor_name) {
    contractorHints.push(email.contractor_name);
  }
  if (email.project_name) {
    projectHints.push(email.project_name);
  }
  if (email.monday_estimate_id) {
    mondayItemHints.push(email.monday_estimate_id);
  }

  for (const row of docRows) {
    const extraction = parseRawExtraction(row.raw_extraction);
    const estimateRef = getNestedString(extraction, "estimate_reference");
    const projectName = getNestedString(extraction, "project", "name");
    const projectNumber = getNestedString(extraction, "project", "number");
    const projectAddress = getNestedString(extraction, "project", "address");
    const contractor = getNestedString(extraction, "parties", "contractor");

    if (estimateRef) {
      estimateReferenceHints.push(estimateRef);
    }
    if (projectName) {
      projectHints.push(projectName);
    }
    if (projectNumber) {
      projectHints.push(projectNumber);
    }
    if (projectAddress) {
      addressHints.push(projectAddress);
    }
    if (contractor) {
      contractorHints.push(contractor);
    }
    if (row.summary) {
      queryHints.push(row.summary);
    }
    if (row.file_name) {
      queryHints.push(row.file_name);
    }
  }

  return {
    emailId,
    subject: email.subject ?? "",
    bodyPreview: email.body_preview ?? "",
    attachmentNames,
    fromDomain: email.from_domain,
    contractorHints: uniqueStrings([
      ...contractorHints,
      ...(hints.contractorHints ?? []),
    ]),
    projectHints: uniqueStrings([
      ...projectHints,
      ...(hints.projectHints ?? []),
    ]),
    addressHints: uniqueStrings([
      ...addressHints,
      ...(hints.addressHints ?? []),
    ]),
    estimateReferenceHints: uniqueStrings([
      ...estimateReferenceHints,
      ...(hints.estimateReferenceHints ?? []),
    ]),
    mondayItemHints: uniqueStrings([
      ...mondayItemHints,
      ...(hints.mondayItemHints ?? []),
    ]),
    queryHints: uniqueStrings([...queryHints, ...(hints.queryHints ?? [])]),
  };
}

function buildTextBundleForHints(context: EstimateMatchContext): string {
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

function rankEstimateCandidates(
  rows: EstimateCandidateRow[],
  context: EstimateMatchContext
): EstimateMatchCandidate[] {
  const hintText = buildTextBundleForHints(context);
  const estimateRefs = new Set<string>([
    ...context.estimateReferenceHints
      .map((v) => normalizeEstimateNumberDigits(v))
      .filter((v): v is string => Boolean(v)),
    ...extractEstimateNumbers(hintText),
  ]);
  const mondayItems = new Set<string>([
    ...context.mondayItemHints,
    ...extractMondayItemIds(hintText),
  ]);

  const ranked: EstimateMatchCandidate[] = [];
  for (const row of rows) {
    const reasons: EstimateMatchReason[] = [];
    const estimateNumberDigits = normalizeEstimateNumberDigits(
      row.estimate_number ?? ""
    );
    if (estimateNumberDigits && estimateRefs.has(estimateNumberDigits)) {
      reasons.push({
        code: "estimate_number_exact",
        points: 220,
        detail: `estimate_number=${estimateNumberDigits}`,
      });
    }

    if (row.monday_item_id && mondayItems.has(row.monday_item_id)) {
      reasons.push({
        code: "monday_item_id_exact",
        points: 240,
        detail: `monday_item_id=${row.monday_item_id}`,
      });
    }

    if (
      context.fromDomain &&
      row.account_domain &&
      context.fromDomain.toLowerCase() === row.account_domain.toLowerCase()
    ) {
      reasons.push({
        code: "account_domain_exact",
        points: 70,
        detail: `domain=${context.fromDomain}`,
      });
    }

    const projectOverlap = scoreFromTokenOverlap(
      [context.subject, ...context.projectHints],
      `${row.name ?? ""} ${row.job_name ?? ""}`,
      90
    );
    if (projectOverlap.points > 0) {
      reasons.push({
        code: "project_token_overlap",
        points: projectOverlap.points,
        detail: projectOverlap.common.slice(0, 6).join(", "),
      });
    }

    const contractorOverlap = scoreFromTokenOverlap(
      context.contractorHints,
      row.contractor ?? "",
      70
    );
    if (contractorOverlap.points > 0) {
      reasons.push({
        code: "contractor_token_overlap",
        points: contractorOverlap.points,
        detail: contractorOverlap.common.slice(0, 5).join(", "),
      });
    }

    const addressOverlap = scoreFromTokenOverlap(
      context.addressHints,
      `${row.job_address ?? ""} ${row.location ?? ""}`,
      70
    );
    if (addressOverlap.points > 0) {
      reasons.push({
        code: "address_token_overlap",
        points: addressOverlap.points,
        detail: addressOverlap.common.slice(0, 6).join(", "),
      });
    }

    const contentOverlap = scoreFromTokenOverlap(
      [context.subject, context.bodyPreview, ...context.attachmentNames],
      `${row.name ?? ""} ${row.job_name ?? ""} ${row.contractor ?? ""} ${
        row.job_address ?? ""
      } ${row.location ?? ""} ${row.estimate_number ?? ""}`,
      40
    );
    if (contentOverlap.points > 0) {
      reasons.push({
        code: "content_token_overlap",
        points: contentOverlap.points,
        detail: contentOverlap.common.slice(0, 5).join(", "),
      });
    }

    if ((row.bid_status ?? "").toLowerCase() === "won") {
      reasons.push({
        code: "won_status_boost",
        points: 10,
        detail: "bid_status=Won",
      });
    }

    const score = reasons.reduce((sum, r) => sum + r.points, 0);
    if (score <= 0) {
      continue;
    }

    ranked.push({
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
      reasons: reasons.sort((a, b) => b.points - a.points),
    });
  }

  return ranked.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export async function findEstimateCandidatesForEmail(
  emailId: number,
  hints: EstimateMatchHintInput = {}
): Promise<EstimateCandidateResult | null> {
  const context = await resolveEmailMatchContext(emailId, hints);
  if (!context) {
    return null;
  }

  const rowsById = new Map<number, EstimateCandidateRow>();
  const limit = Math.max(1, Math.min(25, hints.limit ?? 10));

  const hintText = buildTextBundleForHints(context);
  const exactEstimateRefs = uniqueStrings([
    ...context.estimateReferenceHints,
    ...extractEstimateNumbers(hintText),
  ])
    .map((value) => normalizeEstimateNumberDigits(value))
    .filter((value): value is string => Boolean(value));
  const mondayItemHints = uniqueStrings([
    ...context.mondayItemHints,
    ...extractMondayItemIds(hintText),
  ]);

  const addRows = (rows: EstimateCandidateRow[]) => {
    for (const row of rows) {
      rowsById.set(row.id, row);
    }
  };

  addRows(await fetchEstimateRowsByRef(exactEstimateRefs));
  addRows(await fetchEstimateRowsByMondayItemId(mondayItemHints));

  if (context.fromDomain) {
    addRows(await fetchEstimateRowsByDomain(context.fromDomain));
  }

  const fuzzySearchInputs = uniqueStrings([
    context.subject,
    ...context.projectHints,
    ...context.contractorHints,
    ...context.addressHints,
    ...context.queryHints,
    ...extractSearchTermsFromText(context.subject, 5),
    ...extractSearchTermsFromText(context.bodyPreview, 5),
    ...context.attachmentNames.flatMap((name) =>
      extractSearchTermsFromText(name, 3)
    ),
  ]).slice(0, 12);

  for (const search of fuzzySearchInputs) {
    addRows(await fetchEstimateRowsByFuzzySearch(search, 25));
  }

  const candidates = rankEstimateCandidates(
    [...rowsById.values()],
    context
  ).slice(0, limit);
  const decision = buildDecision(candidates);

  return {
    context,
    candidates,
    decision,
  };
}
