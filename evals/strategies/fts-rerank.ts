/**
 * FTS + Jina reranker strategy.
 *
 * Step 1: FTS across email corpus to find candidate projects (same as fts.ts)
 * Step 2: Jina reranker v3 scores candidates against the query
 *
 * Tests whether semantic reranking improves on FTS ordering.
 */
import { db } from "@lib/db/client";
import { rerank } from "@/packages/enrichment/jina/client";
import type { RetrievalStrategy } from "./types";

interface FTSRow {
  project_id: number;
  email_count: number;
  max_rank: number;
}

interface ProjectInfo {
  id: number;
  name: string;
  address: string | null;
  contractor: string | null;
}

const strategy: RetrievalStrategy = {
  async retrieve(query) {
    const subject = query.metadata?.subject ?? query.text;

    // Step 1: FTS candidate generation (same as fts strategy)
    const ftsResults = await db
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
         LIMIT 20`,
      )
      .all(subject);

    if (ftsResults.length === 0) return [];

    const projectIds = ftsResults.map((r) => r.project_id);

    // Get project details for building reranker documents
    const placeholders = projectIds.map((_, i) => `$${i + 1}`).join(", ");
    const projects = await db
      .query<ProjectInfo>(
        `SELECT id, name, address, contractor FROM projects WHERE id IN (${placeholders})`,
      )
      .all(...projectIds);

    const projectMap = new Map(projects.map((p) => [p.id, p]));

    // Step 2: Rerank with Jina v3
    // Build documents: compact project summary for cross-encoder
    const orderedProjects = projectIds
      .map((id) => projectMap.get(id))
      .filter((p): p is ProjectInfo => p !== undefined);

    if (orderedProjects.length === 0) return [];

    const documents = orderedProjects.map((p) =>
      [p.name, p.address, p.contractor].filter(Boolean).join(" | "),
    );

    try {
      const response = await rerank(query.text, documents, {
        model: "jina-reranker-v3",
        topN: orderedProjects.length,
        returnDocuments: false,
      });

      return response.results.map((r) => orderedProjects[r.index].id);
    } catch (err) {
      // If reranker fails, fall back to FTS ordering
      console.warn(`  Reranker failed for ${query._id}, using FTS order:`, err);
      return projectIds;
    }
  },
};

export default strategy;
