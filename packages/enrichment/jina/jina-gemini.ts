/**
 * Jina + Gemini Company Enrichment
 *
 * Uses Jina web search to find company info, then Gemini to extract structured data.
 * Useful for identifying vendors/providers (e.g., "DX" → "DX Services LLC - Roll-Off Dumpster Rental")
 *
 * Usage:
 *   import { enrichCompany, enrichProvider } from "./jina-gemini";
 *
 *   // Enrich a company name
 *   const result = await enrichCompany("Weinberger");
 *
 *   // Enrich a provider with context
 *   const result = await enrichProvider("DX", "roll-off dumpster");
 */

import { GoogleGenAI } from "@google/genai";
import { read, searchJson } from "@/packages/enrichment/jina/client";

const { GEMINI_API_KEY } = process.env;

// ============================================================================
// Types
// ============================================================================

export interface CompanyInfo {
  address: string | null;
  city: string | null;
  description: string | null;
  email: string | null;
  fullName: string | null;
  industry: string | null;
  name: string;
  phone: string | null;
  services: string[] | null;
  state: string | null;
  website: string | null;
  zip: string | null;
}

export interface EnrichResult {
  company: CompanyInfo | null;
  confidence: number;
  error?: string;
  query: string;
  sources: string[];
  success: boolean;
  timeMs: number;
}

// ============================================================================
// Gemini Extraction
// ============================================================================

async function extractCompanyInfo(
  searchResults: string,
  companyName: string,
  context?: string
): Promise<{ company: CompanyInfo; confidence: number }> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const contextStr = context ? ` in the ${context} industry` : "";

  const prompt = `Extract company information from these search results.
I'm looking for information about "${companyName}"${contextStr}.

Search Results:
${searchResults.slice(0, 8000)}

Extract the most likely matching company. If there are multiple matches, pick the one most relevant to construction/services in Arizona if applicable.`;

  const response = await ai.models.generateContent({
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "Short/common company name" },
          fullName: { type: "STRING", description: "Full legal company name" },
          website: { type: "STRING" },
          phone: { type: "STRING" },
          email: { type: "STRING" },
          address: { type: "STRING" },
          city: { type: "STRING" },
          state: { type: "STRING" },
          zip: { type: "STRING" },
          description: {
            type: "STRING",
            description: "Brief company description",
          },
          services: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Services offered",
          },
          industry: { type: "STRING" },
          confidence: {
            type: "NUMBER",
            description: "Confidence in match (0-1)",
          },
        },
        required: ["name", "confidence"],
      },
    },
    contents: [{ text: prompt }],
    model: "gemini-3-flash-preview",
  });

  const result = JSON.parse(response.text || "{}") as GeminiExtractionResult;

  return {
    company: mapToCompanyInfo(result, companyName),
    confidence: result.confidence ?? 0.5,
  };
}

interface GeminiExtractionResult {
  address?: string;
  city?: string;
  confidence?: number;
  description?: string;
  email?: string;
  fullName?: string;
  industry?: string;
  name?: string;
  phone?: string;
  services?: string[];
  state?: string;
  website?: string;
  zip?: string;
}

function mapToCompanyInfo(
  result: GeminiExtractionResult,
  companyName: string
): CompanyInfo {
  return {
    address: result.address ?? null,
    city: result.city ?? null,
    description: result.description ?? null,
    email: result.email ?? null,
    fullName: result.fullName ?? null,
    industry: result.industry ?? null,
    name: result.name ?? companyName,
    phone: result.phone ?? null,
    services: result.services ?? null,
    state: result.state ?? null,
    website: result.website ?? null,
    zip: result.zip ?? null,
  };
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Enrich a company name using Jina search + Gemini extraction
 *
 * @param companyName - Company name to search for
 * @param options - Optional location and context hints
 */
export async function enrichCompany(
  companyName: string,
  options: {
    location?: string;
    context?: string;
  } = {}
): Promise<EnrichResult> {
  const start = Date.now();
  const sources: string[] = [];

  try {
    // Build search query - avoid quotes for short names
    const locationStr = options.location || "Arizona";
    const contextStr = options.context || "";
    const useQuotes = companyName.length > 4 && !companyName.includes(" ");
    const quotedName = useQuotes ? `"${companyName}"` : companyName;
    const query = `${quotedName} ${contextStr} company ${locationStr}`.trim();

    // Search with Jina
    const searchResult = await searchJson(query, { num: 5 });

    if (!searchResult.data || searchResult.data.length === 0) {
      return {
        company: null,
        confidence: 0,
        error: "No search results found",
        query,
        sources: [],
        success: false,
        timeMs: Date.now() - start,
      };
    }

    // Collect sources
    for (const result of searchResult.data) {
      sources.push(result.url);
    }

    // Build text for Gemini
    const searchText = searchResult.data
      .map((r) => `## ${r.title}\nURL: ${r.url}\n${r.content}`)
      .join("\n\n");

    // Extract with Gemini
    const { company, confidence } = await extractCompanyInfo(
      searchText,
      companyName,
      options.context
    );

    return {
      company,
      confidence,
      query,
      sources,
      success: confidence > 0.3,
      timeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      company: null,
      confidence: 0,
      error: error instanceof Error ? error.message : String(error),
      query: companyName,
      sources,
      success: false,
      timeMs: Date.now() - start,
    };
  }
}

/**
 * Enrich a provider name with service context
 * Optimized for short/abbreviated names like "DX", "WM", "LP"
 *
 * @param providerName - Short or abbreviated provider name
 * @param serviceType - Type of service (e.g., "roll-off dumpster", "portable restroom")
 * @param location - Optional location (default: Arizona)
 */
export function enrichProvider(
  providerName: string,
  serviceType: string,
  location = "Arizona"
): Promise<EnrichResult> {
  // For short names, expand the search to include service type
  // Don't use quotes around short names as they may be abbreviations
  return enrichCompany(providerName, {
    context: serviceType,
    location,
  });
}

/**
 * Enrich a company by fetching and analyzing its website
 *
 * @param companyName - Company name
 * @param websiteUrl - Website URL to analyze
 */
export async function enrichFromWebsite(
  companyName: string,
  websiteUrl: string
): Promise<EnrichResult> {
  const start = Date.now();

  try {
    // Fetch website content with Jina Reader
    const content = await read(websiteUrl, { tokenBudget: 3000 });

    // Extract with Gemini
    const { company, confidence } = await extractCompanyInfo(
      content,
      companyName
    );

    return {
      company,
      confidence,
      query: websiteUrl,
      sources: [websiteUrl],
      success: confidence > 0.3,
      timeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      company: null,
      confidence: 0,
      error: error instanceof Error ? error.message : String(error),
      query: websiteUrl,
      sources: [websiteUrl],
      success: false,
      timeMs: Date.now() - start,
    };
  }
}

/**
 * Batch enrich multiple provider names
 *
 * @param providers - Array of {name, serviceType} objects
 * @param options - Concurrency and delay options
 */
export async function enrichProvidersBatch(
  providers: { name: string; serviceType: string }[],
  options: {
    concurrency?: number;
    delayMs?: number;
    location?: string;
  } = {}
): Promise<Map<string, EnrichResult>> {
  const results = new Map<string, EnrichResult>();
  const concurrency = options.concurrency ?? 2;
  const delayMs = options.delayMs ?? 500;
  const location = options.location ?? "Arizona";

  // Process in batches
  for (let i = 0; i < providers.length; i += concurrency) {
    const batch = providers.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map((p) => enrichProvider(p.name, p.serviceType, location))
    );

    for (const [index, provider] of batch.entries()) {
      const result = batchResults[index];
      if (result) {
        results.set(provider.name, result);
      }
    }

    // Rate limit delay between batches
    const hasMoreBatches = i + concurrency < providers.length;
    if (hasMoreBatches) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
