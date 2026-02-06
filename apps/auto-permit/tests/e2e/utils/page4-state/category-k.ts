/**
 * Category K State Verification (Water Supply)
 */

import type { SelectorMap } from "@/form-data";
import type { ValidationHelpers } from "./helpers";

export interface CategoryKState {
  hasSoilTextureOnSite: boolean;
  hasSoilTextureImported: boolean;
  hasWaterSource: boolean;
  hasWaterMethod: boolean;
  hasMeteredHydrantQty: boolean;
  hasMeteredHydrantSize: boolean;
  hasWaterTowerQty: boolean;
  hasWaterTowerSize: boolean;
  hasWaterPondQty: boolean;
  hasWaterPondSize: boolean;
  hasOffSiteQty: boolean;
  hasOffSiteSize: boolean;
  hasHoseBibQty: boolean;
  hasHoseBibSize: boolean;
  hasOtherSourceQty: boolean;
  hasOtherSourceSize: boolean;
  hasHoseQty: boolean;
  hasHoseSize: boolean;
  hasWaterTruckQty: boolean;
  hasWaterTruckSize: boolean;
  hasWaterPullQty: boolean;
  hasWaterPullSize: boolean;
  hasWaterBuffaloQty: boolean;
  hasWaterBuffaloSize: boolean;
  hasOtherMethodQty: boolean;
  hasOtherMethodSize: boolean;
}

export function getCategoryKState(
  selectors: SelectorMap,
  helpers: ValidationHelpers
): CategoryKState {
  const { isRadioChecked, isCheckboxChecked, hasValue } = helpers;
  const { categoryK } = selectors;

  const { soilTexture, waterSources, waterMethods } = categoryK;

  return {
    hasSoilTextureOnSite:
      isRadioChecked(soilTexture.onSite.moderate) ||
      isRadioChecked(soilTexture.onSite.severe),
    hasSoilTextureImported:
      isRadioChecked(soilTexture.imported.moderate) ||
      isRadioChecked(soilTexture.imported.none) ||
      isRadioChecked(soilTexture.imported.severe),
    hasWaterSource:
      isCheckboxChecked(waterSources.meteredHydrant.yes) ||
      isCheckboxChecked(waterSources.waterTower.yes) ||
      isCheckboxChecked(waterSources.waterPond.yes) ||
      isCheckboxChecked(waterSources.offSite.yes) ||
      isCheckboxChecked(waterSources.hoseBib.yes) ||
      isCheckboxChecked(waterSources.other.yes),
    hasWaterMethod:
      isCheckboxChecked(waterMethods.hose.yes) ||
      isCheckboxChecked(waterMethods.waterTruck.yes) ||
      isCheckboxChecked(waterMethods.waterPull.yes) ||
      isCheckboxChecked(waterMethods.waterBuffalo.yes) ||
      isCheckboxChecked(waterMethods.other.yes),
    hasMeteredHydrantQty: hasValue(waterSources.meteredHydrantQty),
    hasMeteredHydrantSize: hasValue(waterSources.meteredHydrantSize),
    hasWaterTowerQty: hasValue(waterSources.waterTowerQty),
    hasWaterTowerSize: hasValue(waterSources.waterTowerSize),
    hasWaterPondQty: hasValue(waterSources.waterPondQty),
    hasWaterPondSize: hasValue(waterSources.waterPondSize),
    hasOffSiteQty: hasValue(waterSources.offSiteQty),
    hasOffSiteSize: hasValue(waterSources.offSiteSize),
    hasHoseBibQty: hasValue(waterSources.hoseBibQty),
    hasHoseBibSize: hasValue(waterSources.hoseBibSize),
    hasOtherSourceQty: hasValue(waterSources.otherQty),
    hasOtherSourceSize: hasValue(waterSources.otherSize),
    hasHoseQty: hasValue(waterMethods.hoseQty),
    hasHoseSize: hasValue(waterMethods.hoseSize),
    hasWaterTruckQty: hasValue(waterMethods.waterTruckQty),
    hasWaterTruckSize: hasValue(waterMethods.waterTruckSize),
    hasWaterPullQty: hasValue(waterMethods.waterPullQty),
    hasWaterPullSize: hasValue(waterMethods.waterPullSize),
    hasWaterBuffaloQty: hasValue(waterMethods.waterBuffaloQty),
    hasWaterBuffaloSize: hasValue(waterMethods.waterBuffaloSize),
    hasOtherMethodQty: hasValue(waterMethods.otherQty),
    hasOtherMethodSize: hasValue(waterMethods.otherSize),
  };
}
