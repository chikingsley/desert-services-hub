// Components
export {
  AreaHighlight,
  type AreaHighlightProps,
  type AreaHighlightStyle,
} from "./components/area-highlight";
export { CountCanvas, type CountCanvasProps } from "./components/count-canvas";
export {
  CountMarkerHighlight,
  type CountMarkerHighlightProps,
} from "./components/count-marker-highlight";
export {
  DrawingCanvas,
  type DrawingCanvasProps,
} from "./components/drawing-canvas";
export {
  DrawingHighlight,
  type DrawingHighlightProps,
} from "./components/drawing-highlight";
export {
  FreetextHighlight,
  type FreetextHighlightProps,
  type FreetextStyle,
} from "./components/freetext-highlight";
export {
  ImageHighlight,
  type ImageHighlightProps,
} from "./components/image-highlight";
export {
  MonitoredHighlightContainer,
  type MonitoredHighlightContainerProps,
} from "./components/monitored-highlight-container";
export {
  PdfHighlighter,
  type PdfHighlighterProps,
} from "./components/pdf-highlighter";
export { PdfLoader, type PdfLoaderProps } from "./components/pdf-loader";
export {
  PolygonCanvas,
  type PolygonCanvasProps,
} from "./components/polygon-canvas";
export {
  PolygonHighlight,
  type PolygonHighlightProps,
} from "./components/polygon-highlight";
export {
  PolylineCanvas,
  type PolylineCanvasProps,
} from "./components/polyline-canvas";
export {
  PolylineHighlight,
  type PolylineHighlightProps,
} from "./components/polyline-highlight";
export { ShapeCanvas, type ShapeCanvasProps } from "./components/shape-canvas";
export {
  ShapeHighlight,
  type ShapeHighlightProps,
  type ShapeStyle,
} from "./components/shape-highlight";
export {
  SignaturePad,
  type SignaturePadProps,
} from "./components/signature-pad";
export {
  TextHighlight,
  type TextHighlightProps,
  type TextHighlightStyle,
} from "./components/text-highlight";

// Config
export {
  DEFAULT_SCALE_PRESETS,
  DEFAULT_TAKEOFF_CONFIG,
  getDefaultUnit,
  type MeasurementType,
  measurementTypeToToolType,
  type ScalePresetConfig,
  type TakeoffConfig,
  type TakeoffItemConfig,
} from "./config";

// Contexts
export {
  type HighlightContainerUtils,
  useHighlightContainerContext,
} from "./contexts/highlight-context";
export {
  type PdfHighlighterUtils,
  usePdfHighlighterContext,
} from "./contexts/pdf-highlighter-context";

// Library utilities
export {
  scaledPositionToViewport,
  viewportPositionToScaled,
} from "./lib/coordinates";
export {
  downloadAsCsv,
  downloadAsJson,
  downloadFile,
  exportToCsv,
  exportToJson,
  importFromJson,
  type TakeoffExportData,
} from "./lib/export-data";
export {
  type ExportableHighlight,
  type ExportPdfOptions,
  exportPdf,
} from "./lib/export-pdf";
export {
  calculatePolygonArea,
  calculatePolygonPerimeter,
  calculatePolylineLength,
  formatMeasurement,
  getAnnotationMeasurement,
  type MeasurementSummary,
  pdfPointsSquaredToSquareFeet,
  pdfPointsToFeet,
  summarizeByItem,
} from "./lib/measurements";

// Takeoff types
export type {
  CountMarker,
  PolygonAnnotation,
  PolylineAnnotation,
  ScaleCalibration,
  TakeoffAnnotation,
  TakeoffToolType,
  ViewportPoint,
} from "./takeoff-types";

// Core types
export type {
  Content,
  DrawingPoint,
  DrawingStroke,
  GhostHighlight,
  Highlight,
  HighlightBindings,
  HighlightType,
  LTWH,
  LTWHP,
  Page,
  PdfScaleValue,
  PdfSelection,
  Scaled,
  ScaledPosition,
  ShapeData,
  ShapeType,
  Tip,
  ViewportHighlight,
  ViewportPosition,
} from "./types";
