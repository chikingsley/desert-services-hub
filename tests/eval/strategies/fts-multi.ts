/**
 * Multi-table FTS strategy.
 *
 * Searches across THREE sources and merges results:
 *   1. emails (tsvector) — full email corpus, grouped by project
 *   2. project_search_index (tsvector) — pre-built index with project name +
 *      address + contractor + email subjects consolidated per project
 *   3. estimates (trigram) — estimate names, job names, addresses, contractors
 *
 * Results from all three are merged and scored, giving the broadest recall.
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

    // Source 1: Email corpus FTS
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

    // Source 2: Project search index FTS (project name + address + email subjects)
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

    // Source 3: Estimates trigram search (fuzzy name/address matching)
    // Uses the existing gin_trgm_ops index on estimates
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
         ORDER BY sim DESC
         LIMIT 20`,
      )
      .all(subject);

    for (const r of estimateResults) {
      const s = getOrCreate(r.project_id);
      s.estimateScore = r.sim;
    }

    // Merge: weighted score across all sources
    const ranked = [...scores.values()].map((s) => ({
      projectId: s.projectId,
      // Email FTS is the strongest signal (proven 86% recall@1)
      // PSI adds project-level context, estimates add fuzzy name matching
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
