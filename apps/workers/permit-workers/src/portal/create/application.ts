import type { BrowserContext, Page } from "playwright";
import type { CreateResult } from "@/portal/types";
import { isDustApplicationId, SETTLE_MS, sleep } from "@/portal/utils/helpers";
import { portal } from "@/portal/utils/selectors";
import { DEFAULT_COPY_FROM_APP } from "./constants";
import {
  clickNewApplicationButton,
  handleNewAppPopup,
  handleNewAppPopupFresh,
  handleReviseAppPopup,
} from "./popup";

/**
 * Wait for the application to be created after popup submission.
 *
 * Polls for either the Page 1 email field or a valid application ID
 * to appear in the header, indicating successful creation.
 *
 * @param page - Playwright Page instance
 * @param timeoutMs - Maximum time to wait (default: 30000)
 * @returns True if application was created, false on timeout
 */
export async function waitForApplicationCreated(
  page: Page,
  timeoutMs = 30_000
): Promise<boolean> {
  console.log("  Waiting for application to be created...");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (
      (await page.isVisible(portal.pageMarkers.page1Email)) ||
      (await getCreatedApplicationId(page))
    ) {
      console.log(
        `  Application created (ID: ${await getCreatedApplicationId(page)})`
      );
      return true;
    }
    await sleep(SETTLE_MS);
  }
  console.log("  Timeout waiting for application");
  return false;
}

export async function getCreatedApplicationId(
  page: Page
): Promise<string | null> {
  const appId = await page.evaluate(
    () =>
      document
        .querySelector('[id="ThePage:applicationId"]')
        ?.textContent?.trim() || null
  );
  return appId && isDustApplicationId(appId) ? appId : null;
}

export async function createNewCompanyApplication(
  page: Page,
  context: BrowserContext,
  copyFromApp = DEFAULT_COPY_FROM_APP
): Promise<CreateResult> {
  console.log("\n[CREATE - NEW COMPANY FLOW]");
  const popup = await clickNewApplicationButton(page, context);
  if (!popup) {
    return { success: false, applicationId: null, error: "No popup" };
  }
  if (!(await handleNewAppPopup(popup, { flow: "new-company", copyFromApp }))) {
    return { success: false, applicationId: null, error: "Popup failed" };
  }
  await sleep(SETTLE_MS);
  if (!(await waitForApplicationCreated(page))) {
    return { success: false, applicationId: null, error: "Creation timed out" };
  }
  return { success: true, applicationId: await getCreatedApplicationId(page) };
}

/**
 * Create a new application with a new company - FRESH START (no copy-from).
 *
 * This flow does NOT copy from an existing application, so nothing is pre-filled.
 * Use this for the most thorough testing since all form filling must work from scratch.
 *
 * @param page - Playwright Page instance
 * @param context - Browser context for popup detection
 * @returns CreateResult with success status and application ID
 */
export async function createNewCompanyFreshApplication(
  page: Page,
  context: BrowserContext
): Promise<CreateResult> {
  console.log("\n[CREATE - NEW COMPANY FRESH (NO COPY-FROM)]");
  const popup = await clickNewApplicationButton(page, context);
  if (!popup) {
    return { success: false, applicationId: null, error: "No popup" };
  }
  if (!(await handleNewAppPopupFresh(popup, { flow: "new-company" }))) {
    return { success: false, applicationId: null, error: "Popup failed" };
  }
  await sleep(SETTLE_MS);
  if (!(await waitForApplicationCreated(page))) {
    return { success: false, applicationId: null, error: "Creation timed out" };
  }
  return { success: true, applicationId: await getCreatedApplicationId(page) };
}

export async function createExistingCompanyApplication(
  page: Page,
  context: BrowserContext,
  companyName: string,
  copyFromApp = DEFAULT_COPY_FROM_APP
): Promise<CreateResult> {
  console.log("\n[CREATE - EXISTING COMPANY FLOW]");
  const popup = await clickNewApplicationButton(page, context);
  if (!popup) {
    return { success: false, applicationId: null, error: "No popup" };
  }
  if (
    !(await handleNewAppPopup(popup, {
      flow: "existing-company",
      companyName,
      copyFromApp,
    }))
  ) {
    return { success: false, applicationId: null, error: "Popup failed" };
  }
  await sleep(SETTLE_MS);
  if (!(await waitForApplicationCreated(page))) {
    return { success: false, applicationId: null, error: "Creation timed out" };
  }
  return { success: true, applicationId: await getCreatedApplicationId(page) };
}

export function createRenewApplication(
  page: Page,
  context: BrowserContext,
  renewFromApp: string,
  companyName?: string
): Promise<CreateResult> {
  console.log(`\n[CREATE - RENEW FROM ${renewFromApp}]`);
  return companyName
    ? createExistingCompanyApplication(page, context, companyName, renewFromApp)
    : createNewCompanyApplication(page, context, renewFromApp);
}

/**
 * Create a revision of an existing active permit.
 *
 * Revisions edit the permit in-place and do NOT extend the expiration date.
 * Use this for making changes to an active permit (e.g., acreage changes).
 *
 * @param page - Playwright Page instance
 * @param context - Browser context for popup detection
 * @param revisionApp - D# of the permit to revise
 * @param revisionPurpose - Required reason/purpose for the revision
 * @returns CreateResult with success status and new revision ID
 */
export async function createReviseApplication(
  page: Page,
  context: BrowserContext,
  revisionApp: string,
  revisionPurpose: string
): Promise<CreateResult> {
  console.log(`\n[CREATE - REVISE ${revisionApp}]`);
  const popup = await clickNewApplicationButton(page, context);
  if (!popup) {
    return { success: false, applicationId: null, error: "No popup" };
  }
  if (!(await handleReviseAppPopup(popup, { revisionApp, revisionPurpose }))) {
    return { success: false, applicationId: null, error: "Popup failed" };
  }
  await sleep(SETTLE_MS);
  if (!(await waitForApplicationCreated(page))) {
    return { success: false, applicationId: null, error: "Creation timed out" };
  }
  return { success: true, applicationId: await getCreatedApplicationId(page) };
}
