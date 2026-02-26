import { z } from "zod";
import { findItem, getAllItems } from "@/packages/estimates/catalog/catalog";
import type { CatalogItem } from "@/packages/estimates/catalog/types";

const stringOrNullSchema = z.union([z.string(), z.null()]);

export const lineItemSchema = z.looseObject({
    section_id: stringOrNullSchema.optional(),
    code: z.string().trim().optional(),
    item_name: z.string().trim().optional(),
    description: z.string().optional(),
    quantity: z.coerce.number().finite().nonnegative().optional(),
    unit: z.string().trim().optional(),
    unit_price: z.coerce.number().finite().nonnegative().optional(),
    notes: stringOrNullSchema.optional(),
    is_excluded: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
    allow_description_override: z.boolean().optional(),
    allow_unit_override: z.boolean().optional(),
  });

export type RawCatalogLineItem = z.infer<typeof lineItemSchema>;

export interface NormalizedEstimateLineItem {
  description: string;
  is_excluded?: boolean;
  item_name: string;
  notes?: string | null;
  quantity: number;
  section_id?: string | null;
  unit: string;
  unit_price: number;
}

const catalogByName = new Map(
  getAllItems().map((item) => [item.name.toLowerCase(), item])
);

function normalizeText(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function firstFiniteNumber(
  ...values: Array<number | undefined>
): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function isInspectionCatalogItem(item: CatalogItem): boolean {
  return item.code === "SWPPP-005" || item.code === "SWPPP-006";
}

function extractDollarAmounts(text: string): number[] {
  const matches = [...text.matchAll(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/g)];
  return matches
    .map((match) => Number.parseFloat(match[1] ?? "NaN"))
    .filter((value) => Number.isFinite(value));
}

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

function formatRate(value: number): string {
  return `$${value.toFixed(2)}`;
}

function buildInspectionDescription(item: CatalogItem, rate: number): string {
  if (item.code === "SWPPP-005") {
    return [
      "Performed every 14 days or within 24 hours of 1/2-inch rain event.",
      "Includes additional inspections for months with more than 4 weeks.",
      `Additional inspections for rain events and/or project extensions are not included and will be billed at ${formatRate(rate)} each.`,
    ].join(" ");
  }

  return [
    "Performed every 28 days for inactive or stabilized sites.",
    `Additional inspections for rain events and/or project extensions are not included and will be billed at ${formatRate(rate)} each.`,
  ].join(" ");
}

function resolveCatalogItem(rawItem: RawCatalogLineItem): CatalogItem {
  const code = normalizeText(rawItem.code)?.toUpperCase();
  if (code) {
    const byCode = findItem(code);
    if (byCode) {
      return byCode;
    }
  }

  const requestedName = normalizeText(rawItem.item_name);
  if (requestedName) {
    const byName = catalogByName.get(requestedName.toLowerCase());
    if (byName) {
      return byName;
    }
  }

  throw new Error("Item must match a catalog code or exact catalog name.");
}

function resolveQuantity(rawItem: RawCatalogLineItem): number | null {
  const quantity = firstFiniteNumber(rawItem.quantity, 1);
  if (quantity === undefined || quantity < 0) {
    return null;
  }
  return quantity;
}

function resolveUnitPrice(
  rawItem: RawCatalogLineItem,
  catalogItem: CatalogItem
): number | null {
  const unitPrice = firstFiniteNumber(rawItem.unit_price, catalogItem.price);
  if (unitPrice === undefined || unitPrice < 0) {
    return null;
  }
  return unitPrice;
}

function resolveDescription(
  rawItem: RawCatalogLineItem,
  catalogItem: CatalogItem,
  unitPrice: number
): string | null {
  const allowDescriptionOverride = rawItem.allow_description_override === true;
  const catalogDescription = catalogItem.description.trim();

  if (!allowDescriptionOverride && catalogDescription.length === 0) {
    return null;
  }

  if (allowDescriptionOverride) {
    return normalizeText(rawItem.description) ?? "";
  }

  if (isInspectionCatalogItem(catalogItem)) {
    return buildInspectionDescription(catalogItem, unitPrice);
  }

  return catalogDescription;
}

function resolveUnit(
  rawItem: RawCatalogLineItem,
  catalogItem: CatalogItem
): string | null {
  const allowUnitOverride = rawItem.allow_unit_override === true;
  if (!allowUnitOverride) {
    return catalogItem.unit;
  }

  const overriddenUnit = normalizeText(rawItem.unit);
  return overriddenUnit ?? "";
}

function validateInspectionDescriptionRate(
  description: string,
  unitPrice: number
): boolean {
  const descriptionRates = extractDollarAmounts(description);
  if (descriptionRates.length === 0) {
    return false;
  }

  return descriptionRates.every((rate) => amountsMatch(rate, unitPrice));
}

function asExcluded(value: RawCatalogLineItem["is_excluded"]): boolean {
  return value === true || value === 1;
}

function withLineItemPrefix(position: number, message: string): string {
  return `Line item ${position}: ${message}`;
}

function normalizeCatalogLineItem(
  rawItem: RawCatalogLineItem,
  position: number,
  errors: string[]
): NormalizedEstimateLineItem | null {
  let catalogItem: CatalogItem;
  try {
    catalogItem = resolveCatalogItem(rawItem);
  } catch (error) {
    errors.push(withLineItemPrefix(position, (error as Error).message));
    return null;
  }

  const quantity = resolveQuantity(rawItem);
  if (quantity === null) {
    errors.push(withLineItemPrefix(position, "quantity must be 0 or greater."));
    return null;
  }

  const unitPrice = resolveUnitPrice(rawItem, catalogItem);
  if (unitPrice === null) {
    errors.push(
      withLineItemPrefix(
        position,
        "unit_price must be a valid non-negative number."
      )
    );
    return null;
  }

  const description = resolveDescription(rawItem, catalogItem, unitPrice);
  if (description === null) {
    errors.push(
      withLineItemPrefix(
        position,
        `catalog item "${catalogItem.name}" is missing a description.`
      )
    );
    return null;
  }
  if (description.trim().length === 0) {
    errors.push(
      withLineItemPrefix(
        position,
        "description override is enabled but description is empty."
      )
    );
    return null;
  }

  const unit = resolveUnit(rawItem, catalogItem);
  if (!unit || unit.trim().length === 0) {
    errors.push(
      withLineItemPrefix(
        position,
        "unit override is enabled but unit is empty."
      )
    );
    return null;
  }

  if (isInspectionCatalogItem(catalogItem)) {
    const hasMatchingInspectionRate = validateInspectionDescriptionRate(
      description,
      unitPrice
    );
    if (!hasMatchingInspectionRate) {
      errors.push(
        withLineItemPrefix(
          position,
          `inspection description dollar amount must match unit price (${unitPrice.toFixed(2)}).`
        )
      );
      return null;
    }
  }

  return {
    section_id: normalizeText(rawItem.section_id) ?? null,
    item_name: catalogItem.name,
    description,
    quantity,
    unit,
    unit_price: unitPrice,
    notes: normalizeText(rawItem.notes) ?? null,
    is_excluded: asExcluded(rawItem.is_excluded),
  };
}

export function normalizeCatalogLineItems(
  rawLineItems: RawCatalogLineItem[],
  errors: string[]
): NormalizedEstimateLineItem[] {
  const normalizedItems: NormalizedEstimateLineItem[] = [];

  for (const [index, rawItem] of rawLineItems.entries()) {
    const normalized = normalizeCatalogLineItem(rawItem, index + 1, errors);
    if (normalized) {
      normalizedItems.push(normalized);
    }
  }

  return normalizedItems;
}
