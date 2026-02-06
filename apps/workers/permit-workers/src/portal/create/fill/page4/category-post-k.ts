/**
 * Fill Post-K Water Tier Categories (siTable:54-67)
 *
 * Post-K sections include water tier-based requirements for various disturbances:
 * - B1 (siTable:54), B2 (siTable:55)
 * - C2 (siTable:56), C3 (siTable:57)
 * - F2 (siTable:58)
 * - G1 (siTable:59), G2 (siTable:60)
 * - H (siTable:61)
 * - I1 (siTable:62), I2 (siTable:63)
 * - J (siTable:64)
 * - D4 (siTable:65) - cubic yards instead of water tier
 * - F1NovFeb (siTable:66), F1MarOct (siTable:67) - acres only, no water tier
 *
 * Water tiers are selected based on avgDailyDisturbedAcres:
 * - 0-2 acres
 * - 2-10 acres
 * - 10-100 acres
 * - 100+ acres
 *
 * IMPORTANT: buildFormData's reconcilePostK has already resolved which sections
 * are active and what acreage they should use. If avgDailyDisturbedAcres is null,
 * the section's category doesn't apply - skip it. If non-null, fill confidently.
 */

import type { Page } from "playwright";
import { type FormData, getWaterTier } from "@/form-data";
import { clickRadio, fillText } from "@/portal/utils/helpers";
import { selectors } from "@/portal/utils/selectors";

/**
 * Select water tier radio based on acres value.
 */
async function selectWaterTier(
  page: Page,
  waterTierSelectors: Record<"0-2" | "2-10" | "10-100" | "100+", string>,
  acres: number
): Promise<void> {
  const tier = getWaterTier(acres);
  await clickRadio(page, waterTierSelectors[tier]);
}

/**
 * Fill Category B.1 (Post-K, siTable:54) - Unpaved Staging Areas
 */
async function fillPostKB1(page: Page, data: FormData): Promise<void> {
  const acres = data.postK.b1.avgDailyDisturbedAcres;
  if (acres === null) {
    return;
  }

  console.log("  Post-K B.1 - Unpaved Staging Areas...");
  const b1 = selectors.postK.b1;
  await selectWaterTier(page, b1.waterTier, acres);
  await fillText(page, b1.avgDailyDisturbedAcres, String(acres));
}

/**
 * Fill Category B.2 (Post-K, siTable:55) - Unpaved Haul Roads
 */
async function fillPostKB2(page: Page, data: FormData): Promise<void> {
  const acres = data.postK.b2.avgDailyDisturbedAcres;
  if (acres === null) {
    return;
  }

  console.log("  Post-K B.2 - Unpaved Haul Roads...");
  const b2 = selectors.postK.b2;
  await selectWaterTier(page, b2.waterTier, acres);
  await fillText(page, b2.avgDailyDisturbedAcres, String(acres));
}

/**
 * Fill Category C.2 (Post-K, siTable:56) - Disturbed Surfaces (Active Operations)
 */
async function fillPostKC2(page: Page, data: FormData): Promise<void> {
  const acres = data.postK.c2.avgDailyDisturbedAcres;
  if (acres === null) {
    return;
  }

  console.log("  Post-K C.2 - Disturbed Surfaces (Active Operations)...");
  const c2 = selectors.postK.c2;
  await selectWaterTier(page, c2.waterTier, acres);
  await fillText(page, c2.avgDailyDisturbedAcres, String(acres));
}

/**
 * Fill Category C.3 (Post-K, siTable:57) - Disturbed Surfaces (Inactive Periods)
 */
async function fillPostKC3(page: Page, data: FormData): Promise<void> {
  const acres = data.postK.c3.avgDailyDisturbedAcres;
  if (acres === null) {
    return;
  }

  console.log("  Post-K C.3 - Disturbed Surfaces (Inactive Periods)...");
  const c3 = selectors.postK.c3;
  await selectWaterTier(page, c3.waterTier, acres);
  await fillText(page, c3.avgDailyDisturbedAcres, String(acres));
}

/**
 * Fill Category F.2 (Post-K, siTable:58) - Fine Grading
 */
async function fillPostKF2(page: Page, data: FormData): Promise<void> {
  const acres = data.postK.f2.avgDailyDisturbedAcres;
  if (acres === null) {
    return;
  }

  console.log("  Post-K F.2 - Fine Grading...");
  const f2 = selectors.postK.f2;
  await selectWaterTier(page, f2.waterTier, acres);
  await fillText(page, f2.avgDailyDisturbedAcres, String(acres));
}

/**
 * Fill Category G.1 (Post-K, siTable:59) - Underground Utilities
 */
async function fillPostKG1(page: Page, data: FormData): Promise<void> {
  const acres = data.postK.g1.avgDailyDisturbedAcres;
  if (acres === null) {
    return;
  }

  console.log("  Post-K G.1 - Underground Utilities...");
  const g1 = selectors.postK.g1;
  await selectWaterTier(page, g1.waterTier, acres);
  await fillText(page, g1.avgDailyDisturbedAcres, String(acres));
}

/**
 * Fill Category G.2 (Post-K, siTable:60) - Vertical Structures
 */
async function fillPostKG2(page: Page, data: FormData): Promise<void> {
  const acres = data.postK.g2.avgDailyDisturbedAcres;
  if (acres === null) {
    return;
  }

  console.log("  Post-K G.2 - Vertical Structures...");
  const g2 = selectors.postK.g2;
  await selectWaterTier(page, g2.waterTier, acres);
  await fillText(page, g2.avgDailyDisturbedAcres, String(acres));
}

/**
 * Fill Category H (Post-K, siTable:61) - Demolition
 */
async function fillPostKH(page: Page, data: FormData): Promise<void> {
  const acres = data.postK.h.avgDailyDisturbedAcres;
  if (acres === null) {
    return;
  }

  console.log("  Post-K H - Demolition...");
  const h = selectors.postK.h;
  await selectWaterTier(page, h.waterTier, acres);
  await fillText(page, h.avgDailyDisturbedAcres, String(acres));
}

/**
 * Fill Category I.1 (Post-K, siTable:62) - During Weed Abatement
 */
async function fillPostKI1(page: Page, data: FormData): Promise<void> {
  const acres = data.postK.i1.avgDailyDisturbedAcres;
  if (acres === null) {
    return;
  }

  console.log("  Post-K I.1 - During Weed Abatement...");
  const i1 = selectors.postK.i1;
  await selectWaterTier(page, i1.waterTier, acres);
  await fillText(page, i1.avgDailyDisturbedAcres, String(acres));
}

/**
 * Fill Category I.2 (Post-K, siTable:63) - Stabilization following Weed Abatement
 */
async function fillPostKI2(page: Page, data: FormData): Promise<void> {
  const acres = data.postK.i2.avgDailyDisturbedAcres;
  if (acres === null) {
    return;
  }

  console.log("  Post-K I.2 - Stabilization following Weed Abatement...");
  const i2 = selectors.postK.i2;
  await selectWaterTier(page, i2.waterTier, acres);
  await fillText(page, i2.avgDailyDisturbedAcres, String(acres));
}

/**
 * Fill Category J (Post-K, siTable:64) - Blasting
 */
async function fillPostKJ(page: Page, data: FormData): Promise<void> {
  const acres = data.postK.j.avgDailyDisturbedAcres;
  if (acres === null) {
    return;
  }

  console.log("  Post-K J - Blasting...");
  const j = selectors.postK.j;
  await selectWaterTier(page, j.waterTier, acres);
  await fillText(page, j.avgDailyDisturbedAcres, String(acres));
}

/**
 * Fill Category D.4 (Post-K, siTable:65) - Bulk Material Loading/Unloading
 * D.4 has cubic yards import/export instead of water tier
 */
async function fillPostKD4(page: Page, data: FormData): Promise<void> {
  const { cubicYardsImport, cubicYardsExport } = data.postK.d4;
  if (!(cubicYardsImport || cubicYardsExport)) {
    return;
  }

  console.log("  Post-K D.4 - Bulk Material Loading/Unloading...");
  const d4 = selectors.postK.d4;
  if (cubicYardsImport) {
    await fillText(page, d4.cubicYardsImport, String(cubicYardsImport));
  }
  if (cubicYardsExport) {
    await fillText(page, d4.cubicYardsExport, String(cubicYardsExport));
  }
}

/**
 * Fill Category F.1 Nov-Feb (Post-K, siTable:66) - Mass Grading November-February
 */
async function fillPostKF1NovFeb(page: Page, data: FormData): Promise<void> {
  const acres = data.postK.f1NovFeb.avgDailyDisturbedAcres;
  if (acres === null) {
    return;
  }

  console.log("  Post-K F.1 Nov-Feb - Mass Grading...");
  await fillText(
    page,
    selectors.postK.f1NovFeb.avgDailyDisturbedAcres,
    String(acres)
  );
}

/**
 * Fill Category F.1 Mar-Oct (Post-K, siTable:67) - Mass Grading March-October
 */
async function fillPostKF1MarOct(page: Page, data: FormData): Promise<void> {
  const acres = data.postK.f1MarOct.avgDailyDisturbedAcres;
  if (acres === null) {
    return;
  }

  console.log("  Post-K F.1 Mar-Oct - Mass Grading...");
  await fillText(
    page,
    selectors.postK.f1MarOct.avgDailyDisturbedAcres,
    String(acres)
  );
}

/**
 * Fill all Post-K categories.
 * buildFormData's reconcilePostK has already determined which sections are active
 * (non-null acreage) and which are inactive (null acreage). Each fill function
 * simply checks for null and skips inactive sections.
 */
export async function fillPostK(page: Page, data: FormData): Promise<void> {
  await fillPostKB1(page, data);
  await fillPostKB2(page, data);
  await fillPostKC2(page, data);
  await fillPostKC3(page, data);
  await fillPostKF2(page, data);
  await fillPostKG1(page, data);
  await fillPostKG2(page, data);
  await fillPostKH(page, data);
  await fillPostKI1(page, data);
  await fillPostKI2(page, data);
  await fillPostKJ(page, data);
  await fillPostKD4(page, data);
  await fillPostKF1NovFeb(page, data);
  await fillPostKF1MarOct(page, data);
}
