/**
 * Smart Company Enrichment
 *
 * Tries PDL first (fast, accurate), falls back to Jina+Gemini (web scraping)
 */

import { enrichCompany } from "./enrich";
import { enrichCompanyByName } from "./pdl";

export type SmartEnrichResult = {
  success: boolean;
  source: "pdl" | "jina" | "none";
  company?: {
    name: string;
    website?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    description?: string | null;
    employeeCount?: number | null;
    founded?: number | null;
    industry?: string | null;
    linkedIn?: string | null;
  };
  likelihood?: number; // PDL match confidence (1-10)
  timeMs: number;
  error?: string;
};

/**
 * Smart enrich - tries PDL first, falls back to Jina+Gemini
 *
 * @param companyName - Company name to enrich
 * @param options - Optional location hints
 */
export async function smartEnrich(
  companyName: string,
  options: {
    location?: string;
    skipPdl?: boolean; // Force Jina+Gemini
    skipJina?: boolean; // Only try PDL
  } = {}
): Promise<SmartEnrichResult> {
  const totalStart = Date.now();

  // Step 1: Try PDL (fast, ~400ms)
  if (!options.skipPdl) {
    const pdlResult = await enrichCompanyByName(companyName, {
      location: options.location,
      minLikelihood: 2, // Lower threshold to catch more matches
    });

    if (pdlResult.success && pdlResult.company) {
      return {
        success: true,
        source: "pdl",
        company: {
          name: pdlResult.company.name,
          website: pdlResult.company.website,
          address: pdlResult.company.address,
          phone: pdlResult.company.phone,
          email: null, // PDL doesn't provide email
          description: pdlResult.company.description,
          employeeCount: pdlResult.company.employeeCount,
          founded: pdlResult.company.founded,
          industry: pdlResult.company.industry,
          linkedIn: pdlResult.company.linkedIn,
        },
        likelihood: pdlResult.likelihood,
        timeMs: Date.now() - totalStart,
      };
    }
  }

  // Step 2: Fall back to Jina+Gemini (slower, ~6-12s)
  if (!options.skipJina) {
    const jinaResult = await enrichCompany(companyName, {
      location: options.location,
    });

    if (jinaResult.success && jinaResult.extractedInfo) {
      const info = jinaResult.extractedInfo;
      return {
        success: true,
        source: "jina",
        company: {
          name: info.name || companyName,
          website: info.website,
          address:
            [info.address, info.city, info.state, info.zip]
              .filter(Boolean)
              .join(", ") || null,
          phone: info.phone,
          email: info.email,
          description: info.description,
          employeeCount: info.employeeCount
            ? Number.parseInt(info.employeeCount, 10)
            : null,
          founded: info.yearFounded
            ? Number.parseInt(info.yearFounded, 10)
            : null,
          industry: info.services?.join(", "),
          linkedIn: null,
        },
        timeMs: Date.now() - totalStart,
      };
    }
  }

  // Neither worked
  return {
    success: false,
    source: "none",
    timeMs: Date.now() - totalStart,
    error: "Company not found in PDL or via web search",
  };
}
