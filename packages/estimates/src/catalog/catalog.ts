// Service catalog for Desert Services estimates
// 2026 Pricing - Effective January 1st, 2026

import { catalogCategories } from "@estimates/catalog/definitions/categories";
import { takeoffBundlesData } from "@estimates/catalog/definitions/takeoff-bundles";
import type {
  Catalog,
  CatalogCategory,
  CatalogItem,
  LineItem,
  TakeoffBundle,
} from "@estimates/catalog/types";

export const catalog: Catalog = {
  categories: catalogCategories,
};

export const takeoffBundles: TakeoffBundle[] = takeoffBundlesData;

// Get all items from catalog as flat list
export function getAllItems(): CatalogItem[] {
  const items: CatalogItem[] = [];

  for (const category of catalog.categories) {
    if (category.items) {
      for (const item of category.items) {
        items.push(item);
      }
    }

    if (category.subcategories) {
      for (const sub of category.subcategories) {
        for (const item of sub.items) {
          items.push(item);
        }
      }
    }
  }

  return items;
}

// Find item by code
export function findItem(code: string): CatalogItem | null {
  for (const item of getAllItems()) {
    if (item.code === code) {
      return item;
    }
  }
  return null;
}

// Find category by id
export function findCategory(id: string): CatalogCategory | null {
  for (const category of catalog.categories) {
    if (category.id === id) {
      return category;
    }
  }
  return null;
}

// Check if code exists in category items or subcategory items
function categoryContainsCode(
  category: CatalogCategory,
  code: string
): boolean {
  const directMatch =
    category.items?.some((item) => item.code === code) ?? false;
  if (directMatch) {
    return true;
  }

  return (
    category.subcategories?.some((sub) =>
      sub.items.some((item) => item.code === code)
    ) ?? false
  );
}

// Find category containing an item by code
export function findItemCategory(
  code: string
): { categoryId: string; categoryName: string } | null {
  const category = catalog.categories.find((cat) =>
    categoryContainsCode(cat, code)
  );
  if (category) {
    return { categoryId: category.id, categoryName: category.name };
  }
  return null;
}

// Create a line item from catalog code
export function createLineItem(code: string, qty?: number): LineItem | null {
  const catalogItem = findItem(code);
  if (catalogItem === null) {
    return null;
  }

  const quantity = qty ?? catalogItem.defaultQty ?? 1;

  return {
    id: crypto.randomUUID(),
    item: catalogItem.name,
    description: catalogItem.description,
    qty: quantity,
    uom: catalogItem.unit,
    cost: catalogItem.price,
    total: catalogItem.price * quantity,
  };
}

// Create multiple line items from codes
export function createLineItems(
  items: Array<{ code: string; qty?: number }>
): LineItem[] {
  const lineItems: LineItem[] = [];

  for (const { code, qty } of items) {
    const lineItem = createLineItem(code, qty);
    if (lineItem !== null) {
      lineItems.push(lineItem);
    }
  }

  return lineItems;
}

// Calculate total from line items
export function calculateTotal(lineItems: LineItem[]): number {
  let total = 0;
  for (const item of lineItems) {
    total += item.total;
  }
  return total;
}

// Get takeoff bundles formatted for the takeoff editor
export function getTakeoffItems() {
  return takeoffBundles.map((bundle) => {
    const bundleItems = bundle.items
      .map((bundleItem) => {
        const catalogItem = findItem(bundleItem.code);
        if (!catalogItem) {
          return null;
        }
        return {
          id: `bi-${bundleItem.code}`,
          itemId: bundleItem.code,
          code: bundleItem.code,
          name: catalogItem.name,
          unit: catalogItem.unit,
          price: catalogItem.price,
          isRequired: bundleItem.isRequired,
          quantityMultiplier: bundleItem.quantityMultiplier,
        };
      })
      .filter((item) => item !== null);

    return {
      id: bundle.id,
      code: `BUNDLE-${bundle.id.slice(0, 8).toUpperCase()}`,
      label: bundle.name,
      description: bundle.description,
      unit: bundle.unit,
      unitPrice: 0,
      color: bundle.color,
      type: bundle.toolType,
      isBundle: true,
      bundleItems,
      categoryId: null,
      categoryName: "Takeoff Bundles",
      subcategoryId: null,
      subcategoryName: null,
      notes: null,
      defaultQty: 1,
    };
  });
}
