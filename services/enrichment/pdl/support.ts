/**
 * People Data Labs - Support APIs
 *
 * - jobTitle: Enrich job titles to find similar roles + skills (10/month free - testing only!)
 * - ip: Get company/location info from IP address (1,000/month free)
 * - cleanLocation: Standardize location strings (10,000/month free)
 * - cleanSchool: Standardize school/university names (10,000/month free)
 * - autocomplete: Get autocomplete suggestions for fields (1,000/month free)
 */
import { getClient } from "./client";
import type {
  AutocompleteResult,
  IPEnrichResult,
  JobTitleEnrichResult,
  LocationCleanResult,
  SchoolCleanResult,
} from "./types";

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
 * Parse a "lat,lng" geo string into coordinates object
 */
function parseGeoString(
  geoStr: string | undefined
): { lat: number; lng: number } | null {
  if (!geoStr) {
    return null;
  }

  const parts = geoStr.split(",").map(Number);
  const lat = parts[0];
  const lng = parts[1];

  if (lat === undefined || lng === undefined) {
    return null;
  }

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  return { lat, lng };
}

// ============================================================================
// Job Title Enrichment (10/month free - for testing only!)
// ============================================================================

/**
 * Enrich a job title to find similar roles and relevant skills
 *
 * ⚠️ WARNING: Only 10 credits/month on free tier! Use sparingly.
 *
 * Useful for:
 * - Finding similar job titles for person searches
 * - Discovering skills associated with a role
 *
 * @example
 * await enrichJobTitle("Software Engineer");
 * // → { matches: ["Software Developer", "Backend Engineer", ...], skills: ["Python", "JavaScript", ...] }
 */
export async function enrichJobTitle(
  jobTitle: string
): Promise<JobTitleEnrichResult> {
  const start = Date.now();

  try {
    const client = getClient();
    const response = await client.jobTitle({ jobTitle });

    const data = response as unknown as {
      data?: Array<{
        cleaned_job_title?: string;
        similar_job_titles?: Array<{ job_title: string; relevance: number }>;
        relevant_skills?: Array<{ skill: string }>;
      }>;
      status?: number;
    };

    const firstMatch = data.data?.[0];
    if (!firstMatch) {
      return {
        success: false,
        matches: [],
        skills: [],
        timeMs: Date.now() - start,
        error: "Job title not found",
      };
    }

    return {
      success: true,
      matches:
        firstMatch.similar_job_titles?.map((t) => ({
          title: t.job_title,
          relevance: t.relevance,
        })) ?? [],
      skills: firstMatch.relevant_skills?.map((s) => s.skill) ?? [],
      timeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      matches: [],
      skills: [],
      timeMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// IP Enrichment (1,000/month free)
// ============================================================================

/**
 * Get company and location info from an IP address
 *
 * Useful for:
 * - Identifying companies visiting your website
 * - Geographic targeting
 *
 * @example
 * await enrichIP("72.212.42.169");
 * // → { company: "Google", location: "Mountain View, CA" }
 */
export async function enrichIP(ip: string): Promise<IPEnrichResult> {
  const start = Date.now();

  try {
    const client = getClient();
    const response = await client.ip({ ip });

    const data = response as unknown as {
      data?: {
        ip?: {
          address?: string;
        };
        company?: {
          name?: string;
        };
        location?: {
          name?: string;
        };
      };
      status?: number;
    };

    if (!data.data) {
      return {
        success: false,
        timeMs: Date.now() - start,
        error: "IP not found",
      };
    }

    return {
      success: true,
      ip: {
        address: data.data.ip?.address ?? ip,
        company: data.data.company?.name ?? null,
        location: data.data.location?.name ?? null,
      },
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

// ============================================================================
// Location Cleaner (10,000/month free)
// ============================================================================

/**
 * Standardize a location string
 *
 * Great for normalizing messy addresses/locations:
 * - "phx az" → { locality: "Phoenix", region: "Arizona", country: "United States" }
 * - "NYC" → { locality: "New York", region: "New York", ... }
 *
 * @example
 * await cleanLocation("phx az");
 * await cleanLocation("123 Main St, Phoenix, AZ 85001");
 */
export async function cleanLocation(
  location: string
): Promise<LocationCleanResult> {
  const start = Date.now();

  try {
    const client = getClient();
    const response = await client.location.cleaner({ location });

    const data = response as unknown as {
      name?: string;
      locality?: string;
      region?: string;
      country?: string;
      continent?: string;
      postal_code?: string;
      type?: string;
      geo?: string; // "lat,lng" format
      status?: number;
    };

    if (!data || data.status === 404) {
      return {
        success: false,
        timeMs: Date.now() - start,
        error: "Location not found",
      };
    }

    return {
      success: true,
      location: {
        name: data.name ?? null,
        locality: data.locality ?? null,
        region: data.region ?? null,
        country: data.country ?? null,
        continent: data.continent ?? null,
        postalCode: data.postal_code ?? null,
        type: data.type ?? null,
        geo: parseGeoString(data.geo),
      },
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

// ============================================================================
// School Cleaner (10,000/month free)
// ============================================================================

interface SchoolCleanParams {
  name?: string;
  website?: string;
  profile?: string; // LinkedIn URL
}

/**
 * Standardize a school/university name
 *
 * Examples:
 * - "ASU" → "Arizona State University"
 * - "MIT" → "Massachusetts Institute of Technology"
 * - "stanford" → "Stanford University"
 *
 * @example
 * await cleanSchool({ name: "ASU" });
 * await cleanSchool({ website: "asu.edu" });
 */
export async function cleanSchool(
  params: SchoolCleanParams
): Promise<SchoolCleanResult> {
  const start = Date.now();

  if (!(params.name || params.website || params.profile)) {
    return {
      success: false,
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

    // The PDL client requires at least website to be set
    if (!cleanerParams.website) {
      return {
        success: false,
        timeMs: Date.now() - start,
        error: "Website is required for school cleaning",
      };
    }

    const response = await client.school.cleaner(
      cleanerParams as { website: string; name?: string; profile?: string }
    );

    const data = response as unknown as {
      name?: string;
      type?: string;
      website?: string;
      linkedin_url?: string;
      location?: { name?: string };
      status?: number;
    };

    if (!data || data.status === 404 || !data.name) {
      return {
        success: false,
        timeMs: Date.now() - start,
        error: "School not found",
      };
    }

    return {
      success: true,
      school: {
        name: data.name,
        type: data.type ?? null,
        website: data.website ?? null,
        linkedIn: data.linkedin_url ?? null,
        location: data.location?.name ?? null,
      },
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
 * Convenience: Clean school by name
 */
export function cleanSchoolByName(name: string): Promise<SchoolCleanResult> {
  return cleanSchool({ name });
}

// ============================================================================
// Autocomplete (1,000/month free)
// ============================================================================

type AutocompleteField =
  | "company"
  | "school"
  | "title"
  | "skill"
  | "location"
  | "industry"
  | "country"
  | "region";

/**
 * Get autocomplete suggestions for a field
 *
 * Useful for:
 * - Building search UIs with autocomplete
 * - Discovering valid values for filters
 *
 * @example
 * // Company autocomplete
 * await autocomplete("company", "goo");
 * // → ["Google", "Goodyear", "Goop", ...]
 *
 * // Job title autocomplete
 * await autocomplete("title", "software eng");
 * // → ["Software Engineer", "Software Engineering Manager", ...]
 */
export async function autocomplete(
  field: AutocompleteField,
  text: string,
  size = 10
): Promise<AutocompleteResult> {
  const start = Date.now();

  try {
    const client = getClient();
    const response = await client.autocomplete({
      field,
      text,
      size,
    });

    const data = response as unknown as {
      data?: Array<{
        name: string;
        count?: number;
        meta?: Record<string, unknown>;
      }>;
      status?: number;
    };

    return {
      success: true,
      suggestions:
        data.data?.map((item) => ({
          name: item.name,
          count: item.count,
          meta: item.meta,
        })) ?? [],
      timeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      suggestions: [],
      timeMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Company name autocomplete
 */
export function autocompleteCompany(
  text: string,
  size = 10
): Promise<AutocompleteResult> {
  return autocomplete("company", text, size);
}

/**
 * Job title autocomplete
 */
export function autocompleteTitle(
  text: string,
  size = 10
): Promise<AutocompleteResult> {
  return autocomplete("title", text, size);
}

/**
 * Skill autocomplete
 */
export function autocompleteSkill(
  text: string,
  size = 10
): Promise<AutocompleteResult> {
  return autocomplete("skill", text, size);
}

/**
 * Location autocomplete
 */
export function autocompleteLocation(
  text: string,
  size = 10
): Promise<AutocompleteResult> {
  return autocomplete("location", text, size);
}
