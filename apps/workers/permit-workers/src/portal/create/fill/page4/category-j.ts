/**
 * Fill Category J - Blasting (siTable:48)
 */

import type { Page } from "playwright";
import type { FormData } from "@/form-data";
import {
  clickRadio,
  fillTextSafe,
  SETTLE_MS,
  selectControlMeasure,
  sleep,
} from "@/portal/utils/helpers";
import { selectors } from "@/portal/utils/selectors";

/**
 * Fill Category J - Blasting.
 */
export async function fillCategoryJ(page: Page, data: FormData): Promise<void> {
  console.log("  Category J - Blasting...");

  const catJ = selectors.categoryJ;
  if (data.categoryJ.applies) {
    await clickRadio(page, catJ.applies.yes);
  } else {
    await clickRadio(page, catJ.applies.no);
  }

  await selectControlMeasure(page, data.categoryJ.water, catJ.water);
  await selectControlMeasure(
    page,
    data.categoryJ.dustSuppressants,
    catJ.dustSuppressants
  );

  // Dust suppressant fields (shown when dust suppressants is Primary or Contingency)
  if (data.categoryJ.dustSuppressants !== "None") {
    await sleep(SETTLE_MS);
    await fillTextSafe(
      page,
      catJ.suppressantFrequency,
      data.categoryJ.suppressantFrequency,
      {
        labelFallback: "Frequency of application (Dust suppressants)",
      }
    );
    await fillTextSafe(
      page,
      catJ.suppressantAmount,
      data.categoryJ.suppressantAmount,
      {
        labelFallback: "Amount (Dust suppressants)",
      }
    );
  }

  // Other (Contingency/None only, no Primary)
  await selectControlMeasure(page, data.categoryJ.other, catJ.other);
  if (data.categoryJ.other === "Contingency") {
    await sleep(SETTLE_MS);
    await fillTextSafe(
      page,
      catJ.otherDescription,
      data.categoryJ.otherDescription,
      {
        labelFallback: "Other",
      }
    );
  }
}
