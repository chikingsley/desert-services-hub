/**
 * Category D State Verification
 * D1: Materials Hauled FROM Site (siTable:29)
 * D2: Materials Hauled WITHIN Site (siTable:30)
 * D3: Materials Hauled Crossing Public Areas (siTable:31)
 * D4: Loading, Unloading, Stacking (siTable:32)
 * D5: Open Storage Piles (siTable:33)
 */

import type { SelectorMap } from "@/form-data";
import type { ValidationHelpers } from "./helpers";

export interface CategoryD1State {
  applies: boolean;
  hasApplyWaterTop: boolean;
  hasApplyDustSuppressants: boolean;
  hasCeaseOperations: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export interface CategoryD2State {
  applies: boolean;
  hasLimitSpeed: boolean;
  hasApplyWaterTop: boolean;
  hasApplyDustSuppressants: boolean;
  hasCoverHaulTrucks: boolean;
  hasCeaseOperations: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export interface CategoryD3State {
  applies: boolean;
  hasCeaseOperations: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export interface CategoryD4State {
  applies: boolean;
  hasApplyWater: boolean;
  hasApplyDustSuppressants: boolean;
  hasSuppressantFrequency: boolean;
  hasSuppressantAmount: boolean;
  hasCeaseOperations: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export interface CategoryD5State {
  applies: boolean;
  hasCoverPiles: boolean;
  hasMaintainMoisture: boolean;
  hasMaintainCrust: boolean;
  hasWindBarriers: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export function getCategoryDState(
  selectors: SelectorMap,
  helpers: ValidationHelpers
): {
  categoryD1: CategoryD1State;
  categoryD2: CategoryD2State;
  categoryD3: CategoryD3State;
  categoryD4: CategoryD4State;
  categoryD5: CategoryD5State;
} {
  const { hasValue, isRadioChecked, hasAnyRadioChecked, isMeasureSelected } =
    helpers;
  const { categoryD1, categoryD2, categoryD3, categoryD4, categoryD5 } =
    selectors;

  const d1Applies = isRadioChecked(categoryD1.applies.yes);
  const d1OtherSelected = isRadioChecked(categoryD1.other.Contingency);

  const d2Applies = isRadioChecked(categoryD2.applies.yes);
  const d2OtherSelected = isMeasureSelected(
    categoryD2.other.Primary,
    categoryD2.other.Contingency
  );

  const d3Applies = isRadioChecked(categoryD3.applies.yes);
  const d3OtherSelected = isRadioChecked(categoryD3.other.Contingency);

  return {
    categoryD1: {
      applies: d1Applies,
      hasApplyDustSuppressants:
        isRadioChecked(categoryD1.dustSuppressantsTopOfLoad.Contingency) ||
        isRadioChecked(categoryD1.dustSuppressantsTopOfLoad.None),
      hasApplyWaterTop:
        isRadioChecked(categoryD1.waterTopOfLoad.Contingency) ||
        isRadioChecked(categoryD1.waterTopOfLoad.None),
      hasCeaseOperations:
        isRadioChecked(categoryD1.ceaseOperations.Contingency) ||
        isRadioChecked(categoryD1.ceaseOperations.None),
      hasOther:
        isRadioChecked(categoryD1.other.Contingency) ||
        isRadioChecked(categoryD1.other.None),
      hasOtherDescription:
        d1OtherSelected && hasValue(categoryD1.otherDescription),
    },
    categoryD2: {
      applies: d2Applies,
      hasApplyDustSuppressants: hasAnyRadioChecked(
        categoryD2.dustSuppressantsTopOfLoad.Primary,
        categoryD2.dustSuppressantsTopOfLoad.Contingency,
        categoryD2.dustSuppressantsTopOfLoad.None
      ),
      hasApplyWaterTop: hasAnyRadioChecked(
        categoryD2.waterTopOfLoad.Primary,
        categoryD2.waterTopOfLoad.Contingency,
        categoryD2.waterTopOfLoad.None
      ),
      hasCeaseOperations:
        isRadioChecked(categoryD2.ceaseOperations.Contingency) ||
        isRadioChecked(categoryD2.ceaseOperations.None),
      hasCoverHaulTrucks: hasAnyRadioChecked(
        categoryD2.coverTrucks.Primary,
        categoryD2.coverTrucks.Contingency,
        categoryD2.coverTrucks.None
      ),
      hasLimitSpeed: hasAnyRadioChecked(
        categoryD2.limitSpeed.Primary,
        categoryD2.limitSpeed.Contingency,
        categoryD2.limitSpeed.None
      ),
      hasOther: hasAnyRadioChecked(
        categoryD2.other.Primary,
        categoryD2.other.Contingency,
        categoryD2.other.None
      ),
      hasOtherDescription:
        d2OtherSelected &&
        hasValue([
          categoryD2.otherDescription,
          ...(categoryD2.otherDescriptionFallbacks ?? []),
        ]),
    },
    categoryD3: {
      applies: d3Applies,
      hasCeaseOperations:
        isRadioChecked(categoryD3.ceaseOperations.Contingency) ||
        isRadioChecked(categoryD3.ceaseOperations.None),
      hasOther:
        isRadioChecked(categoryD3.other.Contingency) ||
        isRadioChecked(categoryD3.other.None),
      hasOtherDescription:
        d3OtherSelected && hasValue(categoryD3.otherDescription),
    },
    categoryD4: {
      applies: isRadioChecked(categoryD4.applies.yes),
      hasApplyDustSuppressants: hasAnyRadioChecked(
        categoryD4.dustSuppressants.Primary,
        categoryD4.dustSuppressants.Contingency,
        categoryD4.dustSuppressants.None
      ),
      hasApplyWater: hasAnyRadioChecked(
        categoryD4.water.Primary,
        categoryD4.water.Contingency,
        categoryD4.water.None
      ),
      hasCeaseOperations:
        isRadioChecked(categoryD4.ceaseOperations.Contingency) ||
        isRadioChecked(categoryD4.ceaseOperations.None),
      hasOther:
        isRadioChecked(categoryD4.other.Contingency) ||
        isRadioChecked(categoryD4.other.None),
      hasOtherDescription:
        isRadioChecked(categoryD4.other.Contingency) &&
        hasValue([
          categoryD4.otherDescription,
          ...(categoryD4.otherDescriptionFallbacks ?? []),
        ]),
      hasSuppressantAmount:
        isMeasureSelected(
          categoryD4.dustSuppressants.Primary,
          categoryD4.dustSuppressants.Contingency
        ) &&
        hasValue([
          categoryD4.suppressantAmount,
          ...(categoryD4.suppressantAmountFallbacks ?? []),
        ]),
      hasSuppressantFrequency:
        isMeasureSelected(
          categoryD4.dustSuppressants.Primary,
          categoryD4.dustSuppressants.Contingency
        ) &&
        hasValue([
          categoryD4.suppressantFrequency,
          ...(categoryD4.suppressantFrequencyFallbacks ?? []),
        ]),
    },
    categoryD5: {
      applies: isRadioChecked(categoryD5.applies.yes),
      hasCoverPiles: hasAnyRadioChecked(
        categoryD5.coverPiles.Primary,
        categoryD5.coverPiles.Contingency,
        categoryD5.coverPiles.None
      ),
      hasMaintainCrust: hasAnyRadioChecked(
        categoryD5.maintainCrust.Primary,
        categoryD5.maintainCrust.Contingency,
        categoryD5.maintainCrust.None
      ),
      hasMaintainMoisture: hasAnyRadioChecked(
        categoryD5.maintainMoisture.Primary,
        categoryD5.maintainMoisture.Contingency,
        categoryD5.maintainMoisture.None
      ),
      hasOther: hasAnyRadioChecked(
        categoryD5.other.Primary,
        categoryD5.other.Contingency,
        categoryD5.other.None
      ),
      hasOtherDescription:
        isMeasureSelected(
          categoryD5.other.Primary,
          categoryD5.other.Contingency
        ) && hasValue(categoryD5.otherDescription),
      hasWindBarriers: hasAnyRadioChecked(
        categoryD5.windBarriers.Primary,
        categoryD5.windBarriers.Contingency,
        categoryD5.windBarriers.None
      ),
    },
  };
}
