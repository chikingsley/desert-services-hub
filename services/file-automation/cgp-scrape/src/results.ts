/**
 * Results Page Parsing
 *
 * Extract permit records from search results.
 */

import type { Page } from "playwright";
import type { PageScrapeResult, PermitRecord } from "./types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Regex pattern for extracting page numbers */
const PAGE_NUMBER_REGEX = /Page\s+(\d+)/i;

// =============================================================================
// RESULTS EXTRACTION
// =============================================================================

/**
 * Check if we're on a results page (vs the search form or error page).
 */
export async function isOnResultsPage(page: Page): Promise<boolean> {
  try {
    // Results pages typically have a table with permit data
    const hasTable = await page.isVisible("table", { timeout: 5000 });
    // And some kind of record count or pagination
    const hasFont = await page.isVisible("font", { timeout: 1000 });
    return hasTable && hasFont;
  } catch {
    return false;
  }
}

/**
 * Check if the results indicate "no records found".
 */
export async function hasNoResults(page: Page): Promise<boolean> {
  try {
    const pageContent = await page.content();
    const noResultsIndicators = [
      "No records found",
      "no records",
      "0 records",
      "Your search returned no results",
    ];
    return noResultsIndicators.some((indicator) =>
      pageContent.toLowerCase().includes(indicator.toLowerCase()),
    );
  } catch {
    return false;
  }
}

/**
 * Extract permit records from the current results page.
 *
 * The results table structure needs to be determined by inspecting
 * actual results. This is a placeholder that can be refined.
 */
export async function extractPermitsFromPage(
  page: Page,
): Promise<PageScrapeResult> {
  try {
    // Check for no results first
    if (await hasNoResults(page)) {
      return {
        success: true,
        permits: [],
        hasMore: false,
        currentPage: 1,
      };
    }

    // Extract table data - this will need refinement based on actual HTML
    const permits = await page.evaluate(() => {
      const records: PermitRecord[] = [];

      // Find all tables - results are typically in a data table
      const tables = document.querySelectorAll("table");

      for (const table of Array.from(tables)) {
        const rows = table.querySelectorAll("tr");

        // Skip header row, process data rows
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i]?.querySelectorAll("td");
          if (!cells || cells.length < 5) {
            continue;
          }

          // Extract cell text content
          const record: PermitRecord = {
            azpdesNumber: cells[0]?.textContent?.trim() ?? "",
            operatorBusinessName: cells[1]?.textContent?.trim() ?? "",
            projectSiteName: cells[2]?.textContent?.trim() ?? "",
            applicationStatus: cells[3]?.textContent?.trim() ?? "",
            receivedDate: cells[4]?.textContent?.trim() ?? "",
          };

          // Only add if we have at least an AZPDES number
          if (record.azpdesNumber) {
            records.push(record);
          }
        }
      }

      return records;
    });

    // Check for pagination
    const hasMore = await checkForMorePages(page);
    const currentPage = await getCurrentPageNumber(page);

    return {
      success: true,
      permits,
      hasMore,
      currentPage,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      permits: [],
      hasMore: false,
      currentPage: 1,
      error: errorMessage,
    };
  }
}

/**
 * Check if there are more pages of results.
 */
export async function checkForMorePages(page: Page): Promise<boolean> {
  try {
    // Look for "Next" link or numbered pagination
    const hasNextLink = await page.isVisible('a:has-text("Next")', {
      timeout: 1000,
    });
    if (hasNextLink) {
      return true;
    }

    // Check for numbered page links
    const pageLinks = await page.$$("font > font > a");
    return pageLinks.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get the current page number from pagination.
 */
export async function getCurrentPageNumber(page: Page): Promise<number> {
  try {
    // Look for current page indicator (often non-linked or bold)
    // This needs to be refined based on actual pagination HTML
    const pageContent = await page.content();

    // Try to find a page number pattern
    const pageMatch = pageContent.match(PAGE_NUMBER_REGEX);
    if (pageMatch?.[1]) {
      return Number.parseInt(pageMatch[1], 10);
    }

    return 1;
  } catch {
    return 1;
  }
}

/**
 * Navigate to the next page of results.
 *
 * @returns true if successfully navigated, false if no more pages
 */
export async function goToNextPage(page: Page): Promise<boolean> {
  try {
    const nextLink = page.locator('a:has-text("Next")');
    if (await nextLink.isVisible({ timeout: 1000 })) {
      await nextLink.click();
      await page.waitForLoadState("networkidle", { timeout: 30_000 });
      return true;
    }

    // Try numbered pagination - find the next number
    const currentPage = await getCurrentPageNumber(page);
    const nextPageLink = page.locator(`a:has-text("${currentPage + 1}")`);
    if (await nextPageLink.isVisible({ timeout: 1000 })) {
      await nextPageLink.click();
      await page.waitForLoadState("networkidle", { timeout: 30_000 });
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Navigate to a specific page number.
 *
 * @returns true if successfully navigated
 */
export async function goToPage(
  page: Page,
  pageNumber: number,
): Promise<boolean> {
  try {
    const pageLink = page.locator(`a:has-text("${pageNumber}")`);
    if (await pageLink.isVisible({ timeout: 1000 })) {
      await pageLink.click();
      await page.waitForLoadState("networkidle", { timeout: 30_000 });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
