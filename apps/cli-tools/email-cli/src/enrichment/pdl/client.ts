/**
 * People Data Labs Client
 *
 * Single client instance for all PDL APIs using the official SDK.
 *
 * APIs available:
 * - Person: enrichment, search, identify
 * - Company: enrichment, search, cleaner
 * - Support: job title, IP, location cleaner, school cleaner, autocomplete
 *
 * @see https://docs.peopledatalabs.com/docs/javascript-sdk
 */
import PDLJS from "peopledatalabs";

function getApiKey(): string {
  const key = process.env.PEOPLE_DATA_LABS_API_KEY;
  if (!key) {
    throw new Error("Missing PEOPLE_DATA_LABS_API_KEY in environment");
  }
  return key;
}

/**
 * PDL client singleton - lazily initialized
 */
let _client: PDLJS | null = null;

export function getClient(): PDLJS {
  if (!_client) {
    _client = new PDLJS({ apiKey: getApiKey() });
  }
  return _client;
}

/**
 * Check if PDL is configured
 */
export function isConfigured(): boolean {
  return Boolean(process.env.PEOPLE_DATA_LABS_API_KEY);
}

/**
 * Rate limits by API (free tier)
 */
export const RATE_LIMITS = {
  person: {
    enrichment: { perMinute: 10, perMonth: 100 },
    search: { perMinute: 10, perMonth: 100 },
    identify: { perMinute: 10, perMonth: 100 },
  },
  company: {
    enrichment: { perMinute: 100, perMonth: 100 },
    search: { perMinute: 10, perMonth: 100 },
    cleaner: { perMinute: 10, perMonth: 10_000 },
  },
  support: {
    jobTitle: { perMinute: 10, perMonth: 10 }, // Very limited on free tier!
    ip: { perMinute: 10, perMonth: 1000 },
    locationCleaner: { perMinute: 10, perMonth: 10_000 },
    schoolCleaner: { perMinute: 10, perMonth: 10_000 },
    autocomplete: { perMinute: 10, perMonth: 1000 },
  },
} as const;

/**
 * Recommended delay between calls for free tier (10 req/min = 6s)
 */
export const RATE_LIMIT_DELAY = 6500;
