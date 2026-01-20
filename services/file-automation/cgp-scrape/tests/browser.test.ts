/**
 * Browser E2E Tests
 *
 * Tests browser creation, navigation, and cleanup.
 * Each step is a separate test so you can see exactly where failures occur.
 *
 * Run with: bun test tests/browser.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import {
  CGP_URL,
  closeBrowser,
  createBrowser,
  navigateToSearchPage,
} from "../src/browser";
import type { BrowserInstance } from "../src/types";
import { TIMEOUTS } from "./timeouts";

let instance: BrowserInstance | null = null;

describe("Browser Management", () => {
  afterAll(async () => {
    if (instance) {
      await closeBrowser(instance);
      instance = null;
    }
  });

  test(
    "1. can create browser instance",
    async () => {
      instance = await createBrowser({ headless: true });

      expect(instance).toBeDefined();
      expect(instance.browser).toBeDefined();
      expect(instance.context).toBeDefined();
      expect(instance.page).toBeDefined();
    },
    TIMEOUTS.standard,
  );

  test(
    "2. browser page is ready for navigation",
    async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const url = instance.page.url();
      // New page starts at about:blank
      expect(url).toMatch(/^(about:blank|)$/);
    },
    TIMEOUTS.quick,
  );

  test(
    "3. can navigate to CGP search page",
    async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const success = await navigateToSearchPage(instance);

      expect(success).toBe(true);
      expect(instance.page.url()).toBe(CGP_URL);
    },
    TIMEOUTS.standard,
  );

  test(
    "4. search page contains expected form elements",
    async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      const page = instance.page;

      // Check for key form elements based on our selectors
      const appTypeVisible = await page.isVisible("select#App\\ Type");
      const countyVisible = await page.isVisible("select#County");
      const searchBtnVisible = await page.isVisible(
        'input[type="submit"][value="Search"]',
      );

      expect(appTypeVisible).toBe(true);
      expect(countyVisible).toBe(true);
      expect(searchBtnVisible).toBe(true);
    },
    TIMEOUTS.quick,
  );

  test(
    "5. can close browser cleanly",
    async () => {
      expect(instance).not.toBeNull();
      if (!instance) {
        throw new Error("Browser instance not created");
      }

      await closeBrowser(instance);

      // Verify browser is closed
      const isConnected = instance.browser.isConnected();
      expect(isConnected).toBe(false);

      instance = null; // Prevent double-close in afterAll
    },
    TIMEOUTS.quick,
  );
});
