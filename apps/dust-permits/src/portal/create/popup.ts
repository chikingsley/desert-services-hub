import type { BrowserContext, Page } from "playwright";
import type { NewAppPopupOptions, ReviseAppPopupOptions } from "@/portal/types";
import {
  clickInFrames,
  fillText,
  findFrameWithSelector,
  SETTLE_MS,
  setCheckbox,
  sleep,
  waitForElement,
  waitForFrameElement,
  waitForPopup,
} from "@/portal/utils/helpers";
import { portal } from "@/portal/utils/selectors";

export async function clickNewApplicationButton(
  page: Page,
  context: BrowserContext
): Promise<Page | null> {
  console.log("\n[CLICK NEW APPLICATION]");

  // Wait for the button to be ready (with longer timeout for page stability)
  const buttonReady = await waitForElement(
    page,
    portal.dustApps.newApplicationBtn,
    15_000
  );
  if (!buttonReady) {
    return null;
  }

  // Give the page a moment to stabilize after navigation
  await sleep(SETTLE_MS);

  const pagesBefore = context.pages().length;
  const popupPromise = page
    .waitForEvent("popup", { timeout: 20_000 })
    .catch(() => null);

  await page.locator(portal.dustApps.newApplicationBtn).first().click();

  console.log("  Clicked New Application, waiting for popup...");
  let popup = await popupPromise;
  if (!popup) {
    popup = (await waitForPopup(context, pagesBefore)) ?? null;
  }
  if (!popup) {
    return null;
  }

  await popup.waitForLoadState("domcontentloaded");
  console.log("  Popup opened");
  return popup;
}

/**
 * Helper: Check "New Company" checkbox in popup.
 */
async function selectNewCompanyInPopup(popupPage: Page): Promise<void> {
  console.log("  Step 4: Checking 'New Company'...");
  const newCompFrame = await findFrameWithSelector(
    popupPage,
    portal.newAppPopup.newCompanyCheckbox
  );
  if (!newCompFrame) {
    throw new Error("New company checkbox not found");
  }
  await setCheckbox(newCompFrame, portal.newAppPopup.newCompanyCheckbox, true);
}

/**
 * Helper: Handle company selection in the popup (step 4).
 * Extracted to reduce cognitive complexity of main function.
 */
async function selectCompanyInPopup(
  popupPage: Page,
  options: NewAppPopupOptions
): Promise<void> {
  if (options.flow === "existing-company" && options.companyName) {
    console.log(`  Step 4: Selecting company "${options.companyName}"...`);

    // Try to show all companies
    const showAllFrame = await findFrameWithSelector(
      popupPage,
      portal.newAppPopup.showAllCompaniesDropdown
    );
    if (showAllFrame) {
      await showAllFrame.evaluate((sel) => {
        const s = document.querySelector(sel) as HTMLSelectElement | null;
        if (s) {
          s.value = "all";
          s.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, portal.newAppPopup.showAllCompaniesDropdown);
      await waitForFrameElement(
        popupPage,
        portal.newAppPopup.companyRadioButtons
      );
    }

    // Find and click the company radio button
    const radioFrame = await findFrameWithSelector(
      popupPage,
      portal.newAppPopup.companyRadioButtons
    );
    const found =
      radioFrame &&
      (await radioFrame.evaluate((name) => {
        const radios = [
          ...document.querySelectorAll('input[name="RadioButtons"]'),
        ];
        for (const r of radios) {
          const rowText = r.closest("tr")?.textContent?.toLowerCase() || "";
          if (rowText.includes(name.toLowerCase())) {
            (r as HTMLInputElement).click();
            return true;
          }
        }
        return false;
      }, options.companyName));

    if (!found) {
      console.log("    Company not found, falling back to New Company");
      await selectNewCompanyInPopup(popupPage);
    }
  } else {
    await selectNewCompanyInPopup(popupPage);
  }
}

/**
 * Handle the multi-step "New Application" popup wizard.
 *
 * Steps:
 * 1. Click Continue
 * 2. Check "Re-application" checkbox
 * 3. Select application to copy from
 * 4. Select company (new or existing)
 * 5. Click Create
 *
 * @param popupPage - The popup Page instance
 * @param options - Configuration for the popup flow
 * @returns True if popup was handled successfully
 */
export async function handleNewAppPopup(
  popupPage: Page,
  options: NewAppPopupOptions
): Promise<boolean> {
  try {
    await sleep(SETTLE_MS);

    // Step 1: Continue
    console.log("  Step 1: Clicking Continue...");
    const continuClicked = await clickInFrames(
      popupPage,
      portal.newAppPopup.continueBtn
    );
    if (!continuClicked) {
      throw new Error("Continue button not found");
    }
    await waitForFrameElement(
      popupPage,
      portal.newAppPopup.reapplicationCheckbox
    );

    // Step 2: Re-application checkbox
    console.log("  Step 2: Checking Re-application...");
    const reappFrame = await findFrameWithSelector(
      popupPage,
      portal.newAppPopup.reapplicationCheckbox
    );
    if (!reappFrame) {
      throw new Error("Re-application checkbox not found");
    }
    await setCheckbox(
      reappFrame,
      portal.newAppPopup.reapplicationCheckbox,
      true
    );
    await waitForFrameElement(
      popupPage,
      portal.newAppPopup.copyFromAppDropdown
    );

    // Step 3: Select app to copy from
    console.log(`  Step 3: Selecting ${options.copyFromApp} to copy from...`);
    const dropdownFrame = await findFrameWithSelector(
      popupPage,
      portal.newAppPopup.copyFromAppDropdown
    );
    if (!dropdownFrame) {
      throw new Error("Copy-from dropdown not found");
    }
    const selected = await dropdownFrame.evaluate(
      ({ sel, app }) => {
        const select = document.querySelector(sel) as HTMLSelectElement | null;
        if (!select) {
          return false;
        }
        const opt = [...select.options].find((o) =>
          (o.textContent || "").includes(app)
        );
        if (!opt) {
          return false;
        }
        select.value = opt.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
      {
        app: options.copyFromApp,
        sel: portal.newAppPopup.copyFromAppDropdown,
      }
    );
    if (!selected) {
      throw new Error(`Could not find app ${options.copyFromApp}`);
    }
    await sleep(SETTLE_MS);

    // Step 4: Company selection (delegated to helper)
    await selectCompanyInPopup(popupPage, options);
    await sleep(SETTLE_MS);

    // Step 5: Create
    console.log("  Step 5: Clicking Create...");
    const createClicked = await clickInFrames(
      popupPage,
      portal.newAppPopup.createAnchor
    );
    if (!createClicked) {
      throw new Error("Create button not found");
    }

    return true;
  } catch (error) {
    console.log(`  Popup handler failed: ${error}`);
    return false;
  }
}

/**
 * Handle the "New Application" popup WITHOUT copying from existing app.
 *
 * This is the "fresh start" flow - nothing pre-filled. Use this for the
 * most thorough testing since no data is pre-populated from a copied app.
 *
 * Steps:
 * 1. Click Continue
 * 2. Select company (new or existing) - skip re-application checkbox entirely
 * 3. Click Create
 *
 * @param popupPage - The popup Page instance
 * @param options - Configuration for the popup flow (flow type and optional company name)
 * @returns True if popup was handled successfully
 */
export async function handleNewAppPopupFresh(
  popupPage: Page,
  options: { flow: "new-company" | "existing-company"; companyName?: string }
): Promise<boolean> {
  try {
    await sleep(SETTLE_MS);

    // Step 1: Continue
    console.log("  Step 1: Clicking Continue...");
    const continueClicked = await clickInFrames(
      popupPage,
      portal.newAppPopup.continueBtn
    );
    if (!continueClicked) {
      throw new Error("Continue button not found");
    }
    // Wait for the re-application checkbox to appear (indicates page loaded)
    await waitForFrameElement(
      popupPage,
      portal.newAppPopup.reapplicationCheckbox
    );

    // Step 2: Company selection - skip re-application checkbox entirely
    // (Don't check the "copy from existing application" checkbox)
    await selectCompanyInPopup(popupPage, {
      companyName: options.companyName,
      copyFromApp: "",
      flow: options.flow, // Not used since we're not copying
    });
    await sleep(SETTLE_MS);

    // Step 3: Create
    console.log("  Step 3: Clicking Create...");
    const createClicked = await clickInFrames(
      popupPage,
      portal.newAppPopup.createAnchor
    );
    if (!createClicked) {
      throw new Error("Create button not found");
    }

    return true;
  } catch (error) {
    console.log(`  Fresh popup handler failed: ${error}`);
    return false;
  }
}

/**
 * Handle the "Application Revision" popup wizard.
 *
 * Used to revise an existing active permit (edits in-place, doesn't extend dates).
 *
 * Steps:
 * 1. Click Continue
 * 2. Check "Application Revision" checkbox
 * 3. Wait for revision fields to appear
 * 4. Select application to revise from dropdown
 * 5. Fill revision purpose textarea
 * 6. Click Create
 *
 * @param popupPage - The popup Page instance
 * @param options - Configuration for the revision flow
 * @returns True if popup was handled successfully
 */
export async function handleReviseAppPopup(
  popupPage: Page,
  options: Omit<ReviseAppPopupOptions, "flow">
): Promise<boolean> {
  try {
    await sleep(SETTLE_MS);

    // Step 1: Continue
    console.log("  Step 1: Clicking Continue...");
    const continueClicked = await clickInFrames(
      popupPage,
      portal.newAppPopup.continueBtn
    );
    if (!continueClicked) {
      throw new Error("Continue button not found");
    }
    await waitForFrameElement(popupPage, portal.newAppPopup.revisionCheckbox);

    // Step 2: Check revision checkbox
    console.log("  Step 2: Checking Application Revision...");
    const revisionFrame = await findFrameWithSelector(
      popupPage,
      portal.newAppPopup.revisionCheckbox
    );
    if (!revisionFrame) {
      throw new Error("Revision checkbox not found");
    }
    await setCheckbox(revisionFrame, portal.newAppPopup.revisionCheckbox, true);
    await waitForFrameElement(
      popupPage,
      portal.newAppPopup.revisionAppDropdown
    );

    // Step 3: Select application to revise
    console.log(`  Step 3: Selecting ${options.revisionApp} to revise...`);
    const dropdownFrame = await findFrameWithSelector(
      popupPage,
      portal.newAppPopup.revisionAppDropdown
    );
    if (!dropdownFrame) {
      throw new Error("Revision app dropdown not found");
    }
    const selected = await dropdownFrame.evaluate(
      ({ sel, app }) => {
        const select = document.querySelector(sel) as HTMLSelectElement | null;
        if (!select) {
          return false;
        }
        const opt = [...select.options].find((o) =>
          (o.textContent || "").includes(app)
        );
        if (!opt) {
          return false;
        }
        select.value = opt.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
      {
        app: options.revisionApp,
        sel: portal.newAppPopup.revisionAppDropdown,
      }
    );
    if (!selected) {
      throw new Error(`Could not find app ${options.revisionApp} to revise`);
    }
    await sleep(SETTLE_MS);

    // Step 4: Fill revision purpose
    console.log("  Step 4: Filling revision purpose...");
    const purposeFrame = await findFrameWithSelector(
      popupPage,
      portal.newAppPopup.revisionPurposeTextarea
    );
    if (!purposeFrame) {
      throw new Error("Revision purpose textarea not found");
    }
    await fillText(
      purposeFrame,
      portal.newAppPopup.revisionPurposeTextarea,
      options.revisionPurpose
    );
    await sleep(SETTLE_MS);

    // Step 5: Create
    console.log("  Step 5: Clicking Create...");
    const createClicked = await clickInFrames(
      popupPage,
      portal.newAppPopup.createAnchor
    );
    if (!createClicked) {
      throw new Error("Create button not found");
    }

    return true;
  } catch (error) {
    console.log(`  Revise popup handler failed: ${error}`);
    return false;
  }
}
