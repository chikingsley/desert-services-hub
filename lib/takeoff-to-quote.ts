// Utility to convert takeoff annotations into quote line items
import type { TakeoffAnnotation } from "@/lib/pdf-takeoff";
import type { QuoteLineItem } from "@/lib/types";

// Catalog mapping from takeoff preset items to catalog pricing
// Based on Desert Services catalog from quoting-example
export const TAKEOFF_CATALOG_MAP: Record<
  string,
  {
    catalogCode: string;
    name: string;
    description: string;
    unitPrice: number;
    unit: string;
    unitCost: number;
    sectionName: string;
  }
> = {
  temp_fence: {
    catalogCode: "TF-001",
    name: "Temporary Fencing Install/Remove",
    description: "Pounded or stands, gate included",
    unitPrice: 1.35,
    unit: "LF",
    unitCost: 0.95,
    sectionName: "Temporary Fencing",
  },
  filter_sock: {
    catalogCode: "CM-003",
    name: 'Compost Filter Sock (9")',
    description: "ADEQ Approved erosion control",
    unitPrice: 2.45,
    unit: "LF",
    unitCost: 1.75,
    sectionName: "SWPPP Control Measures",
  },
  silt_fence: {
    catalogCode: "CM-004",
    name: "Wire-Backed Silt Fence",
    description: "Steel T-Posts via Tommy Slice Method",
    unitPrice: 4.9,
    unit: "LF",
    unitCost: 3.5,
    sectionName: "SWPPP Control Measures",
  },
  curb_inlet: {
    catalogCode: "CM-006",
    name: "Curb Inlet Protection",
    description: "Sediment Barrier for Curb Drains",
    unitPrice: 375,
    unit: "EA",
    unitCost: 275,
    sectionName: "SWPPP Control Measures",
  },
  drop_inlet: {
    catalogCode: "CM-005",
    name: "Drop Inlet Protection",
    description: "Sediment Barrier for Drop Inlets",
    unitPrice: 145,
    unit: "EA",
    unitCost: 105,
    sectionName: "SWPPP Control Measures",
  },
  rumble_grate: {
    catalogCode: "CM-002",
    name: "Rumble Grates Rental",
    description: "Monthly rental per entrance",
    unitPrice: 550,
    unit: "Month",
    unitCost: 400,
    sectionName: "SWPPP Control Measures",
  },
  rock_entrance: {
    catalogCode: "CM-001",
    name: "Rock Entrance w/ Fabric",
    description: "Includes Filter Fabric per SWPPP",
    unitPrice: 2475,
    unit: "EA",
    unitCost: 1800,
    sectionName: "SWPPP Control Measures",
  },
  area: {
    catalogCode: "AREA-001",
    name: "Site Area",
    description: "Total measured area",
    unitPrice: 0,
    unit: "SF",
    unitCost: 0,
    sectionName: "Site Measurements",
  },
};

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
}

// Aggregate annotations by item type and calculate quantities
export function aggregateTakeoffAnnotations(
  annotations: TakeoffAnnotation[],
  pixelsPerFoot: number
): TakeoffSummaryItem[] {
  const safeAnnotations = Array.isArray(annotations) ? annotations : [];
  const summaryMap = new Map<string, TakeoffSummaryItem>();

  for (const ann of safeAnnotations) {
    const catalogItem = TAKEOFF_CATALOG_MAP[ann.itemId];
    if (!catalogItem) {
      continue;
    }

    let quantity = 0;
    let unit = catalogItem.unit;

    if (ann.type === "count") {
      quantity = 1;
    } else if (ann.type === "polyline" && ann.points) {
      const lengthPoints = calculatePolylineLength(ann.points);
      quantity = lengthPoints / pixelsPerFoot;
      unit = "LF";
    } else if (ann.type === "polygon" && ann.points) {
      const areaPoints = calculatePolygonArea(ann.points);
      quantity = areaPoints / (pixelsPerFoot * pixelsPerFoot);
      unit = "SF";
    }

    const existing = summaryMap.get(ann.itemId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      summaryMap.set(ann.itemId, {
        itemId: ann.itemId,
        label: ann.label,
        quantity,
        unit,
        catalogCode: catalogItem.catalogCode,
        name: catalogItem.name,
        description: catalogItem.description,
        unitPrice: catalogItem.unitPrice,
        unitCost: catalogItem.unitCost,
        sectionName: catalogItem.sectionName,
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
