/**
 * Company Lookup Utilities
 *
 * Searches for portal companies by looking at distinct company names
 * in the dust permits table.
 */

import { db } from "@lib/db/hub";

interface PortalCompany {
  portalCompanyId: string;
  companyName: string;
}

/**
 * Search for a company by name in the dust permits table.
 * Returns the first match (exact match preferred, then partial).
 */
export async function searchCompany(
  name: string
): Promise<PortalCompany | null> {
  // Try exact match first
  const exact = await db
    .query<
      { portal_company_id: string; company_name: string },
      [string]
    >(
      `SELECT DISTINCT portal_company_id, company_name
       FROM dust_permits_filed_by_desert_services
       WHERE LOWER(company_name) = LOWER(?)
         AND portal_company_id IS NOT NULL
       LIMIT 1`
    )
    .get(name);

  if (exact) {
    return {
      portalCompanyId: exact.portal_company_id,
      companyName: exact.company_name,
    };
  }

  // Fall back to partial match
  const partial = await db
    .query<
      { portal_company_id: string; company_name: string },
      [string]
    >(
      `SELECT DISTINCT portal_company_id, company_name
       FROM dust_permits_filed_by_desert_services
       WHERE company_name ILIKE ?
         AND portal_company_id IS NOT NULL
       LIMIT 1`
    )
    .get(`%${name}%`);

  if (partial) {
    return {
      portalCompanyId: partial.portal_company_id,
      companyName: partial.company_name,
    };
  }

  return null;
}
