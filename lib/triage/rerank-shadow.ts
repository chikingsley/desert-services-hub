/**
 * Unified Email Triage — Rerank Shadow Evaluator
 *
 * Runs an external reranker against project candidates:
 * - shadow mode logs metrics without changing behavior
 * - project mode reorders candidate projects before prompt construction
 */

import { rerank } from "@enrichment/jina/client";
import type {
  TriageContext,
  TriageProjectCandidate,
  TriageResult,
} from "./types";

export type TriageRerankMode = "disabled" | "shadow" | "project";

export interface TriageRerankShadowConfig {
  mode: TriageRerankMode;
  topN?: number;
}

interface ProjectRerankCandidate {
  address: string | null;
  contractor: string | null;
  id: number;
  name: string;
  score: number;
}

const DEFAULT_TOP_N = 3;
const MAX_QUERY_CHARS = 1600;
const MAX_DOCUMENT_CHARS = 8192;
const JINA_TRIAGE_RERANK_MODEL = "jina-reranker-v3";

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}…`;
}

function toCsv(values: number[]): string {
  return values.length > 0 ? values.join(",") : "none";
}

function overlapCount(a: number[], b: number[]): number {
  const right = new Set(b);
  let count = 0;
  for (const id of a) {
    if (right.has(id)) {
      count++;
    }
  }
  return count;
}

function normalizeTopN(
  requestedTopN: number | undefined,
  candidateCount: number
): number {
  const topN = Number.isInteger(requestedTopN) ? (requestedTopN as number) : 0;
  if (topN > 0) {
    return Math.min(topN, candidateCount);
  }
  return Math.min(DEFAULT_TOP_N, candidateCount);
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
  if (!query.trim()) {
    return "";
  }
  return truncate(query, MAX_QUERY_CHARS);
}

function buildProjectDocument(candidate: ProjectRerankCandidate): string {
  const parts = [
    `project_name: ${candidate.name}`,
    `contractor: ${candidate.contractor ?? ""}`,
    `address: ${candidate.address ?? ""}`,
  ].filter(Boolean);
  return truncate(parts.join("\n"), MAX_DOCUMENT_CHARS);
}

async function evaluateSingleKind<T extends { id: number; score: number }>(
  args: {
    kind: "project";
    candidates: T[];
    emailId: number;
    llmPickedId: number | null;
    query: string;
    buildDocument: (candidate: T) => string;
  },
  config: TriageRerankShadowConfig
): Promise<void> {
  if (args.candidates.length < 2) {
    return;
  }
  if (!args.query) {
    return;
  }

  const topN = normalizeTopN(config.topN, args.candidates.length);
  const baselineTop = rankByBaselineScore(args.candidates, topN);

  const documents = args.candidates.map((candidate) =>
    args.buildDocument(candidate)
  );

  const response = await rerank(args.query, documents, {
    model: JINA_TRIAGE_RERANK_MODEL,
    topN,
    returnDocuments: false,
  });

  const rerankTop = response.results
    .map((row) => args.candidates[row.index]?.id)
    .filter((id): id is number => Number.isInteger(id));

  const topChanged = baselineTop[0] !== rerankTop[0];
  let llmMatch = "none";
  if (args.llmPickedId !== null) {
    llmMatch = rerankTop[0] === args.llmPickedId ? "yes" : "no";
  }

  console.log(
    `[triage:rerank:shadow] email=${args.emailId} kind=${args.kind} ` +
      `baselineTop=${toCsv(baselineTop)} rerankTop=${toCsv(rerankTop)} ` +
      `llmPicked=${args.llmPickedId ?? "none"} llmTopMatch=${llmMatch} ` +
      `topChanged=${topChanged} overlapTop${topN}=${overlapCount(baselineTop, rerankTop)}`
  );
}

function reorderCandidatesById(
  candidates: TriageProjectCandidate[],
  idsInOrder: number[]
): TriageProjectCandidate[] {
  const byId = new Map(
    candidates.map((candidate) => [candidate.id, candidate])
  );
  const ranked: TriageProjectCandidate[] = [];
  const seen = new Set<number>();

  for (const id of idsInOrder) {
    const candidate = byId.get(id);
    if (!candidate || seen.has(id)) {
      continue;
    }
    ranked.push(candidate);
    seen.add(id);
  }

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      continue;
    }
    ranked.push(candidate);
    seen.add(candidate.id);
  }

  return ranked;
}

export async function rerankProjectCandidates(
  input: { context: TriageContext; emailId: number },
  config: TriageRerankShadowConfig
): Promise<TriageProjectCandidate[]> {
  const baseline = input.context.candidates.projects;
  if (config.mode !== "project") {
    return baseline;
  }

  const query = buildRerankQuery(input.context);
  if (baseline.length < 2 || !query) {
    return baseline;
  }

  try {
    const documents = baseline.map((candidate) =>
      buildProjectDocument(candidate)
    );
    const response = await rerank(query, documents, {
      model: JINA_TRIAGE_RERANK_MODEL,
      topN: baseline.length,
      returnDocuments: false,
    });

    const rerankedIds = response.results
      .map((row) => baseline[row.index]?.id)
      .filter((id): id is number => Number.isInteger(id));
    if (rerankedIds.length === 0) {
      return baseline;
    }

    const reranked = reorderCandidatesById(baseline, rerankedIds);
    console.log(
      `[triage:rerank:project] email=${input.emailId} ` +
        `baselineTop=${toCsv(rankByBaselineScore(baseline, 3))} ` +
        `rerankTop=${toCsv(reranked.slice(0, 3).map((candidate) => candidate.id))}`
    );
    return reranked;
  } catch (error) {
    console.warn(
      `[triage:rerank:project] email=${input.emailId} failed:`,
      error
    );
    return baseline;
  }
}

export async function evaluateTriageRerankShadow(
  input: {
    context: TriageContext;
    emailId: number;
    llmResult: TriageResult | null;
  },
  config: TriageRerankShadowConfig
): Promise<void> {
  if (config.mode !== "shadow") {
    return;
  }

  const query = buildRerankQuery(input.context);

  try {
    await evaluateSingleKind<ProjectRerankCandidate>(
      {
        kind: "project",
        candidates: input.context.candidates.projects,
        emailId: input.emailId,
        llmPickedId: input.llmResult?.projectId ?? null,
        query,
        buildDocument: buildProjectDocument,
      },
      config
    );
  } catch (error) {
    console.warn(
      `[triage:rerank:shadow] email=${input.emailId} kind=project failed:`,
      error
    );
  }
}
