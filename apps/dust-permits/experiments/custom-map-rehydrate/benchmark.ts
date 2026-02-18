#!/usr/bin/env bun

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  type ParcelData,
  queryParcelByAPN,
  queryParcelByCoordinates,
  queryParcelsByAddress,
} from "../../src/lib/assessor";
import { queryPermitMapFeatures } from "../../src/lib/dust-features";
import { calculateBoundsFromCenter } from "./bounds";
import { buildDocumentCluesForPermit } from "./document-clues";
import { buildGeminiDocumentCluesForPermit } from "./gemini-document-clues";
import { runRehydratedPipeline } from "./pipeline";
import type { Bounds, LatLng } from "./types";

type InputPermit = {
  permitId: string;
  projectName?: string | null;
  address?: string | null;
  city?: string | null;
  parcel?: string | null;
  status?: string | null;
  projectId?: number | null;
  docCount?: number;
};

type PredictionSource =
  | "apn"
  | "address"
  | "apn_clipped_by_doc"
  | "apn_size_normalized_by_doc"
  | "coord_parcel_override"
  | "doc_bounds_only"
  | "none";

type CliArgs = {
  inputPath: string;
  outputPath: string;
  limit: number | null;
  parallel: number;
  maxApns: number;
  iouGrid: number;
  minIou: number;
  minAreaRatio: number;
  maxAreaRatio: number;
  maxCentroidErrorM: number;
  withDocClues: boolean;
  docContainer: string;
  docLimit: number;
  docMinConfidence: number;
  docMaxCoordDeltaM: number;
  docClipMinAreaShare: number;
  docCoordinateParcelOverride: boolean;
  docCoordinateParcelMaxDeltaM: number;
  docCoordinateParcelMinDeltaM: number;
  docSizeNormalize: boolean;
  docSizeOverageRatio: number;
  docSizeMinScale: number;
  withGeminiClues: boolean;
  geminiModel: string;
  geminiMaxDocs: number;
  geminiMaxDocBytes: number;
  geminiOnlyWhenMissingCoords: boolean;
  googleMapsApiKey?: string;
  recordHistory: boolean;
  historyPath: string;
  label: string | null;
};

type BenchmarkStatus = "scored" | "skipped" | "error";

type BenchmarkResult = {
  permitId: string;
  status: BenchmarkStatus;
  reason: string | null;
  hints: {
    projectName: string | null;
    address: string | null;
    city: string | null;
    parcelRaw: string | null;
    apnCandidates: string[];
  };
  prediction: {
    source: PredictionSource;
    apnsUsed: string[];
    polygonCount: number;
  };
  documentClues: {
    enabled: boolean;
    docsUsed: number;
    roads: number;
    intersections: number;
    hasCoordinates: boolean;
    hasEstimatedSize: boolean;
    consensusConfidence: number | null;
    boundsMode: string | null;
    boundsApplied: boolean;
  } | null;
  groundTruth: {
    polygonVertices: number;
    centroid: LatLng;
  } | null;
  metrics: {
    centroidErrorM: number;
    areaRatio: number;
    iou: number;
    passCentroid: boolean;
    passArea: boolean;
    passIou: boolean;
  } | null;
  debug: string[];
};

const EARTH_RADIUS_M = 6_371_000;
const DEFAULT_DOC_CONTAINER = "supabase_db_desert-services-hub";
const DEFAULT_HISTORY_PATH =
  "experiments/custom-map-rehydrate/ITERATION_LOG.md";
const OVERRIDE_DELTA_TIE_TOLERANCE_M = 30;

function nowStamp(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  return iso.replace("T", "_").replace("Z", "");
}

function parseBooleanFlag(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseArgs(argv: string[]): CliArgs {
  const args = [...argv];

  let inputPath = "";
  let outputPath = `experiments/custom-map-rehydrate/out/benchmark-${nowStamp()}.json`;
  let limit: number | null = null;
  let parallel = 3;
  let maxApns = 4;
  let iouGrid = 90;
  let minIou = 0.25;
  let minAreaRatio = 0.5;
  let maxAreaRatio = 2.0;
  let maxCentroidErrorM = 120;
  let withDocClues = false;
  let docContainer = DEFAULT_DOC_CONTAINER;
  let docLimit = 8;
  let docMinConfidence = 0.55;
  let docMaxCoordDeltaM = 1200;
  let docClipMinAreaShare = 0.45;
  let docCoordinateParcelOverride = false;
  let docCoordinateParcelMaxDeltaM = 350;
  let docCoordinateParcelMinDeltaM = 80;
  let docSizeNormalize = false;
  let docSizeOverageRatio = 3;
  let docSizeMinScale = 0.35;
  let withGeminiClues = false;
  let geminiModel = "gemini-3-flash-preview";
  let geminiMaxDocs = 1;
  let geminiMaxDocBytes = 12 * 1024 * 1024;
  let geminiOnlyWhenMissingCoords = true;
  let googleMapsApiKey =
    process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_KEY || undefined;
  let recordHistory = true;
  let historyPath = DEFAULT_HISTORY_PATH;
  let label: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) {
      continue;
    }

    if (arg === "--input") {
      inputPath = args[i + 1] ?? "";
      i += 1;
      continue;
    }

    if (arg === "--out") {
      outputPath = args[i + 1] ?? outputPath;
      i += 1;
      continue;
    }

    if (arg === "--limit") {
      limit = Number(args[i + 1] ?? "0");
      i += 1;
      continue;
    }

    if (arg === "--parallel") {
      parallel = Number(args[i + 1] ?? "3");
      i += 1;
      continue;
    }

    if (arg === "--max-apns") {
      maxApns = Number(args[i + 1] ?? "4");
      i += 1;
      continue;
    }

    if (arg === "--iou-grid") {
      iouGrid = Number(args[i + 1] ?? "90");
      i += 1;
      continue;
    }

    if (arg === "--min-iou") {
      minIou = Number(args[i + 1] ?? "0.25");
      i += 1;
      continue;
    }

    if (arg === "--min-area-ratio") {
      minAreaRatio = Number(args[i + 1] ?? "0.5");
      i += 1;
      continue;
    }

    if (arg === "--max-area-ratio") {
      maxAreaRatio = Number(args[i + 1] ?? "2");
      i += 1;
      continue;
    }

    if (arg === "--max-centroid-error") {
      maxCentroidErrorM = Number(args[i + 1] ?? "120");
      i += 1;
      continue;
    }

    if (arg === "--with-doc-clues") {
      withDocClues = true;
      continue;
    }

    if (arg === "--doc-container") {
      docContainer = args[i + 1] ?? docContainer;
      i += 1;
      continue;
    }

    if (arg === "--doc-limit") {
      docLimit = Number(args[i + 1] ?? "8");
      i += 1;
      continue;
    }

    if (arg === "--doc-min-confidence") {
      docMinConfidence = Number(args[i + 1] ?? "0.55");
      i += 1;
      continue;
    }

    if (arg === "--doc-max-coord-delta") {
      docMaxCoordDeltaM = Number(args[i + 1] ?? "1200");
      i += 1;
      continue;
    }

    if (arg === "--doc-clip-min-area-share") {
      docClipMinAreaShare = Number(args[i + 1] ?? "0.45");
      i += 1;
      continue;
    }

    if (arg === "--doc-coordinate-parcel-override") {
      docCoordinateParcelOverride = true;
      continue;
    }

    if (arg === "--doc-coordinate-parcel-max-delta") {
      docCoordinateParcelMaxDeltaM = Number(args[i + 1] ?? "350");
      i += 1;
      continue;
    }

    if (arg === "--doc-coordinate-parcel-min-delta") {
      docCoordinateParcelMinDeltaM = Number(args[i + 1] ?? "80");
      i += 1;
      continue;
    }

    if (arg === "--doc-size-normalize") {
      docSizeNormalize = true;
      continue;
    }

    if (arg === "--doc-size-overage-ratio") {
      docSizeOverageRatio = Number(args[i + 1] ?? "3");
      i += 1;
      continue;
    }

    if (arg === "--doc-size-min-scale") {
      docSizeMinScale = Number(args[i + 1] ?? "0.35");
      i += 1;
      continue;
    }

    if (arg === "--with-gemini-clues") {
      withGeminiClues = true;
      continue;
    }

    if (arg === "--gemini-model") {
      geminiModel = args[i + 1] ?? geminiModel;
      i += 1;
      continue;
    }

    if (arg === "--gemini-max-docs") {
      geminiMaxDocs = Number(args[i + 1] ?? "1");
      i += 1;
      continue;
    }

    if (arg === "--gemini-max-doc-bytes") {
      geminiMaxDocBytes = Number(args[i + 1] ?? String(12 * 1024 * 1024));
      i += 1;
      continue;
    }

    if (arg === "--gemini-only-when-missing-coords") {
      geminiOnlyWhenMissingCoords = parseBooleanFlag(args[i + 1] ?? "true");
      i += 1;
      continue;
    }

    if (arg === "--api-key") {
      googleMapsApiKey = args[i + 1] ?? undefined;
      i += 1;
      continue;
    }

    if (arg === "--record-history") {
      recordHistory = parseBooleanFlag(args[i + 1] ?? "true");
      i += 1;
      continue;
    }

    if (arg === "--history-path") {
      historyPath = args[i + 1] ?? historyPath;
      i += 1;
      continue;
    }

    if (arg === "--label") {
      label = args[i + 1] ?? null;
      i += 1;
    }
  }

  if (!inputPath) {
    throw new Error("Missing required --input <path>");
  }

  if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error(`Invalid --limit: ${limit}`);
  }

  if (!Number.isFinite(parallel) || parallel <= 0) {
    throw new Error(`Invalid --parallel: ${parallel}`);
  }

  if (!Number.isFinite(maxApns) || maxApns <= 0) {
    throw new Error(`Invalid --max-apns: ${maxApns}`);
  }

  if (!Number.isFinite(iouGrid) || iouGrid < 20) {
    throw new Error(`Invalid --iou-grid: ${iouGrid}`);
  }

  if (!Number.isFinite(docLimit) || docLimit <= 0) {
    throw new Error(`Invalid --doc-limit: ${docLimit}`);
  }

  if (!Number.isFinite(docMinConfidence) || docMinConfidence < 0) {
    throw new Error(`Invalid --doc-min-confidence: ${docMinConfidence}`);
  }

  if (!Number.isFinite(docMaxCoordDeltaM) || docMaxCoordDeltaM <= 0) {
    throw new Error(`Invalid --doc-max-coord-delta: ${docMaxCoordDeltaM}`);
  }

  if (
    !Number.isFinite(docClipMinAreaShare) ||
    docClipMinAreaShare < 0 ||
    docClipMinAreaShare > 1
  ) {
    throw new Error(
      `Invalid --doc-clip-min-area-share: ${docClipMinAreaShare}`
    );
  }

  if (
    !Number.isFinite(docCoordinateParcelMaxDeltaM) ||
    docCoordinateParcelMaxDeltaM <= 0
  ) {
    throw new Error(
      "Invalid --doc-coordinate-parcel-max-delta: " +
        docCoordinateParcelMaxDeltaM
    );
  }

  if (
    !Number.isFinite(docCoordinateParcelMinDeltaM) ||
    docCoordinateParcelMinDeltaM < 0
  ) {
    throw new Error(
      "Invalid --doc-coordinate-parcel-min-delta: " +
        docCoordinateParcelMinDeltaM
    );
  }

  if (!Number.isFinite(docSizeOverageRatio) || docSizeOverageRatio <= 1) {
    throw new Error("Invalid --doc-size-overage-ratio: " + docSizeOverageRatio);
  }

  if (
    !Number.isFinite(docSizeMinScale) ||
    docSizeMinScale <= 0 ||
    docSizeMinScale >= 1
  ) {
    throw new Error("Invalid --doc-size-min-scale: " + docSizeMinScale);
  }

  if (!Number.isFinite(geminiMaxDocs) || geminiMaxDocs <= 0) {
    throw new Error("Invalid --gemini-max-docs: " + geminiMaxDocs);
  }

  if (!Number.isFinite(geminiMaxDocBytes) || geminiMaxDocBytes <= 0) {
    throw new Error("Invalid --gemini-max-doc-bytes: " + geminiMaxDocBytes);
  }

  return {
    inputPath,
    outputPath,
    limit: limit ? Math.floor(limit) : null,
    parallel: Math.floor(parallel),
    maxApns: Math.floor(maxApns),
    iouGrid: Math.floor(iouGrid),
    minIou,
    minAreaRatio,
    maxAreaRatio,
    maxCentroidErrorM,
    withDocClues,
    docContainer,
    docLimit: Math.floor(docLimit),
    docMinConfidence,
    docMaxCoordDeltaM,
    docClipMinAreaShare,
    docCoordinateParcelOverride,
    docCoordinateParcelMaxDeltaM,
    docCoordinateParcelMinDeltaM,
    docSizeNormalize,
    docSizeOverageRatio,
    docSizeMinScale,
    withGeminiClues,
    geminiModel,
    geminiMaxDocs,
    geminiMaxDocBytes,
    geminiOnlyWhenMissingCoords,
    googleMapsApiKey,
    recordHistory,
    historyPath,
    label,
  };
}

function cleanApn(apn: string): string {
  return apn.replace(/[-\s.]/g, "").toUpperCase();
}

function extractApnCandidates(parcelRaw: string | null | undefined): string[] {
  if (!parcelRaw) {
    return [];
  }

  const rawTokens = parcelRaw.toUpperCase().match(/[0-9A-Z-]+/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const token of rawTokens) {
    if (!/\d/.test(token)) {
      continue;
    }

    const clean = cleanApn(token);
    if (clean.length < 6 || seen.has(clean)) {
      continue;
    }

    seen.add(clean);
    out.push(token);
  }

  return out;
}

function coordinateKey(coord: LatLng): string {
  return coord.lat.toFixed(6) + "," + coord.lng.toFixed(6);
}

function dedupeCoordinates(coords: LatLng[], maxCount = 10): LatLng[] {
  const out: LatLng[] = [];
  const seen = new Set<string>();

  for (const coord of coords) {
    const key = coordinateKey(coord);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(coord);

    if (out.length >= maxCount) {
      break;
    }
  }

  return out;
}

function normalizePolygon(points: LatLng[]): LatLng[] {
  const filtered: LatLng[] = [];
  for (const p of points) {
    if (!(Number.isFinite(p.lat) && Number.isFinite(p.lng))) {
      continue;
    }
    filtered.push({ lat: p.lat, lng: p.lng });
  }

  if (filtered.length < 3) {
    return [];
  }

  const first = filtered[0];
  const last = filtered.at(-1);
  if (first && last && first.lat === last.lat && first.lng === last.lng) {
    filtered.pop();
  }

  return filtered.length >= 3 ? filtered : [];
}

function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (!(pi && pj)) {
      continue;
    }

    const intersects =
      pi.lat > point.lat !== pj.lat > point.lat &&
      point.lng <
        ((pj.lng - pi.lng) * (point.lat - pi.lat)) / (pj.lat - pi.lat) + pi.lng;

    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function metersBetween(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function polygonAreaM2(polygon: LatLng[]): number {
  if (polygon.length < 3) {
    return 0;
  }

  let lat0 = 0;
  let lng0 = 0;
  for (const p of polygon) {
    lat0 += p.lat;
    lng0 += p.lng;
  }
  lat0 /= polygon.length;
  lng0 /= polygon.length;

  const cosLat0 = Math.cos((lat0 * Math.PI) / 180);

  const toXY = (p: LatLng): { x: number; y: number } => ({
    x: ((p.lng - lng0) * Math.PI * EARTH_RADIUS_M * cosLat0) / 180,
    y: ((p.lat - lat0) * Math.PI * EARTH_RADIUS_M) / 180,
  });

  let area2 = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p1Raw = polygon[i];
    const p2Raw = polygon[(i + 1) % polygon.length];
    if (!(p1Raw && p2Raw)) {
      continue;
    }
    const p1 = toXY(p1Raw);
    const p2 = toXY(p2Raw);
    area2 += p1.x * p2.y - p2.x * p1.y;
  }

  return Math.abs(area2) / 2;
}

function polygonCentroid(polygon: LatLng[]): LatLng {
  if (polygon.length === 0) {
    return { lat: 0, lng: 0 };
  }

  let crossSum = 0;
  let cxSum = 0;
  let cySum = 0;

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    if (!(p1 && p2)) {
      continue;
    }

    const cross = p1.lng * p2.lat - p2.lng * p1.lat;
    crossSum += cross;
    cxSum += (p1.lng + p2.lng) * cross;
    cySum += (p1.lat + p2.lat) * cross;
  }

  if (Math.abs(crossSum) < 1e-12) {
    let lat = 0;
    let lng = 0;
    for (const p of polygon) {
      lat += p.lat;
      lng += p.lng;
    }
    return { lat: lat / polygon.length, lng: lng / polygon.length };
  }

  return {
    lat: cySum / (3 * crossSum),
    lng: cxSum / (3 * crossSum),
  };
}

function weightedCentroid(polygons: LatLng[][]): LatLng {
  let weightedLat = 0;
  let weightedLng = 0;
  let totalWeight = 0;

  for (const poly of polygons) {
    const area = polygonAreaM2(poly);
    if (area <= 0) {
      continue;
    }
    const centroid = polygonCentroid(poly);
    weightedLat += centroid.lat * area;
    weightedLng += centroid.lng * area;
    totalWeight += area;
  }

  if (totalWeight > 0) {
    return { lat: weightedLat / totalWeight, lng: weightedLng / totalWeight };
  }

  return polygons[0] ? polygonCentroid(polygons[0]) : { lat: 0, lng: 0 };
}

function scalePolygonAroundAnchor(
  polygon: LatLng[],
  anchor: LatLng,
  scale: number
): LatLng[] {
  if (polygon.length < 3 || !Number.isFinite(scale) || scale <= 0) {
    return [];
  }

  const scaled = polygon.map((point) => ({
    lat: anchor.lat + (point.lat - anchor.lat) * scale,
    lng: anchor.lng + (point.lng - anchor.lng) * scale,
  }));

  return normalizePolygon(scaled);
}

function allBounds(polygons: LatLng[][]): {
  north: number;
  south: number;
  east: number;
  west: number;
} {
  let north = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let west = Number.POSITIVE_INFINITY;

  for (const poly of polygons) {
    for (const p of poly) {
      if (p.lat > north) {
        north = p.lat;
      }
      if (p.lat < south) {
        south = p.lat;
      }
      if (p.lng > east) {
        east = p.lng;
      }
      if (p.lng < west) {
        west = p.lng;
      }
    }
  }

  if (!(Number.isFinite(north) && Number.isFinite(south))) {
    return { north: 0, south: 0, east: 0, west: 0 };
  }

  return { north, south, east, west };
}

function approximateSetMetrics(
  predicted: LatLng[][],
  truth: LatLng[],
  grid: number
): {
  iou: number;
  predAreaM2: number;
  truthAreaM2: number;
} {
  const bounds = allBounds([...predicted, truth]);
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  if (latSpan <= 0 || lngSpan <= 0) {
    return { iou: 0, predAreaM2: 0, truthAreaM2: 0 };
  }

  const midLat = (bounds.north + bounds.south) / 2;
  const widthM = metersBetween(
    { lat: midLat, lng: bounds.west },
    { lat: midLat, lng: bounds.east }
  );
  const heightM = metersBetween(
    { lat: bounds.south, lng: bounds.west },
    { lat: bounds.north, lng: bounds.west }
  );
  const bboxAreaM2 = widthM * heightM;

  let predCount = 0;
  let truthCount = 0;
  let intersectionCount = 0;

  const total = grid * grid;
  for (let y = 0; y < grid; y++) {
    const lat = bounds.south + ((y + 0.5) / grid) * latSpan;
    for (let x = 0; x < grid; x++) {
      const lng = bounds.west + ((x + 0.5) / grid) * lngSpan;
      const point = { lat, lng };

      const inTruth = pointInPolygon(point, truth);
      const inPred = predicted.some((poly) => pointInPolygon(point, poly));

      if (inTruth) {
        truthCount += 1;
      }
      if (inPred) {
        predCount += 1;
      }
      if (inTruth && inPred) {
        intersectionCount += 1;
      }
    }
  }

  const unionCount = predCount + truthCount - intersectionCount;
  const cellArea = total > 0 ? bboxAreaM2 / total : 0;

  return {
    iou: unionCount > 0 ? intersectionCount / unionCount : 0,
    predAreaM2: predCount * cellArea,
    truthAreaM2: truthCount * cellArea,
  };
}

function boundsToPolygon(bounds: Bounds): LatLng[] {
  return [
    { lat: bounds.north, lng: bounds.west },
    { lat: bounds.north, lng: bounds.east },
    { lat: bounds.south, lng: bounds.east },
    { lat: bounds.south, lng: bounds.west },
  ];
}

type ClipEdge = "left" | "right" | "bottom" | "top";

function isInside(point: LatLng, bounds: Bounds, edge: ClipEdge): boolean {
  switch (edge) {
    case "left":
      return point.lng >= bounds.west;
    case "right":
      return point.lng <= bounds.east;
    case "bottom":
      return point.lat >= bounds.south;
    case "top":
      return point.lat <= bounds.north;
  }
}

function edgeIntersection(
  start: LatLng,
  end: LatLng,
  bounds: Bounds,
  edge: ClipEdge
): LatLng | null {
  const dLat = end.lat - start.lat;
  const dLng = end.lng - start.lng;

  if (edge === "left" || edge === "right") {
    const x = edge === "left" ? bounds.west : bounds.east;
    if (Math.abs(dLng) < 1e-12) {
      return null;
    }
    const t = (x - start.lng) / dLng;
    if (!Number.isFinite(t)) {
      return null;
    }
    return {
      lat: start.lat + t * dLat,
      lng: x,
    };
  }

  const y = edge === "bottom" ? bounds.south : bounds.north;
  if (Math.abs(dLat) < 1e-12) {
    return null;
  }
  const t = (y - start.lat) / dLat;
  if (!Number.isFinite(t)) {
    return null;
  }
  return {
    lat: y,
    lng: start.lng + t * dLng,
  };
}

function clipPolygonByEdge(
  polygon: LatLng[],
  bounds: Bounds,
  edge: ClipEdge
): LatLng[] {
  const output: LatLng[] = [];
  if (polygon.length === 0) {
    return output;
  }

  let prev = polygon[polygon.length - 1];
  if (!prev) {
    return output;
  }
  let prevInside = isInside(prev, bounds, edge);

  for (const current of polygon) {
    const currentInside = isInside(current, bounds, edge);

    if (currentInside) {
      if (!prevInside) {
        const intersection = edgeIntersection(prev, current, bounds, edge);
        if (intersection) {
          output.push(intersection);
        }
      }
      output.push(current);
    } else if (prevInside) {
      const intersection = edgeIntersection(prev, current, bounds, edge);
      if (intersection) {
        output.push(intersection);
      }
    }

    prev = current;
    prevInside = currentInside;
  }

  return output;
}

function clipPolygonToBounds(polygon: LatLng[], bounds: Bounds): LatLng[] {
  let output = [...polygon];
  const edges: ClipEdge[] = ["left", "right", "bottom", "top"];

  for (const edge of edges) {
    output = clipPolygonByEdge(output, bounds, edge);
    if (output.length === 0) {
      return [];
    }
  }

  return normalizePolygon(output);
}

function parseInputPermits(input: unknown): InputPermit[] {
  if (Array.isArray(input)) {
    return input.map((row) => ({
      permitId: String((row as Record<string, unknown>).permitId ?? ""),
      projectName: ((row as Record<string, unknown>).projectName ?? null) as
        | string
        | null,
      address: ((row as Record<string, unknown>).address ?? null) as
        | string
        | null,
      city: ((row as Record<string, unknown>).city ?? null) as string | null,
      parcel: ((row as Record<string, unknown>).parcel ?? null) as
        | string
        | null,
      status: ((row as Record<string, unknown>).status ?? null) as
        | string
        | null,
      projectId: ((row as Record<string, unknown>).projectId ?? null) as
        | number
        | null,
      docCount: Number((row as Record<string, unknown>).docCount ?? 0),
    }));
  }

  if (
    input &&
    typeof input === "object" &&
    Array.isArray((input as Record<string, unknown>).permits)
  ) {
    return parseInputPermits((input as { permits: unknown[] }).permits);
  }

  return [];
}

async function resolvePredictionPolygons(
  permit: InputPermit,
  maxApns: number
): Promise<{
  source: PredictionSource;
  apnsUsed: string[];
  polygons: LatLng[][];
  debug: string[];
}> {
  const debug: string[] = [];
  const apnCandidates = extractApnCandidates(permit.parcel).slice(0, maxApns);

  const polygonsFromApn: LatLng[][] = [];
  const apnsUsed: string[] = [];
  const seenApns = new Set<string>();

  for (const apn of apnCandidates) {
    try {
      const parcel = await queryParcelByAPN(apn);
      const poly = normalizePolygon(parcel?.polygon ?? []);
      const clean = parcel?.apn ? cleanApn(parcel.apn) : null;

      if (poly.length < 3 || !clean || seenApns.has(clean)) {
        continue;
      }

      seenApns.add(clean);
      polygonsFromApn.push(poly);
      apnsUsed.push(apn);
    } catch (error) {
      debug.push(
        `queryParcelByAPN(${apn}) failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (polygonsFromApn.length > 0) {
    debug.push(`prediction from APN (${polygonsFromApn.length} polygons)`);
    return { source: "apn", apnsUsed, polygons: polygonsFromApn, debug };
  }

  if (!permit.address) {
    debug.push("address fallback unavailable");
    return { source: "none", apnsUsed: [], polygons: [], debug };
  }

  try {
    const addressMatches = await queryParcelsByAddress(permit.address);
    if (addressMatches.length === 0) {
      debug.push("address fallback returned no parcels");
      return { source: "none", apnsUsed: [], polygons: [], debug };
    }

    let chosen: ParcelData | null = null;
    if (apnCandidates.length > 0) {
      const apnSet = new Set(apnCandidates.map(cleanApn));
      chosen =
        addressMatches.find((m) => apnSet.has(cleanApn(m.apn))) ??
        addressMatches[0] ??
        null;
    } else {
      chosen = addressMatches[0] ?? null;
    }

    const polygon = normalizePolygon(chosen?.polygon ?? []);
    if (polygon.length < 3) {
      debug.push("address fallback candidate had invalid polygon");
      return { source: "none", apnsUsed: [], polygons: [], debug };
    }

    debug.push("prediction from address fallback");
    return {
      source: "address",
      apnsUsed: chosen?.apn ? [chosen.apn] : [],
      polygons: [polygon],
      debug,
    };
  } catch (error) {
    debug.push(
      `queryParcelsByAddress failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return { source: "none", apnsUsed: [], polygons: [], debug };
  }
}

function buildFallbackBoundsFromHints(
  sizeMeters: number | null,
  coordinates: LatLng | null
): { bounds: Bounds | null; mode: string | null } {
  if (!sizeMeters || sizeMeters <= 0) {
    return { bounds: null, mode: null };
  }

  if (coordinates) {
    return {
      bounds: calculateBoundsFromCenter(coordinates, sizeMeters, 1),
      mode: "hint-coordinates-size",
    };
  }

  return { bounds: null, mode: null };
}

async function evaluatePermit(
  permit: InputPermit,
  options: CliArgs,
  documentCache: Map<number, any[]>
): Promise<BenchmarkResult> {
  const debug: string[] = [];
  const apnCandidates = extractApnCandidates(permit.parcel);

  try {
    const mapData = await queryPermitMapFeatures(permit.permitId);
    const truthPolygon = normalizePolygon(
      mapData.disturbedArea?.latLngCoordinates ?? []
    );

    if (truthPolygon.length < 3) {
      return {
        permitId: permit.permitId,
        status: "skipped",
        reason: "missing disturbed-area polygon in map data",
        hints: {
          projectName: permit.projectName ?? null,
          address: permit.address ?? null,
          city: permit.city ?? null,
          parcelRaw: permit.parcel ?? null,
          apnCandidates,
        },
        prediction: {
          source: "none",
          apnsUsed: [],
          polygonCount: 0,
        },
        documentClues: null,
        groundTruth: null,
        metrics: null,
        debug,
      };
    }

    const basePrediction = await resolvePredictionPolygons(
      permit,
      options.maxApns
    );
    debug.push(...basePrediction.debug);

    let predictionSource: PredictionSource = basePrediction.source;
    let predictionPolygons = [...basePrediction.polygons];
    let documentClues: BenchmarkResult["documentClues"] = null;

    if (options.withDocClues) {
      const clueResult = await buildDocumentCluesForPermit(
        {
          permitId: permit.permitId,
          projectId: permit.projectId ?? null,
          projectName: permit.projectName ?? null,
          address: permit.address ?? null,
          city: permit.city ?? null,
          parcel: permit.parcel ?? null,
        },
        {
          container: options.docContainer,
          maxDocs: options.docLimit,
          state: "AZ",
          county: "Maricopa",
        },
        documentCache as Map<number, any[]>
      );

      debug.push(...clueResult.debug.map((d) => `doc-clues: ${d}`));

      const hintsForPipeline = {
        ...clueResult.hints,
        roads: [...clueResult.hints.roads],
        intersections: [...clueResult.hints.intersections],
        coordinates: clueResult.hints.coordinates
          ? { ...clueResult.hints.coordinates }
          : null,
        coordinateCandidates: dedupeCoordinates(
          (clueResult.hints.coordinateCandidates ?? []).map((coord) => ({
            lat: coord.lat,
            lng: coord.lng,
          })),
          10
        ),
      };

      if (
        options.withGeminiClues &&
        permit.projectId &&
        permit.projectId > 0 &&
        (!options.geminiOnlyWhenMissingCoords ||
          (hintsForPipeline.coordinateCandidates ?? []).length === 0)
      ) {
        const geminiClues = await buildGeminiDocumentCluesForPermit(
          permit.permitId,
          permit.projectId ?? null,
          {
            enabled: true,
            model: options.geminiModel,
            maxDocs: options.geminiMaxDocs,
            maxDocBytes: options.geminiMaxDocBytes,
            container: options.docContainer,
          }
        );

        debug.push(...geminiClues.debug.map((d) => `doc-gemini: ${d}`));

        if (geminiClues.coordinates.length > 0) {
          hintsForPipeline.coordinateCandidates = dedupeCoordinates(
            [
              ...geminiClues.coordinates,
              ...(hintsForPipeline.coordinateCandidates ?? []),
            ],
            10
          );
          hintsForPipeline.coordinates =
            hintsForPipeline.coordinateCandidates[0] ?? null;
        }
      }

      const allCoordinates = dedupeCoordinates(
        [
          ...(hintsForPipeline.coordinates
            ? [hintsForPipeline.coordinates]
            : []),
          ...(hintsForPipeline.coordinateCandidates ?? []),
        ],
        10
      );

      if (predictionPolygons.length > 0 && allCoordinates.length > 0) {
        const predictionCenter = weightedCentroid(predictionPolygons);
        const inlierCoordinates: LatLng[] = [];

        for (const coord of allCoordinates) {
          const coordDelta = metersBetween(predictionCenter, coord);
          if (coordDelta <= options.docMaxCoordDeltaM) {
            inlierCoordinates.push(coord);
            continue;
          }

          debug.push(
            `doc-clues: dropped outlier coordinates (${coordDelta.toFixed(1)}m from parcel center)`
          );
        }

        hintsForPipeline.coordinateCandidates = inlierCoordinates;
      } else if (allCoordinates.length > 0) {
        hintsForPipeline.coordinateCandidates = allCoordinates;
      }

      hintsForPipeline.coordinates =
        (hintsForPipeline.coordinateCandidates ?? [])[0] ?? null;

      if (
        options.docCoordinateParcelOverride &&
        predictionPolygons.length === 1
      ) {
        const coordCandidates = hintsForPipeline.coordinateCandidates ?? [];
        if (coordCandidates.length > 0) {
          const basePoly = predictionPolygons[0];
          if (basePoly) {
            const baseCenter = polygonCentroid(basePoly);
            const baseApnSet = new Set(
              basePrediction.apnsUsed.map((apn) => cleanApn(apn))
            );

            let bestOverride: {
              polygon: LatLng[];
              deltaM: number;
              apn: string | null;
              coordinate: LatLng;
            } | null = null;

            for (const coord of coordCandidates) {
              try {
                const coordParcel = await queryParcelByCoordinates(
                  coord.lat,
                  coord.lng
                );
                const coordPoly = normalizePolygon(coordParcel?.polygon ?? []);
                if (coordPoly.length < 3) {
                  continue;
                }

                const coordCenter = polygonCentroid(coordPoly);
                const deltaM = metersBetween(baseCenter, coordCenter);
                const coordInBase = pointInPolygon(coord, basePoly);

                const coordApnClean = coordParcel?.apn
                  ? cleanApn(coordParcel.apn)
                  : "";
                const sameApn = coordApnClean
                  ? baseApnSet.has(coordApnClean)
                  : false;

                const valid =
                  !(sameApn || coordInBase) &&
                  deltaM >= options.docCoordinateParcelMinDeltaM &&
                  deltaM <= options.docCoordinateParcelMaxDeltaM;

                if (!valid) {
                  continue;
                }

                if (
                  !bestOverride ||
                  deltaM + OVERRIDE_DELTA_TIE_TOLERANCE_M < bestOverride.deltaM
                ) {
                  bestOverride = {
                    polygon: coordPoly,
                    deltaM,
                    apn: coordParcel?.apn ?? null,
                    coordinate: coord,
                  };
                }
              } catch (error) {
                debug.push(
                  `doc-clues: coordinate parcel candidate failed: ${error instanceof Error ? error.message : String(error)}`
                );
              }
            }

            if (bestOverride) {
              predictionPolygons = [bestOverride.polygon];
              predictionSource = "coord_parcel_override";
              hintsForPipeline.coordinates = bestOverride.coordinate;
              debug.push(
                `doc-clues: coordinate parcel override applied (delta=${bestOverride.deltaM.toFixed(1)}m, apn=${bestOverride.apn ?? "n/a"}, candidates=${coordCandidates.length})`
              );
            } else {
              debug.push(
                `doc-clues: coordinate parcel override skipped (no valid candidate from ${coordCandidates.length})`
              );
            }
          }
        }
      }

      if (
        options.docSizeNormalize &&
        predictionSource === "apn" &&
        predictionPolygons.length === 1 &&
        hintsForPipeline.estimatedSizeMeters &&
        hintsForPipeline.estimatedSizeMeters > 0
      ) {
        const polygon = predictionPolygons[0];
        if (polygon) {
          const baseAreaM2 = polygonAreaM2(polygon);
          const targetAreaM2 = hintsForPipeline.estimatedSizeMeters ** 2;
          const overageRatio = targetAreaM2 > 0 ? baseAreaM2 / targetAreaM2 : 0;

          if (
            baseAreaM2 > 0 &&
            targetAreaM2 > 0 &&
            overageRatio >= options.docSizeOverageRatio
          ) {
            let anchor = polygonCentroid(polygon);
            if (
              hintsForPipeline.coordinates &&
              pointInPolygon(hintsForPipeline.coordinates, polygon)
            ) {
              anchor = hintsForPipeline.coordinates;
            }

            const rawScale = Math.sqrt(targetAreaM2 / baseAreaM2);
            const appliedScale = Math.max(
              options.docSizeMinScale,
              Math.min(0.98, rawScale)
            );

            if (appliedScale < 0.98) {
              const scaled = scalePolygonAroundAnchor(
                polygon,
                anchor,
                appliedScale
              );
              if (scaled.length >= 3) {
                predictionPolygons = [scaled];
                predictionSource = "apn_size_normalized_by_doc";
                debug.push(
                  "doc-clues: size-normalized parcel (overage=" +
                    overageRatio.toFixed(2) +
                    "x, scale=" +
                    appliedScale.toFixed(3) +
                    ")"
                );
              }
            }
          }
        }
      }

      const rehydrate = await runRehydratedPipeline(hintsForPipeline, {
        googleMapsApiKey: options.googleMapsApiKey,
        enableRoadGeometry: false,
        maxIntersections: 4,
        maxRoads: 6,
        defaultSiteSizeMeters: hintsForPipeline.estimatedSizeMeters ?? 150,
      });

      let bounds =
        rehydrate.suggestedBounds &&
        rehydrate.consensusConfidence >= options.docMinConfidence
          ? rehydrate.suggestedBounds
          : null;
      let boundsMode = bounds ? "rehydrate-bounds" : null;

      if (!bounds) {
        const fallback = buildFallbackBoundsFromHints(
          hintsForPipeline.estimatedSizeMeters,
          hintsForPipeline.coordinates
        );
        bounds = fallback.bounds;
        boundsMode = fallback.mode;
      }

      let boundsApplied = false;
      const clipEligible = Boolean(bounds) && boundsMode === "rehydrate-bounds";
      if (clipEligible && predictionPolygons.length > 0) {
        const beforeAreaM2 = predictionPolygons.reduce(
          (sum, poly) => sum + polygonAreaM2(poly),
          0
        );

        const clipped = predictionPolygons
          .map((poly) => clipPolygonToBounds(poly, bounds as Bounds))
          .filter((poly) => poly.length >= 3);

        if (clipped.length > 0) {
          const clippedAreaM2 = clipped.reduce(
            (sum, poly) => sum + polygonAreaM2(poly),
            0
          );
          const clippedAreaShare =
            beforeAreaM2 > 0 ? clippedAreaM2 / beforeAreaM2 : 0;

          if (clippedAreaShare >= options.docClipMinAreaShare) {
            predictionPolygons = clipped;
            predictionSource = "apn_clipped_by_doc";
            boundsApplied = true;
            debug.push(
              `doc-clues: applied bounds clipping (${boundsMode ?? "n/a"}, share=${clippedAreaShare.toFixed(3)})`
            );
          } else {
            debug.push(
              `doc-clues: skipped clipping due to small area share (${clippedAreaShare.toFixed(3)} < ${options.docClipMinAreaShare.toFixed(3)})`
            );
          }
        }
      } else if (bounds && !clipEligible) {
        debug.push(
          `doc-clues: bounds (${boundsMode ?? "n/a"}) not eligible for clipping`
        );
      } else if (bounds && predictionPolygons.length === 0) {
        debug.push(
          "doc-clues: bounds available but skipped because no base APN/address polygon"
        );
      }

      documentClues = {
        enabled: true,
        docsUsed: clueResult.docsUsed,
        roads: clueResult.extracted.roads,
        intersections: clueResult.extracted.intersections,
        hasCoordinates: Boolean(hintsForPipeline.coordinates),
        hasEstimatedSize: clueResult.extracted.hasEstimatedSize,
        consensusConfidence: rehydrate.consensusLocation
          ? rehydrate.consensusConfidence
          : null,
        boundsMode,
        boundsApplied,
      };
    }
    if (predictionPolygons.length === 0) {
      return {
        permitId: permit.permitId,
        status: "skipped",
        reason: "no prediction polygon from APN/address hints",
        hints: {
          projectName: permit.projectName ?? null,
          address: permit.address ?? null,
          city: permit.city ?? null,
          parcelRaw: permit.parcel ?? null,
          apnCandidates,
        },
        prediction: {
          source: predictionSource,
          apnsUsed: basePrediction.apnsUsed,
          polygonCount: 0,
        },
        documentClues,
        groundTruth: {
          polygonVertices: truthPolygon.length,
          centroid: polygonCentroid(truthPolygon),
        },
        metrics: null,
        debug,
      };
    }

    const truthCentroid = polygonCentroid(truthPolygon);
    const predCentroid = weightedCentroid(predictionPolygons);
    const centroidErrorM = metersBetween(truthCentroid, predCentroid);

    const setMetrics = approximateSetMetrics(
      predictionPolygons,
      truthPolygon,
      options.iouGrid
    );

    const areaRatio =
      setMetrics.truthAreaM2 > 0
        ? setMetrics.predAreaM2 / setMetrics.truthAreaM2
        : 0;
    const passCentroid = centroidErrorM <= options.maxCentroidErrorM;
    const passArea =
      areaRatio >= options.minAreaRatio && areaRatio <= options.maxAreaRatio;
    const passIou = setMetrics.iou >= options.minIou;

    return {
      permitId: permit.permitId,
      status: "scored",
      reason: null,
      hints: {
        projectName: permit.projectName ?? null,
        address: permit.address ?? null,
        city: permit.city ?? null,
        parcelRaw: permit.parcel ?? null,
        apnCandidates,
      },
      prediction: {
        source: predictionSource,
        apnsUsed: basePrediction.apnsUsed,
        polygonCount: predictionPolygons.length,
      },
      documentClues,
      groundTruth: {
        polygonVertices: truthPolygon.length,
        centroid: truthCentroid,
      },
      metrics: {
        centroidErrorM,
        areaRatio,
        iou: setMetrics.iou,
        passCentroid,
        passArea,
        passIou,
      },
      debug,
    };
  } catch (error) {
    return {
      permitId: permit.permitId,
      status: "error",
      reason: error instanceof Error ? error.message : String(error),
      hints: {
        projectName: permit.projectName ?? null,
        address: permit.address ?? null,
        city: permit.city ?? null,
        parcelRaw: permit.parcel ?? null,
        apnCandidates,
      },
      prediction: {
        source: "none",
        apnsUsed: [],
        polygonCount: 0,
      },
      documentClues: null,
      groundTruth: null,
      metrics: null,
      debug,
    };
  }
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function iouBins(results: BenchmarkResult[]): Record<string, number> {
  const scored = results.filter((r) => r.status === "scored" && r.metrics);
  const bins = {
    gte_0_75: 0,
    gte_0_50: 0,
    gte_0_25: 0,
    lt_0_25: 0,
  };

  for (const result of scored) {
    const iou = result.metrics?.iou ?? 0;
    if (iou >= 0.75) {
      bins.gte_0_75 += 1;
    } else if (iou >= 0.5) {
      bins.gte_0_50 += 1;
    } else if (iou >= 0.25) {
      bins.gte_0_25 += 1;
    } else {
      bins.lt_0_25 += 1;
    }
  }

  return bins;
}

async function runWithConcurrency<T, R>(
  items: T[],
  parallel: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;

  const runners = Array.from({ length: parallel }, async () => {
    while (true) {
      const i = index;
      index += 1;
      if (i >= items.length) {
        return;
      }
      const item = items[i];
      if (item === undefined) {
        continue;
      }
      results[i] = await worker(item, i);
    }
  });

  await Promise.all(runners);
  return results;
}

async function appendIterationHistory(
  options: CliArgs,
  summary: {
    totalInput: number;
    scored: number;
    skipped: number;
    errors: number;
    averageIou: number;
    averageCentroidErrorM: number;
    averageAreaRatio: number;
    passRates: {
      all: number;
      iou: number;
      area: number;
      centroid: number;
    };
  },
  bins: Record<string, number>,
  outputPath: string,
  top: Array<{ permitId: string; iou: number; source: PredictionSource }>
): Promise<void> {
  const ts = new Date().toISOString();
  const title = options.label ? `${ts} - ${options.label}` : ts;
  const lines = [
    `## ${title}`,
    `- input: \`${options.inputPath}\``,
    `- output: \`${outputPath}\``,
    `- mode: ${options.withDocClues ? "doc-clue-assisted" : "baseline"}`,
    `- scored/skipped/errors: ${summary.scored}/${summary.skipped}/${summary.errors}`,
    `- avg IoU: ${summary.averageIou.toFixed(3)}`,
    `- avg centroid error (m): ${summary.averageCentroidErrorM.toFixed(1)}`,
    `- avg area ratio: ${summary.averageAreaRatio.toFixed(3)}`,
    `- pass(all/iou/area/centroid): ${(summary.passRates.all * 100).toFixed(1)}% / ${(summary.passRates.iou * 100).toFixed(1)}% / ${(summary.passRates.area * 100).toFixed(1)}% / ${(summary.passRates.centroid * 100).toFixed(1)}%`,
    `- IoU bins: >=0.75=${bins.gte_0_75}, >=0.50=${bins.gte_0_50}, >=0.25=${bins.gte_0_25}, <0.25=${bins.lt_0_25}`,
    `- top permits: ${top.map((t) => `${t.permitId}:${t.iou.toFixed(3)}(${t.source})`).join(", ") || "n/a"}`,
    "",
  ];

  const historyFile = Bun.file(options.historyPath);
  const exists = await historyFile.exists();
  const header = "# Custom Map Rehydrate Iteration Log\n\n";
  const current = exists ? await historyFile.text() : header;
  const normalizedCurrent = current.endsWith("\n") ? current : `${current}\n`;
  const separator = normalizedCurrent.endsWith("\n\n") ? "" : "\n";

  await mkdir(dirname(options.historyPath), { recursive: true });
  await Bun.write(
    options.historyPath,
    `${normalizedCurrent}${separator}${lines.join("\n")}`
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const file = Bun.file(options.inputPath);
  if (!(await file.exists())) {
    throw new Error(`Input file not found: ${options.inputPath}`);
  }

  const raw = await file.json();
  const allPermits = parseInputPermits(raw).filter((p) => Boolean(p.permitId));
  const permits =
    options.limit === null ? allPermits : allPermits.slice(0, options.limit);

  if (permits.length === 0) {
    throw new Error("No permits found in input");
  }

  console.log("=== Benchmark Start ===");
  console.log(`input: ${options.inputPath}`);
  console.log(`permits: ${permits.length}`);
  console.log(`parallel: ${options.parallel}`);
  console.log(`doc clues: ${options.withDocClues ? "on" : "off"}`);
  console.log(`gemini clues: ${options.withGeminiClues ? "on" : "off"}`);

  const startedAt = Date.now();
  const documentCache = new Map<number, any[]>();

  const results = await runWithConcurrency(
    permits,
    options.parallel,
    async (permit, idx) => {
      const result = await evaluatePermit(permit, options, documentCache);
      const label =
        result.status === "scored"
          ? `IoU=${result.metrics?.iou.toFixed(3) ?? "n/a"}`
          : (result.reason ?? "skip");
      console.log(
        `[${idx + 1}/${permits.length}] ${result.permitId} -> ${result.status} (${label})`
      );
      return result;
    }
  );

  const scored = results.filter((r) => r.status === "scored" && r.metrics);
  const skipped = results.filter((r) => r.status === "skipped");
  const errored = results.filter((r) => r.status === "error");

  const ious = scored
    .map((r) => r.metrics?.iou ?? 0)
    .filter((v) => Number.isFinite(v));
  const centroidErrors = scored
    .map((r) => r.metrics?.centroidErrorM ?? 0)
    .filter((v) => Number.isFinite(v));
  const areaRatios = scored
    .map((r) => r.metrics?.areaRatio ?? 0)
    .filter((v) => Number.isFinite(v));

  const passAll = scored.filter(
    (r) => r.metrics?.passIou && r.metrics.passArea && r.metrics.passCentroid
  ).length;
  const passIou = scored.filter((r) => r.metrics?.passIou).length;
  const passArea = scored.filter((r) => r.metrics?.passArea).length;
  const passCentroid = scored.filter((r) => r.metrics?.passCentroid).length;

  const summary = {
    totalInput: permits.length,
    scored: scored.length,
    skipped: skipped.length,
    errors: errored.length,
    averageIou: average(ious),
    averageCentroidErrorM: average(centroidErrors),
    averageAreaRatio: average(areaRatios),
    passRates: {
      all: scored.length > 0 ? passAll / scored.length : 0,
      iou: scored.length > 0 ? passIou / scored.length : 0,
      area: scored.length > 0 ? passArea / scored.length : 0,
      centroid: scored.length > 0 ? passCentroid / scored.length : 0,
    },
  };

  const output = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    options: {
      inputPath: options.inputPath,
      limit: options.limit,
      parallel: options.parallel,
      maxApns: options.maxApns,
      iouGrid: options.iouGrid,
      withDocClues: options.withDocClues,
      docContainer: options.docContainer,
      docLimit: options.docLimit,
      docMinConfidence: options.docMinConfidence,
      docMaxCoordDeltaM: options.docMaxCoordDeltaM,
      docClipMinAreaShare: options.docClipMinAreaShare,
      docCoordinateParcelOverride: options.docCoordinateParcelOverride,
      docCoordinateParcelMaxDeltaM: options.docCoordinateParcelMaxDeltaM,
      docCoordinateParcelMinDeltaM: options.docCoordinateParcelMinDeltaM,
      docSizeNormalize: options.docSizeNormalize,
      docSizeOverageRatio: options.docSizeOverageRatio,
      docSizeMinScale: options.docSizeMinScale,
      withGeminiClues: options.withGeminiClues,
      geminiModel: options.geminiModel,
      geminiMaxDocs: options.geminiMaxDocs,
      geminiMaxDocBytes: options.geminiMaxDocBytes,
      geminiOnlyWhenMissingCoords: options.geminiOnlyWhenMissingCoords,
      thresholds: {
        minIou: options.minIou,
        minAreaRatio: options.minAreaRatio,
        maxAreaRatio: options.maxAreaRatio,
        maxCentroidErrorM: options.maxCentroidErrorM,
      },
    },
    summary,
    iouBins: iouBins(results),
    results,
  };

  await mkdir(dirname(options.outputPath), { recursive: true });
  await Bun.write(options.outputPath, JSON.stringify(output, null, 2));

  if (options.recordHistory) {
    const top = [...scored]
      .sort((a, b) => (b.metrics?.iou ?? 0) - (a.metrics?.iou ?? 0))
      .slice(0, 5)
      .map((r) => ({
        permitId: r.permitId,
        iou: r.metrics?.iou ?? 0,
        source: r.prediction.source,
      }));

    await appendIterationHistory(
      options,
      summary,
      output.iouBins,
      options.outputPath,
      top
    );
  }

  console.log("\n=== Benchmark Summary ===");
  console.log(`scored: ${scored.length}`);
  console.log(`skipped: ${skipped.length}`);
  console.log(`errors: ${errored.length}`);
  console.log(`avg IoU: ${average(ious).toFixed(3)}`);
  console.log(`avg centroid error (m): ${average(centroidErrors).toFixed(1)}`);
  console.log(`avg area ratio: ${average(areaRatios).toFixed(3)}`);
  console.log(`pass(all): ${(summary.passRates.all * 100).toFixed(1)}%`);
  console.log(`out: ${options.outputPath}`);
  if (options.recordHistory) {
    console.log(`history: ${options.historyPath}`);
  }
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
