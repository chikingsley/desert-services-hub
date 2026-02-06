/**
 * Fill Category A - Wind-Blown Dust
 *
 * 4 checkboxes - no Yes/No, always required
 */

import type { Page } from "playwright";
import type { FormData } from "@/form-data";
import {
  fillText,
  SETTLE_MS,
  setCheckbox,
  sleep,
} from "@/portal/utils/helpers";
import { selectors } from "@/portal/utils/selectors";

/**
 * Fill Category A - Wind-Blown Dust.
 */
export async function fillCategoryA(page: Page, data: FormData): Promise<void> {
  console.log("  Category A - Wind-Blown Dust...");
  console.log(
    `    soilCrust=${data.categoryA.soilCrust}, tfv=${data.categoryA.tfv}, vegetative=${data.categoryA.vegetative}, other=${data.categoryA.other}`
  );

  const catA = selectors.categoryA;

  // Debug: Check if selector exists
  const soilCrustCount = await page.locator(catA.soilCrust.yes).count();
  console.log(`    soilCrust selector found: ${soilCrustCount} elements`);

  await setCheckbox(page, catA.soilCrust.yes, data.categoryA.soilCrust);
  await setCheckbox(page, catA.tfv.yes, data.categoryA.tfv);
  await setCheckbox(page, catA.vegetative.yes, data.categoryA.vegetative);
  await setCheckbox(page, catA.other.yes, data.categoryA.other);

  if (data.categoryA.other && data.categoryA.otherDescription) {
    // Extra settle to allow conditional text field to appear
    await sleep(SETTLE_MS);
    await fillText(
      page,
      catA.otherDescription,
      data.categoryA.otherDescription
    );
  }
}
