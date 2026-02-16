/**
 * Category F State Verification
 * F1: Mass Grading (siTable:38)
 * F2: Fine Grading (siTable:39)
 */

import type { SelectorMap } from "@/form-data";
import type { ValidationHelpers } from "./helpers";

export interface CategoryF1State {
  applies: boolean;
}

export interface CategoryF2State {
  applies: boolean;
}

export function getCategoryFState(
  selectors: SelectorMap,
  helpers: ValidationHelpers
): {
  categoryF1: CategoryF1State;
  categoryF2: CategoryF2State;
} {
  const { isRadioChecked } = helpers;
  const { categoryF1, categoryF2 } = selectors;

  return {
    categoryF1: {
      applies: isRadioChecked(categoryF1.applies.yes),
    },
    categoryF2: {
      applies: isRadioChecked(categoryF2.applies.yes),
    },
  };
}
