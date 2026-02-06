/**
 * Category A State Verification (Wind-Blown Dust)
 */

import type { SelectorMap } from "@/form-data";
import type { ValidationHelpers } from "./helpers";

export interface CategoryAState {
  hasAnswer: boolean;
  hasSoilCrust: boolean;
  hasTfv: boolean;
  hasVegetative: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export function getCategoryAState(
  selectors: SelectorMap,
  helpers: ValidationHelpers
): CategoryAState {
  const { isCheckboxChecked, hasValue } = helpers;
  const { categoryA } = selectors;

  // Category A - check if any checkbox is checked (no Yes/No, just checkboxes)
  const hasSoilCrust = isCheckboxChecked(categoryA.soilCrust.yes);
  const hasTfv = isCheckboxChecked(categoryA.tfv.yes);
  const hasVegetative = isCheckboxChecked(categoryA.vegetative.yes);
  const hasOther = isCheckboxChecked(categoryA.other.yes);

  const hasAnswer = hasSoilCrust || hasTfv || hasVegetative || hasOther;

  return {
    hasAnswer,
    hasSoilCrust,
    hasTfv,
    hasVegetative,
    hasOther,
    hasOtherDescription: hasValue(categoryA.otherDescription),
  };
}
