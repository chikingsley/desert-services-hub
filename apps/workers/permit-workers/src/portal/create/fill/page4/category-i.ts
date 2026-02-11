/**
 * Fill Category I - Weed Abatement (siTable:46)
 */

import type { Page } from "playwright";
import type { FormData } from "@/form-data";
import {
  clickRadio,
  fillText,
  fillTextWithSelectors,
  SETTLE_MS,
  selectControlMeasure,
  sleep,
} from "@/portal/utils/helpers";
import { selectors } from "@/portal/utils/selectors";

/**
 * Fill Category I.1 - During Weed Abatement Disturbance.
 */
async function fillCategoryI1(page: Page, data: FormData): Promise<void> {
  console.log("  Category I.1 - During Weed Abatement...");

  const i1 = selectors.categoryI1;
  if (data.categoryI1.applies) {
    await clickRadio(page, i1.applies.yes);
    // Cease operations - Contingency/None only
    await selectControlMeasure(
      page,
      data.categoryI1.ceaseOperations,
      i1.ceaseOperations
    );
    // Other - Contingency/None only
    await selectControlMeasure(page, data.categoryI1.other, i1.other);
    if (
      data.categoryI1.other === "Contingency" &&
      data.categoryI1.otherDescription
    ) {
      await sleep(SETTLE_MS);
      await fillText(
        page,
        i1.otherDescription,
        data.categoryI1.otherDescription
      );
    }
    // Note: avgDailyDisturbedAcres fields (sioTable:37-38) don't appear to exist
    // in current form state - skipping for now
  } else {
    await clickRadio(page, i1.applies.no);
  }
}

/**
 * Fill Category I.2 - Stabilization following Weed Abatement.
 */
async function fillCategoryI2(page: Page, data: FormData): Promise<void> {
  console.log("  Category I.2 - Stabilization after Weed Abatement...");

  const i2 = selectors.categoryI2;
  // Pave
  await selectControlMeasure(page, data.categoryI2.pave, i2.pave);
  // Gravel
  await selectControlMeasure(page, data.categoryI2.gravel, i2.gravel);
  // Water
  await selectControlMeasure(page, data.categoryI2.water, i2.water);
  // Dust Suppressants
  await selectControlMeasure(
    page,
    data.categoryI2.dustSuppressants,
    i2.dustSuppressants
  );
  if (data.categoryI2.dustSuppressants !== "None") {
    await sleep(SETTLE_MS);
    let usedFrequencySelector: string | null = null;
    if (data.categoryI2.suppressantFrequency) {
      const freqResult = await fillTextWithSelectors(
        page,
        [i2.suppressantFrequency, ...(i2.suppressantFrequencyFallbacks ?? [])],
        data.categoryI2.suppressantFrequency,
        "I2.suppressantFrequency"
      );
      usedFrequencySelector = freqResult.usedSelector;
    }
    if (data.categoryI2.suppressantAmount) {
      const amountSelectors = [
        i2.suppressantAmount,
        ...(i2.suppressantAmountFallbacks ?? []),
      ];
      // Filter out selector used by frequency to avoid filling same field twice
      const filtered = usedFrequencySelector
        ? amountSelectors.filter((s) => s !== usedFrequencySelector)
        : amountSelectors;
      await fillTextWithSelectors(
        page,
        filtered,
        data.categoryI2.suppressantAmount,
        "I2.suppressantAmount"
      );
    }
  }
  // Vegetation
  await selectControlMeasure(page, data.categoryI2.vegetation, i2.vegetation);
  // Other
  await selectControlMeasure(page, data.categoryI2.other, i2.other);
  if (data.categoryI2.other !== "None" && data.categoryI2.otherDescription) {
    await sleep(SETTLE_MS);
    await fillTextWithSelectors(
      page,
      [i2.otherDescription, ...(i2.otherDescriptionFallbacks ?? [])],
      data.categoryI2.otherDescription,
      "I2.otherDescription"
    );
    await sleep(SETTLE_MS);
  }
}

/**
 * Fill Category I - Weed Abatement (I.1 + I.2).
 */
export async function fillCategoryI(page: Page, data: FormData): Promise<void> {
  await fillCategoryI1(page, data);
  // I.2 controls only render when I.1 applies (they share siTable:46)
  if (data.categoryI1.applies) {
    await fillCategoryI2(page, data);
  }
}
