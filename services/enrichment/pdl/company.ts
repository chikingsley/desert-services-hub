/**
 * People Data Labs - Company APIs
 *
 * - enrichment: Get detailed company profile by name, website, or LinkedIn
 * - search: Find companies matching criteria (SQL or Elasticsearch queries)
 * - cleaner: Standardize/clean messy company names (great for CRM cleanup!)
 *
 * Rate limits (free tier):
 * - Enrichment: 100/min, 100/month
 * - Search: 10/min, 100/month
 * - Cleaner: 10/min, 10,000/month (very generous!)
 */
import { getClient } from "./client";
import type {
  CompanyCleanResult,
  CompanyEnrichmentResult,
  CompanySearchResult,
  PDLCompanyData,
} from "./types";

// Top-level regex for URL cleaning (compiled once)
const PROTOCOL_REGEX = /^https?:\/\//;
const WWW_REGEX = /^www\./;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Remove undefined values from an object, keeping only defined properties
 */
function filterDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Clean a website URL to its base domain
 */
function cleanWebsiteUrl(website: string): string {
  const cleaned = website
    .replace(PROTOCOL_REGEX, "")
    .replace(WWW_REGEX, "")
    .split("/")[0];
  return cleaned ?? website;
}

function buildAddress(location: PDLCompanyData["location"]): string | null {
  if (!location) {
    return null;
  }

  const parts: string[] = [];
  if (location.street_address) {
    parts.push(location.street_address);
  }
  if (location.locality && location.region) {
    let cityState = `${location.locality}, ${location.region}`;
    if (location.postal_code) {
      cityState += ` ${location.postal_code}`;
    }
    parts.push(cityState);
  }

  return parts.length > 0 ? parts.join(", ") : (location.name ?? null);
}

function normalizeCompany(
  data: PDLCompanyData
): CompanyEnrichmentResult["company"] {
  return {
    id: data.id ?? null,
    name: data.display_name ?? data.name ?? "Unknown",
    website: data.website ?? null,
    address: buildAddress(data.location),
    city: data.location?.locality ?? null,
    state: data.location?.region ?? null,
    zip: data.location?.postal_code ?? null,
    description: data.headline ?? data.summary ?? null,
    employeeCount: data.employee_count ?? null,
    founded: data.founded ?? null,
    industry: data.industry ?? null,
    linkedIn: data.linkedin_url ?? null,
    tags: data.tags ?? [],
  };
}

// ============================================================================
// Company Enrichment
// ============================================================================

type EnrichmentParams = {
  name?: string;
  website?: string;
  profile?: string; // LinkedIn URL
  ticker?: string;
  location?: string; // Hint for disambiguation
  locality?: string; // City
  region?: string; // State
  minLikelihood?: number; // 1-10, default 3
  sandbox?: boolean;
};

/**
 * Enrich a company by various identifiers
 *
 * @example
 * // By name
 * await enrichCompany({ name: "Acme Inc" });
 *
 * // By website (most accurate)
 * await enrichCompany({ website: "acme.com" });
 *
 * // By name with location hint
 * await enrichCompany({ name: "Baker Construction", location: "Phoenix, AZ" });
 */
export async function enrichCompany(
  params: EnrichmentParams
): Promise<CompanyEnrichmentResult> {
  const start = Date.now();

  try {
    const client = getClient();
    const website = params.website
      ? cleanWebsiteUrl(params.website)
      : undefined;

    // PDL requires website for enrichment
    if (!website) {
      return {
        success: false,
        timeMs: Date.now() - start,
        error: "Website is required for company enrichment",
      };
    }

    const enrichParams = filterDefined({
      website,
      name: params.name,
      profile: params.profile,
      ticker: params.ticker,
      location: params.location,
      locality: params.locality,
      region: params.region,
      sandbox: params.sandbox,
      min_likelihood: params.minLikelihood ?? 3,
    });

    const response = await client.company.enrichment(
      enrichParams as { website: string }
    );

    const data = response as unknown as PDLCompanyData & {
      likelihood?: number;
      status?: number;
    };
    if (!data || data.status === 404 || !data.name) {
      return {
        success: false,
        timeMs: Date.now() - start,
        error: "Company not found",
      };
    }

    return {
      success: true,
      likelihood: data.likelihood,
      company: normalizeCompany(data),
      raw: data,
      timeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      timeMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Convenience: Enrich by company name
 */
export function enrichCompanyByName(
  name: string,
  options?: {
    location?: string;
    locality?: string;
    region?: string;
    minLikelihood?: number;
    sandbox?: boolean;
  }
): Promise<CompanyEnrichmentResult> {
  return enrichCompany({ name, ...options });
}

/**
 * Convenience: Enrich by website/domain
 */
export function enrichCompanyByWebsite(
  website: string,
  options?: { sandbox?: boolean }
): Promise<CompanyEnrichmentResult> {
  return enrichCompany({ website, ...options });
}

// ============================================================================
// Company Search
// ============================================================================

type SearchParams = {
  query: string; // SQL query string
  size?: number; // Max results (default 10)
  sandbox?: boolean;
};

/**
 * Search for companies using SQL syntax
 *
 * @example
 * // Find construction companies in Arizona
 * await searchCompanies({
 *   query: "SELECT * FROM company WHERE industry='construction' AND location_region='AZ'",
 *   size: 20
 * });
 */
export async function searchCompanies(
  params: SearchParams
): Promise<CompanySearchResult> {
  const start = Date.now();

  try {
    const client = getClient();
    const response = await client.company.search.sql({
      searchQuery: params.query,
      size: params.size ?? 10,
      sandbox: params.sandbox,
    });

    const companies = (response.data ?? []) as unknown as PDLCompanyData[];

    return {
      success: true,
      total: response.total ?? companies.length,
      companies: companies.map((c) => ({
        id: c.id ?? null,
        name: c.display_name ?? c.name ?? "Unknown",
        website: c.website ?? null,
        industry: c.industry ?? null,
        employeeCount: c.employee_count ?? null,
        location: c.location?.name ?? null,
      })),
      raw: companies,
      timeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      total: 0,
      companies: [],
      timeMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Search using Elasticsearch query syntax
 */
export async function searchCompaniesElastic(params: {
  query: Record<string, unknown>;
  size?: number;
  sandbox?: boolean;
}): Promise<CompanySearchResult> {
  const start = Date.now();

  try {
    const client = getClient();
    const response = await client.company.search.elastic({
      searchQuery: params.query,
      size: params.size ?? 10,
      sandbox: params.sandbox,
    });

    const companies = (response.data ?? []) as unknown as PDLCompanyData[];

    return {
      success: true,
      total: response.total ?? companies.length,
      companies: companies.map((c) => ({
        id: c.id ?? null,
        name: c.display_name ?? c.name ?? "Unknown",
        website: c.website ?? null,
        industry: c.industry ?? null,
        employeeCount: c.employee_count ?? null,
        location: c.location?.name ?? null,
      })),
      raw: companies,
      timeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      total: 0,
      companies: [],
      timeMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Company Cleaner (10,000/month free!)
// ============================================================================

type CleanParams = {
  name?: string;
  website?: string;
  profile?: string; // LinkedIn URL
};

/**
 * Clean/standardize a messy company name
 *
 * Great for CRM data cleanup! Takes variations like:
 * - "GOOGLE INC" → "Google"
 * - "Micro Soft Corp." → "Microsoft"
 * - "amazon.com inc" → "Amazon"
 *
 * Returns standardized name plus additional company info.
 *
 * @example
 * await cleanCompany({ name: "GOOGLE INC" });
 * // → { name: "Google", website: "google.com", industry: "internet", ... }
 */
export async function cleanCompany(
  params: CleanParams
): Promise<CompanyCleanResult> {
  const start = Date.now();

  if (!(params.name || params.website || params.profile)) {
    return {
      success: false,
      fuzzyMatch: false,
      timeMs: Date.now() - start,
      error: "Must provide name, website, or profile",
    };
  }

  try {
    const client = getClient();
    const cleanerParams = filterDefined({
      name: params.name,
      website: params.website,
      profile: params.profile,
    });

    // PDL company cleaner requires profile
    if (!cleanerParams.profile) {
      return {
        success: false,
        fuzzyMatch: false,
        timeMs: Date.now() - start,
        error: "Profile (LinkedIn URL) is required for company cleaning",
      };
    }

    const response = await client.company.cleaner(
      cleanerParams as { profile: string; name?: string; website?: string }
    );

    const data = response as unknown as {
      name?: string;
      website?: string;
      linkedin_url?: string;
      industry?: string;
      size?: string;
      founded?: number;
      location?: { name?: string };
      fuzzy_match?: boolean;
      status?: number;
    };

    if (!data || data.status === 404 || !data.name) {
      return {
        success: false,
        fuzzyMatch: false,
        timeMs: Date.now() - start,
        error: "Company not found",
      };
    }

    return {
      success: true,
      company: {
        name: data.name,
        website: data.website ?? null,
        linkedIn: data.linkedin_url ?? null,
        industry: data.industry ?? null,
        size: data.size ?? null,
        founded: data.founded ?? null,
        location: data.location?.name ?? null,
      },
      fuzzyMatch: data.fuzzy_match ?? false,
      timeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      fuzzyMatch: false,
      timeMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Convenience: Clean company by name
 */
export function cleanCompanyByName(name: string): Promise<CompanyCleanResult> {
  return cleanCompany({ name });
}

/**
 * Batch clean multiple company names
 *
 * Useful for CRM cleanup workflows.
 *
 * @example
 * const results = await cleanCompanyBatch([
 *   "GOOGLE INC",
 *   "Micro Soft Corp",
 *   "amazon.com inc"
 * ]);
 */
export async function cleanCompanyBatch(
  names: string[]
): Promise<CompanyCleanResult[]> {
  // PDL doesn't have a batch cleaner endpoint, so we run sequentially
  // Could parallelize but need to respect rate limits (10/min)
  const results: CompanyCleanResult[] = [];

  for (const name of names) {
    const result = await cleanCompany({ name });
    results.push(result);
  }

  return results;
}
