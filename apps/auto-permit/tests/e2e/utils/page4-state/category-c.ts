/**
 * Category C State Verification
 * C1: Before/after daily construction (siTable:24)
 * C2: During active operations (siTable:25)
 * C3: Inactive periods (siTable:26)
 * C4: Permanent stabilization (siTable:27)
 */

import type { SelectorMap } from "@/form-data";
import type { ValidationHelpers } from "./helpers";

export interface CategoryC1State {
  hasPreWater: boolean;
  hasPhaseWork: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export interface CategoryC2State {
  hasVisiblyMoist: boolean;
  hasAstm: boolean;
  hasSuppressants: boolean;
  hasSuppressantFrequency: boolean;
  hasSuppressantAmount: boolean;
  hasWindBarriers: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export interface CategoryC3State {
  hasApplyWater: boolean;
  hasSurfaceGravel: boolean;
  hasSuppressants: boolean;
  hasSuppressantFrequency: boolean;
  hasSuppressantAmount: boolean;
  hasCoverTarps: boolean;
  hasVegetative: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export interface CategoryC4State {
  hasPave: boolean;
  hasPaveWhen: boolean;
  hasGravel: boolean;
  hasSuppressants: boolean;
  hasSuppressantFrequency: boolean;
  hasSuppressantAmount: boolean;
  hasVegetative: boolean;
  hasRestrictAccess: boolean;
  hasApplyWaterPrevent: boolean;
  hasApplyWaterPreventMethods: boolean;
  hasApplyWaterPreventOtherText: boolean;
  hasPreventAccess: boolean;
  hasPreventAccessMethods: boolean;
  hasPreventAccessOtherText: boolean;
  hasRestoreVegetation: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
}

export function getCategoryCState(
  selectors: SelectorMap,
  helpers: ValidationHelpers
): {
  categoryC1: CategoryC1State;
  categoryC2: CategoryC2State;
  categoryC3: CategoryC3State;
  categoryC4: CategoryC4State;
} {
  const {
    hasValue,
    isCheckboxChecked,
    isMeasureSelected,
    hasAnyRadioChecked,
    isRadioChecked,
  } = helpers;
  const { categoryC1, categoryC2, categoryC3, categoryC4 } = selectors;

  const c2SuppressantsSelected = isMeasureSelected(
    categoryC2.suppressants.Primary,
    categoryC2.suppressants.Contingency
  );
  const c2OtherSelected = isMeasureSelected(
    categoryC2.other.Primary,
    categoryC2.other.Contingency
  );

  const c3SuppressantsSelected = isMeasureSelected(
    categoryC3.suppressants.Primary,
    categoryC3.suppressants.Contingency
  );
  const c3OtherSelected = isMeasureSelected(
    categoryC3.other.Primary,
    categoryC3.other.Contingency
  );

  const c4PaveSelected = isMeasureSelected(
    categoryC4.pave.Primary,
    categoryC4.pave.Contingency
  );
  const c4SuppressantsSelected = isMeasureSelected(
    categoryC4.suppressants.Primary,
    categoryC4.suppressants.Contingency
  );
  const c4ApplyWaterPreventSelected = isMeasureSelected(
    categoryC4.applyWaterPrevent.Primary,
    categoryC4.applyWaterPrevent.Contingency
  );
  const c4PreventAccessSelected = isMeasureSelected(
    categoryC4.preventAccess.Primary,
    categoryC4.preventAccess.Contingency
  );
  const c4OtherSelected = isMeasureSelected(
    categoryC4.other.Primary,
    categoryC4.other.Contingency
  );
  const c4ApplyWaterPreventMethodsOther = isCheckboxChecked(
    categoryC4.applyWaterPreventMethods.other
  );
  const c4PreventAccessMethodsOther = isCheckboxChecked(
    categoryC4.preventAccessMethods.other
  );

  return {
    categoryC1: {
      hasPreWater: hasAnyRadioChecked(
        categoryC1.preWater.Primary,
        categoryC1.preWater.Contingency,
        categoryC1.preWater.None
      ),
      hasPhaseWork: hasAnyRadioChecked(
        categoryC1.phaseWork.Primary,
        categoryC1.phaseWork.Contingency,
        categoryC1.phaseWork.None
      ),
      hasOther: hasAnyRadioChecked(
        categoryC1.other.Primary,
        categoryC1.other.Contingency,
        categoryC1.other.None
      ),
      hasOtherDescription:
        hasAnyRadioChecked(
          categoryC1.other.Primary,
          categoryC1.other.Contingency,
          categoryC1.other.None
        ) && hasValue(categoryC1.otherDescription),
    },
    categoryC2: {
      hasVisiblyMoist: hasAnyRadioChecked(
        categoryC2.visiblyMoist.Primary,
        categoryC2.visiblyMoist.Contingency,
        categoryC2.visiblyMoist.None
      ),
      hasAstm: hasAnyRadioChecked(
        categoryC2.astm.Primary,
        categoryC2.astm.Contingency,
        categoryC2.astm.None
      ),
      hasSuppressants: hasAnyRadioChecked(
        categoryC2.suppressants.Primary,
        categoryC2.suppressants.Contingency,
        categoryC2.suppressants.None
      ),
      hasSuppressantFrequency:
        c2SuppressantsSelected && hasValue(categoryC2.suppressantFrequency),
      hasSuppressantAmount:
        c2SuppressantsSelected && hasValue(categoryC2.suppressantAmount),
      hasWindBarriers: hasAnyRadioChecked(
        categoryC2.windBarriers.Primary,
        categoryC2.windBarriers.Contingency,
        categoryC2.windBarriers.None
      ),
      hasOther: hasAnyRadioChecked(
        categoryC2.other.Primary,
        categoryC2.other.Contingency,
        categoryC2.other.None
      ),
      hasOtherDescription:
        c2OtherSelected && hasValue(categoryC2.otherDescription),
    },
    categoryC3: {
      hasApplyWater: hasAnyRadioChecked(
        categoryC3.applyWater.Primary,
        categoryC3.applyWater.Contingency,
        categoryC3.applyWater.None
      ),
      hasSurfaceGravel: hasAnyRadioChecked(
        categoryC3.surfaceGravel.Primary,
        categoryC3.surfaceGravel.Contingency,
        categoryC3.surfaceGravel.None
      ),
      hasSuppressants: hasAnyRadioChecked(
        categoryC3.suppressants.Primary,
        categoryC3.suppressants.Contingency,
        categoryC3.suppressants.None
      ),
      hasSuppressantFrequency:
        c3SuppressantsSelected && hasValue(categoryC3.suppressantFrequency),
      hasSuppressantAmount:
        c3SuppressantsSelected && hasValue(categoryC3.suppressantAmount),
      hasCoverTarps: hasAnyRadioChecked(
        categoryC3.coverTarps.Primary,
        categoryC3.coverTarps.Contingency,
        categoryC3.coverTarps.None
      ),
      hasVegetative: hasAnyRadioChecked(
        categoryC3.vegetative.Primary,
        categoryC3.vegetative.Contingency,
        categoryC3.vegetative.None
      ),
      hasOther: hasAnyRadioChecked(
        categoryC3.other.Primary,
        categoryC3.other.Contingency,
        categoryC3.other.None
      ),
      hasOtherDescription:
        c3OtherSelected && hasValue(categoryC3.otherDescription),
    },
    categoryC4: {
      hasPave: hasAnyRadioChecked(
        categoryC4.pave.Primary,
        categoryC4.pave.Contingency,
        categoryC4.pave.None
      ),
      hasPaveWhen:
        c4PaveSelected &&
        (isRadioChecked(categoryC4.paveWhen.prior) ||
          isRadioChecked(categoryC4.paveWhen.during) ||
          isRadioChecked(categoryC4.paveWhen.end)),
      hasGravel: hasAnyRadioChecked(
        categoryC4.gravel.Primary,
        categoryC4.gravel.Contingency,
        categoryC4.gravel.None
      ),
      hasSuppressants: hasAnyRadioChecked(
        categoryC4.suppressants.Primary,
        categoryC4.suppressants.Contingency,
        categoryC4.suppressants.None
      ),
      hasSuppressantFrequency:
        c4SuppressantsSelected &&
        hasValue([
          categoryC4.suppressantFrequency,
          ...(categoryC4.suppressantFrequencyFallbacks ?? []),
        ]),
      hasSuppressantAmount:
        c4SuppressantsSelected &&
        hasValue([
          categoryC4.suppressantAmount,
          ...(categoryC4.suppressantAmountFallbacks ?? []),
        ]),
      hasVegetative: hasAnyRadioChecked(
        categoryC4.vegetative.Primary,
        categoryC4.vegetative.Contingency,
        categoryC4.vegetative.None
      ),
      hasRestrictAccess: hasAnyRadioChecked(
        categoryC4.restrictAccess.Primary,
        categoryC4.restrictAccess.Contingency,
        categoryC4.restrictAccess.None
      ),
      hasApplyWaterPrevent: hasAnyRadioChecked(
        categoryC4.applyWaterPrevent.Primary,
        categoryC4.applyWaterPrevent.Contingency,
        categoryC4.applyWaterPrevent.None
      ),
      hasApplyWaterPreventMethods:
        c4ApplyWaterPreventSelected &&
        (isCheckboxChecked(categoryC4.applyWaterPreventMethods.ditches) ||
          isCheckboxChecked(categoryC4.applyWaterPreventMethods.fences)),
      hasApplyWaterPreventOtherText:
        c4ApplyWaterPreventMethodsOther &&
        hasValue(categoryC4.applyWaterPreventOtherText),
      hasPreventAccess: hasAnyRadioChecked(
        categoryC4.preventAccess.Primary,
        categoryC4.preventAccess.Contingency,
        categoryC4.preventAccess.None
      ),
      hasPreventAccessMethods:
        c4PreventAccessSelected &&
        (isCheckboxChecked(categoryC4.preventAccessMethods.ditches) ||
          isCheckboxChecked(categoryC4.preventAccessMethods.fences)),
      hasPreventAccessOtherText:
        c4PreventAccessMethodsOther &&
        hasValue(categoryC4.preventAccessOtherText),
      hasRestoreVegetation: hasAnyRadioChecked(
        categoryC4.restoreVegetation.Primary,
        categoryC4.restoreVegetation.Contingency,
        categoryC4.restoreVegetation.None
      ),
      hasOther: hasAnyRadioChecked(
        categoryC4.other.Primary,
        categoryC4.other.Contingency,
        categoryC4.other.None
      ),
      hasOtherDescription:
        c4OtherSelected &&
        hasValue([
          categoryC4.otherDescription,
          ...(categoryC4.otherDescriptionFallbacks ?? []),
        ]),
    },
  };
}
