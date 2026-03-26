import { z } from "zod";
import { queryParcelByCoordinates } from "@/lib/assessor";
import type { ParcelData } from "@/lib/assessor";
import type { LatLng, MapFeature, PermitMapData } from "@/lib/dust-features";
import { latLngToWebMercator } from "@/lib/dust-features";
import {
  approximatePolygonAreaM2,
  formatApnDashed,
  m2ToAcres,
} from "@/lib/site-drawing";

const LatLngSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
});

const BaseGeometrySourceSchema = z.object({
  disturbedAcres: z.number().positive().optional(),
  targetParcel: z.string().trim().min(1).optional(),
});

const ManualGeometrySourceSchema = BaseGeometrySourceSchema.extend({
  accessPoints: z.array(LatLngSchema).optional(),
  disturbedArea: z.array(LatLngSchema).min(3),
  kind: z.literal("manual"),
});

const KmlFileGeometrySourceSchema = BaseGeometrySourceSchema.extend({
  kind: z.literal("kml-file"),
  path: z.string().trim().min(1),
});

const KmlTextGeometrySourceSchema = BaseGeometrySourceSchema.extend({
  kind: z.literal("kml-text"),
  text: z.string().trim().min(1),
});

const KmlUrlGeometrySourceSchema = BaseGeometrySourceSchema.extend({
  kind: z.literal("kml-url"),
  url: z.string().url(),
});

export const GeometrySourceSchema = z.discriminatedUnion("kind", [
  ManualGeometrySourceSchema,
  KmlFileGeometrySourceSchema,
  KmlTextGeometrySourceSchema,
  KmlUrlGeometrySourceSchema,
]);

export type GeometrySource = z.infer<typeof GeometrySourceSchema>;

export interface ResolvedGeometrySource {
  centroid: LatLng | null;
  mapData: PermitMapData;
  parcel: ParcelData | null;
  sourceKind: GeometrySource["kind"];
  targetParcelDashed?: string;
  disturbedAcres: number | null;
  disturbedAcresSource: "computed" | "explicit" | null;
}

export interface ParsedKmlGeometry {
  accessPoints: LatLng[];
  centroid: LatLng | null;
  disturbedAcres: number | null;
  disturbedArea: LatLng[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isZipBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

function stripClosingCoordinate(points: LatLng[]): LatLng[] {
  const cleaned = points.filter(
    (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)
  );
  if (cleaned.length < 2) {
    return cleaned;
  }

  const first = cleaned[0];
  const last = cleaned.at(-1);
  if (!first || !last) {
    return cleaned;
  }

  if (first.lat === last.lat && first.lng === last.lng) {
    return cleaned.slice(0, -1);
  }

  return cleaned;
}

function averagePoint(points: LatLng[]): LatLng | null {
  const cleaned = stripClosingCoordinate(points);
  if (cleaned.length === 0) {
    return null;
  }

  let lat = 0;
  let lng = 0;
  for (const point of cleaned) {
    lat += point.lat;
    lng += point.lng;
  }

  return {
    lat: lat / cleaned.length,
    lng: lng / cleaned.length,
  };
}

function computePolygonCentroid(points: LatLng[]): LatLng | null {
  const cleaned = stripClosingCoordinate(points);
  if (cleaned.length < 3) {
    return averagePoint(cleaned);
  }

  let lat0 = 0;
  let lng0 = 0;
  for (const point of cleaned) {
    lat0 += point.lat;
    lng0 += point.lng;
  }
  lat0 /= cleaned.length;
  lng0 /= cleaned.length;

  const radiusMeters = 6_371_000;
  const cosLat0 = Math.max(Math.cos((lat0 * Math.PI) / 180), 1e-6);

  const toLocalPoint = (point: LatLng): { x: number; y: number } => ({
    x: ((point.lng - lng0) * Math.PI * radiusMeters * cosLat0) / 180,
    y: ((point.lat - lat0) * Math.PI * radiusMeters) / 180,
  });

  let twiceArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < cleaned.length; index += 1) {
    const current = cleaned[index];
    const next = cleaned[(index + 1) % cleaned.length];
    if (!(current && next)) {
      continue;
    }

    const currentLocal = toLocalPoint(current);
    const nextLocal = toLocalPoint(next);
    const cross =
      currentLocal.x * nextLocal.y - nextLocal.x * currentLocal.y;
    twiceArea += cross;
    centroidX += (currentLocal.x + nextLocal.x) * cross;
    centroidY += (currentLocal.y + nextLocal.y) * cross;
  }

  if (Math.abs(twiceArea) < 1e-9) {
    return averagePoint(cleaned);
  }

  const localCentroidX = centroidX / (3 * twiceArea);
  const localCentroidY = centroidY / (3 * twiceArea);

  return {
    lat: lat0 + (localCentroidY * 180) / (Math.PI * radiusMeters),
    lng:
      lng0 +
      (localCentroidX * 180) / (Math.PI * radiusMeters * cosLat0),
  };
}

function parseCoordinateText(text: string): LatLng[] {
  return text
    .trim()
    .split(/\s+/)
    .map((entry) => entry.split(","))
    .map(([lngRaw, latRaw]) => ({
      lat: Number(latRaw),
      lng: Number(lngRaw),
    }))
    .filter(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)
    );
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function getTagBlocks(xml: string, tagName: string): string[] {
  const pattern = new RegExp(
    `<(?:[\\w-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tagName}>`,
    "gi"
  );

  return Array.from(xml.matchAll(pattern), (match) => match[1] ?? "");
}

function getFirstTagText(xml: string, tagName: string): string | null {
  const pattern = new RegExp(
    `<(?:[\\w-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tagName}>`,
    "i"
  );
  const match = pattern.exec(xml);
  if (!match?.[1]) {
    return null;
  }

  return decodeXmlEntities(match[1].trim());
}

function getPolygonCoordinateText(polygonXml: string): string | null {
  const outerBoundaryPattern = new RegExp(
    `<(?:[\\w-]+:)?outerBoundaryIs\\b[^>]*>[\\s\\S]*?<(?:[\\w-]+:)?coordinates\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?coordinates>`,
    "i"
  );
  const outerBoundaryMatch = outerBoundaryPattern.exec(polygonXml);
  if (outerBoundaryMatch?.[1]) {
    return outerBoundaryMatch[1].trim();
  }

  return getFirstTagText(polygonXml, "coordinates");
}

function parsePointCoordinates(pointXml: string): LatLng | null {
  const coordinatesText = getFirstTagText(pointXml, "coordinates");
  if (!coordinatesText) {
    return null;
  }

  return parseCoordinateText(coordinatesText)[0] ?? null;
}

function chooseDisturbedAreaPolygon(
  candidates: Array<{ areaM2: number; name: string; points: LatLng[] }>
): LatLng[] {
  if (candidates.length === 0) {
    throw new Error("KML does not contain any polygon geometry");
  }

  const namedCandidates = candidates.filter((candidate) =>
    /disturb|construction|work|boundary|area/i.test(candidate.name)
  );
  const source = namedCandidates.length > 0 ? namedCandidates : candidates;
  const bestCandidate = source.reduce((best, current) =>
    current.areaM2 > best.areaM2 ? current : best
  );

  return bestCandidate.points;
}

function buildPointFeature(
  point: LatLng,
  attributes: Record<string, unknown>
): MapFeature {
  return {
    attributes,
    coordinates: [latLngToWebMercator(point.lat, point.lng)],
    latLngCoordinates: [point],
    layerIndex: 0,
    type: "point",
  };
}

function buildPolygonFeature(
  points: LatLng[],
  attributes: Record<string, unknown>
): MapFeature {
  return {
    attributes,
    coordinates: points.map((point) => latLngToWebMercator(point.lat, point.lng)),
    latLngCoordinates: points,
    layerIndex: 3,
    type: "polygon",
  };
}

function buildPermitMapDataFromGeometry(params: {
  accessPoints?: LatLng[];
  centroid: LatLng | null;
  disturbedAcres: number | null;
  disturbedArea: LatLng[];
  sourceKind: GeometrySource["kind"];
}): PermitMapData {
  const disturbedAreaFeature = buildPolygonFeature(params.disturbedArea, {
    source: params.sourceKind,
  });

  const accessPointFeatures = (params.accessPoints ?? []).map((point) =>
    buildPointFeature(point, {
      source: params.sourceKind,
    })
  );

  return {
    accessPoints: accessPointFeatures,
    acreage: params.disturbedAcres,
    centroid: params.centroid,
    disturbedArea: disturbedAreaFeature,
    permitId: "NEW",
    points: accessPointFeatures,
    polygons: [disturbedAreaFeature],
    polylines: [],
  };
}

async function readGeometrySourceText(source: Exclude<GeometrySource, { kind: "manual" }>): Promise<string> {
  if (source.kind === "kml-text") {
    return source.text;
  }

  if (source.kind === "kml-file") {
    const file = Bun.file(source.path);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (isZipBytes(bytes)) {
      throw new Error(
        `KMZ is not supported for ${source.path}. Export or unzip it as a .kml file first.`
      );
    }
    return new TextDecoder().decode(bytes);
  }

  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch KML from ${source.url}: HTTP ${response.status}`
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (isZipBytes(bytes)) {
    throw new Error(
      `KMZ is not supported for ${source.url}. Export or unzip it as a .kml file first.`
    );
  }

  return new TextDecoder().decode(bytes);
}

export function parseKmlGeometry(
  kmlText: string,
  options: { disturbedAcres?: number } = {}
): ParsedKmlGeometry {
  const placemarks = getTagBlocks(kmlText, "Placemark");
  if (placemarks.length === 0) {
    throw new Error("KML does not contain any Placemark elements");
  }

  const polygonCandidates: Array<{
    areaM2: number;
    name: string;
    points: LatLng[];
  }> = [];
  const accessPointCandidates: Array<{ name: string; point: LatLng }> = [];

  for (const placemark of placemarks) {
    const name = getFirstTagText(placemark, "name") ?? "";

    const polygonElements = getTagBlocks(placemark, "Polygon");
    for (const polygonElement of polygonElements) {
      const coordinatesText = getPolygonCoordinateText(polygonElement);
      if (!coordinatesText) {
        continue;
      }

      const points = stripClosingCoordinate(parseCoordinateText(coordinatesText));
      if (points.length < 3) {
        continue;
      }

      polygonCandidates.push({
        areaM2: approximatePolygonAreaM2(points),
        name,
        points,
      });
    }

    const pointElements = getTagBlocks(placemark, "Point");
    for (const pointElement of pointElements) {
      const point = parsePointCoordinates(pointElement);
      if (point) {
        accessPointCandidates.push({ name, point });
      }
    }
  }

  const disturbedArea = chooseDisturbedAreaPolygon(polygonCandidates);
  const centroid = computePolygonCentroid(disturbedArea);
  const namedAccessPoints = accessPointCandidates.filter(
    (candidate) => candidate.name.length > 0
  );
  const accessPoints = (
    namedAccessPoints.length > 0 ? namedAccessPoints : accessPointCandidates
  ).map((candidate) => candidate.point);
  const computedArea = m2ToAcres(approximatePolygonAreaM2(disturbedArea));
  const disturbedAcres =
    options.disturbedAcres ??
    (Number.isFinite(computedArea) && computedArea > 0 ? computedArea : null);

  return {
    accessPoints,
    centroid,
    disturbedAcres,
    disturbedArea,
  };
}

function parseManualGeometry(
  source: z.infer<typeof ManualGeometrySourceSchema>
): ParsedKmlGeometry {
  const disturbedArea = stripClosingCoordinate(source.disturbedArea);
  if (disturbedArea.length < 3) {
    throw new Error("Manual geometry requires at least three disturbed-area coordinates");
  }

  const disturbedAcres =
    source.disturbedAcres ??
    m2ToAcres(approximatePolygonAreaM2(disturbedArea));

  return {
    accessPoints: source.accessPoints ?? [],
    centroid: computePolygonCentroid(disturbedArea),
    disturbedAcres:
      Number.isFinite(disturbedAcres) && disturbedAcres > 0
        ? disturbedAcres
        : null,
    disturbedArea,
  };
}

export function validateGeometrySource(
  geometrySource: unknown
): { success: true; data: GeometrySource } | { success: false; error: string } {
  const parsed = GeometrySourceSchema.safeParse(geometrySource);
  if (!parsed.success) {
    return {
      error: z.prettifyError(parsed.error),
      success: false,
    };
  }

  return {
    data: parsed.data,
    success: true,
  };
}

export async function resolveGeometrySource(
  source: GeometrySource
): Promise<ResolvedGeometrySource> {
  const parsedGeometry =
    source.kind === "manual"
      ? parseManualGeometry(source)
      : parseKmlGeometry(await readGeometrySourceText(source), {
          disturbedAcres: source.disturbedAcres,
        });

  const disturbedAcresSource =
    source.disturbedAcres !== undefined
      ? "explicit"
      : parsedGeometry.disturbedAcres !== null
        ? "computed"
        : null;

  const targetParcelDashed = source.targetParcel
    ? formatApnDashed(source.targetParcel)
    : undefined;

  let parcel: ParcelData | null = null;
  if (!targetParcelDashed && parsedGeometry.centroid) {
    try {
      parcel = await queryParcelByCoordinates(
        parsedGeometry.centroid.lat,
        parsedGeometry.centroid.lng
      );
    } catch (error) {
      console.warn(
        `[geometry] Failed to infer parcel at centroid: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  const mapData = buildPermitMapDataFromGeometry({
    accessPoints: parsedGeometry.accessPoints,
    centroid: parsedGeometry.centroid,
    disturbedAcres: parsedGeometry.disturbedAcres,
    disturbedArea: parsedGeometry.disturbedArea,
    sourceKind: source.kind,
  });

  return {
    centroid: parsedGeometry.centroid,
    mapData,
    parcel,
    sourceKind: source.kind,
    targetParcelDashed:
      targetParcelDashed ?? (parcel ? formatApnDashed(parcel.apn) : undefined),
    disturbedAcres: parsedGeometry.disturbedAcres,
    disturbedAcresSource,
  };
}

export function splitFormDataAndGeometrySource(
  input: unknown
): { formData: unknown; geometrySource?: unknown } {
  if (!isPlainObject(input) || !("geometrySource" in input)) {
    return { formData: input };
  }

  const { geometrySource } = input;

  if ("formData" in input) {
    const extraKeys = Object.keys(input).filter(
      (key) => key !== "formData" && key !== "geometrySource"
    );
    if (extraKeys.length > 0) {
      throw new Error(
        `geometrySource files must use either top-level overrides or { formData, geometrySource }, not both. Unexpected keys: ${extraKeys.join(", ")}`
      );
    }

    return {
      formData: input.formData,
      geometrySource,
    };
  }

  const formData = { ...input };
  delete formData.geometrySource;

  return {
    formData,
    geometrySource,
  };
}
