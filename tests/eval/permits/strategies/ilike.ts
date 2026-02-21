/**
 * ILIKE baseline strategy for permit search.
 * Current production behavior — %query% across project_name, company_name, address, id.
 */
import { db } from "@lib/db/client";
import type { PermitRetrievalStrategy } from "./types";

const strategy: PermitRetrievalStrategy = {
  async retrieve(query) {
    const pattern = `%${query}%`;
    const results = await db
      .query<{ id: string }>(
        `SELECT id FROM dust_permits_filed_by_desert_services
         WHERE project_name ILIKE $1
            OR company_name ILIKE $1
            OR address ILIKE $1
            OR id ILIKE $1
         ORDER BY (status = 'Active')::int DESC,
                  expiration_date DESC NULLS LAST
         LIMIT 20`,
      )
      .all(pattern);
    return results.map((r) => r.id);
  },
};

export default strategy;
