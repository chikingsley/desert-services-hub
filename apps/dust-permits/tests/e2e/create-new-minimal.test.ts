/**
 * Create New Company - Minimal Flow E2E Test
 *
 * Tests the new company creation flow through pages 1-3.
 * Uses explicit minimal test data for required fields, defaults for the rest.
 *
 * NOTE: Page 4+ requires additional work - goToPage(4) currently fails.
 * This test covers the working portions of the flow.
 *
 * Required env vars:
 * - COPY_FROM_APP_NUMBER: Application to copy from (for form structure)
 *
 * Run with: bun test tests/e2e/create-new-minimal.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import { buildFormData } from "@/form-data";
import {
  createNewCompanyApplication,
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

// Required env vars
const COPY_FROM_APP = process.env.COPY_FROM_APP_NUMBER;

const RUN_TEST = COPY_FROM_APP !== "";

// Generate unique test data with timestamp
const timestamp = Date.now().toString().slice(-6);
const today = new Date();
const oneYearFromNow = new Date(today);
oneYearFromNow.setFullYear(today.getFullYear() + 1);
const formatDate = (d: Date) =>
  `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

const TEST_COMPANY_NAME = `Test Company ${timestamp} LLC`;

// Minimal test data for new company flow
const TEST_FORM_DATA = buildFormData({
  overrides: {
    // Page 1: Applicant info (required for new company)
    applicant: {
      address1: "123 Test Street",
      city: "Phoenix",
      companyName: TEST_COMPANY_NAME,
      email: `company${timestamp}@example.com`,
      entityType: "Limited Liability Company",
      isDeveloper: false,
      isGeneralContractor: true,
      isLessee: false,
      isPropertyOwner: false,
      phone: "6025550100",
      state: "Arizona",
      zip: "85001",
    },
    presidentOwner: {
      address1: "123 Test Street",
      city: "Phoenix",
      email: `owner${timestamp}@example.com`,
      firstName: "Test",
      lastName: `Owner${timestamp}`,
      phone: "6025550101",
      state: "Arizona",
      zip: "85001",
    },
    // Page 3: Primary contact and project
    primaryContact: {
      companyName: TEST_COMPANY_NAME,
      email: `contact${timestamp}@example.com`,
      firstName: "Test",
      lastName: `Contact${timestamp}`,
      phone: "6025550102",
      title: "Project Manager",
    },
    project: {
      description: "Automated E2E test - new company minimal flow",
      endDate: formatDate(oneYearFromNow),
      name: `E2E New Company Test ${timestamp}`,
      startDate: formatDate(today),
    },
  },
});

const harness = new PortalHarness();
let createdAppId: string | null = null;

const describeSuite = RUN_TEST ? describe : describe.skip;

describeSuite("Create New Company - Minimal Flow (Pages 1-3)", () => {
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
    "2. create application with new company",
    async () => {
      const { page, context } = harness;

      const result = await createNewCompanyApplication(
        page,
        context,
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
    "3. fill page 1 (full - new company)",
    async () => {
      const { page } = harness;
      expect(await getCurrentPage(page)).toBe(1);

      // New company uses "full" mode - fills all applicant info
      const success = await fillPage1(page, TEST_FORM_DATA, "full");
      expect(success).toBe(true);

      // Verify company name was set
      const companyName = await page.inputValue(
        '[id="ThePage:siTable:4:sioTable:2:siForm:text"]'
      );
      expect(companyName).toContain("Test Company");
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
      expect(projectName).toContain("E2E New Company Test");
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
