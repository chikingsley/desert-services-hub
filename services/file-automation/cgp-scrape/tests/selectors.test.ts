/**
 * Selector Validation Tests
 *
 * Validates that our selectors match the actual page HTML.
 * Run these if you think the page structure has changed.
 *
 * Run with: bun test tests/selectors.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  closeBrowser,
  createBrowser,
  navigateToSearchPage,
} from "../src/browser";
import { searchForm } from "../src/selectors";
import type { BrowserInstance } from "../src/types";
import { TIMEOUTS } from "./timeouts";

let instance: BrowserInstance | null = null;

describe("Selector Validation", () => {
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

  describe("Search Form Selectors", () => {
    test("form selector is valid", async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const visible = await instance.page.isVisible(searchForm.form);
      expect(visible).toBe(true);
    });

    test("Application Type selector is valid", async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const visible = await instance.page.isVisible(searchForm.appType.select);
      expect(visible).toBe(true);

      // Verify options exist
      const options = await instance.page.$$eval(
        `${searchForm.appType.select} option`,
        (els) => els.map((el) => el.textContent?.trim()),
      );
      console.log("Application Type options:", options);

      expect(options).toContain("General Construction");
      expect(options).toContain("Waiver Construction");
    });

    test("AZPDES Number selector is valid", async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const visible = await instance.page.isVisible(
        searchForm.azpdesNumber.input,
      );
      expect(visible).toBe(true);
    });

    test("Business Name selector is valid", async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const visible = await instance.page.isVisible(
        searchForm.businessName.input,
      );
      expect(visible).toBe(true);
    });

    test("Project Site Name selector is valid", async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const visible = await instance.page.isVisible(
        searchForm.projectSiteName.input,
      );
      expect(visible).toBe(true);
    });

    test("Site City selector is valid", async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const visible = await instance.page.isVisible(searchForm.siteCity.input);
      expect(visible).toBe(true);
    });

    test("Site Zip selector is valid", async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const visible = await instance.page.isVisible(searchForm.siteZip.input);
      expect(visible).toBe(true);
    });

    test("County selector is valid", async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const visible = await instance.page.isVisible(searchForm.county.select);
      expect(visible).toBe(true);

      // Verify Maricopa option exists
      const options = await instance.page.$$eval(
        `${searchForm.county.select} option`,
        (els) => els.map((el) => el.textContent?.trim()),
      );
      console.log("County options:", options);

      expect(options).toContain("Maricopa");
      expect(options).toContain("Pima");
      expect(options).toContain("Pinal");
    });

    test("Date range selectors are valid", async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const startVisible = await instance.page.isVisible(
        searchForm.dateRange.startDate,
      );
      const endVisible = await instance.page.isVisible(
        searchForm.dateRange.endDate,
      );

      expect(startVisible).toBe(true);
      expect(endVisible).toBe(true);
    });

    test("Search button selector is valid", async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const visible = await instance.page.isVisible(searchForm.buttons.search);
      expect(visible).toBe(true);
    });

    test("Clear button selector is valid", async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const visible = await instance.page.isVisible(searchForm.buttons.clear);
      expect(visible).toBe(true);
    });
  });
});
