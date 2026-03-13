export type MaricopaPermitPricingTier =
  | "0.1-<1"
  | "1-10"
  | "10-50"
  | "50-100"
  | "100-500"
  | "500+";

/**
 * Maricopa dust permit pricing tiers (2026 schedule):
 * - 0.1 to <1
 * - 1 to 10
 * - >10 to 50
 * - >50 to 100
 * - >100 to 500
 * - >500
 *
 * Returns null when acreage is below permit threshold (<0.1).
 */
export function getMaricopaPermitPricingTier(
  acres: number
): MaricopaPermitPricingTier | null {
  if (!Number.isFinite(acres) || acres < 0.1) {
    return null;
  }
  if (acres < 1) {
    return "0.1-<1";
  }
  if (acres <= 10) {
    return "1-10";
  }
  if (acres <= 50) {
    return "10-50";
  }
  if (acres <= 100) {
    return "50-100";
  }
  if (acres <= 500) {
    return "100-500";
  }
  return "500+";
}

export interface ParcelAcreageDecision {
  approved: boolean;
  disturbedAcres: number;
  disturbedTier: MaricopaPermitPricingTier | null;
  parcelAcres: number;
  parcelAtLeastDisturbed: boolean;
  parcelTier: MaricopaPermitPricingTier | null;
  samePricingTier: boolean;
}

export function evaluateParcelAcreageDecision(
  disturbedAcres: number,
  parcelAcres: number
): ParcelAcreageDecision {
  const disturbedTier = getMaricopaPermitPricingTier(disturbedAcres);
  const parcelTier = getMaricopaPermitPricingTier(parcelAcres);
  const parcelAtLeastDisturbed = parcelAcres >= disturbedAcres;
  const samePricingTier =
    disturbedTier !== null &&
    parcelTier !== null &&
    parcelTier === disturbedTier;

  return {
    approved: parcelAtLeastDisturbed && samePricingTier,
    disturbedAcres,
    disturbedTier,
    parcelAcres,
    parcelAtLeastDisturbed,
    parcelTier,
    samePricingTier,
  };
}
