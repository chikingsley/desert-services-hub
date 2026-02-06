/**
 * Fill Category E - Trackout and Spillage
 *
 * E.1: Trackout Control (siTable:35)
 * E.2: Spillage Cleaning (siTable:36, no Yes/No)
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
 * Fill Category E.1 - Trackout Control.
 */
async function fillCategoryE1(page: Page, data: FormData): Promise<void> {
  console.log("  Category E.1 - Trackout Control...");

  const e1 = selectors.categoryE1;
  if (data.categoryE1.applies) {
    await clickRadio(page, e1.applies.yes);
    // Device type checkboxes
    const dt = e1.deviceType;
    if (data.categoryE1.deviceType.includes("gravel_pad")) {
      await setCheckbox(page, dt.gravel_pad, true);
    }
    if (data.categoryE1.deviceType.includes("grizzly")) {
      await setCheckbox(page, dt.grizzly, true);
    }
    if (data.categoryE1.deviceType.includes("wheel_wash")) {
      await setCheckbox(page, dt.wheel_wash, true);
    }
    if (data.categoryE1.deviceType.includes("paved_area")) {
      await setCheckbox(page, dt.paved_area, true);
    }
    if (data.categoryE1.deviceType.includes("other")) {
      await setCheckbox(page, dt.other, true);
      if (data.categoryE1.deviceTypeOther) {
        await sleep(SETTLE_MS);
        await fillText(
          page,
          e1.deviceTypeOther,
          data.categoryE1.deviceTypeOther
        );
      }
    }
    // Cease operations - use selectControlMeasure for nested structure
    await selectControlMeasure(
      page,
      data.categoryE1.ceaseOperations,
      e1.ceaseOperations
    );
    // Other control measure
    await selectControlMeasure(page, data.categoryE1.other, e1.other);
    if (
      data.categoryE1.other === "Contingency" &&
      data.categoryE1.otherDescription
    ) {
      await sleep(SETTLE_MS);
      await fillText(
        page,
        e1.otherDescription,
        data.categoryE1.otherDescription
      );
    }
  } else {
    await clickRadio(page, e1.applies.no);
  }
}

/**
 * Fill Category E.2 - Spillage Cleaning.
 */
async function fillCategoryE2(page: Page, data: FormData): Promise<void> {
  console.log("  Category E.2 - Spillage Cleaning...");

  const e2 = selectors.categoryE2;
  await selectControlMeasure(
    page,
    data.categoryE2.streetSweeper,
    e2.streetSweeper
  );
  await selectControlMeasure(
    page,
    data.categoryE2.manuallySweep,
    e2.manuallySweep
  );
  await selectControlMeasure(page, data.categoryE2.other, e2.other);
  if (data.categoryE2.other !== "None" && data.categoryE2.otherDescription) {
    await sleep(SETTLE_MS);
    await fillText(page, e2.otherDescription, data.categoryE2.otherDescription);
  }
}

/**
 * Fill Category E - Trackout and Spillage (E1 + E2).
 */
export async function fillCategoryE(page: Page, data: FormData): Promise<void> {
  await fillCategoryE1(page, data);
  await fillCategoryE2(page, data);
}
