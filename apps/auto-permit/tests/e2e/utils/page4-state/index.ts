/**
 * Page 4 State Verification Index
 *
 * Exports all category state verification functions and types
 * Organized by category for easy cross-referencing with fill functions
 */

import type { Page } from "@playwright/test";
import type { Page4State } from "@/form-data";
import { selectors } from "@/portal/utils/selectors";
import { createValidationHelpers } from "./helpers";

export type { CategoryAState } from "./category-a";
export { getCategoryAState } from "./category-a";
export type { CategoryB1State, CategoryB2State } from "./category-b";
export { getCategoryBState } from "./category-b";
export type {
  CategoryC1State,
  CategoryC2State,
  CategoryC3State,
  CategoryC4State,
} from "./category-c";
export { getCategoryCState } from "./category-c";
export type {
  CategoryD1State,
  CategoryD2State,
  CategoryD3State,
  CategoryD4State,
  CategoryD5State,
} from "./category-d";
export { getCategoryDState } from "./category-d";
export type { CategoryE1State, CategoryE2State } from "./category-e";
export { getCategoryEState } from "./category-e";
export type { CategoryF1State, CategoryF2State } from "./category-f";
export { getCategoryFState } from "./category-f";
export type { CategoryG1State, CategoryG2State } from "./category-g";
export { getCategoryGState } from "./category-g";
export type { CategoryHState } from "./category-h";
export { getCategoryHState } from "./category-h";
export type { CategoryI1State, CategoryI2State } from "./category-i";
export { getCategoryIState } from "./category-i";
export type { CategoryJState } from "./category-j";
export { getCategoryJState } from "./category-j";
export type { CategoryKState } from "./category-k";
export { getCategoryKState } from "./category-k";
export type { PostKState } from "./category-post-k";
export { getPostKState } from "./category-post-k";
export type { ValidationHelpers } from "./helpers";
export { createValidationHelpers } from "./helpers";

// Import all implementation functions to use in getPage4State
import { getCategoryAState as implA } from "./category-a";
import { getCategoryBState as implB } from "./category-b";
import { getCategoryCState as implC } from "./category-c";
import { getCategoryDState as implD } from "./category-d";
import { getCategoryEState as implE } from "./category-e";
import { getCategoryFState as implF } from "./category-f";
import { getCategoryGState as implG } from "./category-g";
import { getCategoryHState as implH } from "./category-h";
import { getCategoryIState as implI } from "./category-i";
import { getCategoryJState as implJ } from "./category-j";
import { getCategoryKState as implK } from "./category-k";
import { getPostKState as implPostK } from "./category-post-k";

/**
 * Get the full state of Page 4.
 *
 * This function handles the coordinate-heavy evaluation of Page 4 categories.
 * It uses the modular category functions to build the full state.
 */
export async function getPage4State(page: Page): Promise<Page4State> {
  // We execute all category checks in a single page.evaluate call for efficiency.
  // Since the individual category functions are pure (only depend on selectors and helpers),
  // we can stringify and execute them in the browser.

  return await page.evaluate(
    ({ sels, impls }) => {
      // 1. Reconstruct helpers in browser
      const createValidationHelpers = new Function(
        `return ${impls.createHelpers}`
      )();
      const helpers = createValidationHelpers();

      // 2. Reconstruct all category functions in browser
      const getA = new Function(`return ${impls.getA}`)();
      const getB = new Function(`return ${impls.getB}`)();
      const getC = new Function(`return ${impls.getC}`)();
      const getD = new Function(`return ${impls.getD}`)();
      const getE = new Function(`return ${impls.getE}`)();
      const getF = new Function(`return ${impls.getF}`)();
      const getG = new Function(`return ${impls.getG}`)();
      const getH = new Function(`return ${impls.getH}`)();
      const getI = new Function(`return ${impls.getI}`)();
      const getJ = new Function(`return ${impls.getJ}`)();
      const getK = new Function(`return ${impls.getK}`)();
      const getPostK = new Function(`return ${impls.getPostK}`)();

      // 3. Execute all and build state
      const stateB = getB(sels, helpers);
      const stateC = getC(sels, helpers);
      const stateD = getD(sels, helpers);
      const stateE = getE(sels, helpers);
      const stateF = getF(sels, helpers);
      const stateG = getG(sels, helpers);
      const stateI = getI(sels, helpers);

      // Total disturbed acres (common field)
      const totalAcresEl = document.querySelector(
        '[id="ThePage:siTable:54:sioTable:0:siForm:text"]'
      ) as HTMLInputElement | null;
      const hasTotalDisturbedAcres =
        (totalAcresEl?.value?.trim().length ?? 0) > 0;

      return {
        categoryA: getA(sels, helpers),
        categoryB1: stateB.categoryB1,
        categoryB2: stateB.categoryB2,
        categoryC1: stateC.categoryC1,
        categoryC2: stateC.categoryC2,
        categoryC3: stateC.categoryC3,
        categoryC4: stateC.categoryC4,
        categoryD1: stateD.categoryD1,
        categoryD2: stateD.categoryD2,
        categoryD3: stateD.categoryD3,
        categoryD4: stateD.categoryD4,
        categoryD5: stateD.categoryD5,
        categoryE1: stateE.categoryE1,
        categoryE2: stateE.categoryE2,
        categoryF1: stateF.categoryF1,
        categoryF2: stateF.categoryF2,
        categoryG1: stateG.categoryG1,
        categoryG2: stateG.categoryG2,
        categoryH: getH(sels, helpers),
        categoryI1: stateI.categoryI1,
        categoryI2: stateI.categoryI2,
        categoryJ: getJ(sels, helpers),
        categoryK: getK(sels, helpers),
        postK: getPostK(sels, helpers),
        hasTotalDisturbedAcres,
      };
    },
    {
      sels: selectors,
      impls: {
        createHelpers: createValidationHelpers.toString(),
        getA: implA.toString(),
        getB: implB.toString(),
        getC: implC.toString(),
        getD: implD.toString(),
        getE: implE.toString(),
        getF: implF.toString(),
        getG: implG.toString(),
        getH: implH.toString(),
        getI: implI.toString(),
        getJ: implJ.toString(),
        getK: implK.toString(),
        getPostK: implPostK.toString(),
      },
    }
  );
}
