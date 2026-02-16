/**
 * Unified Search Utility
 *
 * Provides a single interface to search for permits by:
 * - Permit ID (D#) - exact match
 * - Project name - wildcard match
 * - Company name - autocomplete selection
 *
 * @module portal/search
 */

import type { Page } from "playwright";
import type { SearchCriteria, SearchResult } from "@/portal/types";
import { listApplicationIds, SETTLE_MS, sleep } from "./helpers";
import { portal } from "./selectors";

export type { SearchCriteria, SearchResult } from "@/portal/types";

/**
 * Clear all search fields to reset the form.
 */
async function clearSearchFields(page: Page): Promise<void> {
  const { dustSearch } = portal;

  const fields = [
    dustSearch.permitNumberInput,
    dustSearch.projectNameInput,
    dustSearch.companyInput,
    dustSearch.projectAddressInput,
    dustSearch.cityInput,
  ];

  for (const selector of fields) {
    const field = page.locator(selector);
    const count = await field.count();
    if (count > 0) {
      await field.fill("");
    }
  }
}

/**
 * Submit the search form and wait for results.
 * Handles both cases: when results appear and when no results are found.
 */
async function submitSearch(page: Page): Promise<void> {
  const submitBtn = page.locator(portal.dustSearch.submitBtn);
  await submitBtn.click();

  // Wait for either:
  // 1. At least one result link to appear (D followed by 7 digits), OR
  // 2. The page to finish loading (network idle) - which means search completed with no results
  const permitLinkLocator = page
    .locator('a:text-matches("^D\\\\d{7}$")')
    .first();

  try {
    // Try to wait for a permit link to appear
    await permitLinkLocator.waitFor({ state: "visible", timeout: 30_000 });
  } catch {
    // No permit link appeared - wait for page to finish loading to ensure search completed
    await page
      .waitForLoadState("networkidle", { timeout: 10_000 })
      .catch(() => {
        // If networkidle times out, that's okay - just proceed
      });
  }

  await sleep(SETTLE_MS);
}

/**
 * Extract permit IDs from search results table.
 */
async function extractResultIds(page: Page): Promise<string[]> {
  const apps = await listApplicationIds(page);
  return apps.map((a) => a.id);
}

/**
 * Search by permit ID (D#).
 * Enters the ID in the permit number field and submits.
 */
async function searchByPermitId(
  page: Page,
  permitId: string
): Promise<SearchResult> {
  console.log(`\n[SEARCH BY PERMIT ID: ${permitId}]`);

  await clearSearchFields(page);

  const input = page.locator(portal.dustSearch.permitNumberInput);
  await input.fill(permitId);
  await sleep(SETTLE_MS);

  await submitSearch(page);

  const permitIds = await extractResultIds(page);
  const found = permitIds.includes(permitId);

  if (found) {
    console.log(`  Found ${permitId}`);
    return { count: 1, permitIds: [permitId], success: true };
  }

  console.log(`  Permit ${permitId} not found`);
  return { count: 0, error: "Permit not found", permitIds: [], success: false };
}

/**
 * Search by project name (wildcard).
 * Enters the name in the project name field and submits.
 */
async function searchByProjectName(
  page: Page,
  projectName: string
): Promise<SearchResult> {
  console.log(`\n[SEARCH BY PROJECT NAME: ${projectName}]`);

  await clearSearchFields(page);

  const input = page.locator(portal.dustSearch.projectNameInput);
  await input.fill(projectName);
  await sleep(SETTLE_MS);

  await submitSearch(page);

  const permitIds = await extractResultIds(page);
  console.log(`  Found ${permitIds.length} results`);

  return {
    count: permitIds.length,
    error: permitIds.length === 0 ? "No permits found" : undefined,
    permitIds,
    success: permitIds.length > 0,
  };
}

/**
 * Search by company name (autocomplete).
 * Types in the company field, waits for autocomplete, and selects a match.
 * Uses jQuery UI Autocomplete which requires character-by-character typing.
 */
async function searchByCompanyName(
  page: Page,
  companyName: string
): Promise<SearchResult> {
  console.log(`\n[SEARCH BY COMPANY NAME: ${companyName}]`);

  await clearSearchFields(page);

  const input = page.locator(portal.dustSearch.companyInput);

  // Wait for input to be visible and ready
  await input.waitFor({ state: "visible", timeout: 60_000 });

  // Clear and focus the input
  await input.click({ timeout: 60_000 });
  await input.fill("");
  await sleep(SETTLE_MS);

  // Type character by character to trigger jQuery UI autocomplete
  // (fill() doesn't trigger keyup events that autocomplete needs)
  await input.type(companyName, { delay: 50 });

  // Wait for autocomplete dropdown to become visible
  // jQuery UI adds display:block when visible
  const autocompleteDropdown = page.locator(
    `${portal.dustSearch.companyAutocomplete}:visible`
  );

  try {
    await autocompleteDropdown.waitFor({ state: "visible", timeout: 5000 });
    console.log("  Autocomplete dropdown appeared");

    // Find the item that matches our company name (case-insensitive)
    const items = page.locator(portal.dustSearch.companyAutocompleteItems);
    const count = await items.count();
    console.log(`  Found ${count} autocomplete options`);

    if (count > 0) {
      // Try to find an exact match first
      let clicked = false;
      for (let i = 0; i < count; i++) {
        const itemText = await items.nth(i).textContent();
        if (itemText?.toLowerCase() === companyName.toLowerCase()) {
          console.log(`  Clicking exact match: ${itemText}`);
          await items.nth(i).click();
          clicked = true;
          break;
        }
      }

      // If no exact match, click the first item
      if (!clicked) {
        const firstItemText = await items.first().textContent();
        console.log(`  No exact match, clicking first: ${firstItemText}`);
        await items.first().click();
      }

      await sleep(SETTLE_MS);
    }
  } catch {
    console.log("  No autocomplete dropdown appeared");
  }

  await submitSearch(page);

  const permitIds = await extractResultIds(page);
  console.log(`  Found ${permitIds.length} results`);

  return {
    count: permitIds.length,
    error: permitIds.length === 0 ? "No permits found for company" : undefined,
    permitIds,
    success: permitIds.length > 0,
  };
}

/**
 * Unified search function.
 * Searches by the first provided criteria: permitId, projectName, or companyName.
 *
 * @param page - Playwright Page instance (on the search page)
 * @param criteria - Search criteria object
 * @returns SearchResult with found permit IDs
 *
 * @example
 * // Search by permit ID
 * const result = await searchPermits(page, { permitId: "D0063581" });
 *
 * @example
 * // Search by company name
 * const result = await searchPermits(page, { companyName: "FCL Builders" });
 */
export async function searchPermits(
  page: Page,
  criteria: SearchCriteria
): Promise<SearchResult> {
  if (criteria.permitId) {
    return await searchByPermitId(page, criteria.permitId);
  }

  if (criteria.projectName) {
    return await searchByProjectName(page, criteria.projectName);
  }

  if (criteria.companyName) {
    return await searchByCompanyName(page, criteria.companyName);
  }

  return {
    count: 0,
    error: "No search criteria provided",
    permitIds: [],
    success: false,
  };
}
