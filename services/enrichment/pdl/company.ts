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

interface EnrichmentParams {
  name?: string;
  website?: string;
  profile?: string; // LinkedIn URL
  ticker?: string;
  location?: string; // Hint for disambiguation
  locality?: string; // City
  region?: string; // State
  minLikelihood?: number; // 1-10, default 3
  sandbox?: boolean;
}

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

interface SearchParams {
  query: string; // SQL query string
  size?: number; // Max results (default 10)
  sandbox?: boolean;
}

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

/**
 * Parameters for the Company Cleaner API.
 *
 * **API Requirement:** At least ONE of these fields must be provided.
 * You do NOT need all three - any single field is sufficient.
 *
 * @see https://docs.peopledatalabs.com/docs/cleaner-apis-reference
 * @see https://docs.peopledatalabs.com/reference/get_v5-company-clean-1
 */
interface CleanParams {
  /** Company name - accepts messy input like "GOOGLE INC" or "amazon.com inc" */
  name?: string;
  /** Company website/domain - e.g. "google.com" */
  website?: string;
  /** LinkedIn company URL - e.g. "linkedin.com/company/google" */
  profile?: string;
}

/**
 * Clean/standardize a messy company name using the PDL Company Cleaner API.
 *
 * This API is ideal for CRM data cleanup. It accepts messy, unformatted input
 * and returns a standardized company record with additional enrichment data.
 *
 * **API Documentation:**
 * - Reference: https://docs.peopledatalabs.com/docs/cleaner-apis-reference
 * - Endpoint: https://docs.peopledatalabs.com/reference/get_v5-company-clean-1
 *
 * **Input Requirements:**
 * - At least ONE of: `name`, `website`, or `profile` (LinkedIn URL)
 * - Any single field is sufficient - you do NOT need all three
 * - Accepts unformatted strings with arbitrary capitalization
 *
 * **Rate Limits (free tier):**
 * - 10 requests per minute
 * - 10,000 requests per month
 *
 * **Example transformations:**
 * - "GOOGLE INC" → "google"
 * - "Micro Soft Corp." → "microsoft"
 * - "amazon.com inc" → "amazon"
 * - "Willmeng Construction" → "willmeng construction, inc."
 *
 * @param params - At least one of: name, website, or profile
 * @returns Standardized company data including website, industry, size, location
 *
 * @example
 * // By name only (most common use case)
 * await cleanCompany({ name: "GOOGLE INC" });
 *
 * @example
 * // By website only
 * await cleanCompany({ website: "willmeng.com" });
 *
 * @example
 * // By name + website (more accurate matching)
 * await cleanCompany({ name: "AR Mays Construction", website: "armays.com" });
 */
export async function cleanCompany(
  params: CleanParams
): Promise<CompanyCleanResult> {
  const start = Date.now();

  // Validate: at least one identifier required
  // Per PDL docs: "You must pass in at least one of name, website, or profile"
  if (!(params.name || params.website || params.profile)) {
    return {
      success: false,
      fuzzyMatch: false,
      timeMs: Date.now() - start,
      error: "Must provide at least one of: name, website, or profile",
    };
  }

  try {
    const client = getClient();
    const cleanerParams = filterDefined({
      name: params.name,
      website: params.website ? cleanWebsiteUrl(params.website) : undefined,
      profile: params.profile,
    });

    // Call PDL Company Cleaner API
    // Note: The SDK accepts any combination of name/website/profile
    const response = await client.company.cleaner(
      cleanerParams as unknown as any
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
 * Clean a company by name only.
 *
 * This is the most common use case for CRM data cleanup.
 * The API will fuzzy match and return the standardized company record.
 *
 * @see https://docs.peopledatalabs.com/docs/cleaner-apis-reference
 *
 * @param name - Company name (can be messy, e.g. "GOOGLE INC")
 * @returns Standardized company data
 *
 * @example
 * const result = await cleanCompanyByName("Willmeng Construction");
 * // result.company.name → "willmeng construction, inc."
 * // result.company.website → "willmeng.com"
 * // result.company.industry → "construction"
 */
export function cleanCompanyByName(name: string): Promise<CompanyCleanResult> {
  return cleanCompany({ name });
}

/**
 * Clean a company by website/domain only.
 *
 * Useful when you have the domain but not the exact company name.
 *
 * @param website - Company domain (e.g. "armays.com")
 * @returns Standardized company data
 *
 * @example
 * const result = await cleanCompanyByWebsite("armays.com");
 * // result.company.name → "a.r. mays construction"
 */
export function cleanCompanyByWebsite(
  website: string
): Promise<CompanyCleanResult> {
  return cleanCompany({ website });
}

/** Rate limit delay between batch calls (10 req/min = 6 seconds) */
const CLEANER_RATE_LIMIT_DELAY_MS = 6000;

/**
 * Batch clean multiple company names with automatic rate limiting.
 *
 * **Rate Limits:**
 * - 10 requests per minute (enforced with 6 second delay between calls)
 * - 10,000 requests per month (free tier)
 *
 * **Important:** This function respects rate limits by waiting 6 seconds
 * between each API call. For 100 companies, expect ~10 minutes runtime.
 *
 * @see https://docs.peopledatalabs.com/docs/usage-limits
 *
 * @param names - Array of company names to clean
 * @param options - Optional settings
 * @param options.delayMs - Override delay between calls (default: 6000ms)
 * @param options.onProgress - Callback for progress updates
 * @returns Array of results in same order as input
 *
 * @example
 * const results = await cleanCompanyBatch(
 *   ["GOOGLE INC", "Willmeng Construction", "AR Mays"],
 *   {
 *     onProgress: (i, total) => console.log(`${i}/${total} complete`)
 *   }
 * );
 */
export async function cleanCompanyBatch(
  names: string[],
  options?: {
    delayMs?: number;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<CompanyCleanResult[]> {
  const delay = options?.delayMs ?? CLEANER_RATE_LIMIT_DELAY_MS;
  const results: CompanyCleanResult[] = [];

  for (let i = 0; i < names.length; i++) {
    const result = await cleanCompany({ name: names[i] });
    results.push(result);

    // Report progress if callback provided
    if (options?.onProgress) {
      options.onProgress(i + 1, names.length);
    }

    // Rate limit delay (skip after last item)
    if (i < names.length - 1 && delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return results;
}
