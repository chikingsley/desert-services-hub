/**
 * CGP Scraper - Main Entry Point
 *
 * Orchestrates the complete scrape flow:
 * 1. Create browser
 * 2. Navigate to search page
 * 3. Fill and submit search form
 * 4. Extract results from all pages
 * 5. Return structured data
 */

import { closeBrowser, createBrowser, navigateToSearchPage } from "./browser";
import { extractPermitsFromPage, goToNextPage, hasNoResults } from "./results";
import { fillSearchForm, submitSearchForm } from "./search";
import type {
  PermitRecord,
  ScrapeResult,
  ScraperOptions,
  SearchCriteria,
} from "./types";

// =============================================================================
// DEFAULT OPTIONS
// =============================================================================

const DEFAULT_OPTIONS: Required<ScraperOptions> = {
  headless: true,
  maxPages: 100, // Reasonable limit to prevent infinite loops
  pageDelay: 1000,
  timeout: 30_000,
};

// =============================================================================
// MAIN SCRAPER
// =============================================================================

/**
 * Run the complete CGP scrape flow.
 *
 * @param criteria - Search criteria to filter permits
 * @param options - Scraper configuration options
 * @returns Structured scrape results
 */
export async function scrape(
  criteria: SearchCriteria,
  options?: ScraperOptions,
): Promise<ScrapeResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const allPermits: PermitRecord[] = [];
  const errors: string[] = [];
  let pageCount = 0;

  // Create browser
  const instance = await createBrowser({ headless: opts.headless });

  try {
    // Navigate to search page
    const navigated = await navigateToSearchPage(instance);
    if (!navigated) {
      return {
        success: false,
        totalCount: 0,
        permits: [],
        pageCount: 0,
        errors: ["Failed to navigate to search page"],
      };
    }

    // Fill and submit search form
    const filled = await fillSearchForm(instance.page, criteria);
    if (!filled) {
      return {
        success: false,
        totalCount: 0,
        permits: [],
        pageCount: 0,
        errors: ["Failed to fill search form"],
      };
    }

    const submitted = await submitSearchForm(instance.page);
    if (!submitted) {
      return {
        success: false,
        totalCount: 0,
        permits: [],
        pageCount: 0,
        errors: ["Failed to submit search form"],
      };
    }

    // Check for no results
    if (await hasNoResults(instance.page)) {
      return {
        success: true,
        totalCount: 0,
        permits: [],
        pageCount: 0,
        errors: [],
      };
    }

    // Extract results from all pages
    let hasMore = true;
    while (hasMore && pageCount < opts.maxPages) {
      pageCount += 1;

      const pageResult = await extractPermitsFromPage(instance.page);

      if (!pageResult.success) {
        errors.push(`Error on page ${pageCount}: ${pageResult.error}`);
        break;
      }

      allPermits.push(...pageResult.permits);

      // Check for more pages and navigate
      if (pageResult.hasMore) {
        const navigatedToNext = await goToNextPage(instance.page);
        if (navigatedToNext) {
          // Delay between pages
          await new Promise((resolve) => setTimeout(resolve, opts.pageDelay));
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    return {
      success: errors.length === 0,
      totalCount: allPermits.length,
      permits: allPermits,
      pageCount,
      errors,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      totalCount: allPermits.length,
      permits: allPermits,
      pageCount,
      errors: [...errors, errorMessage],
    };
  } finally {
    await closeBrowser(instance);
  }
}

/**
 * Scrape General Construction permits for Maricopa County.
 *
 * This is the primary use case - scraping new CGP permits.
 */
export async function scrapeMaricopaGeneral(
  options?: ScraperOptions & { startDate?: string; endDate?: string },
): Promise<ScrapeResult> {
  const criteria: SearchCriteria = {
    applicationType: "General Construction",
    county: "Maricopa",
    startDate: options?.startDate,
    endDate: options?.endDate,
  };

  return await scrape(criteria, options);
}

// Re-export types for convenience
export type {
  PermitRecord,
  ScrapeResult,
  ScraperOptions,
  SearchCriteria,
} from "./types";
