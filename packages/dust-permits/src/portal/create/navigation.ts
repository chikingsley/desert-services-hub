import type { Page } from "playwright";
import {
  getCurrentPage,
  SETTLE_MS,
  sleep,
  waitForElement,
} from "@/portal/utils/helpers";
import { portal } from "@/portal/utils/selectors";

/**
 * Check if we're on the My Dust Apps page (new application button visible).
 *
 * Use this in tests instead of importing selectors directly.
 */
export async function isOnDustAppsPage(page: Page): Promise<boolean> {
  return await waitForElement(page, portal.dustApps.newApplicationBtn);
}

export { getCurrentPage } from "@/portal/utils/helpers";

export async function goToPage(
  page: Page,
  targetPage: 1 | 2 | 3 | 4
): Promise<{ success: boolean; debug: string }> {
  const stepSelectors: Record<1 | 2 | 3 | 4, string> = {
    1: portal.stepNav.page1,
    2: portal.stepNav.page2,
    3: portal.stepNav.page3,
    4: portal.stepNav.page4,
  };
  const selector = stepSelectors[targetPage];
  console.log(`\n[GO TO PAGE ${targetPage}]`);
  try {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: "visible", timeout: 10_000 });
    await loc.click();
    for (let i = 0; i < 10; i++) {
      await sleep(SETTLE_MS);
      if ((await getCurrentPage(page)) === targetPage) {
        console.log(`  Successfully reached Page ${targetPage}`);
        return { debug: `Reached page ${targetPage}`, success: true };
      }
    }
    const current = await getCurrentPage(page);
    return {
      debug: `Landed on page ${current} instead of ${targetPage}`,
      success: false,
    };
  } catch (error) {
    return {
      success: false,
      debug: `Failed to navigate to page ${targetPage}: ${error}`,
    };
  }
}
