/**
 * Company Lookup Utilities
 *
 * Wrapper around the company permits database company functions
 * for use by NOI extraction.
 */

import type { Company } from "./company-permits";
import { findCompany, searchCompanies } from "./company-permits";

/**
 * Search for a company by name.
 * Returns the first match (exact match preferred, then partial).
 *
 * @param name - Company name to search for
 * @returns Company if found, null otherwise
 */
export function searchCompany(name: string): Company | null {
  // Try exact match first
  const exact = findCompany(name);
  if (exact) {
    return exact;
  }

  // Fall back to partial match
  const results = searchCompanies(name, 1);
  return results.length > 0 ? (results[0] ?? null) : null;
}
