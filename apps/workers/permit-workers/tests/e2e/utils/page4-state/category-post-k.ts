/**
 * Post-K State Verification
 * Handles Water Tier and Average Daily Disturbed Acres
 */

import type { SelectorMap } from "@/form-data";
import type { ValidationHelpers } from "./helpers";

export interface WaterTierState {
  "0-2": boolean;
  "2-10": boolean;
  "10-100": boolean;
  "100+": boolean;
}

export interface PostKState {
  b1: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
  b2: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
  c2: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
  c3: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
  f2: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
  g1: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
  g2: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
  h: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
  i1: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
  i2: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
  j: { hasWaterTier: boolean; hasAvgDailyAcres: boolean };
  d4: { hasCubicYardsImport: boolean; hasCubicYardsExport: boolean };
  f1NovFeb: { hasAvgDailyAcres: boolean };
  f1MarOct: { hasAvgDailyAcres: boolean };
}

export function getPostKState(
  selectors: SelectorMap,
  helpers: ValidationHelpers
): PostKState {
  const { isRadioChecked, hasValue } = helpers;
  const { postK } = selectors;

  // Helper to check if any water tier is selected
  const hasWaterTierSelected = (tierSelectors: unknown) => {
    if (!tierSelectors || typeof tierSelectors !== "object") {
      return false;
    }
    const ts = tierSelectors as Record<string, string>;
    return (
      (ts["0-2"] ? isRadioChecked(ts["0-2"]) : false) ||
      (ts["2-10"] ? isRadioChecked(ts["2-10"]) : false) ||
      (ts["10-100"] ? isRadioChecked(ts["10-100"]) : false) ||
      (ts["100+"] ? isRadioChecked(ts["100+"]) : false)
    );
  };

  // Helper to check value safely
  const safeHasValue = (sel: unknown) => {
    if (typeof sel !== "string" || !sel) {
      return false;
    }
    return hasValue(sel);
  };

  return {
    b1: {
      hasWaterTier: hasWaterTierSelected(postK.b1?.waterTier),
      hasAvgDailyAcres: safeHasValue(postK.b1?.avgDailyDisturbedAcres),
    },
    b2: {
      hasWaterTier: hasWaterTierSelected(postK.b2?.waterTier),
      hasAvgDailyAcres: safeHasValue(postK.b2?.avgDailyDisturbedAcres),
    },
    c2: {
      hasWaterTier: hasWaterTierSelected(postK.c2?.waterTier),
      hasAvgDailyAcres: safeHasValue(postK.c2?.avgDailyDisturbedAcres),
    },
    c3: {
      hasWaterTier: hasWaterTierSelected(postK.c3?.waterTier),
      hasAvgDailyAcres: safeHasValue(postK.c3?.avgDailyDisturbedAcres),
    },
    f2: {
      hasWaterTier: hasWaterTierSelected(postK.f2?.waterTier),
      hasAvgDailyAcres: safeHasValue(postK.f2?.avgDailyDisturbedAcres),
    },
    g1: {
      hasWaterTier: hasWaterTierSelected(postK.g1?.waterTier),
      hasAvgDailyAcres: safeHasValue(postK.g1?.avgDailyDisturbedAcres),
    },
    g2: {
      hasWaterTier: hasWaterTierSelected(postK.g2?.waterTier),
      hasAvgDailyAcres: safeHasValue(postK.g2?.avgDailyDisturbedAcres),
    },
    h: {
      hasWaterTier: hasWaterTierSelected(postK.h?.waterTier),
      hasAvgDailyAcres: safeHasValue(postK.h?.avgDailyDisturbedAcres),
    },
    i1: {
      hasWaterTier: hasWaterTierSelected(postK.i1?.waterTier),
      hasAvgDailyAcres: safeHasValue(postK.i1?.avgDailyDisturbedAcres),
    },
    i2: {
      hasWaterTier: hasWaterTierSelected(postK.i2?.waterTier),
      hasAvgDailyAcres: safeHasValue(postK.i2?.avgDailyDisturbedAcres),
    },
    j: {
      hasWaterTier: hasWaterTierSelected(postK.j?.waterTier),
      hasAvgDailyAcres: safeHasValue(postK.j?.avgDailyDisturbedAcres),
    },
    d4: {
      hasCubicYardsImport: safeHasValue(postK.d4?.cubicYardsImport),
      hasCubicYardsExport: safeHasValue(postK.d4?.cubicYardsExport),
    },
    f1NovFeb: {
      hasAvgDailyAcres: safeHasValue(postK.f1NovFeb?.avgDailyDisturbedAcres),
    },
    f1MarOct: {
      hasAvgDailyAcres: safeHasValue(postK.f1MarOct?.avgDailyDisturbedAcres),
    },
  };
}
