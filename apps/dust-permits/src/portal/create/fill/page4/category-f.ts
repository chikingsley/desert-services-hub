/**
 * Fill Category F - Grading
 *
 * F.1: Mass Grading (siTable:38)
 * F.2: Fine Grading (siTable:39)
 */

import type { Page } from "playwright";
import type { FormData } from "@/form-data";
import { clickRadio } from "@/portal/utils/helpers";
import { selectors } from "@/portal/utils/selectors";

/**
 * Fill Category F.1 - Mass Grading.
 */
async function fillCategoryF1(page: Page, data: FormData): Promise<void> {
  console.log("  Category F.1 - Mass Grading...");

  const f1 = selectors.categoryF1;
  if (data.categoryF1.applies) {
    await clickRadio(page, f1.applies.yes);
  } else {
    await clickRadio(page, f1.applies.no);
  }
}

/**
 * Fill Category F.2 - Fine Grading.
 */
async function fillCategoryF2(page: Page, data: FormData): Promise<void> {
  console.log("  Category F.2 - Fine Grading...");

  const f2 = selectors.categoryF2;
  if (data.categoryF2.applies) {
    await clickRadio(page, f2.applies.yes);
  } else {
    await clickRadio(page, f2.applies.no);
  }
}

/**
 * Fill Category F - Grading (F1 + F2).
 */
export async function fillCategoryF(page: Page, data: FormData): Promise<void> {
  await fillCategoryF1(page, data);
  await fillCategoryF2(page, data);
}
