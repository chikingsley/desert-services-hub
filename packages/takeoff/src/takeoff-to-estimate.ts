// Utility to convert takeoff annotations into estimate line items

import type { EstimateLineItem } from "@lib/db/types";
import type { TakeoffAnnotation } from "@takeoff/pdf-takeoff";

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

// Calculate quantity for a single annotation based on its type
function calculateAnnotationQuantity(
  annotation: TakeoffAnnotation,
  pixelsPerFoot: number
): number {
  switch (annotation.type) {
    case "count":
      return 1;
    case "polyline":
      return annotation.points
        ? calculatePolylineLength(annotation.points) / pixelsPerFoot
        : 0;
    case "polygon":
      return annotation.points
        ? calculatePolygonArea(annotation.points) / pixelsPerFoot ** 2
        : 0;
    default:
      return 0;
  }
}

// Accumulate quantities from annotations by item ID
function accumulateQuantitiesByItem(
  annotations: TakeoffAnnotation[],
  catalogMap: Map<string, TakeoffCatalogItem>,
  pixelsPerFoot: number
): Map<string, number> {
  const quantities = new Map<string, number>();

  for (const ann of annotations) {
    if (!catalogMap.has(ann.itemId)) {
      continue;
    }
    const quantity = calculateAnnotationQuantity(ann, pixelsPerFoot);
    const existing = quantities.get(ann.itemId) ?? 0;
    quantities.set(ann.itemId, existing + quantity);
  }

  return quantities;
}

// Expand a bundle item into individual summary items
function expandBundleIntoItems(
  bundleId: string,
  totalQuantity: number,
  catalogItem: TakeoffCatalogItem,
  summaryMap: Map<string, TakeoffSummaryItem>
): void {
  const requiredItems =
    catalogItem.bundleItems?.filter((b) => b.isRequired) ?? [];

  for (const bundleItem of requiredItems) {
    const itemQuantity = totalQuantity * bundleItem.quantityMultiplier;
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
        sectionName: catalogItem.label,
        isFromBundle: true,
        bundleName: catalogItem.label,
        isRequired: bundleItem.isRequired,
      });
    }
  }
}

// Add a direct (non-bundle or empty-bundle) item to summary
function addDirectItem(
  itemId: string,
  totalQuantity: number,
  catalogItem: TakeoffCatalogItem,
  summaryMap: Map<string, TakeoffSummaryItem>
): void {
  const sectionName = catalogItem.subcategoryName || catalogItem.categoryName;

  summaryMap.set(itemId, {
    itemId,
    label: catalogItem.label,
    quantity: totalQuantity,
    unit: catalogItem.unit,
    catalogCode: catalogItem.code,
    name: catalogItem.label,
    description: catalogItem.description || "",
    unitPrice: catalogItem.unitPrice,
    sectionName,
  });
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
  const catalogMap = catalogItems
    ? buildCatalogMap(catalogItems)
    : new Map<string, TakeoffCatalogItem>();

  // Step 1: Accumulate total quantity per item
  const itemQuantities = accumulateQuantitiesByItem(
    safeAnnotations,
    catalogMap,
    pixelsPerFoot
  );

  // Step 2: Expand bundles into individual items
  const summaryMap = new Map<string, TakeoffSummaryItem>();

  for (const [itemId, totalQuantity] of itemQuantities) {
    const catalogItem = catalogMap.get(itemId);
    if (!catalogItem) {
      continue;
    }

    const hasRequiredBundleItems =
      catalogItem.isBundle &&
      catalogItem.bundleItems?.some((b) => b.isRequired);

    if (hasRequiredBundleItems) {
      expandBundleIntoItems(itemId, totalQuantity, catalogItem, summaryMap);
    } else {
      addDirectItem(itemId, totalQuantity, catalogItem, summaryMap);
    }
  }

  return Array.from(summaryMap.values()).filter((item) => item.quantity > 0);
}

// Convert takeoff summary items to estimate line items
export function convertToEstimateLineItems(
  summaryItems: TakeoffSummaryItem[],
  versionId: string
): Omit<EstimateLineItem, "id" | "created_at" | "updated_at">[] {
  return summaryItems.map((item, index) => ({
    version_id: versionId,
    section_id: null, // Will be set when creating sections
    item_name: item.name,
    description: item.description || item.name,
    quantity: Math.round(item.quantity * 100) / 100, // Round to 2 decimal places
    unit: item.unit,
    unit_price: item.unitPrice,
    is_excluded: false,
    notes: null,
    sort_order: index,
  }));
}

// Group summary items by section for estimate creation
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
