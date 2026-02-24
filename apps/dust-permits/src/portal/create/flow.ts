import { getPermitById } from "@lib/db/repositories/dust-permit";
import type { BrowserContext, Page } from "playwright";
import type { DeepPartial, FormData } from "@/form-data";
import { DEFAULTS, deepMerge, oneYearFromNow, today } from "@/form-data";
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
  checkExpedited,
  clickPaymentContinue,
  confirmPayment,
  fillPage1,
  fillPage2,
  fillPage2Renew,
  fillPage2WithMapData,
  fillPage3,
  fillPage4,
  fillPage5,
  fillPaymentPage1,
  submitApplication,
} from "./fill";

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
      applicationId: null,
      error: "Invalid options",
      reachedPage5: false,
      success: false,
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

  const page5Result = await fillPage5(page);
  const reachedPage5 = page5Result.reachedPage5;
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
      applicationId: null,
      error: "Failed to navigate to My Dust Apps",
      reachedPage5: false,
      success: false,
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
      applicationId: null,
      error: "New Application button not found",
      reachedPage5: false,
      success: false,
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
      applicationId: null,
      error: "Invalid flow configuration",
      reachedPage5: false,
      success: false,
    };
  }

  if (!createResult.success) {
    return {
      applicationId: null,
      error: createResult.error,
      reachedPage5: false,
      success: false,
    };
  }

  // 3. Fill all pages
  console.log("[2/3] Filling forms...");

  // Page 1
  await fillPage1(page, formData, isNewCompany ? "full" : "partial");

  // Page 2 (map) - draw polygon from NOI lat/lng by snapping to the parcel
  await clickNext(page);
  await sleep(SETTLE_MS);

  if (flow === "renew") {
    console.log("  Handling Page 2 (Project Location) for renewal...");
    const page2Success = await fillPage2Renew(
      page,
      context,
      options.copyFromApp
    );
    if (!page2Success) {
      return {
        applicationId: createResult.applicationId,
        error:
          "Page 2 failed: location/map data not confirmed. Application created but incomplete.",
        reachedPage5: false,
        success: false,
      };
    }
  } else {
    const lat = formData.site.latitude;
    const lng = formData.site.longitude;

    if (typeof lat === "number" && typeof lng === "number") {
      console.log("  Handling Page 2 (Project Location)...");

      const { buildPermitMapDataFromSiteCoordinates } = await import(
        "@/lib/site-drawing"
      );

      const { mapData, targetParcelDashed, parcel } =
        await buildPermitMapDataFromSiteCoordinates({
          acresDisturbed: formData.site.acresDisturbed,
          latitude: lat,
          longitude: lng,
        });

      console.log(
        `  Parcel from NOI point: ${targetParcelDashed}${parcel.owner ? ` (${parcel.owner})` : ""}`
      );

      const page2Success = await fillPage2WithMapData(
        page,
        context,
        mapData,
        targetParcelDashed
      );
      if (!page2Success) {
        return {
          applicationId: createResult.applicationId,
          error:
            "Page 2 failed: location/map data not confirmed. Application created but incomplete.",
          reachedPage5: false,
          success: false,
        };
      }
    } else {
      console.log(
        "  ⚠ No site latitude/longitude in FormData.site; skipping map drawing (manual required)."
      );
      await clickNext(page);
    }
  }

  await sleep(SETTLE_MS);

  // Page 3
  await fillPage3(page, formData);

  // Navigate to Page 4
  await clickNext(page);
  await sleep(SETTLE_MS);

  // Page 4
  await fillPage4(page, formData);

  // Page 5
  const page5Result = await fillPage5(page);
  const reachedPage5 = page5Result.reachedPage5;
  const currentPage = page5Result.currentPage;

  const { applicationId } = createResult;

  console.log("\n=== FLOW COMPLETE ===");
  console.log(`    Application: ${applicationId}`);
  console.log(`    Reached Page 5: ${reachedPage5}`);
  console.log(`    Current Page: ${currentPage}`);

  if (!reachedPage5) {
    const ts = Date.now();
    const screenshotPath = `/tmp/create-flow-page5-not-reached-${ts}.png`;
    const htmlPath = `/tmp/create-flow-page5-not-reached-${ts}.html`;
    try {
      await page.screenshot({ fullPage: true, path: screenshotPath });
      const { writeFile } = await import("node:fs/promises");
      await writeFile(htmlPath, await page.content());
      console.log(`    Debug screenshot: ${screenshotPath}`);
      console.log(`    Debug HTML: ${htmlPath}`);
    } catch {
      console.log("    (debug capture failed)");
    }
  }

  return {
    applicationId,
    reachedPage5,
    success: true,
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
      endDate: renewalEndDate,
      startDate: renewalStartDate,
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
    endDate: renewalEndDate,
    startDate: renewalStartDate,
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
    return { error: "Failed to navigate to My Dust Apps", success: false };
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
    return { error: result.error, success: false };
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
      applicationId: appId,
      error:
        "Page 2 failed: location/map data not confirmed. Application created but incomplete.",
      success: false,
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
  const page5Result = await fillPage5(page);
  const atPage5 = page5Result.reachedPage5;

  if (atPage5) {
    console.log(`\n=== ✓ RENEWAL READY: ${appId} ===`);
    console.log(`    Copied from: ${permitId}`);
    console.log("    Status: Ready to submit on Page 5\n");
    return { applicationId: appId, success: true };
  }

  return {
    applicationId: appId,
    error: `Did not reach Page 5 (currently on page ${page5Result.currentPage})`,
    success: false,
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
    return { error: "Failed to navigate to My Dust Apps", success: false };
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
    return { error: result.error, success: false };
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
  const page5Result = await fillPage5(page);
  const atPage5 = page5Result.reachedPage5;

  if (atPage5) {
    console.log(`\n=== ✓ REVISION READY: ${appId} ===`);
    console.log(`    Permit: ${permitId}`);
    console.log("    Status: Ready to submit on Page 5\n");
    return { applicationId: appId, success: true };
  }

  return {
    applicationId: appId,
    error: `Did not reach Page 5 (currently on page ${page5Result.currentPage})`,
    success: false,
  };
}

// ============================================================================
// Renew + Submit + Pay (Full gated flow with operator checkpoints)
// ============================================================================

/** Result of the full renew-and-pay flow. */
export interface RenewAndPayResult {
  amount?: string;
  applicationId?: string;
  cardLastFour?: string;
  convenienceFee?: string;
  error?: string;
  /** What stage the flow reached before stopping or completing */
  stage:
    | "renew-failed"
    | "page5-ready"
    | "submit-failed"
    | "submitted-no-payment"
    | "payment-page1"
    | "payment-continue-failed"
    | "payment-review"
    | "paid";
  success: boolean;
  totalPaid?: string;
}

/**
 * Renew a permit, submit it, and pay — pure automation, no checkpoints.
 *
 * Flow: renewPermitFull (pages 1-5) → set expedited → submit
 *       → fill payment page 1 → continue to review → confirm payment
 *
 * Payment data comes from DEFAULTS.payment (populated from PAYMENT_* env vars).
 * Checkpoints are an orchestration concern — add them at the call site
 * (test or API handler) between individual steps.
 */
export async function renewAndPayFull(
  page: Page,
  context: BrowserContext,
  permitId: string,
  companyName: string,
  options?: { expedited?: boolean; dryRun?: boolean }
): Promise<RenewAndPayResult> {
  const expedited = options?.expedited ?? false;
  const dryRun = options?.dryRun ?? false;

  // Phase 1: Renew to Page 5
  const renewResult = await renewPermitFull(
    page,
    context,
    permitId,
    companyName
  );
  if (!renewResult.success) {
    return {
      applicationId: renewResult.applicationId,
      error: renewResult.error,
      stage: "renew-failed",
      success: false,
    };
  }

  const appId = renewResult.applicationId;
  console.log(`  Renewal created: ${appId}`);

  // Set expedited checkbox
  if (expedited) {
    await checkExpedited(page, true);
  }

  // Phase 2: Submit
  console.log("  Submitting...");
  const submitResult = await submitApplication(page);
  console.log(
    `  Submit: success=${submitResult.success}, redirect=${submitResult.redirectedToPayment}`
  );

  if (!submitResult.success) {
    return {
      applicationId: appId,
      error: `Submit failed: ${submitResult.error}`,
      stage: "submit-failed",
      success: false,
    };
  }

  if (!submitResult.redirectedToPayment) {
    return {
      applicationId: appId,
      stage: "submitted-no-payment",
      success: true,
    };
  }

  // Phase 3: Fill payment page 1
  const fillReport = await fillPaymentPage1(page, DEFAULTS.payment);
  console.log(`  Filled: ${fillReport.filledFields.join(", ")}`);

  if (!fillReport.success) {
    return {
      applicationId: appId,
      error: `Payment fill failed: ${fillReport.failedFields.join(", ")}`,
      stage: "payment-page1",
      success: false,
    };
  }

  // Advance to review page
  const continued = await clickPaymentContinue(page);
  if (!continued) {
    return {
      applicationId: appId,
      error: "Failed to advance to payment review page",
      stage: "payment-continue-failed",
      success: false,
    };
  }

  // Read amounts via dry run
  const review = await confirmPayment(page, { dryRun: true });

  if (dryRun) {
    return {
      amount: review.amount,
      applicationId: appId,
      convenienceFee: review.convenienceFee,
      stage: "payment-review",
      success: true,
      totalPaid: review.totalPaid,
    };
  }

  // Phase 4: Pay
  console.log("  Processing payment...");
  const payResult = await confirmPayment(page, { dryRun: false });
  console.log(
    `  Payment: success=${payResult.success}, total=${payResult.totalPaid}`
  );

  return {
    amount: payResult.amount,
    applicationId: appId,
    cardLastFour: payResult.cardLastFour,
    convenienceFee: payResult.convenienceFee,
    stage: "paid",
    success: payResult.success,
    totalPaid: payResult.totalPaid,
  };
}
