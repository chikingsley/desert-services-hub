/**
 * Fill Category D - Bulk Material Handling
 *
 * Five subsections: D.1, D.2, D.3, D.4, D.5
 * Each has Yes/No
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
 * Fill Category D.1 - Loading/Unloading.
 */
async function fillCategoryD1(page: Page, data: FormData): Promise<void> {
  console.log("  Category D.1 - Loading/Unloading...");

  const d1 = selectors.categoryD1;
  if (data.categoryD1.applies) {
    await clickRadio(page, d1.applies.yes);
    // D1 only allows Contingency/None (no Primary option)
    await selectControlMeasure(
      page,
      data.categoryD1.waterTopOfLoad,
      d1.waterTopOfLoad
    );
    await selectControlMeasure(
      page,
      data.categoryD1.dustSuppressantsTopOfLoad,
      d1.dustSuppressantsTopOfLoad
    );
    await selectControlMeasure(
      page,
      data.categoryD1.ceaseOperations,
      d1.ceaseOperations
    );
    await selectControlMeasure(page, data.categoryD1.other, d1.other);
    if (
      data.categoryD1.other === "Contingency" &&
      data.categoryD1.otherDescription
    ) {
      await fillText(
        page,
        d1.otherDescription,
        data.categoryD1.otherDescription
      );
    }
  } else {
    await clickRadio(page, d1.applies.no);
  }
}

/**
 * Fill Category D.2 - Transport.
 */
async function fillCategoryD2(page: Page, data: FormData): Promise<void> {
  console.log("  Category D.2 - Transport...");

  const d2 = selectors.categoryD2;
  if (data.categoryD2.applies) {
    await clickRadio(page, d2.applies.yes);
    await selectControlMeasure(page, data.categoryD2.limitSpeed, d2.limitSpeed);
    await selectControlMeasure(
      page,
      data.categoryD2.waterTopOfLoad,
      d2.waterTopOfLoad
    );
    await selectControlMeasure(
      page,
      data.categoryD2.dustSuppressantsTopOfLoad,
      d2.dustSuppressantsTopOfLoad
    );
    await selectControlMeasure(
      page,
      data.categoryD2.coverTrucks,
      d2.coverTrucks
    );
    await selectControlMeasure(
      page,
      data.categoryD2.ceaseOperations,
      d2.ceaseOperations
    );
    await selectControlMeasure(page, data.categoryD2.other, d2.other);
    await sleep(SETTLE_MS);
    if (data.categoryD2.other !== "None" && data.categoryD2.otherDescription) {
      await fillTextWithSelectors(
        page,
        [d2.otherDescription, ...(d2.otherDescriptionFallbacks ?? [])],
        data.categoryD2.otherDescription,
        "D2.otherDescription"
      );
    }
  } else {
    await clickRadio(page, d2.applies.no);
  }
}

/**
 * Fill Category D.3 - Storage.
 */
async function fillCategoryD3(page: Page, data: FormData): Promise<void> {
  console.log("  Category D.3 - Storage...");

  const d3 = selectors.categoryD3;
  if (data.categoryD3.applies) {
    await clickRadio(page, d3.applies.yes);
    await selectControlMeasure(
      page,
      data.categoryD3.ceaseOperations,
      d3.ceaseOperations
    );
    await selectControlMeasure(page, data.categoryD3.other, d3.other);
    if (
      data.categoryD3.other === "Contingency" &&
      data.categoryD3.otherDescription
    ) {
      await fillText(
        page,
        d3.otherDescription,
        data.categoryD3.otherDescription
      );
    }
  } else {
    await clickRadio(page, d3.applies.no);
  }
}

/**
 * Fill Category D.4 - Haul Trucks.
 */
async function fillCategoryD4(page: Page, data: FormData): Promise<void> {
  console.log("  Category D.4 - Haul Trucks...");

  const d4 = selectors.categoryD4;
  if (data.categoryD4.applies) {
    await clickRadio(page, d4.applies.yes);
    await selectControlMeasure(
      page,
      data.categoryD4.ceaseOperations,
      d4.ceaseOperations
    );
    await selectControlMeasure(page, data.categoryD4.water, d4.water);
    await selectControlMeasure(
      page,
      data.categoryD4.dustSuppressants,
      d4.dustSuppressants
    );
    if (data.categoryD4.dustSuppressants !== "None") {
      let usedFrequencySelector: string | null = null;
      if (data.categoryD4.suppressantFrequency) {
        const freqResult = await fillTextWithSelectors(
          page,
          [
            d4.suppressantFrequency,
            ...(d4.suppressantFrequencyFallbacks ?? []),
          ],
          data.categoryD4.suppressantFrequency,
          "D4.suppressantFrequency"
        );
        usedFrequencySelector = freqResult.usedSelector;
      }
      if (data.categoryD4.suppressantAmount) {
        const amountSelectors = [
          d4.suppressantAmount,
          ...(d4.suppressantAmountFallbacks ?? []),
        ];
        // Filter out selector used by frequency to avoid filling same field twice
        const filtered = usedFrequencySelector
          ? amountSelectors.filter((s) => s !== usedFrequencySelector)
          : amountSelectors;
        await fillTextWithSelectors(
          page,
          filtered,
          data.categoryD4.suppressantAmount,
          "D4.suppressantAmount"
        );
      }
    }
    // D4 Other only has Contingency/None options (no Primary)
    await selectControlMeasure(page, data.categoryD4.other, d4.other);
    if (data.categoryD4.other !== "None" && data.categoryD4.otherDescription) {
      await fillTextWithSelectors(
        page,
        [d4.otherDescription, ...(d4.otherDescriptionFallbacks ?? [])],
        data.categoryD4.otherDescription,
        "D4.otherDescription"
      );
    }
  } else {
    await clickRadio(page, d4.applies.no);
  }
}

/**
 * Fill Category D.5 - Other.
 */
async function fillCategoryD5(page: Page, data: FormData): Promise<void> {
  console.log("  Category D.5 - Other...");

  const d5 = selectors.categoryD5;
  if (data.categoryD5.applies) {
    await clickRadio(page, d5.applies.yes);
    await selectControlMeasure(page, data.categoryD5.coverPiles, d5.coverPiles);
    await selectControlMeasure(
      page,
      data.categoryD5.maintainMoisture,
      d5.maintainMoisture
    );
    await selectControlMeasure(
      page,
      data.categoryD5.maintainCrust,
      d5.maintainCrust
    );
    await selectControlMeasure(
      page,
      data.categoryD5.windBarriers,
      d5.windBarriers
    );
    await selectControlMeasure(page, data.categoryD5.other, d5.other);
    if (data.categoryD5.other !== "None" && data.categoryD5.otherDescription) {
      await fillText(
        page,
        d5.otherDescription,
        data.categoryD5.otherDescription
      );
    }
  } else {
    await clickRadio(page, d5.applies.no);
  }
}

/**
 * Fill Category D - Bulk Material Handling (D1-D5).
 */
export async function fillCategoryD(page: Page, data: FormData): Promise<void> {
  await fillCategoryD1(page, data);
  await fillCategoryD2(page, data);
  await fillCategoryD3(page, data);
  await fillCategoryD4(page, data);
  await fillCategoryD5(page, data);
}
