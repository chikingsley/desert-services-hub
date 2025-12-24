import {
  AreaHighlight,
  type AreaHighlightProps,
  type AreaHighlightStyle,
} from "./components/AreaHighlight";
import { CountCanvas, type CountCanvasProps } from "./components/CountCanvas";
import {
  CountMarkerHighlight,
  type CountMarkerHighlightProps,
} from "./components/CountMarkerHighlight";
import {
  DrawingCanvas,
  type DrawingCanvasProps,
} from "./components/DrawingCanvas";
import {
  DrawingHighlight,
  type DrawingHighlightProps,
} from "./components/DrawingHighlight";
import {
  FreetextHighlight,
  type FreetextHighlightProps,
  type FreetextStyle,
} from "./components/FreetextHighlight";
import {
  ImageHighlight,
  type ImageHighlightProps,
} from "./components/ImageHighlight";
import {
  MonitoredHighlightContainer,
  type MonitoredHighlightContainerProps,
} from "./components/MonitoredHighlightContainer";
import {
  PdfHighlighter,
  type PdfHighlighterProps,
} from "./components/PdfHighlighter";
import { PdfLoader, type PdfLoaderProps } from "./components/PdfLoader";
import {
  PolygonCanvas,
  type PolygonCanvasProps,
} from "./components/PolygonCanvas";
import {
  PolygonHighlight,
  type PolygonHighlightProps,
} from "./components/PolygonHighlight";
import {
  PolylineCanvas,
  type PolylineCanvasProps,
} from "./components/PolylineCanvas";
import {
  PolylineHighlight,
  type PolylineHighlightProps,
} from "./components/PolylineHighlight";
import { ShapeCanvas, type ShapeCanvasProps } from "./components/ShapeCanvas";
import {
  ShapeHighlight,
  type ShapeHighlightProps,
  type ShapeStyle,
} from "./components/ShapeHighlight";
import {
  SignaturePad,
  type SignaturePadProps,
} from "./components/SignaturePad";
import {
  TextHighlight,
  type TextHighlightProps,
  type TextHighlightStyle,
} from "./components/TextHighlight";
import {
  type HighlightContainerUtils,
  useHighlightContainerContext,
} from "./contexts/HighlightContext";
import {
  type PdfHighlighterUtils,
  usePdfHighlighterContext,
} from "./contexts/PdfHighlighterContext";
import {
  scaledPositionToViewport,
  viewportPositionToScaled,
} from "./lib/coordinates";
import {
  type ExportableHighlight,
  type ExportPdfOptions,
  exportPdf,
} from "./lib/export-pdf";

export {
  AreaHighlight,
  CountCanvas,
  CountMarkerHighlight,
  DrawingCanvas,
  DrawingHighlight,
  exportPdf,
  FreetextHighlight,
  ImageHighlight,
  MonitoredHighlightContainer,
  PdfHighlighter,
  PdfLoader,
  PolygonCanvas,
  PolygonHighlight,
  PolylineCanvas,
  PolylineHighlight,
  scaledPositionToViewport,
  ShapeCanvas,
  ShapeHighlight,
  SignaturePad,
  TextHighlight,
  useHighlightContainerContext,
  usePdfHighlighterContext,
  viewportPositionToScaled,
};

export type {
  AreaHighlightProps,
  AreaHighlightStyle,
  CountCanvasProps,
  CountMarkerHighlightProps,
  DrawingCanvasProps,
  DrawingHighlightProps,
  ExportableHighlight,
  ExportPdfOptions,
  FreetextHighlightProps,
  FreetextStyle,
  HighlightContainerUtils,
  ImageHighlightProps,
  MonitoredHighlightContainerProps,
  PdfHighlighterProps,
  PdfHighlighterUtils,
  PdfLoaderProps,
  PolygonCanvasProps,
  PolygonHighlightProps,
  PolylineCanvasProps,
  PolylineHighlightProps,
  ShapeCanvasProps,
  ShapeHighlightProps,
  ShapeStyle,
  SignaturePadProps,
  TextHighlightProps,
  TextHighlightStyle,
};

export * from "./config";
export * from "./lib/export-data";
export * from "./lib/measurements";
export * from "./takeoff-types";
export * from "./types";
