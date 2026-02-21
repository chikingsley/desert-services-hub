// biome-ignore lint/nursery/noExcessiveLinesPerFile: Keeps replay orchestration in one CLI-oriented module.
import { rerank } from "@enrichment/jina/client";
import { db } from "@lib/db/client";
import { gatherTriageContext } from "@lib/triage/context";
import type {
  TriageContext,
  TriageEstimateCandidate,
  TriageProjectCandidate,
} from "@lib/triage/types";

type CandidateKind = "project" | "estimate";

export interface ReplayOptions {
  concurrency: number;
  limit: number;
  lookbackDays: number;
  mailbox: string | null;
  sample: number;
  since: string | null;
  topN: number;
}

interface ReplaySeedRow {
  email_id: number;
  email_project_id: number | null;
  estimate_ids: unknown;
  mailbox_email: string;
  project_ids_from_estimate: unknown;
  received_at: string;
  subject: string | null;
}

interface KindStats {
  baselineTop1Hits: number;
  baselineTopKHits: number;
  evaluated: number;
  rerankApplied: number;
  rerankAttempted: number;
  rerankChangedTop1: number;
  rerankErrored: number;
  rerankTop1Hits: number;
  rerankTopKHits: number;
  skippedFewCandidates: number;
  skippedNoQuery: number;
  truthInCandidates: number;
  withCandidates: number;
}

interface ReplayExample {
  baselineTop: number[];
  candidateCount: number;
  emailId: number;
  kind: CandidateKind;
  mailboxEmail: string;
  queryChars: number;
  receivedAt: string;
  rerankTop: number[];
  subject: string | null;
  truthIds: number[];
}

interface ReplayAccumulator {
  contextMissing: number;
  estimate: KindStats;
  improved: ReplayExample[];
  project: KindStats;
  regressed: ReplayExample[];
  rowErrors: number;
  rowsProcessed: number;
}

interface EvaluateKindInput<T extends { id: number; score: number }> {
  buildDocument: (candidate: T) => string;
  candidates: T[];
  emailId: number;
  kind: CandidateKind;
  mailboxEmail: string;
  query: string;
  receivedAt: string;
  subject: string | null;
  topN: number;
  truthIds: number[];
}

interface RerankOutcome {
  applied: boolean;
  attempted: boolean;
  changedTop1: boolean;
  errored: boolean;
  skippedFewCandidates: boolean;
  skippedNoQuery: boolean;
  top: number[];
}

interface TopHitResult {
  top1: boolean;
  topK: boolean;
}

const JINA_TRIAGE_RERANK_MODEL = "jina-reranker-v3";
const MAX_QUERY_CHARS = 1600;
const MAX_DOCUMENT_CHARS = 8192;

async function fetchReplaySeeds(
  options: ReplayOptions
): Promise<ReplaySeedRow[]> {
  const rows = await db
    .query<ReplaySeedRow>(
      `SELECT
         e.id AS email_id,
         m.email AS mailbox_email,
         e.received_at,
         e.subject,
         e.project_id AS email_project_id,
         COALESCE(
           ARRAY_AGG(DISTINCT ee.estimate_id) FILTER (WHERE ee.estimate_id IS NOT NULL),
           ARRAY[]::int[]
         ) AS estimate_ids,
         COALESCE(
           ARRAY_AGG(DISTINCT pe.project_id) FILTER (WHERE pe.project_id IS NOT NULL),
           ARRAY[]::int[]
         ) AS project_ids_from_estimate
       FROM emails e
       JOIN mailboxes m ON m.id = e.mailbox_id
       LEFT JOIN estimate_emails ee ON ee.email_id = e.id
       LEFT JOIN project_estimates pe ON pe.estimate_id = ee.estimate_id
       WHERE e.is_excluded = 0
         AND (
           ($1::timestamptz IS NOT NULL AND e.received_at >= $1::timestamptz)
           OR ($1::timestamptz IS NULL AND e.received_at >= now() - make_interval(days => $2::int))
         )
         AND ($3::text IS NULL OR lower(m.email) = lower($3))
         AND (e.project_id IS NOT NULL OR ee.estimate_id IS NOT NULL)
       GROUP BY e.id, m.email
       ORDER BY e.received_at DESC
       LIMIT $4`
    )
    .all(options.since, options.lookbackDays, options.mailbox, options.limit);
  return rows;
}

function createKindStats(): KindStats {
  return {
    baselineTop1Hits: 0,
    baselineTopKHits: 0,
    evaluated: 0,
    rerankApplied: 0,
    rerankAttempted: 0,
    rerankChangedTop1: 0,
    rerankErrored: 0,
    rerankTop1Hits: 0,
    rerankTopKHits: 0,
    skippedFewCandidates: 0,
    skippedNoQuery: 0,
    truthInCandidates: 0,
    withCandidates: 0,
  };
}

function createAccumulator(): ReplayAccumulator {
  return {
    contextMissing: 0,
    estimate: createKindStats(),
    improved: [],
    project: createKindStats(),
    regressed: [],
    rowErrors: 0,
    rowsProcessed: 0,
  };
}

function mergeKindStats(target: KindStats, source: KindStats): void {
  target.baselineTop1Hits += source.baselineTop1Hits;
  target.baselineTopKHits += source.baselineTopKHits;
  target.evaluated += source.evaluated;
  target.rerankApplied += source.rerankApplied;
  target.rerankAttempted += source.rerankAttempted;
  target.rerankChangedTop1 += source.rerankChangedTop1;
  target.rerankErrored += source.rerankErrored;
  target.rerankTop1Hits += source.rerankTop1Hits;
  target.rerankTopKHits += source.rerankTopKHits;
  target.skippedFewCandidates += source.skippedFewCandidates;
  target.skippedNoQuery += source.skippedNoQuery;
  target.truthInCandidates += source.truthInCandidates;
  target.withCandidates += source.withCandidates;
}

function mergeAccumulator(
  target: ReplayAccumulator,
  source: ReplayAccumulator,
  sampleLimit: number
): void {
  target.contextMissing += source.contextMissing;
  mergeKindStats(target.estimate, source.estimate);
  target.improved = [...target.improved, ...source.improved].slice(
    0,
    sampleLimit
  );
  mergeKindStats(target.project, source.project);
  target.regressed = [...target.regressed, ...source.regressed].slice(
    0,
    sampleLimit
  );
  target.rowErrors += source.rowErrors;
  target.rowsProcessed += source.rowsProcessed;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}…`;
}

function uniquePositiveInts(values: number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const value of values) {
    if (!Number.isInteger(value) || value <= 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

function parseIntVector(value: unknown): number[] {
  if (!value) {
    return [];
  }

  const collect = (items: unknown[]): number[] =>
    uniquePositiveInts(
      items
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    );

  if (Array.isArray(value)) {
    return collect(value);
  }
  if (ArrayBuffer.isView(value)) {
    return collect(Array.from(value as unknown as Iterable<unknown>));
  }
  if (typeof value === "object") {
    return collect(Object.values(value as Record<string, unknown>));
  }
  return [];
}

function rankByBaselineScore(
  candidates: Array<{ id: number; score: number }>,
  topN: number
): number[] {
  return [...candidates]
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, topN)
    .map((candidate) => candidate.id);
}

function buildRerankQuery(context: TriageContext): string {
  const parts: string[] = [];
  if (context.email.subject?.trim()) {
    parts.push(context.email.subject.trim());
  }
  if (context.email.body?.trim()) {
    parts.push(truncate(context.email.body.trim(), 1200));
  }
  if (context.email.from?.trim()) {
    parts.push(`From: ${context.email.from.trim()}`);
  }
  for (const threadEmail of context.thread) {
    if (threadEmail.subject?.trim()) {
      parts.push(threadEmail.subject.trim());
    }
  }
  const query = parts.join("\n");
  return query.trim() ? truncate(query, MAX_QUERY_CHARS) : "";
}

function buildProjectDocument(candidate: TriageProjectCandidate): string {
  const parts = [
    `project_name: ${candidate.name}`,
    `contractor: ${candidate.contractor ?? ""}`,
    `address: ${candidate.address ?? ""}`,
  ];
  return truncate(parts.join("\n"), MAX_DOCUMENT_CHARS);
}

function buildEstimateDocument(candidate: TriageEstimateCandidate): string {
  const parts = [
    `estimate_number: ${candidate.estimateNumber ?? ""}`,
    `job_name: ${candidate.jobName}`,
    `contractor: ${candidate.contractor ?? ""}`,
    `job_address: ${candidate.jobAddress ?? ""}`,
  ];
  return truncate(parts.join("\n"), MAX_DOCUMENT_CHARS);
}

function computeTopHits(
  rankedIds: number[],
  truthSet: Set<number>
): TopHitResult {
  const top1Id = rankedIds[0] ?? null;
  return {
    top1: top1Id !== null && truthSet.has(top1Id),
    topK: rankedIds.some((id) => truthSet.has(id)),
  };
}

async function computeRerankOutcome<T extends { id: number; score: number }>(
  input: EvaluateKindInput<T>,
  baselineTop: number[],
  topN: number
): Promise<RerankOutcome> {
  if (input.candidates.length < 2) {
    return {
      attempted: false,
      applied: false,
      changedTop1: false,
      errored: false,
      skippedFewCandidates: true,
      skippedNoQuery: false,
      top: baselineTop,
    };
  }
  if (!input.query) {
    return {
      attempted: false,
      applied: false,
      changedTop1: false,
      errored: false,
      skippedFewCandidates: false,
      skippedNoQuery: true,
      top: baselineTop,
    };
  }

  try {
    const documents = input.candidates.map((candidate) =>
      input.buildDocument(candidate)
    );
    const response = await rerank(input.query, documents, {
      // @enrichment/jina union is older; runtime model is v3.
      model:
        JINA_TRIAGE_RERANK_MODEL as unknown as "jina-reranker-v2-base-multilingual",
      topN,
      returnDocuments: false,
    });
    const ranked = response.results
      .map((result) => input.candidates[result.index]?.id)
      .filter((id): id is number => Number.isInteger(id) && id > 0);
    const rerankTop = ranked.length > 0 ? ranked : baselineTop;
    return {
      attempted: true,
      applied: ranked.length > 0,
      changedTop1: (baselineTop[0] ?? null) !== (rerankTop[0] ?? null),
      errored: false,
      skippedFewCandidates: false,
      skippedNoQuery: false,
      top: rerankTop,
    };
  } catch {
    return {
      attempted: true,
      applied: false,
      changedTop1: false,
      errored: true,
      skippedFewCandidates: false,
      skippedNoQuery: false,
      top: baselineTop,
    };
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Guarded evaluation flow is easier to audit during replay tuning.
async function evaluateKind<T extends { id: number; score: number }>(
  input: EvaluateKindInput<T>
): Promise<{
  improved: ReplayExample[];
  regressed: ReplayExample[];
  stats: KindStats;
}> {
  const stats = createKindStats();
  const improved: ReplayExample[] = [];
  const regressed: ReplayExample[] = [];
  const truthIds = uniquePositiveInts(input.truthIds);
  if (truthIds.length === 0 || input.candidates.length === 0) {
    if (truthIds.length > 0) {
      stats.evaluated++;
    }
    return { improved, regressed, stats };
  }

  stats.evaluated++;
  stats.withCandidates++;

  const truthSet = new Set(truthIds);
  const candidateIds = input.candidates.map((candidate) => candidate.id);
  if (candidateIds.some((id) => truthSet.has(id))) {
    stats.truthInCandidates++;
  }

  const topN = Math.min(Math.max(1, input.topN), input.candidates.length);
  const baselineTop = rankByBaselineScore(input.candidates, topN);
  const baselineHits = computeTopHits(baselineTop, truthSet);
  if (baselineHits.top1) {
    stats.baselineTop1Hits++;
  }
  if (baselineHits.topK) {
    stats.baselineTopKHits++;
  }

  const rerank = await computeRerankOutcome(input, baselineTop, topN);
  if (rerank.attempted) {
    stats.rerankAttempted++;
  }
  if (rerank.applied) {
    stats.rerankApplied++;
  }
  if (rerank.changedTop1) {
    stats.rerankChangedTop1++;
  }
  if (rerank.errored) {
    stats.rerankErrored++;
  }
  if (rerank.skippedFewCandidates) {
    stats.skippedFewCandidates++;
  }
  if (rerank.skippedNoQuery) {
    stats.skippedNoQuery++;
  }

  const rerankHits = computeTopHits(rerank.top, truthSet);
  if (rerankHits.top1) {
    stats.rerankTop1Hits++;
  }
  if (rerankHits.topK) {
    stats.rerankTopKHits++;
  }

  if (rerank.changedTop1) {
    const example: ReplayExample = {
      baselineTop,
      candidateCount: input.candidates.length,
      emailId: input.emailId,
      kind: input.kind,
      mailboxEmail: input.mailboxEmail,
      queryChars: input.query.length,
      receivedAt: input.receivedAt,
      rerankTop: rerank.top,
      subject: input.subject,
      truthIds,
    };
    if (!baselineHits.top1 && rerankHits.top1) {
      improved.push(example);
    }
    if (baselineHits.top1 && !rerankHits.top1) {
      regressed.push(example);
    }
  }

  return { improved, regressed, stats };
}

function pct(part: number, total: number): string {
  if (total <= 0) {
    return "n/a";
  }
  return `${((part / total) * 100).toFixed(1)}%`;
}

function formatDelta(a: number, b: number, denom: number): string {
  if (denom <= 0) {
    return "n/a";
  }
  const delta = ((b - a) / denom) * 100;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}pp`;
}

function printKindSummary(label: string, stats: KindStats): void {
  console.log(`\n[${label}]`);
  console.log(`evaluated rows:                  ${stats.evaluated}`);
  console.log(`rows with candidates:            ${stats.withCandidates}`);
  console.log(
    `truth in candidate set:           ${stats.truthInCandidates}/${stats.evaluated} (${pct(stats.truthInCandidates, stats.evaluated)})`
  );
  console.log(
    `baseline top1 hit:               ${stats.baselineTop1Hits}/${stats.withCandidates} (${pct(stats.baselineTop1Hits, stats.withCandidates)})`
  );
  console.log(
    `rerank top1 hit (effective):     ${stats.rerankTop1Hits}/${stats.withCandidates} (${pct(stats.rerankTop1Hits, stats.withCandidates)})`
  );
  console.log(
    `top1 delta (rerank-baseline):     ${formatDelta(stats.baselineTop1Hits, stats.rerankTop1Hits, stats.withCandidates)}`
  );
  console.log(
    `baseline topK hit:               ${stats.baselineTopKHits}/${stats.withCandidates} (${pct(stats.baselineTopKHits, stats.withCandidates)})`
  );
  console.log(
    `rerank topK hit (effective):     ${stats.rerankTopKHits}/${stats.withCandidates} (${pct(stats.rerankTopKHits, stats.withCandidates)})`
  );
  console.log(
    `topK delta (rerank-baseline):     ${formatDelta(stats.baselineTopKHits, stats.rerankTopKHits, stats.withCandidates)}`
  );
  console.log(`rerank attempted:                ${stats.rerankAttempted}`);
  console.log(`rerank applied:                  ${stats.rerankApplied}`);
  console.log(`rerank changed top1:             ${stats.rerankChangedTop1}`);
  console.log(`rerank errors:                   ${stats.rerankErrored}`);
  console.log(`skipped (<2 candidates):         ${stats.skippedFewCandidates}`);
  console.log(`skipped (empty query):           ${stats.skippedNoQuery}`);
}

function printExamples(
  label: string,
  rows: ReplayExample[],
  sampleSize: number
): void {
  console.log(`\n${label}: ${rows.length > 0 ? rows.length : 0}`);
  if (rows.length === 0) {
    return;
  }
  for (const row of rows.slice(0, sampleSize)) {
    console.log(
      `- ${row.kind} email=${row.emailId} mailbox=${row.mailboxEmail} ` +
        `truth=${row.truthIds.join(",")} baselineTop=${row.baselineTop.join(",") || "none"} ` +
        `rerankTop=${row.rerankTop.join(",") || "none"} candidates=${row.candidateCount} ` +
        `received=${row.receivedAt} subject=${JSON.stringify(row.subject)}`
    );
  }
}

async function evaluateEmailRow(
  row: ReplaySeedRow,
  options: ReplayOptions
): Promise<ReplayAccumulator> {
  const acc = createAccumulator();
  acc.rowsProcessed = 1;
  const context = await gatherTriageContext(row.email_id, row.mailbox_email);
  if (!context) {
    acc.contextMissing = 1;
    return acc;
  }

  const query = buildRerankQuery(context);
  const truthProjectIds = uniquePositiveInts([
    ...(row.email_project_id ? [row.email_project_id] : []),
    ...parseIntVector(row.project_ids_from_estimate),
  ]);
  const truthEstimateIds = parseIntVector(row.estimate_ids);

  const project = await evaluateKind({
    buildDocument: buildProjectDocument,
    candidates: context.candidates.projects,
    emailId: row.email_id,
    kind: "project",
    mailboxEmail: row.mailbox_email,
    query,
    receivedAt: row.received_at,
    subject: row.subject,
    topN: options.topN,
    truthIds: truthProjectIds,
  });
  const estimate = await evaluateKind({
    buildDocument: buildEstimateDocument,
    candidates: context.candidates.estimates,
    emailId: row.email_id,
    kind: "estimate",
    mailboxEmail: row.mailbox_email,
    query,
    receivedAt: row.received_at,
    subject: row.subject,
    topN: options.topN,
    truthIds: truthEstimateIds,
  });

  mergeKindStats(acc.project, project.stats);
  mergeKindStats(acc.estimate, estimate.stats);
  acc.improved = [...project.improved, ...estimate.improved].slice(
    0,
    options.sample
  );
  acc.regressed = [...project.regressed, ...estimate.regressed].slice(
    0,
    options.sample
  );
  return acc;
}

async function runWorker(
  workerId: number,
  rows: ReplaySeedRow[],
  options: ReplayOptions,
  claimIndex: () => number
): Promise<ReplayAccumulator> {
  const local = createAccumulator();
  while (true) {
    const index = claimIndex();
    if (index >= rows.length) {
      break;
    }
    try {
      const result = await evaluateEmailRow(rows[index], options);
      mergeAccumulator(local, result, options.sample);
    } catch (error) {
      local.rowsProcessed++;
      local.rowErrors++;
      console.warn(
        `[replay] worker=${workerId} email=${rows[index]?.email_id} failed`,
        error
      );
    }

    const processed = index + 1;
    if (processed % 25 === 0 || processed === rows.length) {
      console.log(`[replay] progress ${processed}/${rows.length}`);
    }
  }
  return local;
}

export async function runTriageRerankReplay(
  options: ReplayOptions
): Promise<void> {
  const start = Date.now();
  console.log(
    `[replay] start limit=${options.limit} lookbackDays=${options.lookbackDays} since=${options.since ?? "none"} mailbox=${options.mailbox ?? "all"} topN=${options.topN} concurrency=${options.concurrency}`
  );
  console.log("[replay] mode=offline-real ranking-only (no triage LLM call)");

  const rows = await fetchReplaySeeds(options);
  console.log(`[replay] fetched ${rows.length} linked historical emails`);
  if (rows.length === 0) {
    return;
  }

  let nextIndex = 0;
  const claimIndex = (): number => {
    const current = nextIndex;
    nextIndex += 1;
    return current;
  };

  const workerCount = Math.min(options.concurrency, rows.length);
  const workers = await Promise.all(
    Array.from({ length: workerCount }, (_, i) =>
      runWorker(i + 1, rows, options, claimIndex)
    )
  );

  const total = createAccumulator();
  for (const worker of workers) {
    mergeAccumulator(total, worker, options.sample);
  }

  console.log("\n===== Replay Summary =====");
  console.log(`rows fetched:                    ${rows.length}`);
  console.log(`rows processed:                 ${total.rowsProcessed}`);
  console.log(`row errors:                     ${total.rowErrors}`);
  console.log(`context missing:                ${total.contextMissing}`);
  console.log(`elapsed ms:                     ${Date.now() - start}`);
  printKindSummary("project", total.project);
  printKindSummary("estimate", total.estimate);
  printExamples(
    "rerank improved top1 examples",
    total.improved,
    options.sample
  );
  printExamples(
    "rerank regressed top1 examples",
    total.regressed,
    options.sample
  );
}
