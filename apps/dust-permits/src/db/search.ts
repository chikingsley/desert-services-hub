/**
 * Permit & Company Lookup Utilities
 *
 * Searches the dust permits table in Supabase Postgres for:
 * - Company names → portal company IDs
 * - Permit IDs → parcel numbers, addresses
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
    .query<{ portal_company_id: string; company_name: string }, [string]>(
      `SELECT DISTINCT portal_company_id, company_name
       FROM dust_permits_filed_by_desert_services
       WHERE LOWER(company_name) = LOWER(?)
         AND portal_company_id IS NOT NULL
       LIMIT 1`
    )
    .get(name);

  if (exact) {
    return {
      companyName: exact.company_name,
      portalCompanyId: exact.portal_company_id,
    };
  }

  // Fall back to partial match
  const partial = await db
    .query<{ portal_company_id: string; company_name: string }, [string]>(
      `SELECT DISTINCT portal_company_id, company_name
       FROM dust_permits_filed_by_desert_services
       WHERE company_name ILIKE ?
         AND portal_company_id IS NOT NULL
       LIMIT 1`
    )
    .get(`%${name}%`);

  if (partial) {
    return {
      companyName: partial.company_name,
      portalCompanyId: partial.portal_company_id,
    };
  }

  return null;
}

/**
 * Look up a permit's parcel number and address from Supabase Postgres.
 * Returns null if the permit isn't found or has no parcel.
 */
export async function lookupPermitParcel(
  permitId: string
): Promise<{ parcel: string; address: string | null } | null> {
  const row = await db
    .query<{ parcel: string | null; address: string | null }, [string]>(
      `SELECT parcel, address
       FROM dust_permits_filed_by_desert_services
       WHERE id = ?
       LIMIT 1`
    )
    .get(permitId);

  if (!row?.parcel) {
    return null;
  }

  return { address: row.address, parcel: row.parcel };
}
