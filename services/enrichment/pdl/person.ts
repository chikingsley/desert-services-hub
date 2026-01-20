/**
 * People Data Labs - Person APIs
 *
 * - enrichment: Get detailed profile for a known person (by email, LinkedIn, etc.)
 * - search: Find people matching criteria (SQL or Elasticsearch queries)
 * - identify: Fuzzy match to find possible person matches
 *
 * Rate limits (free tier): 10 req/min, 100/month for each
 */
import { getClient } from "./client";
import type {
  PDLPersonData,
  PersonEnrichmentResult,
  PersonIdentifyResult,
  PersonSearchResult,
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

function normalizePerson(
  data: PDLPersonData
): PersonEnrichmentResult["person"] {
  return {
    id: data.id ?? null,
    name: data.full_name ?? null,
    firstName: data.first_name ?? null,
    lastName: data.last_name ?? null,
    title: data.job_title ?? null,
    company: data.job_company_name ?? null,
    companyWebsite: data.job_company_website ?? null,
    linkedIn: data.linkedin_url ?? null,
    email: data.work_email ?? data.personal_emails?.[0] ?? null,
    phone: data.mobile_phone ?? data.phone_numbers?.[0] ?? null,
    location: data.location_name ?? null,
    skills: data.skills ?? [],
  };
}

// ============================================================================
// Person Enrichment
// ============================================================================

type EnrichmentParams = {
  email?: string;
  phone?: string;
  profile?: string; // LinkedIn URL
  name?: string;
  company?: string;
  firstName?: string;
  lastName?: string;
  minLikelihood?: number;
  sandbox?: boolean; // Use sandbox mode (no credits consumed)
};

/**
 * Enrich a person by various identifiers
 *
 * @example
 * // By email
 * await enrichPerson({ email: "john@acme.com" });
 *
 * // By LinkedIn
 * await enrichPerson({ profile: "https://linkedin.com/in/johndoe" });
 *
 * // By name + company
 * await enrichPerson({ name: "John Doe", company: "Acme Inc" });
 */
export async function enrichPerson(
  params: EnrichmentParams
): Promise<PersonEnrichmentResult> {
  const start = Date.now();

  try {
    const client = getClient();
    const response = await client.person.enrichment({
      email: params.email,
      phone: params.phone,
      profile: params.profile,
      name: params.name,
      company: params.company,
      first_name: params.firstName,
      last_name: params.lastName,
      min_likelihood: params.minLikelihood ?? 2,
      sandbox: params.sandbox,
    });

    const data = response.data as PDLPersonData | undefined;
    if (!data) {
      return {
        success: false,
        timeMs: Date.now() - start,
        error: "Person not found",
      };
    }

    return {
      success: true,
      likelihood: response.likelihood,
      person: normalizePerson(data),
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
 * Convenience: Enrich by email
 */
export function enrichByEmail(
  email: string,
  options?: { minLikelihood?: number; sandbox?: boolean }
): Promise<PersonEnrichmentResult> {
  return enrichPerson({ email, ...options });
}

/**
 * Convenience: Enrich by LinkedIn URL
 */
export function enrichByLinkedIn(
  profileUrl: string,
  options?: { sandbox?: boolean }
): Promise<PersonEnrichmentResult> {
  return enrichPerson({ profile: profileUrl, ...options });
}

/**
 * Convenience: Enrich by name and company
 */
export function enrichByNameAndCompany(
  name: string,
  company: string,
  options?: { sandbox?: boolean }
): Promise<PersonEnrichmentResult> {
  return enrichPerson({ name, company, ...options });
}

// ============================================================================
// Person Search
// ============================================================================

type SearchParams = {
  query: string; // SQL query string
  size?: number; // Max results (default 10)
  sandbox?: boolean;
};

/**
 * Search for people using SQL syntax
 *
 * @example
 * // Find software engineers in NYC
 * await searchPeople({
 *   query: "SELECT * FROM person WHERE job_title='Software Engineer' AND location_locality='New York'",
 *   size: 10
 * });
 */
export async function searchPeople(
  params: SearchParams
): Promise<PersonSearchResult> {
  const start = Date.now();

  try {
    const client = getClient();
    const response = await client.person.search.sql({
      searchQuery: params.query,
      size: params.size ?? 10,
      sandbox: params.sandbox,
    });

    const people = (response.data ?? []) as PDLPersonData[];

    return {
      success: true,
      total: response.total ?? people.length,
      people: people.map((p) => ({
        id: p.id ?? null,
        name: p.full_name ?? null,
        title: p.job_title ?? null,
        company: p.job_company_name ?? null,
        linkedIn: p.linkedin_url ?? null,
        email: p.work_email ?? p.personal_emails?.[0] ?? null,
        location: p.location_name ?? null,
      })),
      raw: people,
      timeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      total: 0,
      people: [],
      timeMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Search using Elasticsearch query syntax
 */
export async function searchPeopleElastic(params: {
  query: Record<string, unknown>;
  size?: number;
  sandbox?: boolean;
}): Promise<PersonSearchResult> {
  const start = Date.now();

  try {
    const client = getClient();
    const response = await client.person.search.elastic({
      searchQuery: params.query,
      size: params.size ?? 10,
      sandbox: params.sandbox,
    });

    const people = (response.data ?? []) as PDLPersonData[];

    return {
      success: true,
      total: response.total ?? people.length,
      people: people.map((p) => ({
        id: p.id ?? null,
        name: p.full_name ?? null,
        title: p.job_title ?? null,
        company: p.job_company_name ?? null,
        linkedIn: p.linkedin_url ?? null,
        email: p.work_email ?? p.personal_emails?.[0] ?? null,
        location: p.location_name ?? null,
      })),
      raw: people,
      timeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      total: 0,
      people: [],
      timeMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Person Identify
// ============================================================================

type IdentifyParams = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  profile?: string;
  location?: string;
  sandbox?: boolean;
};

/**
 * Identify possible person matches (fuzzy matching)
 *
 * Returns multiple potential matches with confidence scores.
 * Useful when you have partial info and want to find candidates.
 *
 * @example
 * await identifyPerson({ name: "John", company: "Google", location: "San Francisco" });
 */
export async function identifyPerson(
  params: IdentifyParams
): Promise<PersonIdentifyResult> {
  const start = Date.now();

  try {
    const client = getClient();
    const identifyParams = filterDefined({
      name: params.name,
      email: params.email,
      phone: params.phone,
      company: params.company,
      profile: params.profile,
      location: params.location,
      sandbox: params.sandbox,
    });

    // PDL identify requires school (for students) - use empty string as workaround
    const response = await client.person.identify({
      school: "",
      ...identifyParams,
    } as { school: string });

    const matches = (response.matches ?? []) as Array<{
      data: PDLPersonData;
      match_score: number;
    }>;

    return {
      success: true,
      matches: matches.map((m) => ({
        id: m.data?.id ?? null,
        name: m.data?.full_name ?? null,
        title: m.data?.job_title ?? null,
        company: m.data?.job_company_name ?? null,
        linkedIn: m.data?.linkedin_url ?? null,
        confidence: m.match_score ?? 0,
      })),
      timeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      matches: [],
      timeMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Legacy helper (for backwards compatibility)
// ============================================================================

/**
 * Extract contact info from raw PDL person data
 * @deprecated Use the normalized `person` field from enrichment results instead
 */
export function extractContactInfo(data: PDLPersonData): {
  name: string | null;
  title: string | null;
  company: string | null;
  linkedIn: string | null;
  phone: string | null;
  location: string | null;
} {
  return {
    name: data.full_name ?? null,
    title: data.job_title ?? null,
    company: data.job_company_name ?? null,
    linkedIn: data.linkedin_url ?? null,
    phone: data.mobile_phone ?? data.phone_numbers?.[0] ?? null,
    location: data.location_name ?? null,
  };
}
