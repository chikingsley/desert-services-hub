/**
 * FTS Multi-Table Project Candidate Generation
 *
 * Replaces token-overlap matching with PostgreSQL full-text search across
 * four data sources: emails, project_search_index, estimates, and documents.
 *
 * Eval results (500 queries, 291 projects):
 *   Token overlap: 52% Recall@5
 *   FTS Multi:     98.4% Recall@5
 */
import { db } from "@lib/db/client";
import type {
  ProjectMatchCandidate,
  ProjectMatchContext,
  ProjectMatchDecision,
  ProjectMatchInput,
  ProjectMatchResult,
} from "./types";

interface ProjectDetailRow {
  account_id: number | null;
  address: string | null;
  contractor: string | null;
  id: number;
  name: string;
  outlook_folder: string | null;
  updated_at: string;
}

function buildSearchText(input: ProjectMatchInput): string {
  const parts = [input.primaryText];
  if (input.aliasHints) {
    for (const hint of input.aliasHints) {
      if (hint.trim()) {
        parts.push(hint.trim());
      }
    }
  }
  // Use the primary text as the FTS query — it's the email subject + body preview
  // Alias hints add noise to tsquery so we use primaryText only for the FTS query
  return input.primaryText.trim();
}

export async function findProjectCandidatesFts(
  input: ProjectMatchInput
): Promise<ProjectMatchResult | null> {
  const searchText = buildSearchText(input);
  if (!searchText) {
    return null;
  }

  const limit = Math.max(1, Math.min(25, input.limit ?? 5));
  const scores = new Map<number, number>();

  const addScore = (pid: number, points: number) => {
    scores.set(pid, (scores.get(pid) ?? 0) + points);
  };

  // Source 1: Email corpus FTS — the dominant signal
  // Finds projects because OTHER emails on the same project mention the query terms
  const emailResults = await db
    .query<{ project_id: number; email_count: number; max_rank: number }>(
      `SELECT e.project_id, COUNT(*) AS email_count,
         MAX(ts_rank(e.search_vector, q.query)) AS max_rank
       FROM emails e, plainto_tsquery('english', $1) q(query)
       WHERE e.search_vector @@ q.query AND e.project_id IS NOT NULL
       GROUP BY e.project_id
       ORDER BY max_rank DESC, email_count DESC LIMIT 30`
    )
    .all(searchText);

  for (const r of emailResults) {
    addScore(r.project_id, r.max_rank * 100 + r.email_count * 2);
  }

  // Source 2: Project search index FTS — pre-built tsvector with project name + address + contractor + email subjects
  const psiResults = await db
    .query<{ project_id: number; rank: number }>(
      `SELECT psi.project_id, ts_rank(psi.search_vector, q.query) AS rank
       FROM project_search_index psi, plainto_tsquery('english', $1) q(query)
       WHERE psi.search_vector @@ q.query
       ORDER BY rank DESC LIMIT 30`
    )
    .all(searchText);

  for (const r of psiResults) {
    addScore(r.project_id, r.rank * 80);
  }

  // Source 3: Estimates FTS — materialized tsvector with GIN index
  const estimateResults = await db
    .query<{ project_id: number; rank: number }>(
      `SELECT pe.project_id,
         MAX(ts_rank(e.search_vector, q.query)) AS rank
       FROM estimates e
       JOIN project_estimates pe ON pe.estimate_id = e.id,
            plainto_tsquery('english', $1) q(query)
       WHERE e.search_vector @@ q.query
       GROUP BY pe.project_id
       ORDER BY rank DESC LIMIT 20`
    )
    .all(searchText);

  for (const r of estimateResults) {
    addScore(r.project_id, r.rank * 50);
  }

  // Source 4: Document summaries FTS — materialized tsvector with GIN index
  const docResults = await db
    .query<{ project_id: number; doc_count: number }>(
      `SELECT d.project_id, COUNT(*) AS doc_count
       FROM documents d, plainto_tsquery('english', $1) q(query)
       WHERE d.search_vector @@ q.query
         AND d.project_id IS NOT NULL
       GROUP BY d.project_id
       ORDER BY doc_count DESC LIMIT 20`
    )
    .all(searchText);

  for (const r of docResults) {
    addScore(r.project_id, r.doc_count * 10);
  }

  // Account ID hint: boost projects matching the sender's account
  if (input.accountIdHint) {
    const accountProjects = await db
      .query<{ id: number }>(
        "SELECT id FROM projects WHERE account_id = $1 LIMIT 50"
      )
      .all(input.accountIdHint);

    for (const p of accountProjects) {
      if (scores.has(p.id)) {
        addScore(p.id, 30);
      }
    }
  }

  if (scores.size === 0) {
    return null;
  }

  // Rank by score, take top N
  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const projectIds = ranked.map(([pid]) => pid);

  // Fetch project details
  const placeholders = projectIds.map((_, i) => `$${i + 1}`).join(", ");
  const projectRows = await db
    .query<ProjectDetailRow>(
      `SELECT id, name, contractor, address, outlook_folder, account_id, updated_at::text
       FROM projects
       WHERE id IN (${placeholders})`
    )
    .all(...projectIds);

  const projectMap = new Map(projectRows.map((p) => [p.id, p]));

  // Build candidates in ranked order
  const candidates: ProjectMatchCandidate[] = [];
  for (const [pid, score] of ranked) {
    const proj = projectMap.get(pid);
    if (!proj) {
      continue;
    }
    candidates.push({
      projectId: proj.id,
      name: proj.name,
      contractor: proj.contractor,
      address: proj.address,
      outlookFolder: proj.outlook_folder,
      accountId: proj.account_id,
      updatedAt: proj.updated_at,
      score,
      confidence: Math.min(1, score / 100),
      reasons: [
        {
          code: "primary_token_overlap", // reason code used by review tooling
          points: score,
          detail: "fts_multi_table",
        },
      ],
    });
  }

  // Build minimal context expected by ProjectMatchResult
  const context: ProjectMatchContext = {
    primaryText: input.primaryText,
    aliasHints: input.aliasHints ?? [],
    contractorHint: input.contractorHint ?? null,
    addressHint: input.addressHint ?? null,
    accountIdHint: input.accountIdHint ?? null,
    primaryNameKey: "",
    nameKeys: [],
    aliasKeys: [],
    primaryTokens: [],
    contractorTokens: [],
    addressTokens: [],
  };

  // Build decision
  const best = candidates[0] ?? null;
  const runnerUp = candidates[1] ?? null;
  const gap = runnerUp
    ? (best?.score ?? 0) - runnerUp.score
    : (best?.score ?? 0);
  const decision: ProjectMatchDecision = {
    best,
    runnerUp,
    autoLink: best !== null && best.score >= 50 && gap >= 15,
    gap,
    reason:
      best && best.score >= 50 && gap >= 15
        ? "auto_link_threshold_met"
        : "manual_review_required",
    thresholds: { minScore: 50, minGap: 15 },
  };

  return { context, candidates, decision };
}
