/**
 * Jina AI integration for company search and website extraction
 */

import type { JinaReadResult, JinaSearchResult } from "./types";

const JINA_API_KEY = process.env.JINA_API_KEY;

/**
 * Search for a company using Jina Search API
 * Returns top results with URLs
 */
export async function searchCompany(
  companyName: string,
  options: { location?: string } = {}
): Promise<JinaSearchResult> {
  const start = Date.now();

  if (!JINA_API_KEY) {
    return {
      success: false,
      results: [],
      timeMs: Date.now() - start,
      error: "JINA_API_KEY not set",
    };
  }

  // Build search query - company name + optional location + "construction" to narrow results
  const query = options.location
    ? `${companyName} ${options.location} construction contractor`
    : `${companyName} construction contractor Arizona`;

  try {
    const response = await fetch(
      `https://s.jina.ai/${encodeURIComponent(query)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${JINA_API_KEY}`,
          Accept: "application/json",
          "X-Respond-With": "no-content", // Just URLs and titles, no full content
        },
      }
    );

    const timeMs = Date.now() - start;

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        results: [],
        timeMs,
        error: `HTTP ${response.status}: ${errorText.substring(0, 100)}`,
      };
    }

    const data = (await response.json()) as {
      data?: Array<{ title?: string; url?: string; description?: string }>;
    };

    const results = (data.data || []).map((item) => ({
      title: item.title || "",
      url: item.url || "",
      description: item.description || "",
    }));

    return {
      success: true,
      results,
      timeMs,
    };
  } catch (error) {
    return {
      success: false,
      results: [],
      timeMs: Date.now() - start,
      error: String(error),
    };
  }
}

/**
 * Extract content from a URL using Jina Reader API
 * Returns markdown content
 */
export async function readWebsite(url: string): Promise<JinaReadResult> {
  const start = Date.now();

  if (!JINA_API_KEY) {
    return {
      success: false,
      markdown: "",
      tokens: 0,
      timeMs: Date.now() - start,
      error: "JINA_API_KEY not set",
    };
  }

  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${JINA_API_KEY}`,
        Accept: "application/json",
        "X-Return-Format": "markdown",
      },
    });

    const timeMs = Date.now() - start;

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        markdown: "",
        tokens: 0,
        timeMs,
        error: `HTTP ${response.status}: ${errorText.substring(0, 100)}`,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    let markdown: string;

    if (contentType.includes("application/json")) {
      const json = (await response.json()) as {
        data?: { content?: string };
        content?: string;
      };
      markdown =
        json.data?.content || json.content || JSON.stringify(json, null, 2);
    } else {
      markdown = await response.text();
    }

    // Rough token estimate
    const tokens = Math.round(markdown.split(/\s+/).length * 1.3);

    return {
      success: true,
      markdown,
      tokens,
      timeMs,
    };
  } catch (error) {
    return {
      success: false,
      markdown: "",
      tokens: 0,
      timeMs: Date.now() - start,
      error: String(error),
    };
  }
}

/**
 * Find the most likely company website from search results
 */
export function findBestWebsite(
  companyName: string,
  results: JinaSearchResult["results"]
): string | null {
  if (results.length === 0) {
    return null;
  }

  const companyWords = companyName.toLowerCase().split(/\s+/);

  // Score each result
  const scored = results.map((r) => {
    let score = 0;
    const urlLower = r.url.toLowerCase();
    const titleLower = r.title.toLowerCase();

    // Boost for company name in URL/domain
    for (const word of companyWords) {
      if (word.length > 2 && urlLower.includes(word)) {
        score += 10;
      }
      if (word.length > 2 && titleLower.includes(word)) {
        score += 5;
      }
    }

    // Penalize aggregator sites
    const aggregators = [
      "linkedin.com",
      "facebook.com",
      "yelp.com",
      "bbb.org",
      "yellowpages.com",
      "manta.com",
      "dnb.com",
      "zoominfo.com",
      "crunchbase.com",
      "glassdoor.com",
      "indeed.com",
    ];
    if (aggregators.some((a) => urlLower.includes(a))) {
      score -= 20;
    }

    // Boost for .com domains
    if (urlLower.includes(".com")) {
      score += 3;
    }

    // Boost for being first result (Google usually ranks official site first)
    if (results.indexOf(r) === 0) {
      score += 5;
    }

    return { ...r, score };
  });

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  // Return top result if score is reasonable
  const best = scored[0];
  if (best && best.score > 0) {
    return best.url;
  }

  // Fallback to first non-aggregator result
  const firstGood = scored.find((r) => r.score >= 0);
  return firstGood?.url || results[0]?.url || null;
}
