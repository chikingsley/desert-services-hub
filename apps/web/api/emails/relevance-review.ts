import { chat } from "@documents-intake/pdf-analysis";
import { db } from "@lib/db/client";
import { z } from "zod";
import {
  type CandidateRow,
  type ClassifierResult,
  getEmailRelevanceRun,
  type RelevanceProvider,
  startEmailRelevanceRun,
} from "@/api/emails/relevance-review-runner";
import {
  formatErrorForLog,
  isApiDbTimeoutError,
  withApiDbTimeout,
} from "@/api/utils/db-guard";
import { invalidateSenderReviewCache } from "./sender-review";
import { mapDomainVerdictToRule } from "./sender-review-llm";

type BunRequest = Request & { params: { id: string } };

const PROMPT_VERSION = "email_relevance_v1";
const MAX_BATCH_SIZE = 25;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 200;
const MAX_BODY_CHARS = 12_000;

const reviewStatusSchema = z.enum(["approved", "needs_work", "unreviewed"]);
const providerSchema = z.enum(["auto", "gemini", "local", "openrouter"]);

const runRequestSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_BATCH_SIZE)
    .default(DEFAULT_BATCH_SIZE),
  provider: providerSchema.default("openrouter"),
});

const saveReviewSchema = z.object({
  reviewNotes: z.string().trim().max(4000).nullable().optional(),
  reviewStatus: reviewStatusSchema,
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
  isObviouslyUnrelated: z.boolean(),
  isWorkRelated: z.boolean(),
  reason: z.string().trim().min(1).max(400),
  suggestedAction: z.enum([
    "ignore_non_work",
    "keep_for_triage",
    "mark_spam",
    "needs_human_review",
  ]),
});

interface ListRow {
  body_preview: string | null;
  confidence: number | null;
  created_at: string;
  email_id: number;
  error: string | null;
  from_email: string | null;
  id: number;
  is_obviously_unrelated: boolean | null;
  is_work_related: boolean | null;
  provider: string | null;
  reason: string | null;
  received_at: string;
  review_status: string;
  run_status: string;
  subject: string | null;
  updated_at: string;
}

interface DetailRow extends ListRow {
  body_full: string | null;
  body_html: string | null;
  category: string | null;
  model: string | null;
  prompt_version: string;
  raw_result: unknown;
  review_notes: string | null;
  reviewed_at: string | null;
  suggested_action: string | null;
  web_url: string | null;
}

interface StatsRow {
  approved_count: number;
  failed_count: number;
  needs_work_count: number;
  predicted_unrelated_count: number;
  predicted_work_count: number;
  total_reviews: number;
  unreviewed_count: number;
}

function parsePositiveInt(
  raw: string | null,
  fallback: number,
  max: number
): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function parseOptionalQuery(raw: string | null): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

function buildListQuery(url: URL): {
  params: unknown[];
  sql: string;
} {
  const params: unknown[] = [];
  const where: string[] = [];
  const query = parseOptionalQuery(url.searchParams.get("q"));
  const reviewStatus = parseOptionalQuery(url.searchParams.get("reviewStatus"));
  const predicted = parseOptionalQuery(url.searchParams.get("predicted"));
  const limit = parsePositiveInt(
    url.searchParams.get("limit"),
    DEFAULT_LIST_LIMIT,
    MAX_LIST_LIMIT
  );

  if (
    reviewStatus &&
    (reviewStatus === "approved" ||
      reviewStatus === "needs_work" ||
      reviewStatus === "unreviewed")
  ) {
    params.push(reviewStatus);
    where.push(`r.review_status = $${params.length}`);
  }

  if (predicted === "work") {
    where.push("r.is_work_related = true");
  } else if (predicted === "unrelated") {
    where.push("r.is_obviously_unrelated = true");
  } else if (predicted === "failed") {
    where.push(`r.run_status = 'failed'`);
  }

  if (query) {
    params.push(`%${query}%`);
    const idx = params.length;
    where.push(
      `(COALESCE(e.subject, '') ILIKE $${idx}
        OR COALESCE(e.from_email, '') ILIKE $${idx}
        OR COALESCE(r.reason, '') ILIKE $${idx}
        OR COALESCE(e.body_preview, '') ILIKE $${idx})`
    );
  }

  params.push(limit);
  const sql = `
    SELECT
      r.id,
      r.email_id,
      r.run_status,
      r.review_status,
      r.provider,
      r.is_work_related,
      r.is_obviously_unrelated,
      r.confidence,
      r.reason,
      r.error,
      r.created_at::text,
      r.updated_at::text,
      e.subject,
      e.from_email,
      e.received_at::text,
      e.body_preview
    FROM email_relevance_reviews r
    JOIN emails e ON e.id = r.email_id
    ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY
      CASE WHEN r.review_status = 'unreviewed' THEN 0 ELSE 1 END,
      r.updated_at DESC,
      r.id DESC
    LIMIT $${params.length}
  `;

  return { params, sql };
}

function buildClassifierPrompt(email: {
  bodyText: string | null;
  fromEmail: string | null;
  subject: string | null;
}): string {
  const body = (email.bodyText ?? "").slice(0, MAX_BODY_CHARS);

  return `You classify email relevance for Desert Services, a construction services company.

Decide whether this email is actually business-related to operations like estimates, projects, dust permits, contracts, scheduling, billing, vendors, subcontractors, customers, compliance, insurance, or internal work.

Consumer mail, clothing promos, politics, generic newsletters, social notifications, personal mail, and random marketing are not work-related.

Return ONLY valid JSON with these exact keys:
{
  "isWorkRelated": boolean,
  "isObviouslyUnrelated": boolean,
  "category": "work_related" | "marketing" | "newsletter" | "politics" | "shopping" | "personal" | "social" | "spam" | "other",
  "confidence": number,
  "reason": string,
  "suggestedAction": "keep_for_triage" | "mark_spam" | "ignore_non_work" | "needs_human_review"
}

Guidance:
- "isWorkRelated" should be true only if the email is plausibly relevant to Desert Services work.
- "isObviouslyUnrelated" should be true for clearly non-work mail.
- Use "mark_spam" only for obvious spam/junk.
- Use "ignore_non_work" for non-work mail that is not traditional spam.
- Use "needs_human_review" if it is ambiguous.

Email:
From: ${email.fromEmail ?? "(unknown)"}
Subject: ${email.subject ?? "(no subject)"}
Body:
${body}`;
}

async function classifyCandidate(
  candidate: CandidateRow,
  provider: RelevanceProvider
): Promise<{
  model: string;
  rawResult: Record<string, unknown>;
  result: ClassifierResult;
}> {
  const prompt = buildClassifierPrompt({
    bodyText: candidate.body_text,
    fromEmail: candidate.from_email,
    subject: candidate.subject,
  });

  const response = await chat(prompt, provider);
  const parsed = classifierResultSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid classifier output"
    );
  }

  return {
    model: response.model,
    rawResult: response.data,
    result: parsed.data,
  };
}

async function getCandidates(limit: number): Promise<CandidateRow[]> {
  return await db
    .query<CandidateRow, [number]>(
      `WITH email_candidates AS (
         SELECT
           e.id,
           e.subject,
           e.from_email,
           e.received_at,
           e.body_preview,
           COALESCE(NULLIF(e.body_full, ''), NULLIF(e.body_preview, '')) AS body_text,
           COALESCE(
             NULLIF(e.real_sender_domain, ''),
             NULLIF(e.original_sender_domain, ''),
             NULLIF(e.from_domain, '')
           ) AS sender_domain
         FROM emails e
         WHERE COALESCE(e.is_excluded, 0) = 0
           AND e.classification IS NULL
           AND COALESCE(NULLIF(e.body_full, ''), NULLIF(e.body_preview, '')) IS NOT NULL
       )
       SELECT
         candidate.id,
         candidate.subject,
         candidate.from_email,
         candidate.received_at::text,
         candidate.body_preview,
         candidate.body_text
       FROM email_candidates candidate
       LEFT JOIN email_relevance_reviews review
         ON review.email_id = candidate.id
       LEFT JOIN LATERAL (
         SELECT domain, classification, is_excluded
         FROM domain_rules
         WHERE candidate.sender_domain = domain
            OR candidate.sender_domain LIKE '%.' || domain
         ORDER BY length(domain) DESC
         LIMIT 1
       ) AS rule ON TRUE
       WHERE COALESCE(rule.is_excluded, false) = false
         AND COALESCE(rule.classification, '') NOT IN ('HR', 'IT', 'SPAM')
         AND (
           review.email_id IS NULL
           OR review.run_status = 'failed'
           OR review.review_status = 'needs_work'
         )
       ORDER BY
         CASE
           WHEN review.run_status = 'failed' THEN 0
           WHEN review.review_status = 'needs_work' THEN 1
           ELSE 2
         END,
         COALESCE(review.updated_at, candidate.received_at) DESC,
         candidate.id DESC
       LIMIT $1`
    )
    .all(limit);
}

function mapDetailRow(row: DetailRow) {
  return {
    bodyPreview: row.body_preview,
    bodyHtml: row.body_html,
    bodyText: row.body_full ?? row.body_preview,
    category: row.category,
    confidence: row.confidence,
    createdAt: row.created_at,
    emailId: row.email_id,
    error: row.error,
    fromEmail: row.from_email,
    id: row.id,
    isObviouslyUnrelated: row.is_obviously_unrelated,
    isWorkRelated: row.is_work_related,
    model: row.model,
    promptVersion: row.prompt_version,
    provider: row.provider,
    rawResult: row.raw_result,
    reason: row.reason,
    receivedAt: row.received_at,
    reviewNotes: row.review_notes,
    reviewStatus: row.review_status,
    reviewedAt: row.reviewed_at,
    runStatus: row.run_status,
    suggestedAction: row.suggested_action,
    subject: row.subject,
    updatedAt: row.updated_at,
    webUrl: row.web_url,
  };
}

export async function listEmailRelevanceReview(
  req: Request
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const { params, sql } = buildListQuery(url);

    const { items, stats } = await withApiDbTimeout(
      {
        operation: "emails.relevance-review.list",
        maxInFlight: 4,
        requestId,
        route: "/api/emails/relevance-review",
      },
      async () =>
        await db.transaction(async () => {
          const items = await db.query<ListRow, unknown[]>(sql).all(...params);
          const stats = await db
            .query<StatsRow>(
              `SELECT
                 COUNT(*)::int AS total_reviews,
                 COUNT(*) FILTER (WHERE review_status = 'unreviewed')::int AS unreviewed_count,
                 COUNT(*) FILTER (WHERE review_status = 'approved')::int AS approved_count,
                 COUNT(*) FILTER (WHERE review_status = 'needs_work')::int AS needs_work_count,
                 COUNT(*) FILTER (WHERE run_status = 'failed')::int AS failed_count,
                 COUNT(*) FILTER (WHERE is_work_related = true)::int AS predicted_work_count,
                 COUNT(*) FILTER (WHERE is_obviously_unrelated = true)::int AS predicted_unrelated_count
               FROM email_relevance_reviews`
            )
            .get();
          return { items, stats };
        })
    );

    return Response.json({
      items: items.map((item) => ({
        bodyPreview: item.body_preview,
        confidence: item.confidence,
        createdAt: item.created_at,
        emailId: item.email_id,
        error: item.error,
        fromEmail: item.from_email,
        id: item.id,
        isObviouslyUnrelated: item.is_obviously_unrelated,
        isWorkRelated: item.is_work_related,
        provider: item.provider,
        reason: item.reason,
        receivedAt: item.received_at,
        reviewStatus: item.review_status,
        runStatus: item.run_status,
        subject: item.subject,
        updatedAt: item.updated_at,
      })),
      requestId,
      stats: stats ?? {
        approved_count: 0,
        failed_count: 0,
        needs_work_count: 0,
        predicted_unrelated_count: 0,
        predicted_work_count: 0,
        total_reviews: 0,
        unreviewed_count: 0,
      },
    });
  } catch (error) {
    console.error("[api.emails.relevance-review] failed", {
      requestId,
      route: "/api/emails/relevance-review",
      error: formatErrorForLog(error),
    });

    if (isApiDbTimeoutError(error)) {
      return Response.json(
        { error: "Email relevance review query timed out", requestId },
        { status: 503 }
      );
    }

    return Response.json(
      { error: "Failed to load email relevance review queue", requestId },
      { status: 500 }
    );
  }
}

export async function getEmailRelevanceReviewDetail(
  req: BunRequest
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const reviewId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(reviewId) || reviewId <= 0) {
      return Response.json(
        { error: "Invalid relevance review id", requestId },
        { status: 400 }
      );
    }

    const row = await withApiDbTimeout(
      {
        operation: "emails.relevance-review.detail",
        requestId,
        route: "/api/emails/relevance-review/:id",
      },
      () =>
        db
          .query<DetailRow, [number]>(
            `SELECT
               r.id,
               r.email_id,
               r.run_status,
               r.review_status,
               r.provider,
               r.model,
               r.prompt_version,
               r.is_work_related,
               r.is_obviously_unrelated,
               r.category,
               r.confidence,
               r.reason,
               r.suggested_action,
               r.raw_result,
               r.error,
               r.review_notes,
               r.reviewed_at::text,
               r.created_at::text,
               r.updated_at::text,
               e.subject,
               e.from_email,
               e.received_at::text,
               e.body_preview,
               e.body_html,
               e.body_full,
               e.web_url
             FROM email_relevance_reviews r
             JOIN emails e ON e.id = r.email_id
             WHERE r.id = $1
             LIMIT 1`
          )
          .get(reviewId)
    );

    if (!row) {
      return Response.json(
        { error: "Email relevance review not found", requestId },
        { status: 404 }
      );
    }

    return Response.json({ item: mapDetailRow(row), requestId });
  } catch (error) {
    console.error("[api.emails.relevance-review.detail] failed", {
      requestId,
      route: "/api/emails/relevance-review/:id",
      error: formatErrorForLog(error),
    });

    if (isApiDbTimeoutError(error)) {
      return Response.json(
        { error: "Email relevance detail query timed out", requestId },
        { status: 503 }
      );
    }

    return Response.json(
      { error: "Failed to load email relevance detail", requestId },
      { status: 500 }
    );
  }
}

export async function runEmailRelevanceReview(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const parsed = runRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid request",
          requestId,
        },
        { status: 400 }
      );
    }

    const runResult = await startEmailRelevanceRun({
      classifyCandidate,
      getCandidates,
      limit: parsed.data.limit,
      promptVersion: PROMPT_VERSION,
      provider: parsed.data.provider,
    });

    return Response.json(
      {
        requestId,
        run: runResult.run,
        started: runResult.started,
      },
      { status: runResult.started ? 202 : 200 }
    );
  } catch (error) {
    console.error("[api.emails.relevance-review.run] failed", {
      requestId,
      route: "/api/emails/relevance-review/run",
      error: formatErrorForLog(error),
    });

    return Response.json(
      { error: "Failed to run email relevance review batch", requestId },
      { status: 500 }
    );
  }
}

export function getEmailRelevanceRunStatus(): Response {
  return Response.json({ run: getEmailRelevanceRun() });
}

export async function updateEmailRelevanceReview(
  req: BunRequest
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const reviewId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(reviewId) || reviewId <= 0) {
      return Response.json(
        { error: "Invalid relevance review id", requestId },
        { status: 400 }
      );
    }

    const parsed = saveReviewSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid request",
          requestId,
        },
        { status: 400 }
      );
    }

    await db.run(
      `UPDATE email_relevance_reviews
       SET review_status = $1,
           review_notes = $2,
           reviewed_at = CASE WHEN $1 = 'unreviewed' THEN NULL ELSE now() END,
           updated_at = now()
       WHERE id = $3`,
      [parsed.data.reviewStatus, parsed.data.reviewNotes ?? null, reviewId]
    );

    // Cascade: when approving a "not work related" review, auto-create a domain rule
    if (parsed.data.reviewStatus === "approved") {
      const review = await db
        .query<
          {
            category: string | null;
            is_work_related: boolean | null;
            sender_domain: string | null;
          },
          [number]
        >(
          `SELECT
             r.is_work_related,
             r.category,
             COALESCE(
               NULLIF(e.real_sender_domain, ''),
               NULLIF(e.original_sender_domain, ''),
               NULLIF(e.from_domain, '')
             ) AS sender_domain
           FROM email_relevance_reviews r
           JOIN emails e ON e.id = r.email_id
           WHERE r.id = $1`
        )
        .get(reviewId);

      if (review?.is_work_related === false && review.sender_domain) {
        const rule = mapDomainVerdictToRule({
          category: review.category,
          isWorkRelated: false,
        });

        await db.run(
          `INSERT INTO domain_rules (domain, classification, is_excluded)
           VALUES ($1, $2, $3)
           ON CONFLICT (domain) DO NOTHING`,
          [review.sender_domain, rule.classification, rule.isExcluded]
        );
        invalidateSenderReviewCache();

        console.log(
          `[relevance-cascade] domain=${review.sender_domain} classification=${rule.classification} excluded=${rule.isExcluded} (from review ${reviewId})`
        );
      }
    }

    const row = await db
      .query<DetailRow, [number]>(
        `SELECT
           r.id,
           r.email_id,
           r.run_status,
           r.review_status,
           r.provider,
           r.model,
           r.prompt_version,
           r.is_work_related,
           r.is_obviously_unrelated,
           r.category,
           r.confidence,
           r.reason,
           r.suggested_action,
           r.raw_result,
           r.error,
           r.review_notes,
           r.reviewed_at::text,
           r.created_at::text,
           r.updated_at::text,
           e.subject,
           e.from_email,
           e.received_at::text,
           e.body_preview,
           e.body_html,
           e.body_full,
           e.web_url
         FROM email_relevance_reviews r
         JOIN emails e ON e.id = r.email_id
         WHERE r.id = $1
         LIMIT 1`
      )
      .get(reviewId);

    if (!row) {
      return Response.json(
        { error: "Email relevance review not found", requestId },
        { status: 404 }
      );
    }

    return Response.json({ item: mapDetailRow(row), requestId });
  } catch (error) {
    console.error("[api.emails.relevance-review.update] failed", {
      requestId,
      route: "/api/emails/relevance-review/:id/review",
      error: formatErrorForLog(error),
    });

    return Response.json(
      { error: "Failed to save email relevance review", requestId },
      { status: 500 }
    );
  }
}
