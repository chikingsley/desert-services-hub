import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

/**
 * A rectangle as measured by the viewport.
 *
 * @category Type
 */
export interface LTWH {
  /** The x coordinate of the top-left of the rectangle. */
  left: number;
  /** The y coordinate of the top-left of the rectangle. */
  top: number;
  /** Width of the rectangle, relative to top left of the viewport. */
  width: number;
  /** Height of the rectangle, relative to top left of the viewport. */
  height: number;
}

/** @category Type */
export type LTWHP = LTWH & {
  /** 1-Indexed page number */
  pageNumber: number;
};

/**
 * "scaled" means that data structure stores (0, 1) coordinates.
 *  for clarity reasons I decided not to store actual (0, 1) coordinates but
 *  provide width and height, so user can compute ratio himself if needed
 *
 * @category Type
 * @author Artem Tyurin <artem.tyurin@gmail.com>
 */
export interface Scaled {
  x1: number;
  y1: number;

  x2: number;
  y2: number;

  width: number;
  height: number;

  /** 1-Indexed page number */
  pageNumber: number;
}

/**
 * Position of a Highlight relative to the viewport.
 *
 * @category Type
 */
export interface ViewportPosition {
  /** Bounding rectangle for the entire highlight. */
  boundingRect: LTWHP;
  /** For text highlights, the rectangular highlights for each block of text. */
  rects: LTWHP[];
}

/**
 * Position of a Highlight with normalised coordinates.
 *
 * @category Type
 */
export interface ScaledPosition {
  /** Bounding rectangle for the entire highlight. */
  boundingRect: Scaled;
  /** For text highlights, the rectangular highlights for each block of text. */
  rects: Scaled[];
  /** Rarely applicable property of whether coordinates should be in PDF coordinate space.  */
  usePdfCoordinates?: boolean;
}

/**
 * A point in a drawing stroke.
 *
 * @category Type
 */
export interface DrawingPoint {
  x: number;
  y: number;
}

/**
 * A stroke in a drawing, with its own color and width.
 *
 * @category Type
 */
export interface DrawingStroke {
  points: DrawingPoint[];
  color: string;
  width: number;
}

/**
 * Shape types for shape annotations.
 *
 * @category Type
 */
export type ShapeType = "rectangle" | "circle" | "arrow";

/**
 * Shape data for shape highlights.
 *
 * @category Type
 */
export interface ShapeData {
  shapeType: ShapeType;
  strokeColor: string;
  strokeWidth: number;
  /** For arrows: start point as percentage of bounding box (0-1) */
  startPoint?: { x: number; y: number };
  /** For arrows: end point as percentage of bounding box (0-1) */
  endPoint?: { x: number; y: number };
}

/**
 * The content of a highlight
 *
 * @category Type
 */
export interface Content {
  text?: string;
  image?: string;
  /** For drawing highlights, store the stroke data for later editing */
  strokes?: DrawingStroke[];
  /** For shape highlights, store the shape data */
  shape?: ShapeData;
}

/**
 * What type the highlight is. This is the ideal way to determine whether to
 * render it in an AreaHighlight or TextHighlight.
 *
 * @category Type
 */
export type HighlightType =
  | "text"
  | "area"
  | "freetext"
  | "image"
  | "drawing"
  | "shape";

/**
 * This represents a selected (text/mouse) area that has been turned into a
 * highlight. If you are storing highlights, they should be stored as this type.
 *
 * @category Type
 */
export interface Highlight {
  id: string;
  /**
   * This property is planned to be non-optional in future.
   */
  type?: HighlightType;
  /**
   * @deprecated If you want your highlight to store content after being a
   * GhostHighlight, you should create your own interface extended off this. If
   * you are currently using this property to determine what kind of highlight
   * to render, please use {@link type}.
   */
  content?: Content;
  position: ScaledPosition;
}

/**
 * This represents a temporary highlight and is ideal as an intermediary between
 * a selection and a highlight.
 *
 * @category Type
 */
export interface GhostHighlight extends Required<Omit<Highlight, "id">> {
  content: Content;
}

/**
 * This represents a rendered highlight, with its position defined by the page
 * viewport.
 *
 * @category Type
 */
export type ViewportHighlight<T extends Highlight = Highlight> = Omit<
  T,
  "position"
> & {
  position: ViewportPosition;
};

/**
 * An area or text selection in a PDF Document.
 *
 * @category Type
 */
export type PdfSelection = GhostHighlight & {
  /** Convert the current selection into a temporary highlight */
  makeGhostHighlight(): GhostHighlight;
};

/**
 * A PDF.js page representation. This is the reference type for every page in the PdfHighlighter.
 *
 * @category Type
 */
export interface Page {
  node: HTMLElement;
  /** 1-Index page number */
  number: number;
}

/**
 * All the DOM refs for a group of highlights on one page
 *
 * @category Type
 */
export interface HighlightBindings {
  reactRoot: Root;
  container: Element;
  textLayer: HTMLElement;
}

/**
 * A popup that can be viewed inside a PdfHighlighter.
 *
 * @category Type
 */
export interface Tip {
  position: ViewportPosition;
  content: ReactNode;
}

/**
 * The accepted scale values by the PDF.js viewer.
 * Numeric entries accept floats, e.g. 1.2 = 120%
 *
 * @category Type
 */
export type PdfScaleValue =
  | "page-actual"
  | "page-width"
  | "page-height"
  | "page-fit"
  | "auto"
  | number;

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
