/**
 * FTS Multi-Table + Jina reranker with RICH documents.
 *
 * Step 1: Multi-table FTS (emails + project_search_index + estimates + documents)
 * Step 2: Jina reranker v3 with rich project context from project_search_index
 *         (project name + address + contractor + email subjects — up to 10KB)
 *
 * This gives the reranker the same cross-reference context that FTS uses,
 * instead of the tiny 15-token summaries from the basic fts-rerank strategy.
 */
import { db } from "@lib/db/client";
import { rerank } from "@/packages/enrichment/jina/client";
import type { RetrievalStrategy } from "./types";

const strategy: RetrievalStrategy = {
  async retrieve(query) {
    const subject = query.metadata?.subject ?? query.text;
    const scores = new Map<number, number>();

    const addScore = (pid: number, points: number) => {
      scores.set(pid, (scores.get(pid) ?? 0) + points);
    };

    // Source 1: Email corpus FTS
    const emailResults = await db
      .query<{ project_id: number; email_count: number; max_rank: number }>(
        `SELECT e.project_id, COUNT(*) AS email_count,
           MAX(ts_rank(e.search_vector, q.query)) AS max_rank
         FROM emails e, plainto_tsquery('english', $1) q(query)
         WHERE e.search_vector @@ q.query AND e.project_id IS NOT NULL
         GROUP BY e.project_id
         ORDER BY max_rank DESC, email_count DESC LIMIT 30`,
      )
      .all(subject);

    for (const r of emailResults) {
      addScore(r.project_id, r.max_rank * 100 + r.email_count * 2);
    }

    // Source 2: Project search index FTS
    const psiResults = await db
      .query<{ project_id: number; rank: number }>(
        `SELECT psi.project_id, ts_rank(psi.search_vector, q.query) AS rank
         FROM project_search_index psi, plainto_tsquery('english', $1) q(query)
         WHERE psi.search_vector @@ q.query
         ORDER BY rank DESC LIMIT 30`,
      )
      .all(subject);

    for (const r of psiResults) {
      addScore(r.project_id, r.rank * 80);
    }

    // Source 3: Estimates trigram
    const estimateResults = await db
      .query<{ project_id: number; sim: number }>(
        `SELECT DISTINCT pe.project_id,
           MAX(similarity(
             lower(concat_ws(' ', e.name, e.job_name, e.contractor, e.job_address)),
             lower($1)
           )) AS sim
         FROM estimates e
         JOIN project_estimates pe ON pe.estimate_id = e.id
         WHERE similarity(
           lower(concat_ws(' ', e.name, e.job_name, e.contractor, e.job_address)),
           lower($1)
         ) > 0.15
         GROUP BY pe.project_id
         ORDER BY sim DESC LIMIT 20`,
      )
      .all(subject);

    for (const r of estimateResults) {
      addScore(r.project_id, r.sim * 50);
    }

    // Source 4: Document summaries FTS
    const docResults = await db
      .query<{ project_id: number; doc_count: number }>(
        `SELECT d.project_id, COUNT(*) AS doc_count
         FROM documents d, plainto_tsquery('english', $1) q(query)
         WHERE to_tsvector('english', COALESCE(d.summary, '')) @@ q.query
           AND d.project_id IS NOT NULL
         GROUP BY d.project_id
         ORDER BY doc_count DESC LIMIT 20`,
      )
      .all(subject);

    for (const r of docResults) {
      addScore(r.project_id, r.doc_count * 10);
    }

    if (scores.size === 0) return [];

    // Take top 20 candidates
    const ranked = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    const projectIds = ranked.map(([pid]) => pid);

    // Get RICH documents from project_search_index for reranker
    const placeholders = projectIds.map((_, i) => `$${i + 1}`).join(", ");
    const psiDocs = await db
      .query<{ project_id: number; raw_text: string }>(
        `SELECT project_id, LEFT(raw_text, 4000) AS raw_text
         FROM project_search_index
         WHERE project_id IN (${placeholders})`,
      )
      .all(...projectIds);

    const psiMap = new Map(psiDocs.map((p) => [p.project_id, p.raw_text]));

    // Build rich documents for reranker (up to 4000 chars each)
    const orderedDocs = projectIds.map(
      (pid) => psiMap.get(pid) ?? `Project ${pid}`,
    );

    try {
      const response = await rerank(query.text, orderedDocs, {
        model: "jina-reranker-v3",
        topN: projectIds.length,
        returnDocuments: false,
        maxDocLength: 4096,
        truncation: true,
      });

      return response.results.map((r) => projectIds[r.index]);
    } catch (err) {
      console.warn(
        `  Reranker failed for ${query._id}, using FTS order:`,
        err,
      );
      return projectIds;
    }
  },
};

export default strategy;
