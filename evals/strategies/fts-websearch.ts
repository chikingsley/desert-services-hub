/**
 * FTS strategy using websearch_to_tsquery instead of plainto_tsquery.
 *
 * websearch_to_tsquery handles:
 *   - Quoted phrases: "Sun Health" matches as a phrase
 *   - OR logic: Sun OR Health
 *   - Exclusion: -spam
 *   - More forgiving parsing (won't error on special characters)
 *
 * Tests whether smarter query parsing improves results.
 */
import { db } from "@lib/db/client";
import type { RetrievalStrategy } from "./types";

const strategy: RetrievalStrategy = {
  async retrieve(query) {
    const subject = query.metadata?.subject ?? query.text;

    // websearch_to_tsquery is more forgiving and handles natural language
    const results = await db
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
              websearch_to_tsquery('english', $1) q(query)
         WHERE e.search_vector @@ q.query
           AND e.project_id IS NOT NULL
         GROUP BY e.project_id
         ORDER BY max_rank DESC, email_count DESC
         LIMIT 20`
      )
      .all(subject);

    if (results.length > 0) {
      return results.map((r) => r.project_id);
    }

    // Fallback to project_search_index if email search returns nothing
    const psiResults = await db
      .query<{ project_id: number }>(
        `SELECT psi.project_id
         FROM project_search_index psi,
              websearch_to_tsquery('english', $1) q(query)
         WHERE psi.search_vector @@ q.query
         ORDER BY ts_rank(psi.search_vector, q.query) DESC
         LIMIT 20`
      )
      .all(subject);

    return psiResults.map((r) => r.project_id);
  },
};

export default strategy;
