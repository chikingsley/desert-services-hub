/**
 * Configuration types and defaults for pdf-takeoff library.
 */

/**
 * Measurement type for a takeoff item.
 */
export type MeasurementType = "count" | "linear" | "area";

/**
 * Configuration for a takeoff preset item.
 */
export interface TakeoffItemConfig {
  /** Unique identifier for this item type */
  id: string;
  /** Display label */
  label: string;
  /** Color for annotations (hex) */
  color: string;
  /** Type of measurement */
  type: MeasurementType;
  /** Optional unit label (e.g., "LF", "SF", "EA") */
  unit?: string;
  /** Optional unit cost for estimating */
  unitCost?: number;
}

/**
 * Scale preset configuration.
 */
export interface ScalePresetConfig {
  /** Unique identifier */
  id: string;
  /** Display label (e.g., '1" = 20\'') */
  label: string;
  /** PDF points per real-world foot (72 points = 1 inch) */
  pixelsPerFoot: number;
}

/**
 * Common architectural/engineering scale presets.
 * PDF uses 72 points per inch.
 */
export const DEFAULT_SCALE_PRESETS: ScalePresetConfig[] = [
  { id: "1_5", label: "1\" = 5'", pixelsPerFoot: 72 / 5 },
  { id: "1_10", label: "1\" = 10'", pixelsPerFoot: 72 / 10 },
  { id: "1_20", label: "1\" = 20'", pixelsPerFoot: 72 / 20 },
  { id: "1_30", label: "1\" = 30'", pixelsPerFoot: 72 / 30 },
  { id: "1_40", label: "1\" = 40'", pixelsPerFoot: 72 / 40 },
  { id: "1_50", label: "1\" = 50'", pixelsPerFoot: 72 / 50 },
  { id: "1_100", label: "1\" = 100'", pixelsPerFoot: 72 / 100 },
];

/**
 * Main configuration for a takeoff session.
 */
export interface TakeoffConfig {
  /** Available preset items */
  items: TakeoffItemConfig[];
  /** Available scale presets */
  scalePresets?: ScalePresetConfig[];
  /** Default scale preset ID */
  defaultScaleId?: string;
  /** Default stroke width for polylines */
  defaultStrokeWidth?: number;
  /** Default fill opacity for polygons */
  defaultFillOpacity?: number;
}

/**
 * Default takeoff configuration.
 */
export const DEFAULT_TAKEOFF_CONFIG: TakeoffConfig = {
  items: [],
  scalePresets: DEFAULT_SCALE_PRESETS,
  defaultScaleId: "1_20",
  defaultStrokeWidth: 3,
  defaultFillOpacity: 0.2,
};

/**
 * Maps measurement type to tool type.
 */
export function measurementTypeToToolType(
  type: MeasurementType
): "count" | "polyline" | "polygon" {
  switch (type) {
    case "count":
      return "count";
    case "linear":
      return "polyline";
    case "area":
      return "polygon";
  }
}

/**
 * Get unit label for measurement type.
 */
export function getDefaultUnit(type: MeasurementType): string {
  switch (type) {
    case "count":
      return "EA";
    case "linear":
      return "LF";
    case "area":
      return "SF";
  }
}
