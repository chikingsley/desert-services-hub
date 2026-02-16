/**
 * Fill Category H - Demolition (siTable:44)
 */

import type { Page } from "playwright";
import type { FormData } from "@/form-data";
import {
  clickRadio,
  fillText,
  SETTLE_MS,
  selectControlMeasure,
  setCheckbox,
  sleep,
} from "@/portal/utils/helpers";
import { selectors } from "@/portal/utils/selectors";

/**
 * Fill Category H - Demolition.
 */
export async function fillCategoryH(page: Page, data: FormData): Promise<void> {
  console.log("  Category H - Demolition...");

  const catH = selectors.categoryH;
  if (data.categoryH.applies) {
    await clickRadio(page, catH.applies.yes);
    // Use dust suppressants checkbox
    if (data.categoryH.useDustSuppressants) {
      await setCheckbox(page, catH.useDustSuppressants.yes, true);
      await sleep(SETTLE_MS);
      if (data.categoryH.suppressantFrequency) {
        await fillText(
          page,
          catH.suppressantFrequency,
          data.categoryH.suppressantFrequency
        );
      }
      if (data.categoryH.suppressantAmount) {
        await fillText(
          page,
          catH.suppressantAmount,
          data.categoryH.suppressantAmount
        );
      }
    }
    // Clean debris - Contingency/None only
    await selectControlMeasure(
      page,
      data.categoryH.cleanDebris,
      catH.cleanDebris
    );
    // Other control measure - Contingency/None only
    await selectControlMeasure(page, data.categoryH.other, catH.other);
    if (
      data.categoryH.other === "Contingency" &&
      data.categoryH.otherDescription
    ) {
      await sleep(SETTLE_MS);
      await fillText(
        page,
        catH.otherDescription,
        data.categoryH.otherDescription
      );
    }
  } else {
    await clickRadio(page, catH.applies.no);
  }
}
