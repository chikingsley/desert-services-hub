/**
 * Category E State Verification
 * E1: Trackout Control (siTable:35)
 * E2: Cleaning (siTable:36)
 */

import type { SelectorMap } from "@/form-data";
import type { ValidationHelpers } from "./helpers";

export interface CategoryE1State {
  applies: boolean;
  hasDeviceType: boolean;
  hasDeviceTypeOtherText: boolean;
  hasCeaseOperations: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export interface CategoryE2State {
  hasStreetSweeper: boolean;
  hasManualSweep: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export function getCategoryEState(
  selectors: SelectorMap,
  helpers: ValidationHelpers
): {
  categoryE1: CategoryE1State;
  categoryE2: CategoryE2State;
} {
  const { hasValue, isRadioChecked, isCheckboxChecked, isMeasureSelected } =
    helpers;
  const { categoryE1, categoryE2 } = selectors;

  const e1Applies = isRadioChecked(categoryE1.applies.yes);
  const e1DeviceOther = isCheckboxChecked(categoryE1.deviceType.other);
  const e1OtherSelected = isRadioChecked(categoryE1.other.Contingency);

  const e2OtherSelected = isMeasureSelected(
    categoryE2.other.Primary,
    categoryE2.other.Contingency
  );

  return {
    categoryE1: {
      applies: e1Applies,
      hasDeviceType:
        isCheckboxChecked(categoryE1.deviceType.gravel_pad) ||
        isCheckboxChecked(categoryE1.deviceType.grizzly) ||
        isCheckboxChecked(categoryE1.deviceType.wheel_wash) ||
        isCheckboxChecked(categoryE1.deviceType.paved_area) ||
        isCheckboxChecked(categoryE1.deviceType.other),
      hasDeviceTypeOtherText:
        e1DeviceOther && hasValue(categoryE1.deviceTypeOther),
      hasCeaseOperations:
        isRadioChecked(categoryE1.ceaseOperations.Contingency) ||
        isRadioChecked(categoryE1.ceaseOperations.None),
      hasOther:
        isRadioChecked(categoryE1.other.Contingency) ||
        isRadioChecked(categoryE1.other.None),
      hasOtherDescription:
        e1OtherSelected && hasValue(categoryE1.otherDescription),
    },
    categoryE2: {
      hasStreetSweeper: isMeasureSelected(
        categoryE2.streetSweeper.Primary,
        categoryE2.streetSweeper.Contingency
      ),
      hasManualSweep: isMeasureSelected(
        categoryE2.manuallySweep.Primary,
        categoryE2.manuallySweep.Contingency
      ),
      hasOther: isMeasureSelected(
        categoryE2.other.Primary,
        categoryE2.other.Contingency
      ),
      hasOtherDescription:
        e2OtherSelected && hasValue(categoryE2.otherDescription),
    },
  };
}
