/**
 * Measurement utilities for calculating lengths, areas, and converting units.
 */

import type { ScalePresetConfig } from "../config";
import type { TakeoffAnnotation } from "../takeoff-types";
import type { Scaled } from "../types";

/**
 * Calculate the length of a polyline in PDF points.
 */
export function calculatePolylineLength(points: Scaled[]): number {
  if (points.length < 2) return 0;

  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    // x1, y1 are the coordinates in the scaled space
    const dx = curr.x1 - prev.x1;
    const dy = curr.y1 - prev.y1;
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }
  return totalLength;
}

/**
 * Calculate the area of a polygon in PDF points squared using the Shoelace formula.
 */
export function calculatePolygonArea(points: Scaled[]): number {
  if (points.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    area += curr.x1 * next.y1 - next.x1 * curr.y1;
  }
  return Math.abs(area) / 2;
}

/**
 * Calculate the perimeter of a polygon in PDF points.
 */
export function calculatePolygonPerimeter(points: Scaled[]): number {
  if (points.length < 3) return 0;

  // Close the polygon by adding the first point at the end
  const closedPoints = [...points, points[0]];
  return calculatePolylineLength(closedPoints);
}

/**
 * Convert PDF points to real-world feet using a scale.
 */
export function pdfPointsToFeet(
  points: number,
  scale: ScalePresetConfig
): number {
  return points / scale.pixelsPerFoot;
}

/**
 * Convert PDF points squared to real-world square feet using a scale.
 */
export function pdfPointsSquaredToSquareFeet(
  pointsSquared: number,
  scale: ScalePresetConfig
): number {
  return pointsSquared / scale.pixelsPerFoot ** 2;
}

/**
 * Format a measurement value with unit.
 */
export function formatMeasurement(
  value: number,
  unit: string,
  decimals = 0
): string {
  const formatted =
    decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
  return `${formatted} ${unit}`;
}

/**
 * Get measurement value for an annotation.
 */
export function getAnnotationMeasurement(
  annotation: TakeoffAnnotation,
  scale: ScalePresetConfig
): { value: number; unit: string; formatted: string } {
  switch (annotation.type) {
    case "count":
      return {
        value: 1,
        unit: "EA",
        formatted: "1 EA",
      };

    case "polyline": {
      const lengthPdfPoints = calculatePolylineLength(annotation.points);
      const lengthFeet = pdfPointsToFeet(lengthPdfPoints, scale);
      return {
        value: lengthFeet,
        unit: "LF",
        formatted: formatMeasurement(lengthFeet, "LF"),
      };
    }

    case "polygon": {
      const areaPdfPoints = calculatePolygonArea(annotation.points);
      const areaSqFeet = pdfPointsSquaredToSquareFeet(areaPdfPoints, scale);
      return {
        value: areaSqFeet,
        unit: "SF",
        formatted: formatMeasurement(areaSqFeet, "SF"),
      };
    }
  }
}

/**
 * Summarize measurements by item type.
 */
export interface MeasurementSummary {
  itemId: string;
  label: string;
  color: string;
  count: number;
  totalValue: number;
  unit: string;
  formatted: string;
}

export function summarizeByItem(
  annotations: TakeoffAnnotation[],
  scale: ScalePresetConfig,
  itemConfigs: Array<{
    id: string;
    label: string;
    color: string;
    type: "count" | "linear" | "area";
  }>
): MeasurementSummary[] {
  const summaries: MeasurementSummary[] = [];

  for (const config of itemConfigs) {
    const itemAnnotations = annotations.filter((a) => a.itemId === config.id);
    if (itemAnnotations.length === 0) continue;

    let totalValue = 0;
    let unit = "EA";

    if (config.type === "count") {
      totalValue = itemAnnotations.length;
      unit = "EA";
    } else if (config.type === "linear") {
      for (const ann of itemAnnotations) {
        if (ann.type === "polyline") {
          const length = calculatePolylineLength(ann.points);
          totalValue += pdfPointsToFeet(length, scale);
        }
      }
      unit = "LF";
    } else if (config.type === "area") {
      for (const ann of itemAnnotations) {
        if (ann.type === "polygon") {
          const area = calculatePolygonArea(ann.points);
          totalValue += pdfPointsSquaredToSquareFeet(area, scale);
        }
      }
      unit = "SF";
    }

    summaries.push({
      itemId: config.id,
      label: config.label,
      color: config.color,
      count: itemAnnotations.length,
      totalValue,
      unit,
      formatted:
        config.type === "count"
          ? `${totalValue}`
          : formatMeasurement(totalValue, unit),
    });
  }

  return summaries;
}
