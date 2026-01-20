/**
 * Search Form E2E Tests
 *
 * Tests search form filling and submission.
 * Each step is a separate test so you can see exactly where failures occur.
 *
 * Run with: bun test tests/search.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  closeBrowser,
  createBrowser,
  navigateToSearchPage,
} from "../src/browser";
import {
  clearSearchForm,
  fillSearchForm,
  isOnSearchPage,
  submitSearchForm,
} from "../src/search";
import type { BrowserInstance, SearchCriteria } from "../src/types";
import { TIMEOUTS } from "./timeouts";

let instance: BrowserInstance | null = null;

describe("Search Form Operations", () => {
  beforeAll(async () => {
    instance = await createBrowser({ headless: true });
    await navigateToSearchPage(instance);
  }, TIMEOUTS.standard);

  afterAll(async () => {
    if (instance) {
      await closeBrowser(instance);
      instance = null;
    }
  });

  test(
    "1. confirms we are on search page",
    async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const onSearchPage = await isOnSearchPage(instance.page);
      expect(onSearchPage).toBe(true);
    },
    TIMEOUTS.quick,
  );

  test(
    "2. can select Application Type dropdown",
    async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const criteria: SearchCriteria = {
        applicationType: "General Construction",
      };

      const success = await fillSearchForm(instance.page, criteria);
      expect(success).toBe(true);

      // Verify the value was set
      const selectedValue = await instance.page.$eval(
        "select#App\\ Type",
        (el) => (el as HTMLSelectElement).value,
      );
      expect(selectedValue).toBe("General Construction");
    },
    TIMEOUTS.standard,
  );

  test(
    "3. can clear the form",
    async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const success = await clearSearchForm(instance.page);
      expect(success).toBe(true);
    },
    TIMEOUTS.quick,
  );

  test(
    "4. can select County dropdown",
    async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const criteria: SearchCriteria = {
        county: "Maricopa",
      };

      const success = await fillSearchForm(instance.page, criteria);
      expect(success).toBe(true);

      // Verify the value was set
      const selectedValue = await instance.page.$eval(
        "select#County",
        (el) => (el as HTMLSelectElement).value,
      );
      expect(selectedValue).toBe("Maricopa");
    },
    TIMEOUTS.standard,
  );

  test(
    "5. can fill complete search criteria",
    async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      // Clear form first
      await clearSearchForm(instance.page);

      const criteria: SearchCriteria = {
        applicationType: "General Construction",
        county: "Maricopa",
        startDate: "01/01/2024",
        endDate: "12/31/2024",
      };

      const success = await fillSearchForm(instance.page, criteria);
      expect(success).toBe(true);

      // Verify app type
      const appType = await instance.page.$eval(
        "select#App\\ Type",
        (el) => (el as HTMLSelectElement).value,
      );
      expect(appType).toBe("General Construction");

      // Verify county
      const county = await instance.page.$eval(
        "select#County",
        (el) => (el as HTMLSelectElement).value,
      );
      expect(county).toBe("Maricopa");
    },
    TIMEOUTS.standard,
  );

  test(
    "6. can submit search form",
    async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const success = await submitSearchForm(instance.page);
      expect(success).toBe(true);

      // After submission, we should no longer be on the search page
      // (or we should see results)
      const currentUrl = instance.page.url();
      // The URL might stay the same (if results appear on same page)
      // or change (if there's a results page)
      console.log("URL after submit:", currentUrl);
    },
    TIMEOUTS.complex,
  );
});
