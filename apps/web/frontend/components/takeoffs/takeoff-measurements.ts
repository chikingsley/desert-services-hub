import type { TakeoffAnnotation, TakeoffToolType } from "@takeoff/pdf-takeoff";
import type { PresetItem } from "@/apps/web/frontend/components/takeoffs/takeoff-presets";

// Map preset item types to takeoff tool types
export function mapToolType(
  presetType: "count" | "linear" | "area"
): TakeoffToolType | null {
  switch (presetType) {
    case "count":
      return "count";
    case "linear":
      return "polyline";
    case "area":
      return "polygon";
    default:
      return null;
  }
}

// Calculate polyline length in PDF points
export function calculatePolylineLength(
  points: Array<{ x1: number; y1: number; width: number; height: number }>
): number {
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const x1 = (prev.x1 / prev.width) * 72 * (prev.width / 72);
    const y1 = (prev.y1 / prev.height) * 72 * (prev.height / 72);
    const x2 = (curr.x1 / curr.width) * 72 * (curr.width / 72);
    const y2 = (curr.y1 / curr.height) * 72 * (curr.height / 72);
    totalLength += Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }
  return totalLength;
}

// Calculate polygon area in PDF points squared
export function calculatePolygonArea(
  points: Array<{ x1: number; y1: number; width: number; height: number }>
): number {
  if (points.length < 3) {
    return 0;
  }
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    area += curr.x1 * next.y1 - next.x1 * curr.y1;
  }
  return Math.abs(area) / 2;
}

export interface ItemMeasurement extends PresetItem {
  value: string | number;
  count: number;
  rawValue: number;
}

function measureSingleItem(
  item: PresetItem,
  itemAnnotations: TakeoffAnnotation[],
  pixelsPerFoot: number
): ItemMeasurement {
  if (item.type === "linear") {
    let totalLength = 0;
    for (const ann of itemAnnotations) {
      if (ann.type === "polyline" && ann.points) {
        totalLength += calculatePolylineLength(ann.points);
      }
    }
    const feet = totalLength / pixelsPerFoot;
    return {
      ...item,
      value: feet > 0 ? `${Math.round(feet)} LF` : "0 LF",
      count: itemAnnotations.length,
      rawValue: feet,
    };
  }

  if (item.type === "area") {
    let totalArea = 0;
    for (const ann of itemAnnotations) {
      if (ann.type === "polygon" && ann.points) {
        totalArea += calculatePolygonArea(ann.points);
      }
    }
    const sqFeet = totalArea / pixelsPerFoot ** 2;
    return {
      ...item,
      value: sqFeet > 0 ? `${Math.round(sqFeet)} SF` : "0 SF",
      count: itemAnnotations.length,
      rawValue: sqFeet,
    };
  }

  return {
    ...item,
    value: itemAnnotations.length,
    count: itemAnnotations.length,
    rawValue: itemAnnotations.length,
  };
}

export function computeItemMeasurements(
  annotations: TakeoffAnnotation[],
  presetItems: PresetItem[],
  pixelsPerFoot: number
): ItemMeasurement[] {
  const safeAnnotations = Array.isArray(annotations) ? annotations : [];
  return presetItems
    .map((item) => {
      const itemAnnotations = safeAnnotations.filter(
        (a) => a.itemId === item.id
      );
      return measureSingleItem(item, itemAnnotations, pixelsPerFoot);
    })
    .filter((item) => item.count > 0);
}
