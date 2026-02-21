/**
 * FTS Multi-Table strategy — estimates use FTS instead of trigram.
 *
 * Identical to fts-multi.ts except Source 3 uses plainto_tsquery on
 * estimate fields instead of pg_trgm similarity(). This lets us compare
 * whether FTS or trigram is better for the estimate search leg.
 */
import { db } from "@lib/db/client";
import type { RetrievalStrategy } from "./types";

interface ScoredProject {
  projectId: number;
  emailRank: number;
  emailCount: number;
  psiRank: number;
  estimateScore: number;
}

const strategy: RetrievalStrategy = {
  async retrieve(query) {
    const subject = query.metadata?.subject ?? query.text;
    const scores = new Map<number, ScoredProject>();

    const getOrCreate = (pid: number): ScoredProject => {
      let s = scores.get(pid);
      if (!s) {
        s = {
          projectId: pid,
          emailRank: 0,
          emailCount: 0,
          psiRank: 0,
          estimateScore: 0,
        };
        scores.set(pid, s);
      }
      return s;
    };

    // Source 1: Email corpus FTS (same as fts-multi)
    const emailResults = await db
      .query<{
        project_id: number;
        email_count: number;
        max_rank: number;
      }>(
        `SELECT
           e.project_id,
           COUNT(*) AS email_count,
           MAX(ts_rank(e.search_vector, q.query)) AS max_rank
         FROM emails e,
              plainto_tsquery('english', $1) q(query)
         WHERE e.search_vector @@ q.query
           AND e.project_id IS NOT NULL
         GROUP BY e.project_id
         ORDER BY max_rank DESC, email_count DESC
         LIMIT 30`,
      )
      .all(subject);

    for (const r of emailResults) {
      const s = getOrCreate(r.project_id);
      s.emailRank = r.max_rank;
      s.emailCount = r.email_count;
    }

    // Source 2: Project search index FTS (same as fts-multi)
    const psiResults = await db
      .query<{ project_id: number; rank: number }>(
        `SELECT
           psi.project_id,
           ts_rank(psi.search_vector, q.query) AS rank
         FROM project_search_index psi,
              plainto_tsquery('english', $1) q(query)
         WHERE psi.search_vector @@ q.query
         ORDER BY rank DESC
         LIMIT 30`,
      )
      .all(subject);

    for (const r of psiResults) {
      const s = getOrCreate(r.project_id);
      s.psiRank = r.rank;
    }

    // Source 3: Estimates FTS (replaces trigram with plainto_tsquery)
    const estimateResults = await db
      .query<{ project_id: number; rank: number }>(
        `SELECT pe.project_id,
           MAX(ts_rank(
             to_tsvector('english', concat_ws(' ', e.name, e.job_name, e.contractor, e.job_address)),
             q.query
           )) AS rank
         FROM estimates e
         JOIN project_estimates pe ON pe.estimate_id = e.id,
              plainto_tsquery('english', $1) q(query)
         WHERE to_tsvector('english', concat_ws(' ', e.name, e.job_name, e.contractor, e.job_address)) @@ q.query
         GROUP BY pe.project_id
         ORDER BY rank DESC
         LIMIT 20`,
      )
      .all(subject);

    for (const r of estimateResults) {
      const s = getOrCreate(r.project_id);
      s.estimateScore = r.rank;
    }

    // Merge: same weights as fts-multi
    const ranked = [...scores.values()].map((s) => ({
      projectId: s.projectId,
      finalScore:
        s.emailRank * 100 +
        s.emailCount * 2 +
        s.psiRank * 80 +
        s.estimateScore * 50,
    }));

    ranked.sort((a, b) => b.finalScore - a.finalScore);
    return ranked.slice(0, 20).map((r) => r.projectId);
  },
};

export default strategy;
