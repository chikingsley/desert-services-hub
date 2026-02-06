/**
 * Create Existing Company - Minimal Flow E2E Test
 *
 * Tests the existing company creation flow through pages 1-3.
 * Uses explicit minimal test data for required fields, defaults for the rest.
 *
 * NOTE: Page 4+ requires additional work - goToPage(4) currently fails.
 * This test covers the working portions of the flow.
 *
 * Run with: bun test tests/e2e/create-existing-minimal.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import { buildFormData } from "@/form-data";
import {
  createExistingCompanyApplication,
  fillPage1,
  fillPage2,
  fillPage3,
  getCurrentPage,
  goToPage,
  isOnDustAppsPage,
} from "@/portal/create";
import { deleteByApplicationId } from "@/portal/delete";
import { DUST_APPLICATION_ID_REGEX } from "@/portal/utils/helpers";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

const APP_ID_PATTERN = DUST_APPLICATION_ID_REGEX;

// Test data
const COMPANY_NAME = "Sundt Construction Inc";
const COPY_FROM_APP = process.env.COPY_FROM_APP_NUMBER || "D0062461";

// Generate unique test data with timestamp
const timestamp = Date.now().toString().slice(-6);
const today = new Date();
const oneYearFromNow = new Date(today);
oneYearFromNow.setFullYear(today.getFullYear() + 1);
const formatDate = (d: Date) =>
  `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

// Minimal test data - only what's required
const TEST_FORM_DATA = buildFormData({
  overrides: {
    primaryContact: {
      firstName: "Test",
      lastName: `User${timestamp}`,
      title: "Project Manager",
      email: `test${timestamp}@example.com`,
      phone: "6025550100",
      companyName: COMPANY_NAME,
    },
    project: {
      name: `E2E Test Project ${timestamp}`,
      description: "Automated E2E test - existing company minimal flow",
      startDate: formatDate(today),
      endDate: formatDate(oneYearFromNow),
    },
  },
});

const harness = new PortalHarness();
let createdAppId: string | null = null;

describe("Create Existing Company - Minimal Flow (Pages 1-3)", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  test(
    "1. login and navigate to My Dust Apps",
    async () => {
      await harness.setup();
      const success = await harness.navigateToDustApps();
      expect(success).toBe(true);

      const hasNewBtn = await isOnDustAppsPage(harness.page);
      expect(hasNewBtn).toBe(true);
    },
    TIMEOUTS.complex
  );

  test(
    "2. create application with existing company",
    async () => {
      const { page, context } = harness;

      const result = await createExistingCompanyApplication(
        page,
        context,
        COMPANY_NAME,
        COPY_FROM_APP
      );

      expect(result.success).toBe(true);
      expect(result.applicationId).toMatch(APP_ID_PATTERN);
      expect(result.error).toBeUndefined();

      createdAppId = result.applicationId;
      console.log(`  Created: ${createdAppId}`);
    },
    TIMEOUTS.complex
  );

  test(
    "3. fill page 1 (partial - existing company)",
    async () => {
      const { page } = harness;
      expect(await getCurrentPage(page)).toBe(1);

      // Existing company uses "partial" mode - only fills contact/project info
      const success = await fillPage1(page, TEST_FORM_DATA, "partial");
      expect(success).toBe(true);
    },
    TIMEOUTS.standard
  );

  test(
    "4. navigate to page 2 and fill (Project Location)",
    async () => {
      const { page } = harness;
      const { success } = await goToPage(page, 2);
      expect(success).toBe(true);
      expect(await getCurrentPage(page)).toBe(2);

      const fillSuccess = await fillPage2(page);
      expect(fillSuccess).toBe(true);
    },
    TIMEOUTS.standard
  );

  test(
    "5. verify on page 3 and fill (Project Details)",
    async () => {
      const { page } = harness;
      expect(await getCurrentPage(page)).toBe(3);

      const success = await fillPage3(page, TEST_FORM_DATA);
      expect(success).toBe(true);

      // Verify our test data was used
      const projectName = await page.inputValue(
        '[id="ThePage:siTable:11:sioTable:0:siForm:text"]'
      );
      expect(projectName).toContain("E2E Test Project");
    },
    TIMEOUTS.standard
  );

  test(
    "6. cleanup: delete draft",
    async () => {
      if (!createdAppId) {
        return;
      }

      const { page, context } = harness;
      const deleted = await deleteByApplicationId(page, context, createdAppId);
      expect(deleted).toBe(true);
      console.log(`  Cleaned up ${createdAppId}`);
    },
    TIMEOUTS.standard
  );
});
