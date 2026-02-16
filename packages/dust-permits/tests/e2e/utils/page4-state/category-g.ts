/**
 * Category G State Verification
 * G1: Underground Utilities (siTable:41)
 * G2: Vertical Structures (siTable:42)
 */

import type { SelectorMap } from "@/form-data";
import type { ValidationHelpers } from "./helpers";

export interface CategoryG1State {
  applies: boolean;
}

export interface CategoryG2State {
  applies: boolean;
}

export function getCategoryGState(
  selectors: SelectorMap,
  helpers: ValidationHelpers
): {
  categoryG1: CategoryG1State;
  categoryG2: CategoryG2State;
} {
  const { isRadioChecked } = helpers;
  const { categoryG1, categoryG2 } = selectors;

  return {
    categoryG1: {
      applies: isRadioChecked(categoryG1.applies.yes),
    },
    categoryG2: {
      applies: isRadioChecked(categoryG2.applies.yes),
    },
  };
}
