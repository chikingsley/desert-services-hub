import type { Scaled, ScaledPosition } from "./types";

/**
 * Types specific to construction takeoffs.
 */

export type TakeoffToolType = "count" | "polyline" | "polygon";

/**
 * A count marker annotation (single click point).
 */
export interface CountMarker {
  id: string;
  type: "count";
  position: ScaledPosition;
  itemId: string; // e.g., "curb_inlet", "rumble_grate"
  label: string;
  color: string;
  number: number; // Sequential number for this item type
}

/**
 * A polyline annotation (multiple connected points for linear measurements).
 */
export interface PolylineAnnotation {
  id: string;
  type: "polyline";
  points: Scaled[]; // Each point with its own scaled coordinates
  itemId: string; // e.g., "fence", "silt_fence"
  label: string;
  color: string;
  strokeWidth: number;
  /** Calculated length in scaled units (needs calibration for real units) */
  length?: number;
}

/**
 * A polygon annotation (closed shape for area measurements).
 */
export interface PolygonAnnotation {
  id: string;
  type: "polygon";
  points: Scaled[]; // Points forming closed polygon
  itemId: string; // e.g., "area"
  label: string;
  color: string;
  strokeWidth: number;
  fillOpacity: number;
  /** Calculated area in scaled units (needs calibration for real units) */
  area?: number;
}

/**
 * Union type for all takeoff annotations.
 */
export type TakeoffAnnotation =
  | CountMarker
  | PolylineAnnotation
  | PolygonAnnotation;

/**
 * Scale calibration data for converting pixel measurements to real-world units.
 */
export interface ScaleCalibration {
  /** Known distance in real-world units */
  realDistance: number;
  /** Unit of measurement (ft, m, etc.) */
  unit: string;
  /** Pixel distance on the PDF at base scale */
  pixelDistance: number;
  /** Page number where calibration was set */
  pageNumber: number;
}

/**
 * A point in viewport coordinates with page number.
 */
export interface ViewportPoint {
  x: number;
  y: number;
  pageNumber: number;
}
