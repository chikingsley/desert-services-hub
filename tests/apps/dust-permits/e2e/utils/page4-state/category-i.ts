/**
 * Category I State Verification
 * I1: During Weed Abatement Disturbance (siTable:46)
 * I2: Stabilization following Weed Abatement (siTable:47)
 */

import type { SelectorMap } from "@/form-data";
import type { ValidationHelpers } from "./helpers";

export interface CategoryI1State {
  applies: boolean;
  hasCeaseOperations: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export interface CategoryI2State {
  hasDustSuppressants: boolean;
  hasGravel: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
  hasPave: boolean;
  hasSuppressantAmount: boolean;
  hasSuppressantFrequency: boolean;
  hasVegetation: boolean;
  hasWater: boolean;
}

export function getCategoryIState(
  selectors: SelectorMap,
  helpers: ValidationHelpers
): {
  categoryI1: CategoryI1State;
  categoryI2: CategoryI2State;
} {
  const { isRadioChecked, hasValue, hasAnyRadioChecked, isMeasureSelected } =
    helpers;
  const { categoryI1, categoryI2 } = selectors;

  const i1Applies = isRadioChecked(categoryI1.applies.yes);
  const i1OtherSelected = isRadioChecked(categoryI1.other.Contingency);

  const i2SuppressantsSelected = isMeasureSelected(
    categoryI2.dustSuppressants.Primary,
    categoryI2.dustSuppressants.Contingency
  );
  const i2OtherSelected = isMeasureSelected(
    categoryI2.other.Primary,
    categoryI2.other.Contingency
  );

  return {
    categoryI1: {
      applies: i1Applies,
      hasCeaseOperations: hasAnyRadioChecked(
        categoryI1.ceaseOperations.Contingency,
        categoryI1.ceaseOperations.None
      ),
      hasOther: hasAnyRadioChecked(
        categoryI1.other.Contingency,
        categoryI1.other.None
      ),
      hasOtherDescription:
        i1OtherSelected && hasValue(categoryI1.otherDescription),
    },
    categoryI2: {
      hasDustSuppressants: hasAnyRadioChecked(
        categoryI2.dustSuppressants.Primary,
        categoryI2.dustSuppressants.Contingency,
        categoryI2.dustSuppressants.None
      ),
      hasGravel: hasAnyRadioChecked(
        categoryI2.gravel.Primary,
        categoryI2.gravel.Contingency,
        categoryI2.gravel.None
      ),
      hasOther: hasAnyRadioChecked(
        categoryI2.other.Primary,
        categoryI2.other.Contingency,
        categoryI2.other.None
      ),
      hasOtherDescription:
        i2OtherSelected &&
        hasValue([
          categoryI2.otherDescription,
          ...(categoryI2.otherDescriptionFallbacks ?? []),
        ]),
      hasPave: hasAnyRadioChecked(
        categoryI2.pave.Primary,
        categoryI2.pave.Contingency,
        categoryI2.pave.None
      ),
      hasSuppressantAmount:
        i2SuppressantsSelected &&
        hasValue([
          categoryI2.suppressantAmount,
          ...(categoryI2.suppressantAmountFallbacks ?? []),
        ]),
      hasSuppressantFrequency:
        i2SuppressantsSelected &&
        hasValue([
          categoryI2.suppressantFrequency,
          ...(categoryI2.suppressantFrequencyFallbacks ?? []),
        ]),
      hasVegetation: hasAnyRadioChecked(
        categoryI2.vegetation.Primary,
        categoryI2.vegetation.Contingency,
        categoryI2.vegetation.None
      ),
      hasWater: hasAnyRadioChecked(
        categoryI2.water.Primary,
        categoryI2.water.Contingency,
        categoryI2.water.None
      ),
    },
  };
}
