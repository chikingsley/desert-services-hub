# pdf-takeoff

A React library for construction takeoffs on PDF documents. Built on top of `pdfjs-dist` and forked from `react-pdf-highlighter-plus`.

## Features

- **PDF Viewing**: Pan, zoom, and navigate multi-page PDFs
- **Count Markers**: Click to place numbered count markers
- **Linear Measurements**: Draw polylines to measure lengths (Linear Feet)
- **Area Measurements**: Draw polygons to measure areas (Square Feet)
- **Scale Calibration**: Set architectural scales per page (1"=20', 1"=10', etc.)
- **Drag to Reposition**: Move annotations after placing
- **Export**: Export data as JSON or CSV
- **Configurable**: Custom preset items with colors and measurement types

## Installation

```bash
# This is currently a local library
# Copy the lib/pdf-takeoff folder to your project
```css

## Quick Start

```tsx
import {
  PdfLoader,
  PdfHighlighter,
  type TakeoffAnnotation,
  type ScalePresetConfig,
  DEFAULT_SCALE_PRESETS,
} from "@/lib/pdf-takeoff";

function TakeoffViewer() {
  const [annotations, setAnnotations] = useState<TakeoffAnnotation[]>([]);

  return (
    <PdfLoader document="/plan.pdf">
      {(pdfDocument) => (
        <PdfHighlighter
          pdfDocument={pdfDocument}
          highlights={[]}
        >
          {/* Your annotation rendering logic */}
        </PdfHighlighter>
      )}
    </PdfLoader>
  );
}
```css

## Configuration

### Preset Items

Define your takeoff item types:

```tsx
import type { TakeoffItemConfig } from "@/lib/pdf-takeoff";

const items: TakeoffItemConfig[] = [
  { id: "temp_fence", label: "Temp Fence", color: "#ef4444", type: "linear" },
  { id: "curb_inlet", label: "Curb Inlet", color: "#22c55e", type: "count" },
  { id: "area", label: "Area", color: "#8b5cf6", type: "area" },
];
```css

### Scale Presets

Use built-in presets or define custom:

```tsx
import { DEFAULT_SCALE_PRESETS, type ScalePresetConfig } from "@/lib/pdf-takeoff";

// Built-in: 1"=5', 1"=10', 1"=20', 1"=30', 1"=40', 1"=50', 1"=100'

// Custom:
const customScale: ScalePresetConfig = {
  id: "1_15",
  label: '1" = 15\'',
  pixelsPerFoot: 72 / 15, // PDF uses 72 points per inch
};
```css

## Measurements

Calculate lengths and areas:

```tsx
import {
  calculatePolylineLength,
  calculatePolygonArea,
  pdfPointsToFeet,
  pdfPointsSquaredToSquareFeet,
  summarizeByItem,
} from "@/lib/pdf-takeoff";

// Calculate polyline length in feet
const lengthPdfPoints = calculatePolylineLength(annotation.points);
const lengthFeet = pdfPointsToFeet(lengthPdfPoints, scale);

// Calculate polygon area in square feet
const areaPdfPoints = calculatePolygonArea(annotation.points);
const areaSqFeet = pdfPointsSquaredToSquareFeet(areaPdfPoints, scale);

// Get summary by item type
const summary = summarizeByItem(annotations, scale, itemConfigs);
```css

## Export

Export takeoff data:

```tsx
import {
  exportToJson,
  exportToCsv,
  downloadAsJson,
  downloadAsCsv,
} from "@/lib/pdf-takeoff";

// Export as JSON
const data = exportToJson(annotations, pageScales, scalePresets, itemConfigs, "plan.pdf");
downloadAsJson(data, "takeoff.json");

// Export as CSV
const csv = exportToCsv(annotations, pageScales, scalePresets, itemConfigs);
downloadAsCsv(csv, "takeoff.csv");
```css

## Annotation Types

### CountMarker

```tsx
interface CountMarker {
  id: string;
  type: "count";
  position: ScaledPosition;
  itemId: string;
  label: string;
  color: string;
  number: number;
}
```css

### PolylineAnnotation

```tsx
interface PolylineAnnotation {
  id: string;
  type: "polyline";
  points: Scaled[];
  itemId: string;
  label: string;
  color: string;
  strokeWidth: number;
}
```css

### PolygonAnnotation

```tsx
interface PolygonAnnotation {
  id: string;
  type: "polygon";
  points: Scaled[];
  itemId: string;
  label: string;
  color: string;
  strokeWidth: number;
  fillOpacity: number;
}
```

## Roadmap

- [ ] Undo/redo support
- [ ] Arc measurements
- [ ] Assemblies (material groups)
- [ ] Cost database integration
- [ ] AI-powered auto-detection
- [ ] Plan comparison/overlay

## License

MIT
