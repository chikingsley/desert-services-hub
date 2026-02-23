/**
 * FTS + Jina Reranker v3 strategy for permit search.
 * Step 1: FTS candidate generation (top 20)
 * Step 2: Jina reranker reorders by semantic relevance
 */
import { db } from "@lib/db/client";
import { rerank } from "@/packages/enrichment/jina/client";
import type { PermitRetrievalStrategy } from "./types";

interface PermitRow {
  id: string;
  company_name: string | null;
  project_name: string | null;
  address: string | null;
  city: string | null;
  status: string | null;
}

function toDocument(p: PermitRow): string {
  return [p.id, p.company_name, p.project_name, p.address, p.city, p.status]
    .filter(Boolean)
    .join(" | ");
}

const strategy: PermitRetrievalStrategy = {
  async retrieve(query) {
    // Step 1: FTS candidates
    const candidates = await db
      .query<PermitRow>(
        `SELECT id, company_name, project_name, address, city, status
         FROM dust_permits_filed_by_desert_services
         WHERE search_vector @@ plainto_tsquery('english', $1)
         ORDER BY ts_rank_cd(search_vector, plainto_tsquery('english', $1)) DESC,
                  (status = 'Active')::int DESC,
                  expiration_date DESC NULLS LAST
         LIMIT 20`,
      )
      .all(query);

    if (candidates.length === 0) return [];
    if (candidates.length === 1) return [candidates[0].id];

    // Step 2: Rerank
    const documents = candidates.map(toDocument);
    try {
      const response = await rerank(query, documents, {
        model: "jina-reranker-v3",
        topN: candidates.length,
        returnDocuments: false,
      });
      return response.results.map((r) => candidates[r.index].id);
    } catch (err) {
      console.warn(`  Reranker failed for "${query}", using FTS order:`, err);
      return candidates.map((c) => c.id);
    }
  },
};

export default strategy;
