/**
 * Category B State Verification
 * B1: Unpaved Staging Areas (siTable:21)
 * B2: Unpaved Haul Roads (siTable:22)
 */

import type { SelectorMap } from "@/form-data";
import type { ValidationHelpers } from "./helpers";

export interface CategoryB1State {
  applies: boolean;
  hasPave: boolean;
  hasPaveWhen: boolean;
  hasGravel: boolean;
  hasWater: boolean;
  hasDustSuppressants: boolean;
  hasSuppressantFrequency: boolean;
  hasSuppressantAmount: boolean;
  hasLimitTrips: boolean;
  hasLimitTripsMax: boolean;
  hasSpeedRestrictionMethod: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export interface CategoryB2State {
  applies: boolean;
  hasPave: boolean;
  hasPaveWhen: boolean;
  hasGravel: boolean;
  hasWater: boolean;
  hasDustSuppressants: boolean;
  hasSuppressantFrequency: boolean;
  hasSuppressantAmount: boolean;
  hasLimitTrips: boolean;
  hasLimitTripsMax: boolean;
  hasSpeedRestrictionMethod: boolean;
  hasCeaseOperations: boolean;
  hasCeaseOperationsAreaSpecification: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export function getCategoryBState(
  selectors: SelectorMap,
  helpers: ValidationHelpers
): {
  categoryB1: CategoryB1State;
  categoryB2: CategoryB2State;
} {
  const { isRadioChecked, hasValue, isMeasureSelected } = helpers;
  const { categoryB1, categoryB2 } = selectors;

  const b1Applies = isRadioChecked(categoryB1.applies.yes);
  const b1PaveSelected = isMeasureSelected(
    categoryB1.pave.Primary,
    categoryB1.pave.Contingency
  );
  const b1SuppressantsSelected = isMeasureSelected(
    categoryB1.dustSuppressants.Primary,
    categoryB1.dustSuppressants.Contingency
  );
  const b1OtherSelected = isMeasureSelected(
    categoryB1.other.Primary,
    categoryB1.other.Contingency
  );

  const b2Applies = isRadioChecked(categoryB2.applies.yes);
  const b2PaveSelected = isMeasureSelected(
    categoryB2.pave.Primary,
    categoryB2.pave.Contingency
  );
  const b2SuppressantsSelected = isMeasureSelected(
    categoryB2.dustSuppressants.Primary,
    categoryB2.dustSuppressants.Contingency
  );
  const b2OtherSelected = isMeasureSelected(
    categoryB2.other.Primary,
    categoryB2.other.Contingency
  );

  return {
    categoryB1: {
      applies: b1Applies,
      hasPave: b1PaveSelected,
      hasPaveWhen:
        b1PaveSelected &&
        (isRadioChecked(categoryB1.paveWhen.prior) ||
          isRadioChecked(categoryB1.paveWhen.during) ||
          isRadioChecked(categoryB1.paveWhen.end)),
      hasGravel: isMeasureSelected(
        categoryB1.gravel.Primary,
        categoryB1.gravel.Contingency
      ),
      hasWater: isMeasureSelected(
        categoryB1.water.Primary,
        categoryB1.water.Contingency
      ),
      hasDustSuppressants: b1SuppressantsSelected,
      hasSuppressantFrequency:
        b1SuppressantsSelected &&
        hasValue(categoryB1.dustSuppressantsFrequency),
      hasSuppressantAmount:
        b1SuppressantsSelected && hasValue(categoryB1.dustSuppressantsAmount),
      hasLimitTrips: isMeasureSelected(
        categoryB1.limitTrips.Primary,
        categoryB1.limitTrips.Contingency
      ),
      hasLimitTripsMax:
        isMeasureSelected(
          categoryB1.limitTrips.Primary,
          categoryB1.limitTrips.Contingency
        ) && hasValue(categoryB1.limitTripsMax),
      hasSpeedRestrictionMethod: hasValue(categoryB1.speedRestrictionMethod),
      hasOther: b1OtherSelected,
      hasOtherDescription:
        b1OtherSelected && hasValue(categoryB1.otherDescription),
    },
    categoryB2: {
      applies: b2Applies,
      hasPave: b2PaveSelected,
      hasPaveWhen:
        b2PaveSelected &&
        (isRadioChecked(categoryB2.paveWhen.prior) ||
          isRadioChecked(categoryB2.paveWhen.during) ||
          isRadioChecked(categoryB2.paveWhen.end)),
      hasGravel: isMeasureSelected(
        categoryB2.gravel.Primary,
        categoryB2.gravel.Contingency
      ),
      hasWater: isMeasureSelected(
        categoryB2.water.Primary,
        categoryB2.water.Contingency
      ),
      hasDustSuppressants: b2SuppressantsSelected,
      hasSuppressantFrequency:
        b2SuppressantsSelected &&
        hasValue(categoryB2.dustSuppressantsFrequency),
      hasSuppressantAmount:
        b2SuppressantsSelected && hasValue(categoryB2.dustSuppressantsAmount),
      hasLimitTrips: isMeasureSelected(
        categoryB2.limitTrips.Primary,
        categoryB2.limitTrips.Contingency
      ),
      hasLimitTripsMax:
        isMeasureSelected(
          categoryB2.limitTrips.Primary,
          categoryB2.limitTrips.Contingency
        ) && hasValue(categoryB2.limitTripsMax),
      hasSpeedRestrictionMethod: hasValue(categoryB2.speedRestrictionMethod),
      hasCeaseOperations: isRadioChecked(
        categoryB2.ceaseOperations.Contingency
      ),
      hasCeaseOperationsAreaSpecification:
        isRadioChecked(categoryB2.ceaseOperations.Contingency) &&
        hasValue(categoryB2.ceaseOperationsAreaSpecification),
      hasOther: b2OtherSelected,
      hasOtherDescription:
        b2OtherSelected && hasValue(categoryB2.otherDescription),
    },
  };
}
