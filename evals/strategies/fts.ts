/**
 * FTS strategy: use PostgreSQL full-text search across emails to find projects.
 *
 * Instead of matching query text against project names (token-overlap),
 * this searches the email corpus for matching emails and returns the
 * projects those emails are linked to, ranked by relevance.
 *
 * This catches cross-name references (e.g. "La Loma" in a query finds
 * emails on the "SUN HEALTH" project that mention "La Loma").
 */
import { db } from "@lib/db/client";
import type { RetrievalStrategy } from "./types";

interface FTSRow {
  email_count: number;
  max_rank: number;
  project_id: number;
}

const strategy: RetrievalStrategy = {
  async retrieve(query) {
    // Extract key terms from the query subject (more signal than full body)
    const subject = query.metadata?.subject ?? query.text;

    // Use plainto_tsquery for safe parsing (handles any input without syntax errors)
    // Search emails, group by project_id, rank by relevance
    const results = await db
      .query<FTSRow>(
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
         LIMIT 20`
      )
      .all(subject);

    if (results.length > 0) {
      return results.map((r) => r.project_id);
    }

    // Fallback: if FTS returns nothing (rare terms, typos), try ILIKE on project names
    const fallbackResults = await db
      .query<{ id: number }>(
        `SELECT id FROM projects
         WHERE name ILIKE $1 OR address ILIKE $1
         ORDER BY updated_at DESC
         LIMIT 20`
      )
      .all(`%${subject.slice(0, 100)}%`);

    return fallbackResults.map((r) => r.id);
  },
};

export default strategy;
