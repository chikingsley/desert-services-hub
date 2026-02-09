import { getPermitById } from "@lib/db/repositories/dust-permit";
import type { BrowserContext, Page } from "playwright";
import {
  DEFAULTS,
  type DeepPartial,
  deepMerge,
  type FormData,
  oneYearFromNow,
  today,
} from "@/form-data";
import type { CreateResult, FullCreateResult } from "@/portal/types";
import {
  clickNext,
  SETTLE_MS,
  sleep,
  waitForElement,
} from "@/portal/utils/helpers";
import { portal } from "@/portal/utils/selectors";
import {
  createExistingCompanyApplication,
  createNewCompanyApplication,
  createRenewApplication,
  createReviseApplication,
  getCreatedApplicationId,
} from "./application";
import { DEFAULT_COPY_FROM_APP } from "./constants";
import {
  fillPage1,
  fillPage2,
  fillPage2Renew,
  fillPage3,
  fillPage4,
} from "./fill";
import { getCurrentPage } from "./navigation";

export async function fullCreateFlow(
  page: Page,
  context: BrowserContext,
  options: {
    flow: "new-company" | "existing-company";
    companyName?: string;
    copyFromApp?: string;
    formData?: FormData;
  }
): Promise<FullCreateResult> {
  console.log("\n=== FULL CREATE FLOW ===");
  const isNew = options.flow === "new-company";
  const data = options.formData || DEFAULTS;
  const copyFrom = options.copyFromApp || DEFAULT_COPY_FROM_APP;

  let res: CreateResult;
  if (options.flow === "new-company") {
    res = await createNewCompanyApplication(page, context, copyFrom);
  } else if (options.companyName) {
    res = await createExistingCompanyApplication(
      page,
      context,
      options.companyName,
      copyFrom
    );
  } else {
    return {
      success: false,
      applicationId: null,
      error: "Invalid options",
      reachedPage5: false,
    };
  }

  if (!res.success) {
    return { ...res, reachedPage5: false };
  }

  await fillPage1(page, data, isNew ? "full" : "partial");
  await clickNext(page);
  await fillPage2(page);
  await fillPage3(page, data);
  await clickNext(page);
  await fillPage4(page, data);

  const reachedPage5 = await page.isVisible(portal.pageMarkers.page5Submit);
  console.log(`\n=== FLOW COMPLETE - Page 5 Reached: ${reachedPage5} ===`);
  return { ...res, reachedPage5 };
}

/**
 * Create a new application and fill all forms - complete flow.
 *
 * This is the high-level function that route handlers should call.
 * Handles navigation, application creation, and form filling.
 *
 * @param page - Playwright Page instance (logged in)
 * @param context - Browser context for popup detection
 * @param flow - Application flow type
 * @param formData - Form data to fill
 * @param options - Optional company name and copy-from app
 * @returns Result with success, applicationId, reachedPage5, and error
 */
export async function createApplicationFull(
  page: Page,
  context: BrowserContext,
  flow: "new-company" | "existing-company" | "renew",
  formData: FormData,
  options: {
    companyName?: string;
    copyFromApp?: string;
  } = {}
): Promise<{
  success: boolean;
  applicationId: string | null;
  reachedPage5: boolean;
  error?: string;
}> {
  console.log(`\n=== CREATE APPLICATION FULL: ${flow} ===`);

  // 1. Navigate to My Dust Apps
  const { navigateToMyDustApps } = await import("../utils/helpers");
  const atDustApps = await navigateToMyDustApps(page);
  if (!atDustApps) {
    return {
      success: false,
      applicationId: null,
      reachedPage5: false,
      error: "Failed to navigate to My Dust Apps",
    };
  }

  // Wait for New Application button
  const btnReady = await waitForElement(
    page,
    portal.dustApps.newApplicationBtn,
    15_000
  );
  if (!btnReady) {
    return {
      success: false,
      applicationId: null,
      reachedPage5: false,
      error: "New Application button not found",
    };
  }

  // 2. Create application based on flow
  let createResult: CreateResult;
  const isNewCompany = flow === "new-company";

  if (flow === "new-company") {
    createResult = await createNewCompanyApplication(
      page,
      context,
      options.copyFromApp
    );
  } else if (flow === "existing-company" && options.companyName) {
    createResult = await createExistingCompanyApplication(
      page,
      context,
      options.companyName,
      options.copyFromApp
    );
  } else if (flow === "renew" && options.copyFromApp && options.companyName) {
    createResult = await createRenewApplication(
      page,
      context,
      options.copyFromApp,
      options.companyName
    );
  } else {
    return {
      success: false,
      applicationId: null,
      reachedPage5: false,
      error: "Invalid flow configuration",
    };
  }

  if (!createResult.success) {
    return {
      success: false,
      applicationId: null,
      reachedPage5: false,
      error: createResult.error,
    };
  }

  // 3. Fill all pages
  console.log("[2/3] Filling forms...");

  // Page 1
  await fillPage1(page, formData, isNewCompany ? "full" : "partial");

  // Navigate to Page 2 (map)
  await clickNext(page);

  // Navigate to Page 3
  await clickNext(page);
  await fillPage3(page, formData);

  // Navigate to Page 4
  await clickNext(page);
  await fillPage4(page, formData);

  // Navigate to Page 5
  await clickNext(page);

  // 4. Verify we reached Page 5
  const reachedPage5 = await page.isVisible(portal.pageMarkers.page5Submit);
  const applicationId = createResult.applicationId;

  console.log("\n=== FLOW COMPLETE ===");
  console.log(`    Application: ${applicationId}`);
  console.log(`    Reached Page 5: ${reachedPage5}`);

  return {
    success: true,
    applicationId,
    reachedPage5,
  };
}

/**
 * Renew a permit by ID - complete flow.
 *
 * Creates a new application copying from the existing permit,
 * then navigates through all pages to Page 5 (Submit).
 * The end date automatically advances by one year when copying.
 *
 * @param page - Playwright Page instance (logged in)
 * @param context - Browser context for popup detection
 * @param permitId - Permit ID to renew (e.g., "D0058823")
 * @param companyName - Company name to select in existing company flow
 * @param formData - Optional FormData overrides to apply after copying
 * @returns Result with success flag, new application ID, and optional error
 */
export async function renewPermitFull(
  page: Page,
  context: BrowserContext,
  permitId: string,
  companyName: string,
  formData?: DeepPartial<FormData>
): Promise<{ success: boolean; applicationId?: string; error?: string }> {
  const renewalStartDate = today();
  const renewalEndDate = oneYearFromNow();
  const renewalDefaults: DeepPartial<FormData> = {
    permitContact: {
      email: DEFAULTS.permitContact.email,
      name: DEFAULTS.permitContact.name,
      phone: DEFAULTS.permitContact.phone,
    },
    project: {
      startDate: renewalStartDate,
      endDate: renewalEndDate,
    },
  };
  const renewalOverrides = deepMerge({} as FormData, renewalDefaults, formData);
  // Always enforce permit contact + renewal date window for renewals.
  renewalOverrides.permitContact = {
    email: DEFAULTS.permitContact.email,
    name: DEFAULTS.permitContact.name,
    phone: DEFAULTS.permitContact.phone,
  };
  renewalOverrides.project = {
    ...renewalOverrides.project,
    startDate: renewalStartDate,
    endDate: renewalEndDate,
  };

  console.log(`\n=== RENEWING PERMIT: ${permitId} ===`);
  console.log(`    Company: ${companyName}`);
  console.log(
    `    Permit Contact: ${renewalOverrides.permitContact.name} (${renewalOverrides.permitContact.email})`
  );
  console.log(`    Renewal Dates: ${renewalStartDate} → ${renewalEndDate}`);
  if (formData) {
    console.log("    With additional FormData overrides");
  }

  const sourcePermit = await getPermitById(permitId);
  const sourceParcel = sourcePermit?.parcel?.trim() || undefined;
  const sourceAddress = sourcePermit?.address?.trim() || "";
  if (sourceParcel) {
    const locationSuffix = sourceAddress ? ` (${sourceAddress})` : "";
    console.log(`[renew] Source parcel: ${sourceParcel}${locationSuffix}`);
  }
  console.log("");

  // 1. Navigate to My Dust Apps
  console.log("[1/3] Navigating to My Dust Apps...");
  const { navigateToMyDustApps } = await import("../utils/helpers");

  const atDustApps = await navigateToMyDustApps(page);
  if (!atDustApps) {
    return { success: false, error: "Failed to navigate to My Dust Apps" };
  }

  await waitForElement(page, portal.dustApps.newApplicationBtn, 15_000);
  console.log("  ✓ At My Dust Apps\n");

  // 2. Create renew application (copies data from existing permit)
  console.log(`[2/3] Creating new application (copying from ${permitId})...`);
  const result = await createRenewApplication(
    page,
    context,
    permitId,
    companyName
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const appId =
    result.applicationId || (await getCreatedApplicationId(page)) || undefined;
  console.log(`  ✓ Created new application: ${appId}\n`);

  // 3. Navigate through pages, applying FormData overrides if provided
  console.log(
    `[3/3] ${formData ? "Filling forms and navigating" : "Navigating through pages"}...`
  );

  await sleep(SETTLE_MS);

  // Page 1 - Apply overrides if provided
  console.log("  Filling Page 1...");
  await fillPage1(page, renewalOverrides, "partial");
  await clickNext(page);
  await sleep(SETTLE_MS);

  // Page 2 (map) - Handle location and map for renewals
  console.log("  Handling Page 2 (Project Location)...");
  const page2Success = await fillPage2Renew(
    page,
    context,
    permitId,
    sourceParcel
  );
  if (!page2Success) {
    return {
      success: false,
      applicationId: appId,
      error:
        "Page 2 failed: location/map data not confirmed. Application created but incomplete.",
    };
  }
  await sleep(SETTLE_MS);

  // Page 3 - Apply overrides if provided
  console.log("  Filling Page 3...");
  await fillPage3(page, renewalOverrides);
  await clickNext(page);
  await sleep(SETTLE_MS);

  // Page 4 - Apply overrides if provided
  if (formData) {
    console.log("  Filling Page 4...");
    await fillPage4(page, formData);
  }
  await clickNext(page);
  await sleep(SETTLE_MS);

  // Verify we reached page 5
  const atPage5 = await page.isVisible(portal.pageMarkers.page5Submit);

  if (atPage5) {
    console.log(`\n=== ✓ RENEWAL READY: ${appId} ===`);
    console.log(`    Copied from: ${permitId}`);
    console.log("    Status: Ready to submit on Page 5\n");
    return { success: true, applicationId: appId };
  }

  const currentPage = await getCurrentPage(page);
  return {
    success: false,
    applicationId: appId,
    error: `Did not reach Page 5 (currently on page ${currentPage})`,
  };
}

/**
 * Revise a permit by ID - complete flow.
 *
 * Creates a revision application that edits the permit in-place.
 * Note: Revisions do NOT extend the expiration date (use renew for that).
 *
 * @param page - Playwright Page instance (logged in)
 * @param context - Browser context for popup detection
 * @param permitId - Permit ID to revise (e.g., "D0058823")
 * @param revisionPurpose - Reason for revision (shown in portal)
 * @param formData - Optional FormData overrides to apply after copying
 * @returns Result with success flag, new application ID, and optional error
 */
export async function revisePermitFull(
  page: Page,
  context: BrowserContext,
  permitId: string,
  revisionPurpose: string,
  formData?: DeepPartial<FormData>
): Promise<{ success: boolean; applicationId?: string; error?: string }> {
  console.log(`\n=== REVISING PERMIT: ${permitId} ===`);
  console.log(`    Purpose: ${revisionPurpose}`);
  if (formData) {
    console.log("    With FormData overrides");
  }
  console.log("");

  // 1. Navigate to My Dust Apps
  console.log("[1/3] Navigating to My Dust Apps...");
  const { navigateToMyDustApps } = await import("../utils/helpers");

  const atDustApps = await navigateToMyDustApps(page);
  if (!atDustApps) {
    return { success: false, error: "Failed to navigate to My Dust Apps" };
  }

  await waitForElement(page, portal.dustApps.newApplicationBtn, 15_000);
  console.log("  ✓ At My Dust Apps\n");

  // 2. Create revision application
  console.log(`[2/3] Creating revision for ${permitId}...`);
  const result = await createReviseApplication(
    page,
    context,
    permitId,
    revisionPurpose
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const appId =
    result.applicationId || (await getCreatedApplicationId(page)) || undefined;
  console.log(`  ✓ Created revision application: ${appId}\n`);

  // 3. Navigate through pages, applying FormData overrides if provided
  console.log(
    `[3/3] ${formData ? "Filling forms and navigating" : "Navigating through pages"}...`
  );

  await sleep(SETTLE_MS);

  // Page 1 - Apply overrides if provided
  if (formData) {
    console.log("  Filling Page 1...");
    await fillPage1(page, formData, "partial");
  }
  await clickNext(page);
  await sleep(SETTLE_MS);

  // Page 2 (map) - Skip, just navigate
  await clickNext(page);
  await sleep(SETTLE_MS);

  // Page 3 - Apply overrides if provided
  if (formData) {
    console.log("  Filling Page 3...");
    await fillPage3(page, formData);
  }
  await clickNext(page);
  await sleep(SETTLE_MS);

  // Page 4 - Apply overrides if provided
  if (formData) {
    console.log("  Filling Page 4...");
    await fillPage4(page, formData);
  }
  await clickNext(page);
  await sleep(SETTLE_MS);

  // Verify we reached page 5
  const atPage5 = await page.isVisible(portal.pageMarkers.page5Submit);

  if (atPage5) {
    console.log(`\n=== ✓ REVISION READY: ${appId} ===`);
    console.log(`    Permit: ${permitId}`);
    console.log("    Status: Ready to submit on Page 5\n");
    return { success: true, applicationId: appId };
  }

  const currentPage = await getCurrentPage(page);
  return {
    success: false,
    applicationId: appId,
    error: `Did not reach Page 5 (currently on page ${currentPage})`,
  };
}
