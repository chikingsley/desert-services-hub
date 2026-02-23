import type {
  Catalog,
  CatalogItem,
  CatalogSubcategory,
} from "@/packages/estimates/catalog/types";
import type { EditorEstimate, EditorLineItem } from "@lib/db/types";

export function generateEstimateNumber(sequenceNum = 1): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const seq = String(sequenceNum).padStart(2, "0");
  return `${yy}${mm}${dd}${seq}`;
}

export function createEmptyEstimate(): EditorEstimate {
  return {
    billTo: {
      companyName: "",
      address: "",
      email: "",
      phone: "",
    },
    date: new Date().toISOString(),
    estimateNumber: generateEstimateNumber(1),
    estimator: "",
    estimatorEmail: "",
    jobInfo: {
      siteName: "",
      address: "",
    },
    lineItems: [],
    sections: [],
    total: 0,
  };
}

export function recalcTotal(lineItems: EditorLineItem[]): number {
  return lineItems
    .filter((item) => !item.isStruck)
    .reduce((sum, item) => sum + item.total, 0);
}

export function collectCategoryLineItems(
  category: Catalog["categories"][number],
  timestamp: number,
  categoryId: string
): EditorLineItem[] {
  const items: EditorLineItem[] = [];

  for (const item of category.items ?? []) {
    const qty = item.defaultQty ?? 1;
    items.push({
      cost: item.price,
      description: item.description,
      id: `${timestamp}-${item.code}`,
      item: item.name,
      qty,
      sectionId: categoryId,
      total: item.price * qty,
      uom: item.unit,
    });
  }

  for (const sub of category.subcategories ?? []) {
    if (sub.hidden) {
      continue;
    }
    const isPickOne = sub.selectionMode === "pick-one";
    const itemsToAdd = isPickOne ? [sub.items[0]] : sub.items;
    for (const item of itemsToAdd) {
      if (!item) {
        continue;
      }
      const qty = item.defaultQty ?? 1;
      items.push({
        cost: item.price,
        description: item.description,
        id: `${timestamp}-${item.code}`,
        item: item.name,
        qty,
        sectionId: categoryId,
        subcategoryId: sub.id,
        total: item.price * qty,
        uom: item.unit,
      });
    }
  }

  return items;
}

export type FindCatalogItemFn = (
  catId: string,
  code: string
) => { item: CatalogItem; subcategory?: CatalogSubcategory } | null;

export function maybePairSiltFence(
  updatedLineItems: EditorLineItem[],
  catalogItem: CatalogItem,
  categoryId: string,
  findItem: FindCatalogItemFn
): EditorLineItem[] {
  if (catalogItem.code !== "CM-003") {
    return updatedLineItems;
  }
  const siltFence = findItem(categoryId, "CM-004")?.item;
  if (!siltFence) {
    return updatedLineItems;
  }
  const alreadyHas = updatedLineItems.some(
    (existing) =>
      existing.item === siltFence.name && existing.sectionId === categoryId
  );
  if (alreadyHas) {
    return updatedLineItems;
  }
  return [
    ...updatedLineItems,
    {
      cost: siltFence.price,
      description: siltFence.description,
      id: crypto.randomUUID(),
      isAlternate: true,
      item: siltFence.name,
      qty: 0,
      sectionId: categoryId,
      total: 0,
      uom: siltFence.unit,
    },
  ];
}

export function resolveCatalogSelection(
  parts: string[],
  category: Catalog["categories"][number],
  findItem: FindCatalogItemFn
): { catalogItem: CatalogItem; subcategory?: CatalogSubcategory } | null {
  if (parts.length === 2) {
    const itemCode = parts[1];
    if (!itemCode) {
      return null;
    }
    const result = findItem(parts[0] ?? "", itemCode);
    return result
      ? { catalogItem: result.item, subcategory: result.subcategory }
      : null;
  }
  const subId = parts[1];
  const itemCode = parts[2];
  const subcategory = category.subcategories?.find((s) => s.id === subId);
  if (!subcategory) {
    return null;
  }
  const catalogItem = subcategory.items.find((i) => i.code === itemCode);
  return catalogItem ? { catalogItem, subcategory } : null;
}
