import { adminCategory } from "@estimates/catalog/definitions/category-admin";
import { controlMeasuresCategory } from "@estimates/catalog/definitions/category-control-measures";
import { dustControlMaricopaCategory } from "@estimates/catalog/definitions/category-dust-control-maricopa";
import { dustControlPimaCategory } from "@estimates/catalog/definitions/category-dust-control-pima";
import { portableToiletsCategory } from "@estimates/catalog/definitions/category-portable-toilets";
import { pressureWashingCategory } from "@estimates/catalog/definitions/category-pressure-washing";
import { rollOffCategory } from "@estimates/catalog/definitions/category-roll-off";
import { siteCleaningCategory } from "@estimates/catalog/definitions/category-site-cleaning";
import { streetSweepingCategory } from "@estimates/catalog/definitions/category-street-sweeping";
import { swpppCategory } from "@estimates/catalog/definitions/category-swppp";
import { tanksCategory } from "@estimates/catalog/definitions/category-tanks";
import { tempFencingCategory } from "@estimates/catalog/definitions/category-temp-fencing";
import { waterEquipmentCategory } from "@estimates/catalog/definitions/category-water-equipment";
import { waterTrucksCategory } from "@estimates/catalog/definitions/category-water-trucks";
import type { CatalogCategory } from "@estimates/catalog/types";

export const catalogCategories: CatalogCategory[] = [
  swpppCategory,
  controlMeasuresCategory,
  dustControlMaricopaCategory,
  dustControlPimaCategory,
  portableToiletsCategory,
  tanksCategory,
  rollOffCategory,
  waterTrucksCategory,
  streetSweepingCategory,
  pressureWashingCategory,
  tempFencingCategory,
  waterEquipmentCategory,
  siteCleaningCategory,
  adminCategory,
];
