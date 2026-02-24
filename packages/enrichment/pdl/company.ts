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
import { getClient } from "@/packages/enrichment/pdl/client";
import type {
  CompanyCleanResult,
  CompanyEnrichmentResult,
  CompanySearchResult,
  PDLCompanyData,
} from "@/packages/enrichment/pdl/types";

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
  for (const key of Object.keys(obj) as (keyof T)[]) {
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
    address: buildAddress(data.location),
    city: data.location?.locality ?? null,
    description: data.headline ?? data.summary ?? null,
    employeeCount: data.employee_count ?? null,
    founded: data.founded ?? null,
    id: data.id ?? null,
    industry: data.industry ?? null,
    linkedIn: data.linkedin_url ?? null,
    name: data.display_name ?? data.name ?? "Unknown",
    state: data.location?.region ?? null,
    tags: data.tags ?? [],
    website: data.website ?? null,
    zip: data.location?.postal_code ?? null,
  };
}

// ============================================================================
// Company Enrichment
// ============================================================================

interface EnrichmentParams {
  locality?: string; // City
  location?: string; // Hint for disambiguation
  minLikelihood?: number; // 1-10, default 3
  name?: string;
  profile?: string; // LinkedIn URL
  region?: string; // State
  sandbox?: boolean;
  ticker?: string;
  website?: string;
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
        error: "Website is required for company enrichment",
        success: false,
        timeMs: Date.now() - start,
      };
    }

    const enrichParams = filterDefined({
      locality: params.locality,
      location: params.location,
      min_likelihood: params.minLikelihood ?? 3,
      name: params.name,
      profile: params.profile,
      region: params.region,
      sandbox: params.sandbox,
      ticker: params.ticker,
      website,
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
        error: "Company not found",
        success: false,
        timeMs: Date.now() - start,
      };
    }

    return {
      company: normalizeCompany(data),
      likelihood: data.likelihood,
      raw: data,
      success: true,
      timeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      success: false,
      timeMs: Date.now() - start,
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
  sandbox?: boolean;
  size?: number; // Max results (default 10)
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
      sandbox: params.sandbox,
      searchQuery: params.query,
      size: params.size ?? 10,
    });

    const companies = (response.data ?? []) as unknown as PDLCompanyData[];

    return {
      companies: companies.map((c) => ({
        id: c.id ?? null,
        name: c.display_name ?? c.name ?? "Unknown",
        website: c.website ?? null,
        industry: c.industry ?? null,
        employeeCount: c.employee_count ?? null,
        location: c.location?.name ?? null,
      })),
      raw: companies,
      success: true,
      timeMs: Date.now() - start,
      total: response.total ?? companies.length,
    };
  } catch (error) {
    return {
      companies: [],
      error: error instanceof Error ? error.message : String(error),
      success: false,
      timeMs: Date.now() - start,
      total: 0,
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
      sandbox: params.sandbox,
      searchQuery: params.query,
      size: params.size ?? 10,
    });

    const companies = (response.data ?? []) as unknown as PDLCompanyData[];

    return {
      companies: companies.map((c) => ({
        id: c.id ?? null,
        name: c.display_name ?? c.name ?? "Unknown",
        website: c.website ?? null,
        industry: c.industry ?? null,
        employeeCount: c.employee_count ?? null,
        location: c.location?.name ?? null,
      })),
      raw: companies,
      success: true,
      timeMs: Date.now() - start,
      total: response.total ?? companies.length,
    };
  } catch (error) {
    return {
      companies: [],
      error: error instanceof Error ? error.message : String(error),
      success: false,
      timeMs: Date.now() - start,
      total: 0,
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
  /** LinkedIn company URL - e.g. "linkedin.com/company/google" */
  profile?: string;
  /** Company website/domain - e.g. "google.com" */
  website?: string;
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
      error: "Must provide at least one of: name, website, or profile",
      fuzzyMatch: false,
      success: false,
      timeMs: Date.now() - start,
    };
  }

  try {
    const client = getClient();
    const cleanerParams = filterDefined({
      name: params.name,
      profile: params.profile,
      website: params.website ? cleanWebsiteUrl(params.website) : undefined,
    });
    type CleanerRequest = Parameters<typeof client.company.cleaner>[0];

    // Call PDL Company Cleaner API
    // Note: The SDK accepts any combination of name/website/profile
    const response = await client.company.cleaner(
      cleanerParams as CleanerRequest
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
        error: "Company not found",
        fuzzyMatch: false,
        success: false,
        timeMs: Date.now() - start,
      };
    }

    return {
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
      success: true,
      timeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      fuzzyMatch: false,
      success: false,
      timeMs: Date.now() - start,
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
