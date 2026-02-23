import { adminCategory } from "@/packages/estimates/catalog/definitions/category-admin";
import { controlMeasuresCategory } from "@/packages/estimates/catalog/definitions/category-control-measures";
import { dustControlMaricopaCategory } from "@/packages/estimates/catalog/definitions/category-dust-control-maricopa";
import { dustControlPimaCategory } from "@/packages/estimates/catalog/definitions/category-dust-control-pima";
import { portableToiletsCategory } from "@/packages/estimates/catalog/definitions/category-portable-toilets";
import { pressureWashingCategory } from "@/packages/estimates/catalog/definitions/category-pressure-washing";
import { rollOffCategory } from "@/packages/estimates/catalog/definitions/category-roll-off";
import { siteCleaningCategory } from "@/packages/estimates/catalog/definitions/category-site-cleaning";
import { streetSweepingCategory } from "@/packages/estimates/catalog/definitions/category-street-sweeping";
import { swpppCategory } from "@/packages/estimates/catalog/definitions/category-swppp";
import { tanksCategory } from "@/packages/estimates/catalog/definitions/category-tanks";
import { tempFencingCategory } from "@/packages/estimates/catalog/definitions/category-temp-fencing";
import { waterEquipmentCategory } from "@/packages/estimates/catalog/definitions/category-water-equipment";
import { waterTrucksCategory } from "@/packages/estimates/catalog/definitions/category-water-trucks";
import type { CatalogCategory } from "@/packages/estimates/catalog/types";

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
