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
  hasOther: boolean;
  hasOtherDescription: boolean;
  hasPhaseWork: boolean;
  hasPreWater: boolean;
}

export interface CategoryC2State {
  hasAstm: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
  hasSuppressantAmount: boolean;
  hasSuppressantFrequency: boolean;
  hasSuppressants: boolean;
  hasVisiblyMoist: boolean;
  hasWindBarriers: boolean;
}

export interface CategoryC3State {
  hasApplyWater: boolean;
  hasCoverTarps: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
  hasSuppressantAmount: boolean;
  hasSuppressantFrequency: boolean;
  hasSuppressants: boolean;
  hasSurfaceGravel: boolean;
  hasVegetative: boolean;
}

export interface CategoryC4State {
  hasApplyWaterPrevent: boolean;
  hasApplyWaterPreventMethods: boolean;
  hasApplyWaterPreventOtherText: boolean;
  hasGravel: boolean;
  hasOther: boolean;
  hasOtherDescription: boolean;
  hasPave: boolean;
  hasPaveWhen: boolean;
  hasPreventAccess: boolean;
  hasPreventAccessMethods: boolean;
  hasPreventAccessOtherText: boolean;
  hasRestoreVegetation: boolean;
  hasRestrictAccess: boolean;
  hasSuppressantAmount: boolean;
  hasSuppressantFrequency: boolean;
  hasSuppressants: boolean;
  hasVegetative: boolean;
}

function getCategoryC1State(
  sel: SelectorMap["categoryC1"],
  h: ValidationHelpers
): CategoryC1State {
  const otherChecked = h.hasAnyRadioChecked(
    sel.other.Primary,
    sel.other.Contingency,
    sel.other.None
  );
  return {
    hasOther: otherChecked,
    hasOtherDescription: otherChecked && h.hasValue(sel.otherDescription),
    hasPhaseWork: h.hasAnyRadioChecked(
      sel.phaseWork.Primary,
      sel.phaseWork.Contingency,
      sel.phaseWork.None
    ),
    hasPreWater: h.hasAnyRadioChecked(
      sel.preWater.Primary,
      sel.preWater.Contingency,
      sel.preWater.None
    ),
  };
}

function getCategoryC2State(
  sel: SelectorMap["categoryC2"],
  h: ValidationHelpers
): CategoryC2State {
  const suppSelected = h.isMeasureSelected(
    sel.suppressants.Primary,
    sel.suppressants.Contingency
  );
  const otherSelected = h.isMeasureSelected(
    sel.other.Primary,
    sel.other.Contingency
  );
  return {
    hasAstm: h.hasAnyRadioChecked(
      sel.astm.Primary,
      sel.astm.Contingency,
      sel.astm.None
    ),
    hasOther: h.hasAnyRadioChecked(
      sel.other.Primary,
      sel.other.Contingency,
      sel.other.None
    ),
    hasOtherDescription: otherSelected && h.hasValue(sel.otherDescription),
    hasSuppressantAmount: suppSelected && h.hasValue(sel.suppressantAmount),
    hasSuppressantFrequency:
      suppSelected && h.hasValue(sel.suppressantFrequency),
    hasSuppressants: h.hasAnyRadioChecked(
      sel.suppressants.Primary,
      sel.suppressants.Contingency,
      sel.suppressants.None
    ),
    hasVisiblyMoist: h.hasAnyRadioChecked(
      sel.visiblyMoist.Primary,
      sel.visiblyMoist.Contingency,
      sel.visiblyMoist.None
    ),
    hasWindBarriers: h.hasAnyRadioChecked(
      sel.windBarriers.Primary,
      sel.windBarriers.Contingency,
      sel.windBarriers.None
    ),
  };
}

function getCategoryC3State(
  sel: SelectorMap["categoryC3"],
  h: ValidationHelpers
): CategoryC3State {
  const suppSelected = h.isMeasureSelected(
    sel.suppressants.Primary,
    sel.suppressants.Contingency
  );
  const otherSelected = h.isMeasureSelected(
    sel.other.Primary,
    sel.other.Contingency
  );
  return {
    hasApplyWater: h.hasAnyRadioChecked(
      sel.applyWater.Primary,
      sel.applyWater.Contingency,
      sel.applyWater.None
    ),
    hasCoverTarps: h.hasAnyRadioChecked(
      sel.coverTarps.Primary,
      sel.coverTarps.Contingency,
      sel.coverTarps.None
    ),
    hasOther: h.hasAnyRadioChecked(
      sel.other.Primary,
      sel.other.Contingency,
      sel.other.None
    ),
    hasOtherDescription: otherSelected && h.hasValue(sel.otherDescription),
    hasSuppressantAmount: suppSelected && h.hasValue(sel.suppressantAmount),
    hasSuppressantFrequency:
      suppSelected && h.hasValue(sel.suppressantFrequency),
    hasSuppressants: h.hasAnyRadioChecked(
      sel.suppressants.Primary,
      sel.suppressants.Contingency,
      sel.suppressants.None
    ),
    hasSurfaceGravel: h.hasAnyRadioChecked(
      sel.surfaceGravel.Primary,
      sel.surfaceGravel.Contingency,
      sel.surfaceGravel.None
    ),
    hasVegetative: h.hasAnyRadioChecked(
      sel.vegetative.Primary,
      sel.vegetative.Contingency,
      sel.vegetative.None
    ),
  };
}

function getCategoryC4State(
  sel: SelectorMap["categoryC4"],
  h: ValidationHelpers
): CategoryC4State {
  const paveSelected = h.isMeasureSelected(
    sel.pave.Primary,
    sel.pave.Contingency
  );
  const suppSelected = h.isMeasureSelected(
    sel.suppressants.Primary,
    sel.suppressants.Contingency
  );
  const waterPreventSelected = h.isMeasureSelected(
    sel.applyWaterPrevent.Primary,
    sel.applyWaterPrevent.Contingency
  );
  const preventAccessSelected = h.isMeasureSelected(
    sel.preventAccess.Primary,
    sel.preventAccess.Contingency
  );
  const otherSelected = h.isMeasureSelected(
    sel.other.Primary,
    sel.other.Contingency
  );
  const waterPreventMethodsOther = h.isCheckboxChecked(
    sel.applyWaterPreventMethods.other
  );
  const preventAccessMethodsOther = h.isCheckboxChecked(
    sel.preventAccessMethods.other
  );

  return {
    hasApplyWaterPrevent: h.hasAnyRadioChecked(
      sel.applyWaterPrevent.Primary,
      sel.applyWaterPrevent.Contingency,
      sel.applyWaterPrevent.None
    ),
    hasApplyWaterPreventMethods:
      waterPreventSelected &&
      (h.isCheckboxChecked(sel.applyWaterPreventMethods.ditches) ||
        h.isCheckboxChecked(sel.applyWaterPreventMethods.fences)),
    hasApplyWaterPreventOtherText:
      waterPreventMethodsOther && h.hasValue(sel.applyWaterPreventOtherText),
    hasGravel: h.hasAnyRadioChecked(
      sel.gravel.Primary,
      sel.gravel.Contingency,
      sel.gravel.None
    ),
    hasOther: h.hasAnyRadioChecked(
      sel.other.Primary,
      sel.other.Contingency,
      sel.other.None
    ),
    hasOtherDescription:
      otherSelected &&
      h.hasValue([
        sel.otherDescription,
        ...(sel.otherDescriptionFallbacks ?? []),
      ]),
    hasPave: h.hasAnyRadioChecked(
      sel.pave.Primary,
      sel.pave.Contingency,
      sel.pave.None
    ),
    hasPaveWhen:
      paveSelected &&
      (h.isRadioChecked(sel.paveWhen.prior) ||
        h.isRadioChecked(sel.paveWhen.during) ||
        h.isRadioChecked(sel.paveWhen.end)),
    hasPreventAccess: h.hasAnyRadioChecked(
      sel.preventAccess.Primary,
      sel.preventAccess.Contingency,
      sel.preventAccess.None
    ),
    hasPreventAccessMethods:
      preventAccessSelected &&
      (h.isCheckboxChecked(sel.preventAccessMethods.ditches) ||
        h.isCheckboxChecked(sel.preventAccessMethods.fences)),
    hasPreventAccessOtherText:
      preventAccessMethodsOther && h.hasValue(sel.preventAccessOtherText),
    hasRestoreVegetation: h.hasAnyRadioChecked(
      sel.restoreVegetation.Primary,
      sel.restoreVegetation.Contingency,
      sel.restoreVegetation.None
    ),
    hasRestrictAccess: h.hasAnyRadioChecked(
      sel.restrictAccess.Primary,
      sel.restrictAccess.Contingency,
      sel.restrictAccess.None
    ),
    hasSuppressantAmount:
      suppSelected &&
      h.hasValue([
        sel.suppressantAmount,
        ...(sel.suppressantAmountFallbacks ?? []),
      ]),
    hasSuppressantFrequency:
      suppSelected &&
      h.hasValue([
        sel.suppressantFrequency,
        ...(sel.suppressantFrequencyFallbacks ?? []),
      ]),
    hasSuppressants: h.hasAnyRadioChecked(
      sel.suppressants.Primary,
      sel.suppressants.Contingency,
      sel.suppressants.None
    ),
    hasVegetative: h.hasAnyRadioChecked(
      sel.vegetative.Primary,
      sel.vegetative.Contingency,
      sel.vegetative.None
    ),
  };
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
  return {
    categoryC1: getCategoryC1State(selectors.categoryC1, helpers),
    categoryC2: getCategoryC2State(selectors.categoryC2, helpers),
    categoryC3: getCategoryC3State(selectors.categoryC3, helpers),
    categoryC4: getCategoryC4State(selectors.categoryC4, helpers),
  };
}
