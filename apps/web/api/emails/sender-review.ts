import { chat } from "@documents-intake/pdf-analysis";
import { db } from "@lib/db/client";
import { z } from "zod";
import {
  buildDomainClassifierPrompt,
  type DomainPromptSample,
  extractUsageFromMetadata,
  mapDomainVerdictToRule,
  SENDER_REVIEW_PROMPT_VERSION,
} from "./sender-review-llm";
import { buildSenderReviewSamplesQuery } from "./sender-review-sql";

type SenderReviewStatus =
  | "all"
  | "private"
  | "reviewed"
  | "spam"
  | "unreviewed";

interface DomainAggRow {
  domain: string;
  email_count: number;
  first_received_at: string | null;
  last_received_at: string | null;
  linked_account_count: number;
  llm_category: string | null;
  llm_confidence: number | null;
  llm_is_work_related: boolean | null;
  llm_reason: string | null;
  matched_rule_domain: string | null;
  rule_classification: string | null;
  rule_created_at: string | null;
  rule_is_excluded: boolean | null;
  sender_count: number;
}

interface SampleRow {
  domain: string;
  samples: unknown;
}

interface SenderReviewAuditRow {
  created_at: string | null;
  domain: string;
  input_tokens: number | null;
  metadata: unknown;
  model: string | null;
  output_tokens: number | null;
  processing_time_ms: number | null;
  prompt_input: unknown;
  prompt_text: string | null;
  prompt_version: string | null;
  provider: string | null;
  raw_result: unknown;
  reason: string | null;
  total_tokens: number | null;
  updated_at: string | null;
}

interface SenderReviewPayload {
  items: Array<{
    domain: string;
    emailCount: number;
    firstReceivedAt: string | null;
    lastReceivedAt: string | null;
    linkedAccountCount: number;
    llmVerdict: {
      category: string | null;
      confidence: number | null;
      isWorkRelated: boolean;
      reason: string | null;
    } | null;
    matchedRuleDomain: string | null;
    reviewed: boolean;
    rule: {
      classification: string | null;
      createdAt: string | null;
      domain: string;
      isExcluded: boolean;
    } | null;
    samples: ReturnType<typeof parseSamples>;
    senderCount: number;
  }>;
  pagination: {
    limit: number;
    page: number;
    total: number;
    totalPages: number;
  };
  stats: {
    activeDomains: number;
    activeUnclassifiedEmails: number;
    privateDomains: number;
    reviewedDomains: number;
    spamDomains: number;
    unreviewedDomains: number;
  };
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const SENDER_REVIEW_CACHE_TTL_MS = 10_000;
const MAX_CACHE_ENTRIES = 200;
const MAX_STABLE_LOAD_ATTEMPTS = 3;
const senderReviewCache = new Map<string, CacheEntry<SenderReviewPayload>>();
const senderReviewInflight = new Map<string, Promise<SenderReviewPayload>>();
let senderReviewCacheGeneration = 0;

function parsePositiveInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function normalizeStatus(raw: string | null): SenderReviewStatus {
  switch (raw) {
    case "all":
    case "private":
    case "reviewed":
    case "spam":
    case "unreviewed":
      return raw;
    default:
      return "unreviewed";
  }
}

function getSenderReviewCacheKey(url: URL): string {
  return `${senderReviewCacheGeneration}:${url.searchParams.toString() || "__default__"}`;
}

function pruneSenderReviewCache(now: number): void {
  for (const [key, entry] of senderReviewCache) {
    if (entry.expiresAt <= now) {
      senderReviewCache.delete(key);
    }
  }

  if (senderReviewCache.size <= MAX_CACHE_ENTRIES) {
    return;
  }

  const overflow = senderReviewCache.size - MAX_CACHE_ENTRIES;
  let removed = 0;
  for (const key of senderReviewCache.keys()) {
    senderReviewCache.delete(key);
    removed += 1;
    if (removed >= overflow) {
      break;
    }
  }
}

function getCachedSenderReviewPayload(key: string): SenderReviewPayload | null {
  const now = Date.now();
  const cached = senderReviewCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= now) {
    senderReviewCache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedSenderReviewPayload(
  key: string,
  value: SenderReviewPayload
): void {
  const now = Date.now();
  pruneSenderReviewCache(now);
  senderReviewCache.set(key, {
    expiresAt: now + SENDER_REVIEW_CACHE_TTL_MS,
    value,
  });
}

export function invalidateSenderReviewCache(): void {
  senderReviewCacheGeneration += 1;
  senderReviewCache.clear();
  senderReviewInflight.clear();
}

// Background refresh of the domain_email_stats materialized view.
// CONCURRENTLY allows reads during refresh (requires UNIQUE INDEX).
let matviewRefreshing = false;
export function refreshDomainEmailStats(): void {
  if (matviewRefreshing) {
    return;
  }
  matviewRefreshing = true;
  db.run("REFRESH MATERIALIZED VIEW CONCURRENTLY domain_email_stats")
    .catch((err) => console.error("[domain_email_stats] refresh failed:", err))
    .finally(() => {
      matviewRefreshing = false;
    });
}

function senderReviewResponse(payload: SenderReviewPayload): Response {
  return Response.json({
    ...payload,
    requestId: crypto.randomUUID(),
  });
}

function parseSamples(raw: unknown): Array<{
  accountDomain: string | null;
  accountName: string | null;
  accountType: string | null;
  emailId: number;
  receivedAt: string;
  senderEmail: string | null;
  senderName: string | null;
  subject: string | null;
}> {
  if (Array.isArray(raw)) {
    return raw as Array<{
      accountDomain: string | null;
      accountName: string | null;
      accountType: string | null;
      emailId: number;
      receivedAt: string;
      senderEmail: string | null;
      senderName: string | null;
      subject: string | null;
    }>;
  }

  if (typeof raw === "string" && raw.length > 0) {
    try {
      return JSON.parse(raw) as Array<{
        accountDomain: string | null;
        accountName: string | null;
        accountType: string | null;
        emailId: number;
        receivedAt: string;
        senderEmail: string | null;
        senderName: string | null;
        subject: string | null;
      }>;
    } catch {
      return [];
    }
  }

  return [];
}

function parsePromptSamples(raw: unknown): DomainPromptSample[] {
  const parsed = parseJsonValue(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((sample): sample is Record<string, unknown> =>
      Boolean(sample && typeof sample === "object")
    )
    .map((sample) => ({
      body_excerpt: String(sample.body_excerpt ?? ""),
      from_email:
        typeof sample.from_email === "string" ? sample.from_email : null,
      received_at: String(sample.received_at ?? ""),
      subject: typeof sample.subject === "string" ? sample.subject : null,
    }));
}

function parseJsonValue(raw: unknown): unknown {
  if (typeof raw !== "string") {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// ── Domain aggregation (Phase 1) ─────────────────────────────────────
// Reads from `domain_email_stats` materialized view (5K rows, ~1MB)
// instead of scanning 692K emails. Joins rules + classifications live.
// Matview refresh runs in background after mutations.
const DOMAIN_AGG_SQL = `
SELECT
  da.*,
  rule.domain AS matched_rule_domain,
  rule.classification AS rule_classification,
  rule.is_excluded AS rule_is_excluded,
  rule.created_at::text AS rule_created_at,
  dc.is_work_related AS llm_is_work_related,
  dc.category AS llm_category,
  dc.confidence AS llm_confidence,
  dc.reason AS llm_reason
FROM domain_email_stats da
LEFT JOIN LATERAL (
  SELECT domain, classification, is_excluded, created_at
  FROM domain_rules
  WHERE da.domain = domain
     OR da.domain LIKE '%.' || domain
  ORDER BY length(domain) DESC
  LIMIT 1
) AS rule ON TRUE
LEFT JOIN domain_classifications dc ON dc.domain = da.domain
WHERE da.domain ILIKE $1
ORDER BY da.email_count DESC, da.last_received_at DESC, da.domain ASC`;

function matchesStatusFilter(
  row: DomainAggRow,
  status: SenderReviewStatus
): boolean {
  switch (status) {
    case "reviewed":
      return row.matched_rule_domain !== null;
    case "unreviewed":
      return row.matched_rule_domain === null;
    case "private": {
      const cls = row.rule_classification ?? "";
      return cls === "HR" || cls === "IT";
    }
    case "spam":
      return (
        row.rule_is_excluded === true && row.rule_classification === "SPAM"
      );
    default:
      return true;
  }
}

function computeStats(rows: DomainAggRow[]): SenderReviewPayload["stats"] {
  let activeDomains = 0;
  let activeUnclassifiedEmails = 0;
  let unreviewedDomains = 0;
  let reviewedDomains = 0;
  let privateDomains = 0;
  let spamDomains = 0;

  for (const row of rows) {
    activeDomains += 1;
    activeUnclassifiedEmails += row.email_count;
    const cls = row.rule_classification ?? "";
    if (row.matched_rule_domain === null) {
      unreviewedDomains += 1;
    } else {
      reviewedDomains += 1;
    }
    if (cls === "HR" || cls === "IT") {
      privateDomains += 1;
    }
    if (row.rule_is_excluded === true && cls === "SPAM") {
      spamDomains += 1;
    }
  }

  return {
    activeDomains,
    activeUnclassifiedEmails,
    privateDomains,
    reviewedDomains,
    spamDomains,
    unreviewedDomains,
  };
}

function formatDomainRow(
  row: DomainAggRow,
  samples: ReturnType<typeof parseSamples>
): SenderReviewPayload["items"][number] {
  return {
    domain: row.domain,
    emailCount: row.email_count,
    firstReceivedAt: row.first_received_at,
    lastReceivedAt: row.last_received_at,
    linkedAccountCount: row.linked_account_count,
    llmVerdict:
      row.llm_is_work_related !== null
        ? {
            category: row.llm_category,
            confidence: row.llm_confidence,
            isWorkRelated: row.llm_is_work_related,
            reason: row.llm_reason,
          }
        : null,
    matchedRuleDomain: row.matched_rule_domain,
    reviewed: Boolean(row.matched_rule_domain),
    rule: row.matched_rule_domain
      ? {
          classification: row.rule_classification,
          createdAt: row.rule_created_at,
          domain: row.matched_rule_domain,
          isExcluded: row.rule_is_excluded === true,
        }
      : null,
    samples,
    senderCount: row.sender_count,
  };
}

async function loadSenderReviewPayload(params: {
  limit: number;
  offset: number;
  searchLike: string;
  status: SenderReviewStatus;
}): Promise<SenderReviewPayload> {
  const { limit, offset, searchLike, status } = params;

  // Phase 1: Domain aggregation — single scan, no samples
  const allDomains = await db
    .query<DomainAggRow, [string]>(DOMAIN_AGG_SQL)
    .all(searchLike);

  // JS-side: stats from all domains, filter by status, paginate
  const stats = computeStats(allDomains);
  const filtered = allDomains.filter((row) => matchesStatusFilter(row, status));
  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);

  // Phase 2: Fetch samples only for the displayed page
  const samplesMap = new Map<string, ReturnType<typeof parseSamples>>();
  if (page.length > 0) {
    const domainList = page.map((r) => r.domain);
    const sampleQuery = buildSenderReviewSamplesQuery(domainList);
    if (sampleQuery) {
      const sampleRows = (await db
        .query<SampleRow, string[]>(sampleQuery.sql)
        .all(...sampleQuery.params)) as SampleRow[];
      for (const row of sampleRows) {
        samplesMap.set(row.domain, parseSamples(row.samples));
      }
    }
  }

  return {
    items: page.map((row) =>
      formatDomainRow(row, samplesMap.get(row.domain) ?? [])
    ),
    pagination: {
      limit,
      page: Math.floor(offset / limit) + 1,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    stats,
  };
}

async function loadStableSenderReviewPayload(params: {
  limit: number;
  offset: number;
  searchLike: string;
  status: SenderReviewStatus;
}): Promise<SenderReviewPayload> {
  for (let attempt = 0; attempt < MAX_STABLE_LOAD_ATTEMPTS; attempt += 1) {
    const generation = senderReviewCacheGeneration;
    const payload = await loadSenderReviewPayload(params);
    if (generation === senderReviewCacheGeneration) {
      return payload;
    }
  }

  return loadSenderReviewPayload(params);
}

export async function listSenderReview(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const cacheKey = getSenderReviewCacheKey(url);
    const cached = getCachedSenderReviewPayload(cacheKey);
    if (cached) {
      return senderReviewResponse(cached);
    }

    const inflight = senderReviewInflight.get(cacheKey);
    if (inflight) {
      return senderReviewResponse(await inflight);
    }

    const limit = parsePositiveInt(url.searchParams.get("limit"), 100, 1, 200);
    const page = parsePositiveInt(url.searchParams.get("page"), 1, 1, 5000);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const searchLike = search.length > 0 ? `%${search}%` : "%";
    const status = normalizeStatus(url.searchParams.get("status"));
    const offset = (page - 1) * limit;
    const promise = loadStableSenderReviewPayload({
      limit,
      offset,
      searchLike,
      status,
    });

    senderReviewInflight.set(cacheKey, promise);

    try {
      const payload = await promise;
      setCachedSenderReviewPayload(cacheKey, payload);
      return senderReviewResponse(payload);
    } finally {
      senderReviewInflight.delete(cacheKey);
    }
  } catch (error) {
    console.error("Failed to load sender review queue:", error);
    return Response.json(
      { error: "Failed to load sender review queue" },
      { status: 500 }
    );
  }
}

// ── Domain classification ────────────────────────────────────────────

const MAX_BODY_CHARS = 6000;
const MAX_CLASSIFY_BATCH = 25;
const DEFAULT_CLASSIFY_BATCH = 10;

const classifyRequestSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_CLASSIFY_BATCH)
    .default(DEFAULT_CLASSIFY_BATCH),
  provider: z
    .enum(["auto", "gemini", "local", "local_public", "openrouter"])
    .default("openrouter"),
});

const classifierResultSchema = z.object({
  category: z.enum([
    "marketing",
    "newsletter",
    "other",
    "personal",
    "politics",
    "shopping",
    "social",
    "spam",
    "work_related",
  ]),
  confidence: z.number().min(0).max(1),
  isWorkRelated: z.boolean(),
  reason: z.string().trim().min(1).max(400),
});

interface DomainCandidate {
  domain: string;
  email_count: number;
  samples: string; // JSON array
}

async function getDomainCandidates(limit: number): Promise<DomainCandidate[]> {
  return await db
    .query<DomainCandidate, [number]>(
      `WITH without_existing AS (
         SELECT
           da.domain,
           da.email_count
         FROM domain_email_stats da
         LEFT JOIN LATERAL (
           SELECT domain
           FROM domain_rules
           WHERE da.domain = domain
              OR da.domain LIKE '%.' || domain
           ORDER BY length(domain) DESC
           LIMIT 1
         ) AS dr ON TRUE
         LEFT JOIN domain_classifications dc ON dc.domain = da.domain
         WHERE dr.domain IS NULL
           AND dc.domain IS NULL
         ORDER BY da.email_count DESC, da.last_received_at DESC, da.domain ASC
         LIMIT $1
       ),
       with_samples AS (
         SELECT
           wd.domain,
           wd.email_count,
           (
             SELECT JSON_AGG(sub ORDER BY sub.received_at DESC)
             FROM (
               SELECT
                 e.from_email,
                 e.subject,
                 LEFT(COALESCE(NULLIF(e.body_preview, ''), ''), $2) AS body_excerpt,
                 e.received_at::text
               FROM emails e
               WHERE e.is_excluded = 0
                 AND e.classification IS NULL
                 AND COALESCE(
                   NULLIF(e.real_sender_domain, ''),
                   NULLIF(e.original_sender_domain, ''),
                   NULLIF(e.from_domain, '')
                 ) = wd.domain
               ORDER BY e.received_at DESC
               LIMIT 5
             ) sub
           )::text AS samples
         FROM without_existing wd
         ORDER BY wd.email_count DESC, wd.domain ASC
       )
       SELECT * FROM with_samples`
    )
    .all(limit, MAX_BODY_CHARS);
}

let classifyRunActive = false;
let classifyRunProgress = { completed: 0, failed: 0, total: 0 };

export async function classifyDomains(req: Request): Promise<Response> {
  if (classifyRunActive) {
    return Response.json(
      {
        error: "Classification run already in progress",
        progress: classifyRunProgress,
      },
      { status: 409 }
    );
  }

  const parsed = classifyRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const candidates = await getDomainCandidates(parsed.data.limit);
  if (candidates.length === 0) {
    return Response.json({
      message: "No unclassified domains found",
      results: [],
    });
  }

  classifyRunActive = true;
  classifyRunProgress = { completed: 0, failed: 0, total: candidates.length };

  const results: Array<{
    domain: string;
    emailCount: number;
    error?: string;
    isWorkRelated?: boolean;
    category?: string;
    reason?: string;
    confidence?: number;
  }> = [];

  try {
    for (const candidate of candidates) {
      try {
        const promptInput = {
          domain: candidate.domain,
          emailCount: candidate.email_count,
          samples: parsePromptSamples(candidate.samples),
        };
        const prompt = buildDomainClassifierPrompt(promptInput);
        const response = await chat(prompt, parsed.data.provider);
        const result = classifierResultSchema.safeParse(response.data);

        if (!result.success) {
          results.push({
            domain: candidate.domain,
            emailCount: candidate.email_count,
            error:
              result.error.issues[0]?.message ?? "Invalid classifier output",
          });
          classifyRunProgress.failed += 1;
          continue;
        }

        const tokenUsage = extractUsageFromMetadata(response.metadata);
        await db.run(
          `INSERT INTO domain_classifications (
             domain,
             is_work_related,
             category,
             confidence,
             reason,
             provider,
             model,
             prompt_version,
             prompt_text,
             prompt_input,
             raw_result,
             metadata,
             processing_time_ms,
             input_tokens,
             output_tokens,
             total_tokens,
             updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16, now())
           ON CONFLICT (domain) DO UPDATE SET
             is_work_related = excluded.is_work_related,
             category = excluded.category,
             confidence = excluded.confidence,
             reason = excluded.reason,
             provider = excluded.provider,
             model = excluded.model,
             prompt_version = excluded.prompt_version,
             prompt_text = excluded.prompt_text,
             prompt_input = excluded.prompt_input,
             raw_result = excluded.raw_result,
             metadata = excluded.metadata,
             processing_time_ms = excluded.processing_time_ms,
             input_tokens = excluded.input_tokens,
             output_tokens = excluded.output_tokens,
             total_tokens = excluded.total_tokens,
             updated_at = now(),
             created_at = now()`,
          [
            candidate.domain,
            result.data.isWorkRelated,
            result.data.category,
            result.data.confidence,
            result.data.reason,
            parsed.data.provider,
            response.model,
            SENDER_REVIEW_PROMPT_VERSION,
            prompt,
            JSON.stringify(promptInput),
            JSON.stringify(response.data),
            JSON.stringify(response.metadata ?? {}),
            response.processing_time_ms ?? null,
            tokenUsage.inputTokens,
            tokenUsage.outputTokens,
            tokenUsage.totalTokens,
          ]
        );

        results.push({
          domain: candidate.domain,
          emailCount: candidate.email_count,
          isWorkRelated: result.data.isWorkRelated,
          category: result.data.category,
          reason: result.data.reason,
          confidence: result.data.confidence,
        });
        classifyRunProgress.completed += 1;
      } catch (err) {
        results.push({
          domain: candidate.domain,
          emailCount: candidate.email_count,
          error: err instanceof Error ? err.message : "Unknown error",
        });
        classifyRunProgress.failed += 1;
      }
    }

    invalidateSenderReviewCache();
    refreshDomainEmailStats();
    return Response.json({ results, progress: classifyRunProgress });
  } finally {
    classifyRunActive = false;
  }
}

export function getClassifyStatus(): Response {
  return Response.json({
    active: classifyRunActive,
    progress: classifyRunProgress,
  });
}

export async function approveDomainClassification(
  req: Request & { params: { domain: string } }
): Promise<Response> {
  const domain = decodeURIComponent(req.params.domain);

  const classification = await db
    .query<{ category: string | null; is_work_related: boolean }, [string]>(
      "SELECT is_work_related, category FROM domain_classifications WHERE domain = $1"
    )
    .get(domain);

  if (!classification) {
    return Response.json(
      { error: "No classification found for this domain" },
      { status: 404 }
    );
  }

  // Apply as domain rule based on the LLM verdict
  const rule = mapDomainVerdictToRule({
    category: classification.category,
    isWorkRelated: classification.is_work_related,
  });

  await db.run(
    `INSERT INTO domain_rules (domain, classification, is_excluded)
     VALUES ($1, $2, $3)
     ON CONFLICT (domain) DO NOTHING`,
    [domain, rule.classification, rule.isExcluded]
  );
  invalidateSenderReviewCache();
  refreshDomainEmailStats();

  console.log(
    `[domain-classify-approve] domain=${domain} work=${classification.is_work_related} rule=${rule.classification} excluded=${rule.isExcluded}`
  );

  return Response.json({
    domain,
    classification: rule.classification,
    isExcluded: rule.isExcluded,
    isWorkRelated: classification.is_work_related,
  });
}

export async function getSenderReviewAudit(
  req: Request & { params: { domain: string } }
): Promise<Response> {
  try {
    const domain = decodeURIComponent(req.params.domain);
    const row = await db
      .query<SenderReviewAuditRow, [string]>(
        `SELECT
           domain,
           provider,
           model,
           prompt_version,
           prompt_text,
           prompt_input,
           raw_result,
           metadata,
           processing_time_ms,
           input_tokens,
           output_tokens,
           total_tokens,
           reason,
           created_at::text,
           updated_at::text
         FROM domain_classifications
         WHERE domain = $1
         LIMIT 1`
      )
      .get(domain);

    if (!row) {
      return Response.json(
        { error: "No audit found for this domain" },
        { status: 404 }
      );
    }

    return Response.json({
      audit: {
        createdAt: row.created_at,
        domain: row.domain,
        inputTokens: row.input_tokens,
        metadata: parseJsonValue(row.metadata),
        model: row.model,
        outputTokens: row.output_tokens,
        processingTimeMs: row.processing_time_ms,
        promptInput: parseJsonValue(row.prompt_input),
        promptText: row.prompt_text,
        promptVersion: row.prompt_version,
        provider: row.provider,
        rawResult: parseJsonValue(row.raw_result),
        reason: row.reason,
        totalTokens: row.total_tokens,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error("Failed to load sender review audit:", error);
    return Response.json(
      { error: "Failed to load sender review audit" },
      { status: 500 }
    );
  }
}
