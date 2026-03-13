import { db } from "@lib/db/client";

export type RelevanceProvider =
  | "auto"
  | "gemini"
  | "local"
  | "local_public"
  | "openrouter";

export interface CandidateRow {
  body_preview: string | null;
  body_text: string | null;
  from_email: string | null;
  id: number;
  received_at: string;
  subject: string | null;
}

export interface ClassifierResult {
  category:
    | "marketing"
    | "newsletter"
    | "other"
    | "personal"
    | "politics"
    | "shopping"
    | "social"
    | "spam"
    | "work_related";
  confidence: number;
  isObviouslyUnrelated: boolean;
  isWorkRelated: boolean;
  reason: string;
  suggestedAction:
    | "ignore_non_work"
    | "keep_for_triage"
    | "mark_spam"
    | "needs_human_review";
}

export interface RunResult {
  emailId: number;
  error?: string;
  id?: number;
  status: "failed" | "success";
  subject: string | null;
}

export interface RelevanceRunSnapshot {
  currentEmailId: number | null;
  currentReviewId: number | null;
  currentSubject: string | null;
  error: string | null;
  failed: number;
  finishedAt: string | null;
  id: string;
  limitRequested: number;
  processed: number;
  provider: RelevanceProvider;
  results: RunResult[];
  startedAt: string;
  status: "completed" | "failed" | "running";
  succeeded: number;
  total: number;
}

interface InternalRunState extends RelevanceRunSnapshot {}

interface StartRunParams {
  classifyCandidate: (
    candidate: CandidateRow,
    provider: RelevanceProvider
  ) => Promise<{
    model: string;
    rawResult: Record<string, unknown>;
    result: ClassifierResult;
  }>;
  getCandidates: (limit: number) => Promise<CandidateRow[]>;
  limit: number;
  promptVersion: string;
  provider: RelevanceProvider;
}

let activeRun: InternalRunState | null = null;
let latestRun: InternalRunState | null = null;

function cloneResult(result: RunResult): RunResult {
  return {
    emailId: result.emailId,
    error: result.error,
    id: result.id,
    status: result.status,
    subject: result.subject,
  };
}

function snapshotRun(
  run: InternalRunState | null
): RelevanceRunSnapshot | null {
  if (!run) {
    return null;
  }

  return {
    currentEmailId: run.currentEmailId,
    currentReviewId: run.currentReviewId,
    currentSubject: run.currentSubject,
    error: run.error,
    failed: run.failed,
    finishedAt: run.finishedAt,
    id: run.id,
    limitRequested: run.limitRequested,
    processed: run.processed,
    provider: run.provider,
    results: run.results.map(cloneResult),
    startedAt: run.startedAt,
    status: run.status,
    succeeded: run.succeeded,
    total: run.total,
  };
}

function pushRunResult(run: InternalRunState, result: RunResult) {
  run.results = [result, ...run.results].slice(0, 20);
}

async function lookupReviewId(emailId: number): Promise<number | null> {
  const saved = await db
    .query<{ id: number }, [number]>(
      "SELECT id FROM email_relevance_reviews WHERE email_id = $1 LIMIT 1"
    )
    .get(emailId);

  return saved?.id ?? null;
}

async function upsertRunSuccess(params: {
  candidate: CandidateRow;
  model: string;
  promptVersion: string;
  provider: RelevanceProvider;
  rawResult: Record<string, unknown>;
  result: ClassifierResult;
}): Promise<number | null> {
  const { candidate, model, promptVersion, provider, rawResult, result } =
    params;

  await db.run(
    `INSERT INTO email_relevance_reviews (
       email_id,
       run_status,
       review_status,
       provider,
       model,
       prompt_version,
       is_work_related,
       is_obviously_unrelated,
       category,
       confidence,
       reason,
       suggested_action,
       raw_result,
       error,
       updated_at
     )
     VALUES (
       $1, 'success', 'unreviewed', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NULL, now()
     )
     ON CONFLICT (email_id) DO UPDATE SET
       run_status = excluded.run_status,
       review_status = 'unreviewed',
       provider = excluded.provider,
       model = excluded.model,
       prompt_version = excluded.prompt_version,
       is_work_related = excluded.is_work_related,
       is_obviously_unrelated = excluded.is_obviously_unrelated,
       category = excluded.category,
       confidence = excluded.confidence,
       reason = excluded.reason,
       suggested_action = excluded.suggested_action,
       raw_result = excluded.raw_result,
       error = NULL,
       updated_at = now()`,
    [
      candidate.id,
      provider,
      model,
      promptVersion,
      result.isWorkRelated,
      result.isObviouslyUnrelated,
      result.category,
      result.confidence,
      result.reason,
      result.suggestedAction,
      JSON.stringify(rawResult),
    ]
  );

  return await lookupReviewId(candidate.id);
}

async function upsertRunFailure(params: {
  candidate: CandidateRow;
  error: string;
  promptVersion: string;
  provider: RelevanceProvider;
}): Promise<number | null> {
  await db.run(
    `INSERT INTO email_relevance_reviews (
       email_id,
       run_status,
       review_status,
       provider,
       prompt_version,
       error,
       updated_at
     )
     VALUES ($1, 'failed', 'unreviewed', $2, $3, $4, now())
     ON CONFLICT (email_id) DO UPDATE SET
       run_status = 'failed',
       review_status = 'unreviewed',
       provider = excluded.provider,
       prompt_version = excluded.prompt_version,
       error = excluded.error,
       updated_at = now()`,
    [params.candidate.id, params.provider, params.promptVersion, params.error]
  );

  return await lookupReviewId(params.candidate.id);
}

async function executeRun(
  run: InternalRunState,
  candidates: CandidateRow[],
  params: StartRunParams
) {
  try {
    for (const candidate of candidates) {
      run.currentEmailId = candidate.id;
      run.currentReviewId = null;
      run.currentSubject = candidate.subject;

      try {
        const classified = await params.classifyCandidate(
          candidate,
          params.provider
        );
        const reviewId = await upsertRunSuccess({
          candidate,
          model: classified.model,
          promptVersion: params.promptVersion,
          provider: params.provider,
          rawResult: classified.rawResult,
          result: classified.result,
        });

        run.currentReviewId = reviewId;
        run.processed += 1;
        run.succeeded += 1;
        pushRunResult(run, {
          emailId: candidate.id,
          id: reviewId ?? undefined,
          status: "success",
          subject: candidate.subject,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Email relevance run failed";
        const reviewId = await upsertRunFailure({
          candidate,
          error: message,
          promptVersion: params.promptVersion,
          provider: params.provider,
        });

        run.currentReviewId = reviewId;
        run.failed += 1;
        run.processed += 1;
        pushRunResult(run, {
          emailId: candidate.id,
          error: message,
          id: reviewId ?? undefined,
          status: "failed",
          subject: candidate.subject,
        });
      }
    }

    run.status = "completed";
    run.finishedAt = new Date().toISOString();
    run.currentEmailId = null;
    run.currentReviewId = null;
    run.currentSubject = null;
    run.error = null;
  } catch (error) {
    run.status = "failed";
    run.finishedAt = new Date().toISOString();
    run.currentEmailId = null;
    run.currentReviewId = null;
    run.currentSubject = null;
    run.error =
      error instanceof Error ? error.message : "Email relevance run failed";
  } finally {
    latestRun = run;
    if (activeRun?.id === run.id) {
      activeRun = null;
    }
  }
}

export async function startEmailRelevanceRun(
  params: StartRunParams
): Promise<{ run: RelevanceRunSnapshot | null; started: boolean }> {
  if (activeRun?.status === "running") {
    return { run: snapshotRun(activeRun), started: false };
  }

  const candidates = await params.getCandidates(params.limit);
  const now = new Date().toISOString();
  const run: InternalRunState = {
    currentEmailId: null,
    currentReviewId: null,
    currentSubject: null,
    error: null,
    failed: 0,
    finishedAt: candidates.length === 0 ? now : null,
    id: crypto.randomUUID(),
    limitRequested: params.limit,
    processed: 0,
    provider: params.provider,
    results: [],
    startedAt: now,
    status: candidates.length === 0 ? "completed" : "running",
    succeeded: 0,
    total: candidates.length,
  };

  latestRun = run;
  if (candidates.length === 0) {
    activeRun = null;
    return { run: snapshotRun(run), started: true };
  }

  activeRun = run;
  const runPromise = executeRun(run, candidates, params);
  runPromise.catch((error) => {
    console.error("[api.emails.relevance-review.run] background failure", {
      error,
      runId: run.id,
    });
  });
  return { run: snapshotRun(run), started: true };
}

export function getEmailRelevanceRun(): RelevanceRunSnapshot | null {
  return snapshotRun(activeRun ?? latestRun);
}
