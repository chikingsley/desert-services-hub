/**
 * Portal Login
 *
 * Login to the Maricopa County Dust Permit Portal.
 * Handles disclaimer, credential entry, and login verification.
 */

import type { Frame, Page } from "playwright";
import { config, credentials } from "./config";
import { clickFirstVisibleLocator, fillText, waitForElement } from "./helpers";
import { portal } from "./selectors";

/**
 * Handle the disclaimer page if present.
 *
 * Uses Playwright's native waitForURL instead of polling.
 */
export async function handleDisclaimer(page: Page): Promise<boolean> {
  if (!page.url().includes("disclaimer")) {
    return true;
  }

  console.log("  Clicking Agree on disclaimer...");
  try {
    await page.locator(portal.disclaimer.agreeButton).first().click();
    // Wait for URL to change away from disclaimer page
    await page.waitForURL((url) => !url.href.includes("disclaimer"), {
      timeout: 10_000,
    });
    return true;
  } catch {
    // Check if we navigated away despite the error
    return !page.url().includes("disclaimer");
  }
}

/**
 * Find the login context - form can be on main page or in iframes.
 */
async function findLoginContext(page: Page): Promise<Page | Frame> {
  const onPage = await page
    .locator(portal.login.passwordInput)
    .first()
    .count()
    .catch(() => 0);

  if (onPage > 0) {
    return page;
  }

  for (const frame of page.frames()) {
    try {
      const n = await frame.locator(portal.login.passwordInput).first().count();
      if (n > 0) {
        return frame;
      }
    } catch {
      // Ignore detached frames
    }
  }

  return page;
}

/**
 * Login to the Maricopa County Dust Permit Portal.
 *
 * Performs the full login flow:
 * 1. Navigate to portal URL
 * 2. Handle disclaimer page if present
 * 3. Fill credentials from environment variables
 * 4. Click login and wait for success indicators
 *
 * Requires DUST_PERMIT_USERNAME and DUST_PERMIT_PASSWORD in .env
 */
export async function login(page: Page): Promise<boolean> {
  console.log("\n[LOGIN]");

  console.log("  Navigating to portal...");
  await page.goto(config.dustPermitUrl, {
    timeout: 60_000,
    waitUntil: "networkidle",
  });

  if (!(await handleDisclaimer(page))) {
    console.log("  ERROR: Could not pass disclaimer page");
    return false;
  }

  const alreadyLoggedIn = await page
    .locator(portal.loggedIn.myDustApps)
    .isVisible()
    .catch(() => false);

  if (alreadyLoggedIn) {
    console.log("  Already logged in!");
    return true;
  }

  if (!(credentials.username && credentials.password)) {
    console.log("  ERROR: Missing credentials in .env");
    return false;
  }

  const ctx = await findLoginContext(page);

  console.log("  Filling credentials...");

  await waitForElement(ctx as Page, portal.login.passwordInput, 15_000);

  await fillText(ctx, portal.login.emailInput, credentials.username);
  await fillText(ctx, portal.login.passwordInput, credentials.password);

  // Verify credentials populated
  const values = await ctx.evaluate(() => {
    const emailEl =
      (document.querySelector(
        'input[id*="userName"]'
      ) as HTMLInputElement | null) ||
      (document.querySelector('input[type="text"]') as HTMLInputElement | null);
    const passEl =
      (document.querySelector(
        'input[id*="password"]'
      ) as HTMLInputElement | null) ||
      (document.querySelector(
        'input[type="password"]'
      ) as HTMLInputElement | null);
    return {
      email: (emailEl?.value || "").trim(),
      password: (passEl?.value || "").trim(),
    };
  });

  if (!(values.email && values.password)) {
    console.log(
      `  ERROR: Credentials did not populate (emailLen=${values.email.length}, passLen=${values.password.length})`
    );
    return false;
  }

  console.log("  Clicking Login...");

  let clickedLogin = await clickFirstVisibleLocator(ctx, [
    portal.login.loginBtn,
    'a:has(img[alt="Login"])',
    'input[type="submit"][value="Login"]',
    'input[type="submit"]',
  ]);

  // Fallback: click via DOM
  if (!clickedLogin) {
    clickedLogin = await ctx.evaluate(() => {
      const loginAnchor = document.querySelector(
        'a[id*="loginBtn"]'
      ) as HTMLElement | null;
      if (loginAnchor && loginAnchor.offsetParent !== null) {
        loginAnchor.click();
        return true;
      }

      const nodes = [
        ...document.querySelectorAll(
          "input[type=submit], input[type=button], button, a"
        ),
      ].filter((el) => (el as HTMLElement).offsetParent !== null);

      const match = nodes.find((el) => {
        const tag = el.tagName.toLowerCase();
        if (tag === "input") {
          const v = (el as HTMLInputElement).value || "";
          return v.trim().toLowerCase() === "login";
        }
        return (el.textContent || "").trim().toLowerCase() === "login";
      }) as HTMLElement | undefined;

      match?.click();
      return Boolean(match);
    });
  }

  if (!clickedLogin) {
    console.log("  ERROR: Could not find Login button");
    return false;
  }

  console.log("  Waiting for login...");

  // Race all success indicators in parallel — whichever appears first wins.
  // Sequential || would take up to 75s worst case; racing caps at 25s.
  const raceForTrue = (p: Promise<boolean>) =>
    p.then((v) => {
      if (v) {
        return v;
      }
      throw new Error("not found");
    });
  const ok = await Promise.any([
    raceForTrue(waitForElement(page, portal.loggedIn.myDustApps, 25_000)),
    raceForTrue(waitForElement(page, portal.loggedIn.welcomeTextAlt, 25_000)),
    raceForTrue(waitForElement(page, portal.loggedIn.logoutLink, 25_000)),
  ]).catch(() => false);

  if (ok) {
    console.log("  Login successful!");
    return true;
  }

  console.log("  Login may have failed - check browser");
  return false;
}
