/**
 * Export utilities for takeoff data.
 */

import type { ScalePresetConfig } from "../config";
import type { TakeoffAnnotation } from "../takeoff-types";
import { type MeasurementSummary, summarizeByItem } from "./measurements";

/**
 * Takeoff export data structure.
 */
export interface TakeoffExportData {
  /** Export timestamp */
  exportedAt: string;
  /** Source PDF name */
  pdfName?: string;
  /** Scales used per page */
  pageScales: Record<number, string>;
  /** Summary by item type */
  summary: MeasurementSummary[];
  /** All annotations (for re-import) */
  annotations: TakeoffAnnotation[];
}

/**
 * Export takeoff data as JSON.
 */
export function exportToJson(
  annotations: TakeoffAnnotation[],
  pageScales: Record<number, string>,
  scalePresets: ScalePresetConfig[],
  itemConfigs: Array<{
    id: string;
    label: string;
    color: string;
    type: "count" | "linear" | "area";
  }>,
  pdfName?: string
): TakeoffExportData {
  // Use the default scale for summary (usually page 1's scale)
  const defaultScaleId = pageScales[1] || "1_20";
  const scale =
    scalePresets.find((s) => s.id === defaultScaleId) || scalePresets[0];

  const summary = summarizeByItem(annotations, scale, itemConfigs);

  return {
    exportedAt: new Date().toISOString(),
    pdfName,
    pageScales,
    summary,
    annotations,
  };
}

/**
 * Convert takeoff data to CSV format.
 */
export function exportToCsv(
  annotations: TakeoffAnnotation[],
  pageScales: Record<number, string>,
  scalePresets: ScalePresetConfig[],
  itemConfigs: Array<{
    id: string;
    label: string;
    color: string;
    type: "count" | "linear" | "area";
  }>
): string {
  const defaultScaleId = pageScales[1] || "1_20";
  const scale =
    scalePresets.find((s) => s.id === defaultScaleId) || scalePresets[0];

  const summary = summarizeByItem(annotations, scale, itemConfigs);

  // CSV header
  const lines: string[] = ["Item,Count,Total,Unit"];

  // Data rows
  for (const item of summary) {
    const row = [
      `"${item.label}"`,
      item.count.toString(),
      item.totalValue.toFixed(2),
      item.unit,
    ];
    lines.push(row.join(","));
  }

  return lines.join("\n");
}

/**
 * Download a file in the browser.
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download takeoff data as JSON file.
 */
export function downloadAsJson(
  data: TakeoffExportData,
  filename = "takeoff-data.json"
): void {
  const content = JSON.stringify(data, null, 2);
  downloadFile(content, filename, "application/json");
}

/**
 * Download takeoff summary as CSV file.
 */
export function downloadAsCsv(
  csvContent: string,
  filename = "takeoff-summary.csv"
): void {
  downloadFile(csvContent, filename, "text/csv");
}

/**
 * Import takeoff data from JSON.
 */
export function importFromJson(jsonString: string): TakeoffExportData | null {
  try {
    const data = JSON.parse(jsonString) as TakeoffExportData;
    // Basic validation
    if (!Array.isArray(data.annotations)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
