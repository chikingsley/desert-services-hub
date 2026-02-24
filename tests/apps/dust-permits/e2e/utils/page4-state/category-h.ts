/**
 * Category H State Verification (Demolition)
 */

import type { SelectorMap } from "@/form-data";
import type { ValidationHelpers } from "./helpers";

export interface CategoryHState {
  applies: boolean;
  hasCleanDebris: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
  hasSuppressantAmount: boolean;
  hasSuppressantFrequency: boolean;
  hasUseDustSuppressants: boolean;
}

export function getCategoryHState(
  selectors: SelectorMap,
  helpers: ValidationHelpers
): CategoryHState {
  const { isRadioChecked, hasValue } = helpers;
  const { categoryH } = selectors;

  const hApplies = isRadioChecked(categoryH.applies.yes);
  const hOtherSelected = isRadioChecked(categoryH.other.Contingency);

  return {
    applies: hApplies,
    hasCleanDebris:
      isRadioChecked(categoryH.cleanDebris.Contingency) ||
      isRadioChecked(categoryH.cleanDebris.None),
    hasOther:
      isRadioChecked(categoryH.other.Contingency) ||
      isRadioChecked(categoryH.other.None),
    hasOtherDescription: hOtherSelected && hasValue(categoryH.otherDescription),
    hasSuppressantAmount:
      isRadioChecked(categoryH.useDustSuppressants.yes) &&
      hasValue(categoryH.suppressantAmount),
    hasSuppressantFrequency:
      isRadioChecked(categoryH.useDustSuppressants.yes) &&
      hasValue(categoryH.suppressantFrequency),
    hasUseDustSuppressants: isRadioChecked(categoryH.useDustSuppressants.yes),
  };
}
