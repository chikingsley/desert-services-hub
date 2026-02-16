/**
 * Fill Category G - Utilities and Structures
 *
 * G.1: Underground Utilities (siTable:41)
 * G.2: Vertical Structures (siTable:42)
 */

import type { Page } from "playwright";
import type { FormData } from "@/form-data";
import { clickRadio } from "@/portal/utils/helpers";
import { selectors } from "@/portal/utils/selectors";

/**
 * Fill Category G.1 - Underground Utilities.
 */
async function fillCategoryG1(page: Page, data: FormData): Promise<void> {
  console.log("  Category G.1 - Underground Utilities...");

  const g1 = selectors.categoryG1;
  if (data.categoryG1.applies) {
    await clickRadio(page, g1.applies.yes);
  } else {
    await clickRadio(page, g1.applies.no);
  }
}

/**
 * Fill Category G.2 - Vertical Structures.
 */
async function fillCategoryG2(page: Page, data: FormData): Promise<void> {
  console.log("  Category G.2 - Vertical Structures...");

  const g2 = selectors.categoryG2;
  if (data.categoryG2.applies) {
    await clickRadio(page, g2.applies.yes);
  } else {
    await clickRadio(page, g2.applies.no);
  }
}

/**
 * Fill Category G - Utilities and Structures (G1 + G2).
 */
export async function fillCategoryG(page: Page, data: FormData): Promise<void> {
  await fillCategoryG1(page, data);
  await fillCategoryG2(page, data);
}
