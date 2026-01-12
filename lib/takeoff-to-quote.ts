// Utility to convert takeoff annotations into quote line items
import type { TakeoffAnnotation } from "@/lib/pdf-takeoff";
import type { QuoteLineItem } from "@/lib/types";

// Bundle item within a takeoff bundle
export interface TakeoffBundleItem {
  id: string;
  itemId: string;
  code: string;
  name: string;
  unit: string;
  price: number;
  isRequired: boolean;
  quantityMultiplier: number;
}

// Takeoff catalog item interface - matches the API response
export interface TakeoffCatalogItem {
  id: string;
  code: string;
  label: string;
  description: string | null;
  unit: string;
  unitPrice: number;
  unitCost: number;
  color: string;
  type: "count" | "linear" | "area";
  isBundle?: boolean;
  bundleItems?: TakeoffBundleItem[];
  categoryId: string | null;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  notes: string | null;
  defaultQty: number;
}

// Cache for takeoff items
let takeoffItemsCache: TakeoffCatalogItem[] | null = null;

// Fetch takeoff-enabled items from the database
export async function fetchTakeoffItems(): Promise<TakeoffCatalogItem[]> {
  if (takeoffItemsCache) {
    return takeoffItemsCache;
  }

  try {
    const res = await fetch("/api/catalog/takeoff-items");
    if (!res.ok) {
      throw new Error("Failed to fetch takeoff items");
    }
    takeoffItemsCache = await res.json();
    return takeoffItemsCache || [];
  } catch (error) {
    console.error("Error fetching takeoff items:", error);
    return [];
  }
}

// Clear the cache when needed (e.g., after catalog changes)
export function clearTakeoffItemsCache(): void {
  takeoffItemsCache = null;
}

// Build a lookup map from item IDs to catalog data
export function buildCatalogMap(
  items: TakeoffCatalogItem[]
): Map<string, TakeoffCatalogItem> {
  const map = new Map<string, TakeoffCatalogItem>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return map;
}

// Calculate polyline length in PDF points
function calculatePolylineLength(
  points: Array<{ x1: number; y1: number; width: number; height: number }>
): number {
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const x1 = prev.x1;
    const y1 = prev.y1;
    const x2 = curr.x1;
    const y2 = curr.y1;
    totalLength += Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }
  return totalLength;
}

// Calculate polygon area in PDF points squared
function calculatePolygonArea(
  points: Array<{ x1: number; y1: number; width: number; height: number }>
): number {
  if (points.length < 3) {
    return 0;
  }
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const x1 = curr.x1;
    const y1 = curr.y1;
    const x2 = next.x1;
    const y2 = next.y1;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

export interface TakeoffSummaryItem {
  itemId: string;
  label: string;
  quantity: number;
  unit: string;
  catalogCode: string;
  name: string;
  description: string;
  unitPrice: number;
  unitCost: number;
  sectionName: string;
  isFromBundle?: boolean;
  bundleName?: string;
  isRequired?: boolean;
}

// Aggregate annotations by item type and calculate quantities
// catalogItems: pre-fetched takeoff items from the database (now bundles)
// This function expands bundles into individual line items
export function aggregateTakeoffAnnotations(
  annotations: TakeoffAnnotation[],
  pixelsPerFoot: number,
  catalogItems?: TakeoffCatalogItem[]
): TakeoffSummaryItem[] {
  const safeAnnotations = Array.isArray(annotations) ? annotations : [];
  const summaryMap = new Map<string, TakeoffSummaryItem>();

  // Build lookup map from catalog items (bundles)
  const catalogMap = catalogItems
    ? buildCatalogMap(catalogItems)
    : new Map<string, TakeoffCatalogItem>();

  // First pass: calculate total quantity per bundle/item
  const bundleQuantities = new Map<string, number>();

  for (const ann of safeAnnotations) {
    const catalogItem = catalogMap.get(ann.itemId);
    if (!catalogItem) {
      continue;
    }

    let quantity = 0;

    if (ann.type === "count") {
      quantity = 1;
    } else if (ann.type === "polyline" && ann.points) {
      const lengthPoints = calculatePolylineLength(ann.points);
      quantity = lengthPoints / pixelsPerFoot;
    } else if (ann.type === "polygon" && ann.points) {
      const areaPoints = calculatePolygonArea(ann.points);
      quantity = areaPoints / (pixelsPerFoot * pixelsPerFoot);
    }

    const existing = bundleQuantities.get(ann.itemId) || 0;
    bundleQuantities.set(ann.itemId, existing + quantity);
  }

  // Second pass: expand bundles into individual items
  for (const [bundleId, totalQuantity] of bundleQuantities) {
    const catalogItem = catalogMap.get(bundleId);
    if (!catalogItem) {
      continue;
    }

    // Check if this is a bundle with required items
    const requiredBundleItems =
      catalogItem.isBundle && catalogItem.bundleItems
        ? catalogItem.bundleItems.filter((b) => b.isRequired)
        : [];

    if (requiredBundleItems.length > 0) {
      // Expand bundle into individual required items
      for (const bundleItem of requiredBundleItems) {
        // Calculate quantity with multiplier
        const itemQuantity = totalQuantity * bundleItem.quantityMultiplier;

        // Create unique key for this item
        const itemKey = `${bundleId}-${bundleItem.itemId}`;

        const existing = summaryMap.get(itemKey);
        if (existing) {
          existing.quantity += itemQuantity;
        } else {
          summaryMap.set(itemKey, {
            itemId: bundleItem.itemId,
            label: bundleItem.name,
            quantity: itemQuantity,
            unit: bundleItem.unit,
            catalogCode: bundleItem.code,
            name: bundleItem.name,
            description: "",
            unitPrice: bundleItem.price,
            unitCost: bundleItem.price * 0.7, // Estimated cost margin
            sectionName: catalogItem.label, // Use bundle name as section
            isFromBundle: true,
            bundleName: catalogItem.label,
            isRequired: bundleItem.isRequired,
          });
        }
      }
    } else {
      // Non-bundle item OR bundle with no required items - use catalog item directly
      const sectionName =
        catalogItem.subcategoryName || catalogItem.categoryName;

      summaryMap.set(bundleId, {
        itemId: bundleId,
        label: catalogItem.label,
        quantity: totalQuantity,
        unit: catalogItem.unit,
        catalogCode: catalogItem.code,
        name: catalogItem.label,
        description: catalogItem.description || "",
        unitPrice: catalogItem.unitPrice,
        unitCost: catalogItem.unitCost,
        sectionName,
      });
    }
  }

  return Array.from(summaryMap.values()).filter((item) => item.quantity > 0);
}

// Convert takeoff summary items to quote line items
export function convertToQuoteLineItems(
  summaryItems: TakeoffSummaryItem[],
  versionId: string
): Omit<QuoteLineItem, "id" | "created_at" | "updated_at">[] {
  return summaryItems.map((item, index) => ({
    version_id: versionId,
    section_id: null, // Will be set when creating sections
    description: item.name,
    quantity: Math.round(item.quantity * 100) / 100, // Round to 2 decimal places
    unit: item.unit,
    unit_cost: item.unitCost,
    unit_price: item.unitPrice,
    is_excluded: false,
    notes: item.description,
    sort_order: index,
  }));
}

// Group summary items by section for quote creation
export function groupBySection(
  summaryItems: TakeoffSummaryItem[]
): Map<string, TakeoffSummaryItem[]> {
  const groups = new Map<string, TakeoffSummaryItem[]>();

  for (const item of summaryItems) {
    const existing = groups.get(item.sectionName);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(item.sectionName, [item]);
    }
  }

  return groups;
}
