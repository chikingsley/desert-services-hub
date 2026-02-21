/**
 * FTS strategy for permit search.
 * Uses weighted tsvector (A: id+company, B: project, C: address+city)
 * with ts_rank_cd and smart tiebreaker (Active first, nearest expiration).
 */
import { db } from "@lib/db/client";
import type { PermitRetrievalStrategy } from "./types";

const strategy: PermitRetrievalStrategy = {
  async retrieve(query) {
    const results = await db
      .query<{ id: string }>(
        `SELECT id
         FROM dust_permits_filed_by_desert_services
         WHERE search_vector @@ plainto_tsquery('english', $1)
         ORDER BY ts_rank_cd(search_vector, plainto_tsquery('english', $1)) DESC,
                  (status = 'Active')::int DESC,
                  expiration_date DESC NULLS LAST
         LIMIT 20`,
      )
      .all(query);
    return results.map((r) => r.id);
  },
};

export default strategy;
