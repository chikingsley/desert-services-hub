/**
 * Company Enrichment Pipeline
 *
 * 1. Search for company website using Jina Search
 * 2. Extract content from website using Jina Reader
 * 3. Process content with Gemini to extract structured info
 */

import { processCompanyInfo } from "./gemini";
import { findBestWebsite, readWebsite, searchCompany } from "./jina";
import type { EnrichmentResult } from "./types";

/**
 * Enrich a company by name
 * Searches for their website, extracts content, and processes it
 */
export async function enrichCompany(
  companyName: string,
  options: { location?: string; verbose?: boolean } = {}
): Promise<EnrichmentResult> {
  const totalStart = Date.now();
  const log = options.verbose ? console.log : () => {};

  const result: EnrichmentResult = {
    success: false,
    companyName,
    searchQuery: companyName,
    steps: {
      search: { success: false, timeMs: 0 },
      read: { success: false, timeMs: 0 },
      process: { success: false, timeMs: 0 },
    },
    totalTimeMs: 0,
  };

  // Step 1: Search for company website
  log(`\n🔍 Searching for "${companyName}"...`);
  const searchResult = await searchCompany(companyName, {
    location: options.location,
  });
  result.steps.search = {
    success: searchResult.success,
    timeMs: searchResult.timeMs,
    error: searchResult.error,
  };

  if (!searchResult.success) {
    result.error = `Search failed: ${searchResult.error}`;
    result.totalTimeMs = Date.now() - totalStart;
    return result;
  }

  log(
    `   Found ${searchResult.results.length} results in ${searchResult.timeMs}ms`
  );
  for (const r of searchResult.results.slice(0, 5)) {
    log(`   - ${r.title.slice(0, 50)}: ${r.url}`);
  }

  // Find best website URL
  const websiteUrl = findBestWebsite(companyName, searchResult.results);
  if (!websiteUrl) {
    result.error = "No suitable website found in search results";
    result.totalTimeMs = Date.now() - totalStart;
    return result;
  }

  result.websiteUrl = websiteUrl;
  log(`\n🌐 Best match: ${websiteUrl}`);

  // Step 2: Extract website content
  log("\n📖 Reading website...");
  const readResult = await readWebsite(websiteUrl);
  result.steps.read = {
    success: readResult.success,
    timeMs: readResult.timeMs,
    error: readResult.error,
  };

  if (!readResult.success) {
    result.error = `Read failed: ${readResult.error}`;
    result.totalTimeMs = Date.now() - totalStart;
    return result;
  }

  log(`   Extracted ${readResult.tokens} tokens in ${readResult.timeMs}ms`);
  result.rawMarkdown = readResult.markdown;

  // Step 3: Process with Gemini
  log("\n🤖 Processing with Gemini...");
  const processResult = await processCompanyInfo(
    readResult.markdown,
    companyName
  );
  result.steps.process = {
    success: processResult.success,
    timeMs: processResult.timeMs,
    error: processResult.error,
  };

  if (!processResult.success) {
    result.error = `Process failed: ${processResult.error}`;
    result.totalTimeMs = Date.now() - totalStart;
    return result;
  }

  log(`   Processed in ${processResult.timeMs}ms`);

  // Success!
  result.success = true;
  result.extractedInfo = processResult.info;
  result.totalTimeMs = Date.now() - totalStart;

  return result;
}

/**
 * Enrich multiple companies in sequence
 */
export async function enrichCompanies(
  companyNames: string[],
  options: { location?: string; verbose?: boolean; delayMs?: number } = {}
): Promise<EnrichmentResult[]> {
  const results: EnrichmentResult[] = [];
  const delay = options.delayMs ?? 1000; // Default 1s delay between requests

  for (let i = 0; i < companyNames.length; i++) {
    const name = companyNames[i];
    if (!name) {
      continue;
    }

    console.log(`\n[${i + 1}/${companyNames.length}] Enriching: ${name}`);

    const result = await enrichCompany(name, options);
    results.push(result);

    if (result.success) {
      console.log(
        `   ✅ Success: ${result.extractedInfo?.phone || "no phone"}, ${result.extractedInfo?.email || "no email"}`
      );
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
    }

    // Delay between requests to avoid rate limiting
    if (i < companyNames.length - 1 && delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return results;
}
