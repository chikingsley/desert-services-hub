/**
 * Category J State Verification
 * J: Blasting (siTable:48)
 */

import type { SelectorMap } from "@/form-data";
import type { ValidationHelpers } from "./helpers";

export interface CategoryJState {
  applies: boolean;
  hasWater: boolean;
  hasDustSuppressants: boolean;
  hasSuppressantFrequency: boolean;
  hasSuppressantAmount: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export function getCategoryJState(
  selectors: SelectorMap,
  helpers: ValidationHelpers
): CategoryJState {
  const { isRadioChecked, hasValue, hasAnyRadioChecked, isMeasureSelected } =
    helpers;
  const { categoryJ } = selectors;

  const jApplies = isRadioChecked(categoryJ.applies.yes);
  const jSuppressantsSelected = isMeasureSelected(
    categoryJ.dustSuppressants.Primary,
    categoryJ.dustSuppressants.Contingency
  );
  const jOtherSelected = isRadioChecked(categoryJ.other.Contingency);

  return {
    applies: jApplies,
    hasDustSuppressants: hasAnyRadioChecked(
      categoryJ.dustSuppressants.Primary,
      categoryJ.dustSuppressants.Contingency,
      categoryJ.dustSuppressants.None
    ),
    hasOther: hasAnyRadioChecked(
      categoryJ.other.Contingency,
      categoryJ.other.None
    ),
    hasOtherDescription: jOtherSelected && hasValue(categoryJ.otherDescription),
    hasSuppressantAmount:
      jSuppressantsSelected && hasValue(categoryJ.suppressantAmount),
    hasSuppressantFrequency:
      jSuppressantsSelected && hasValue(categoryJ.suppressantFrequency),
    hasWater: hasAnyRadioChecked(
      categoryJ.water.Primary,
      categoryJ.water.Contingency,
      categoryJ.water.None
    ),
  };
}
