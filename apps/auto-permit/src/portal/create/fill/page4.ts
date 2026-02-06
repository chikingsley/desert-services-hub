/**
 * Fill Page 4 - Dust Control Plan
 *
 * Orchestrates filling all dust control categories (A through K) and Post-K water tier sections.
 * This is the most complex page with many conditional fields and categories.
 *
 * Accepts partial data - only fills categories that are provided.
 */

import type { Page } from "playwright";
import type { DeepPartial, FormData } from "@/form-data";
import {
  fillCategoryA,
  fillCategoryB,
  fillCategoryC,
  fillCategoryD,
  fillCategoryE,
  fillCategoryF,
  fillCategoryG,
  fillCategoryH,
  fillCategoryI,
  fillCategoryJ,
  fillCategoryK,
  fillPostK,
} from "./page4/index";

/**
 * Check if any category B fields are present in the data
 */
function hasCategoryB(data: FormData | DeepPartial<FormData>): boolean {
  return data.categoryB1 !== undefined || data.categoryB2 !== undefined;
}

/**
 * Check if any category C fields are present in the data
 */
function hasCategoryC(data: FormData | DeepPartial<FormData>): boolean {
  return (
    data.categoryC1 !== undefined ||
    data.categoryC2 !== undefined ||
    data.categoryC3 !== undefined ||
    data.categoryC4 !== undefined
  );
}

/**
 * Check if any category D fields are present in the data
 */
function hasCategoryD(data: FormData | DeepPartial<FormData>): boolean {
  return (
    data.categoryD1 !== undefined ||
    data.categoryD2 !== undefined ||
    data.categoryD3 !== undefined ||
    data.categoryD4 !== undefined ||
    data.categoryD5 !== undefined
  );
}

/**
 * Check if any category E fields are present in the data
 */
function hasCategoryE(data: FormData | DeepPartial<FormData>): boolean {
  return data.categoryE1 !== undefined || data.categoryE2 !== undefined;
}

/**
 * Check if any category F fields are present in the data
 */
function hasCategoryF(data: FormData | DeepPartial<FormData>): boolean {
  return data.categoryF1 !== undefined || data.categoryF2 !== undefined;
}

/**
 * Check if any category G fields are present in the data
 */
function hasCategoryG(data: FormData | DeepPartial<FormData>): boolean {
  return data.categoryG1 !== undefined || data.categoryG2 !== undefined;
}

/**
 * Check if any category I fields are present in the data
 */
function hasCategoryI(data: FormData | DeepPartial<FormData>): boolean {
  return data.categoryI1 !== undefined || data.categoryI2 !== undefined;
}

/**
 * Fill Page 4 - Dust Control Plan.
 *
 * Only fills categories that are present in the provided data.
 * For full creates, all categories should be provided.
 * For revisions, only the categories being modified should be provided.
 *
 * @param page - Playwright Page instance
 * @param data - FormData (full or partial) containing dust control measures
 * @returns True if page was filled successfully
 */
export async function fillPage4(
  page: Page,
  data: FormData | DeepPartial<FormData>
): Promise<boolean> {
  console.log("\n[FILL PAGE 4 - Dust Control Plan]");
  try {
    // Only fill categories that are present in the data
    if (data.categoryA !== undefined) {
      await fillCategoryA(page, data as FormData);
    }

    if (hasCategoryB(data)) {
      await fillCategoryB(page, data as FormData);
    }

    if (hasCategoryC(data)) {
      await fillCategoryC(page, data as FormData);
    }

    if (hasCategoryD(data)) {
      await fillCategoryD(page, data as FormData);
    }

    if (hasCategoryE(data)) {
      await fillCategoryE(page, data as FormData);
    }

    if (hasCategoryF(data)) {
      await fillCategoryF(page, data as FormData);
    }

    if (hasCategoryG(data)) {
      await fillCategoryG(page, data as FormData);
    }

    if (data.categoryH !== undefined) {
      await fillCategoryH(page, data as FormData);
    }

    if (hasCategoryI(data)) {
      await fillCategoryI(page, data as FormData);
    }

    if (data.categoryJ !== undefined) {
      await fillCategoryJ(page, data as FormData);
    }

    if (data.categoryK !== undefined) {
      await fillCategoryK(page, data as FormData);
    }

    if (data.postK !== undefined) {
      await fillPostK(page, data as FormData);
    }

    console.log("  Page 4 fill completed (Categories A through K + Post-K)");
    return true;
  } catch (e) {
    console.log(`  fillPage4 failed: ${e}`);
    return false;
  }
}
