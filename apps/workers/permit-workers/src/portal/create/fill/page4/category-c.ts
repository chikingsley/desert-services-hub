/**
 * Fill Category C - Disturbed Surface Stabilization
 *
 * Four subsections: C.1, C.2, C.3, C.4
 * No Yes/No, always required
 */

import type { Page } from "playwright";
import type { FormData } from "@/form-data";
import {
  clickRadioWithSelectors,
  fillText,
  fillTextWithSelectors,
  SETTLE_MS,
  selectControlMeasure,
  setCheckbox,
  setCheckboxWithSelectors,
  sleep,
} from "@/portal/utils/helpers";
import { selectors } from "@/portal/utils/selectors";

/**
 * Fill Category C.1 - Before/After Daily Construction.
 */
async function fillCategoryC1(page: Page, data: FormData): Promise<void> {
  console.log("  Category C.1 - Before/After Construction...");

  const c1 = selectors.categoryC1;
  await selectControlMeasure(page, data.categoryC1.preWater, c1.preWater);
  await selectControlMeasure(page, data.categoryC1.phaseWork, c1.phaseWork);
  await selectControlMeasure(page, data.categoryC1.other, c1.other);

  if (data.categoryC1.otherDescription) {
    await fillText(page, c1.otherDescription, data.categoryC1.otherDescription);
  }
}

/**
 * Fill Category C.2 - During Active Operations.
 */
async function fillCategoryC2(page: Page, data: FormData): Promise<void> {
  console.log("  Category C.2 - During Active Operations...");

  const c2 = selectors.categoryC2;
  await selectControlMeasure(
    page,
    data.categoryC2.visiblyMoist,
    c2.visiblyMoist
  );
  await selectControlMeasure(page, data.categoryC2.astm, c2.astm);
  await selectControlMeasure(
    page,
    data.categoryC2.suppressants,
    c2.suppressants
  );
  await selectControlMeasure(
    page,
    data.categoryC2.windBarriers,
    c2.windBarriers
  );
  await selectControlMeasure(page, data.categoryC2.other, c2.other);

  // C.2 conditional fields - Dust suppressants details
  // Extra settle to allow conditional fields to render after radio clicks
  await sleep(SETTLE_MS);
  if (data.categoryC2.suppressants !== "None") {
    if (data.categoryC2.suppressantFrequency) {
      await fillText(
        page,
        c2.suppressantFrequency,
        data.categoryC2.suppressantFrequency
      );
    }
    if (data.categoryC2.suppressantAmount) {
      await fillText(
        page,
        c2.suppressantAmount,
        data.categoryC2.suppressantAmount
      );
    }
  }

  // Other description (appears if other is Primary or Contingency)
  if (data.categoryC2.other !== "None" && data.categoryC2.otherDescription) {
    await fillText(page, c2.otherDescription, data.categoryC2.otherDescription);
  }
}

/**
 * Fill Category C.3 - Inactive Periods.
 */
async function fillCategoryC3(page: Page, data: FormData): Promise<void> {
  console.log("  Category C.3 - Inactive Periods...");

  const c3 = selectors.categoryC3;
  await selectControlMeasure(page, data.categoryC3.applyWater, c3.applyWater);
  await selectControlMeasure(
    page,
    data.categoryC3.surfaceGravel,
    c3.surfaceGravel
  );
  await selectControlMeasure(
    page,
    data.categoryC3.suppressants,
    c3.suppressants
  );
  await selectControlMeasure(page, data.categoryC3.coverTarps, c3.coverTarps);
  await selectControlMeasure(page, data.categoryC3.vegetative, c3.vegetative);
  await selectControlMeasure(page, data.categoryC3.other, c3.other);

  // C.3 conditional fields - Dust suppressants details
  await sleep(SETTLE_MS);
  if (data.categoryC3.suppressants !== "None") {
    if (data.categoryC3.suppressantFrequency) {
      await fillText(
        page,
        c3.suppressantFrequency,
        data.categoryC3.suppressantFrequency
      );
    }
    if (data.categoryC3.suppressantAmount) {
      await fillText(
        page,
        c3.suppressantAmount,
        data.categoryC3.suppressantAmount
      );
    }
  }

  if (data.categoryC3.other !== "None" && data.categoryC3.otherDescription) {
    await fillText(page, c3.otherDescription, data.categoryC3.otherDescription);
  }
}

/**
 * Fill Category C.4 - Permanent Stabilization.
 */
async function fillCategoryC4(page: Page, data: FormData): Promise<void> {
  console.log("  Category C.4 - Permanent Stabilization...");

  const c4 = selectors.categoryC4;
  await selectControlMeasure(page, data.categoryC4.pave, c4.pave);
  await selectControlMeasure(page, data.categoryC4.gravel, c4.gravel);
  await selectControlMeasure(
    page,
    data.categoryC4.suppressants,
    c4.suppressants
  );
  await selectControlMeasure(page, data.categoryC4.vegetative, c4.vegetative);
  await selectControlMeasure(
    page,
    data.categoryC4.restrictAccess,
    c4.restrictAccess
  );
  await selectControlMeasure(
    page,
    data.categoryC4.applyWaterPrevent,
    c4.applyWaterPrevent
  );
  await selectControlMeasure(
    page,
    data.categoryC4.preventAccess,
    c4.preventAccess
  );
  await selectControlMeasure(
    page,
    data.categoryC4.restoreVegetation,
    c4.restoreVegetation
  );
  await selectControlMeasure(page, data.categoryC4.other, c4.other);

  // C.4 CONDITIONAL FIELDS
  await sleep(SETTLE_MS);

  // Pave timing (appears if pave is selected)
  if (data.categoryC4.pave !== "None" && data.categoryC4.paveWhen) {
    const paveWhenOption = data.categoryC4.paveWhen;
    const primarySelector = c4.paveWhen[paveWhenOption];
    const fallbacks = c4.paveWhenFallbacks?.[paveWhenOption] ?? [];
    await clickRadioWithSelectors(
      page,
      [primarySelector, ...fallbacks],
      `C4.paveWhen.${paveWhenOption}`
    );
  }

  // Dust Suppressants details
  if (data.categoryC4.suppressants !== "None") {
    let usedFrequencySelector: string | null = null;
    if (data.categoryC4.suppressantFrequency) {
      const freqResult = await fillTextWithSelectors(
        page,
        [c4.suppressantFrequency, ...(c4.suppressantFrequencyFallbacks ?? [])],
        data.categoryC4.suppressantFrequency,
        "C4.suppressantFrequency"
      );
      usedFrequencySelector = freqResult.usedSelector;
    }
    if (data.categoryC4.suppressantAmount) {
      const amountSelectors = [
        c4.suppressantAmount,
        ...(c4.suppressantAmountFallbacks ?? []),
      ];
      // Filter out selector used by frequency to avoid filling same field twice
      const filtered = usedFrequencySelector
        ? amountSelectors.filter((s) => s !== usedFrequencySelector)
        : amountSelectors;
      await fillTextWithSelectors(
        page,
        filtered,
        data.categoryC4.suppressantAmount,
        "C4.suppressantAmount"
      );
    }
  }

  // Apply Water Prevent methods - GROUP 1
  if (data.categoryC4.applyWaterPrevent !== "None") {
    await sleep(SETTLE_MS);
    const methods1 = data.categoryC4.applyWaterPreventMethods;
    const awpMethods = c4.applyWaterPreventMethods;
    if (methods1?.includes("ditches")) {
      await setCheckbox(page, awpMethods.ditches, true);
    }
    if (methods1?.includes("fences")) {
      await setCheckbox(page, awpMethods.fences, true);
    }
    if (methods1?.includes("berms")) {
      await setCheckbox(page, awpMethods.berms, true);
    }
    if (methods1?.includes("shrubs")) {
      await setCheckbox(page, awpMethods.shrubs, true);
    }
    if (methods1?.includes("trees")) {
      await setCheckbox(page, awpMethods.trees, true);
    }
    if (methods1?.includes("other")) {
      const otherText = data.categoryC4.applyWaterPreventOtherText.trim();
      if (otherText) {
        await setCheckbox(page, awpMethods.other, true);
        await sleep(SETTLE_MS);
        await fillTextWithSelectors(
          page,
          c4.applyWaterPreventOtherText,
          otherText,
          "C4.applyWaterPreventOtherText"
        );
      } else {
        throw new Error(
          "Invalid FormData: categoryC4.applyWaterPreventMethods includes 'other' but applyWaterPreventOtherText is empty"
        );
      }
    }
  }

  // Prevent Access methods - GROUP 2 (uses fallback selectors due to index drift)
  if (data.categoryC4.preventAccess !== "None") {
    await sleep(SETTLE_MS);
    const methods2 = data.categoryC4.preventAccessMethods;
    const paMethods = c4.preventAccessMethods;
    if (methods2?.includes("ditches")) {
      await setCheckboxWithSelectors(
        page,
        paMethods.ditches,
        true,
        "C4.preventAccessMethods.ditches"
      );
    }
    if (methods2?.includes("fences")) {
      await setCheckboxWithSelectors(
        page,
        paMethods.fences,
        true,
        "C4.preventAccessMethods.fences"
      );
    }
    if (methods2?.includes("berms")) {
      await setCheckboxWithSelectors(
        page,
        paMethods.berms,
        true,
        "C4.preventAccessMethods.berms"
      );
    }
    if (methods2?.includes("shrubs")) {
      await setCheckboxWithSelectors(
        page,
        paMethods.shrubs,
        true,
        "C4.preventAccessMethods.shrubs"
      );
    }
    if (methods2?.includes("trees")) {
      await setCheckboxWithSelectors(
        page,
        paMethods.trees,
        true,
        "C4.preventAccessMethods.trees"
      );
    }
    if (methods2?.includes("other")) {
      const otherText = data.categoryC4.preventAccessOtherText.trim();
      if (otherText) {
        await setCheckboxWithSelectors(
          page,
          paMethods.other,
          true,
          "C4.preventAccessMethods.other"
        );
        await sleep(SETTLE_MS);
        await fillTextWithSelectors(
          page,
          c4.preventAccessOtherText,
          otherText,
          "C4.preventAccessOtherText"
        );
      } else {
        throw new Error(
          "Invalid FormData: categoryC4.preventAccessMethods includes 'other' but preventAccessOtherText is empty"
        );
      }
    }
  }

  // Other description
  if (data.categoryC4.other !== "None" && data.categoryC4.otherDescription) {
    await fillTextWithSelectors(
      page,
      [c4.otherDescription, ...(c4.otherDescriptionFallbacks ?? [])],
      data.categoryC4.otherDescription,
      "C4.otherDescription"
    );
  }
}

/**
 * Fill Category C - Disturbed Surface Stabilization (C1-C4).
 */
export async function fillCategoryC(page: Page, data: FormData): Promise<void> {
  await fillCategoryC1(page, data);
  await fillCategoryC2(page, data);
  await fillCategoryC3(page, data);
  await fillCategoryC4(page, data);
}
