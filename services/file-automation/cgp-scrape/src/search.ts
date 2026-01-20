/**
 * Search Form Operations
 *
 * Fill search criteria and submit the form.
 */

import type { Page } from "playwright";
import { searchForm } from "./selectors";
import type { SearchCriteria } from "./types";

/**
 * Fill a text input field.
 */
async function fillText(
  page: Page,
  selector: string,
  value: string | undefined,
): Promise<void> {
  if (value === undefined || value === "") {
    return;
  }
  await page.fill(selector, value);
}

/**
 * Select an option from a dropdown.
 */
async function selectOption(
  page: Page,
  selector: string,
  value: string | undefined,
): Promise<void> {
  if (value === undefined || value === "") {
    return;
  }
  await page.selectOption(selector, { label: value });
}

/**
 * Fill the search form with the provided criteria.
 *
 * @param page - Playwright page instance
 * @param criteria - Search criteria to apply
 * @returns true if form was filled successfully
 */
export async function fillSearchForm(
  page: Page,
  criteria: SearchCriteria,
): Promise<boolean> {
  try {
    // Application Type dropdown
    if (criteria.applicationType) {
      await selectOption(
        page,
        searchForm.appType.select,
        criteria.applicationType,
      );
    }

    // AZPDES Number
    await fillText(page, searchForm.azpdesNumber.input, criteria.azpdesNumber);

    // Business Name
    await fillText(page, searchForm.businessName.input, criteria.businessName);

    // Project/Site Name
    await fillText(
      page,
      searchForm.projectSiteName.input,
      criteria.projectSiteName,
    );

    // Site City
    await fillText(page, searchForm.siteCity.input, criteria.siteCity);

    // Site Zip
    await fillText(page, searchForm.siteZip.input, criteria.siteZip);

    // County dropdown
    if (criteria.county) {
      await selectOption(page, searchForm.county.select, criteria.county);
    }

    // Date range
    await fillText(page, searchForm.dateRange.startDate, criteria.startDate);
    await fillText(page, searchForm.dateRange.endDate, criteria.endDate);

    return true;
  } catch (error) {
    console.error("[SearchForm] Failed to fill form:", error);
    return false;
  }
}

/**
 * Submit the search form and wait for results.
 *
 * @param page - Playwright page instance
 * @returns true if form was submitted successfully
 */
export async function submitSearchForm(page: Page): Promise<boolean> {
  try {
    // Click the search button and wait for navigation
    // Use Promise.all to handle both click and navigation together
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 30_000 }),
      page.click(searchForm.buttons.search),
    ]);

    // Give the page a moment to fully render
    await page.waitForTimeout(1000);

    return true;
  } catch (error) {
    console.error("[SearchForm] Failed to submit form:", error);
    return false;
  }
}

/**
 * Clear the search form.
 *
 * @param page - Playwright page instance
 * @returns true if form was cleared successfully
 */
export async function clearSearchForm(page: Page): Promise<boolean> {
  try {
    await page.click(searchForm.buttons.clear);
    return true;
  } catch (error) {
    console.error("[SearchForm] Failed to clear form:", error);
    return false;
  }
}

/**
 * Check if we're on the search form page.
 */
export async function isOnSearchPage(page: Page): Promise<boolean> {
  try {
    const formVisible = await page.isVisible(searchForm.form, {
      timeout: 5000,
    });
    return formVisible;
  } catch {
    return false;
  }
}

/**
 * Get the current URL.
 */
export function getCurrentUrl(page: Page): string {
  return page.url();
}
