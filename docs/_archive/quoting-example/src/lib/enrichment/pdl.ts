/**
 * People Data Labs Company Enrichment
 *
 * Uses PDL Company Enrichment API to get company data by name.
 * No LLM needed - direct database matching.
 *
 * Limits: 100 enrichments/month, 100 req/min
 */

const PDL_API_KEY = process.env.PEOPLE_DATA_LABS_API_KEY;
const BASE_URL = "https://api.peopledatalabs.com/v5";

export type PDLCompany = {
  id: string;
  name: string;
  display_name: string;
  website: string | null;
  linkedin_url: string | null;
  founded: number | null;
  employee_count: number | null;
  size: string | null;
  industry: string | null;
  headline: string | null;
  summary: string | null;
  tags: string[] | null;
  location: {
    name: string | null;
    street_address: string | null;
    locality: string | null;
    region: string | null;
    postal_code: string | null;
    country: string | null;
  } | null;
  naics: Array<{ naics_code: string; naics_description: string }> | null;
};

// PDL returns company data at root level, not nested
export type PDLEnrichmentResponse = PDLCompany & {
  status: number;
  likelihood: number;
  error?: {
    type: string;
    message: string;
  };
};

export type CompanyEnrichmentResult = {
  success: boolean;
  likelihood: number;
  company?: {
    name: string;
    website: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    phone: string | null;
    description: string | null;
    employeeCount: number | null;
    founded: number | null;
    industry: string | null;
    linkedIn: string | null;
  };
  raw?: PDLCompany;
  timeMs: number;
  error?: string;
};

/**
 * Build combined address string from PDL location
 */
function buildAddress(location: PDLCompany["location"]): string | null {
  if (!location) {
    return null;
  }

  const parts: string[] = [];
  if (location.street_address) {
    parts.push(location.street_address);
  }
  if (location.locality && location.region) {
    parts.push(`${location.locality}, ${location.region}`);
    if (location.postal_code) {
      parts[parts.length - 1] += ` ${location.postal_code}`;
    }
  }

  return parts.length > 0 ? parts.join(", ") : location.name;
}

/**
 * Enrich a company by name
 *
 * @param name - Company name to search for
 * @param options - Optional filters
 */
export async function enrichCompanyByName(
  name: string,
  options: {
    location?: string; // City, state, or full address
    locality?: string; // City
    region?: string; // State
    minLikelihood?: number; // 1-10, default 3
  } = {}
): Promise<CompanyEnrichmentResult> {
  const start = Date.now();

  if (!PDL_API_KEY) {
    return {
      success: false,
      likelihood: 0,
      timeMs: Date.now() - start,
      error: "PEOPLE_DATA_LABS_API_KEY not set",
    };
  }

  const params = new URLSearchParams({
    api_key: PDL_API_KEY,
    name,
    min_likelihood: String(options.minLikelihood ?? 3),
  });

  // Add location filters if provided
  if (options.location) {
    params.set("location", options.location);
  }
  if (options.locality) {
    params.set("locality", options.locality);
  }
  if (options.region) {
    params.set("region", options.region);
  }

  try {
    const response = await fetch(`${BASE_URL}/company/enrich?${params}`);
    const data = (await response.json()) as PDLEnrichmentResponse;
    const timeMs = Date.now() - start;

    if (data.status === 404 || !data.name) {
      return {
        success: false,
        likelihood: 0,
        timeMs,
        error: "Company not found",
      };
    }

    if (data.error) {
      return {
        success: false,
        likelihood: 0,
        timeMs,
        error: `${data.error.type}: ${data.error.message}`,
      };
    }

    // PDL returns company data at root level
    const company = data;

    return {
      success: true,
      likelihood: data.likelihood,
      company: {
        name: company.display_name || company.name,
        website: company.website,
        address: buildAddress(company.location),
        city: company.location?.locality || null,
        state: company.location?.region || null,
        zip: company.location?.postal_code || null,
        phone: null, // PDL doesn't provide phone
        description: company.headline || company.summary,
        employeeCount: company.employee_count,
        founded: company.founded,
        industry: company.industry,
        linkedIn: company.linkedin_url,
      },
      raw: company,
      timeMs,
    };
  } catch (error) {
    return {
      success: false,
      likelihood: 0,
      timeMs: Date.now() - start,
      error: String(error),
    };
  }
}

/**
 * Enrich a company by website/domain
 * More accurate than name-only search
 */
export async function enrichCompanyByWebsite(
  website: string
): Promise<CompanyEnrichmentResult> {
  const start = Date.now();

  if (!PDL_API_KEY) {
    return {
      success: false,
      likelihood: 0,
      timeMs: Date.now() - start,
      error: "PEOPLE_DATA_LABS_API_KEY not set",
    };
  }

  // Clean up website - just need domain
  const domain = website
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];

  const params = new URLSearchParams({
    api_key: PDL_API_KEY,
    website: domain,
  });

  try {
    const response = await fetch(`${BASE_URL}/company/enrich?${params}`);
    const data = (await response.json()) as PDLEnrichmentResponse;
    const timeMs = Date.now() - start;

    if (data.status === 404 || !data.name) {
      return {
        success: false,
        likelihood: 0,
        timeMs,
        error: "Company not found",
      };
    }

    if (data.error) {
      return {
        success: false,
        likelihood: 0,
        timeMs,
        error: `${data.error.type}: ${data.error.message}`,
      };
    }

    // PDL returns company data at root level
    const company = data;

    return {
      success: true,
      likelihood: data.likelihood,
      company: {
        name: company.display_name || company.name,
        website: company.website,
        address: buildAddress(company.location),
        city: company.location?.locality || null,
        state: company.location?.region || null,
        zip: company.location?.postal_code || null,
        phone: null,
        description: company.headline || company.summary,
        employeeCount: company.employee_count,
        founded: company.founded,
        industry: company.industry,
        linkedIn: company.linkedin_url,
      },
      raw: company,
      timeMs,
    };
  } catch (error) {
    return {
      success: false,
      likelihood: 0,
      timeMs: Date.now() - start,
      error: String(error),
    };
  }
}
