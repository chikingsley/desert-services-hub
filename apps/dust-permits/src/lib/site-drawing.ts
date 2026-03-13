/**
 * Site Drawing Helpers
 *
 * Converts a known site location (lat/lng from NOI) into a deterministic
 * disturbed-area polygon for Page 2 by snapping to the Maricopa Assessor
 * parcel that contains the point.
 */

import type { ParcelData } from "@/lib/assessor";
import { queryParcelByCoordinates } from "@/lib/assessor";
import type { LatLng, MapFeature, PermitMapData } from "@/lib/dust-features";
import { latLngToWebMercator } from "@/lib/dust-features";

const STREET_CENTERLINE_SERVICE_BASE_URL =
  "https://gis.maricopa.gov/arcgis/rest/services/IndividualService/Street/MapServer";
const STREET_CENTERLINE_LAYER_IDS = [1, 2, 3] as const;

export interface SiteCoordinatesInput {
  acresDisturbed?: number | null;
  latitude: number;
  longitude: number;
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parsePositiveNumberEnv(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function formatApnClean(apn: string): string {
  return apn.replaceAll(/[-\s.]/g, "").toUpperCase();
}

/**
 * Convert clean APN like 50172958J to dashed APN like 501-72-958J.
 *
 * Portal tables typically show dashed APNs.
 */
export function formatApnDashed(apn: string): string {
  const clean = formatApnClean(apn);
  if (clean.length <= 5) {
    return clean;
  }

  const book = clean.slice(0, 3);
  const map = clean.slice(3, 5);
  const item = clean.slice(5);
  return `${book}-${map}-${item}`;
}

export function m2ToAcres(m2: number): number {
  return m2 / 4046.856_422_4;
}

interface Extent4326 {
  xmax: number;
  xmin: number;
  ymax: number;
  ymin: number;
}

interface StreetFeature {
  classification: string | null;
  layerId: number;
  name: string | null;
  path: LatLng[];
}

interface CandidateAccessPoint {
  distanceToRoadMeters: number;
  nearStreetClassification: string | null;
  nearStreetName: string | null;
  point: LatLng;
}

interface AccessPointFeatureOptions {
  nearStreetClassification?: string | null;
  nearStreetName?: string | null;
  source: "parcel-centroid" | "street-proximity-inferred";
}

function addUniquePoint(points: LatLng[], point: LatLng): void {
  const key = `${point.lat.toFixed(6)}:${point.lng.toFixed(6)}`;
  const has = points.some(
    (existing) =>
      `${existing.lat.toFixed(6)}:${existing.lng.toFixed(6)}` === key
  );
  if (!has) {
    points.push(point);
  }
}

function pointToLocalMeters(
  point: LatLng,
  origin: LatLng,
  cosLat: number
): { x: number; y: number } {
  const R = 6_371_000;
  return {
    x: ((point.lng - origin.lng) * Math.PI * R * cosLat) / 180,
    y: ((point.lat - origin.lat) * Math.PI * R) / 180,
  };
}

function distanceMeters(a: LatLng, b: LatLng): number {
  const lat0 = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const cosLat = Math.max(Math.cos(lat0), 1e-6);
  const localA = pointToLocalMeters(a, a, cosLat);
  const localB = pointToLocalMeters(b, a, cosLat);
  return Math.hypot(localB.x - localA.x, localB.y - localA.y);
}

function distancePointToSegmentMeters(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 <= 1e-9) {
    return Math.hypot(apx, apy);
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.hypot(p.x - cx, p.y - cy);
}

function getPolygonExtent(points: LatLng[]): Extent4326 | null {
  if (points.length === 0) {
    return null;
  }
  const first = points[0];
  if (!first) {
    return null;
  }
  let xmin = first.lng;
  let xmax = first.lng;
  let ymin = first.lat;
  let ymax = first.lat;

  for (const point of points) {
    if (point.lng < xmin) {
      xmin = point.lng;
    }
    if (point.lng > xmax) {
      xmax = point.lng;
    }
    if (point.lat < ymin) {
      ymin = point.lat;
    }
    if (point.lat > ymax) {
      ymax = point.lat;
    }
  }

  return { xmax, xmin, ymax, ymin };
}

function expandExtentMeters(extent: Extent4326, padMeters: number): Extent4326 {
  const centerLat = (extent.ymin + extent.ymax) / 2;
  const latPad = padMeters / 111_320;
  const lngPad =
    padMeters /
    (111_320 * Math.max(Math.cos((centerLat * Math.PI) / 180), 1e-6));

  return {
    xmax: extent.xmax + lngPad,
    xmin: extent.xmin - lngPad,
    ymax: extent.ymax + latPad,
    ymin: extent.ymin - latPad,
  };
}

function createAccessPointFeature(
  point: LatLng,
  options: AccessPointFeatureOptions
): MapFeature {
  return {
    attributes: {
      source: options.source,
      ...(options.nearStreetName
        ? { nearStreetName: options.nearStreetName }
        : {}),
      ...(options.nearStreetClassification
        ? { nearStreetClassification: options.nearStreetClassification }
        : {}),
    },
    coordinates: [latLngToWebMercator(point.lat, point.lng)],
    latLngCoordinates: [point],
    layerIndex: 0,
    type: "point",
  };
}

function buildBoundaryCandidatePoints(polygon: LatLng[]): LatLng[] {
  const candidates: LatLng[] = [];
  if (polygon.length === 0) {
    return candidates;
  }

  const points = [...polygon];
  const first = points[0];
  const last = points.at(-1);
  if (first && last && first.lat === last.lat && first.lng === last.lng) {
    points.pop();
  }

  if (points.length < 3) {
    return points;
  }

  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (!(current && next)) {
      continue;
    }

    addUniquePoint(candidates, current);

    const segmentLength = distanceMeters(current, next);
    if (segmentLength > 18) {
      addUniquePoint(candidates, {
        lat: (current.lat + next.lat) / 2,
        lng: (current.lng + next.lng) / 2,
      });
    }
  }

  return candidates;
}

async function queryStreetLayer(
  layerId: number,
  extent: Extent4326
): Promise<StreetFeature[]> {
  const params = new URLSearchParams({
    f: "json",
    geometry: `${extent.xmin},${extent.ymin},${extent.xmax},${extent.ymax}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outFields: "FullStreetName,HighwayName,Classification",
    outSR: "4326",
    resultRecordCount: "200",
    returnGeometry: "true",
    spatialRel: "esriSpatialRelIntersects",
    where: "1=1",
  });

  const response = await fetch(
    `${STREET_CENTERLINE_SERVICE_BASE_URL}/${layerId}/query?${params.toString()}`
  );
  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as {
    error?: unknown;
    features?: Array<{
      attributes?: Record<string, unknown>;
      geometry?: { paths?: number[][][] };
    }>;
  };
  if (data.error || !data.features?.length) {
    return [];
  }

  const features: StreetFeature[] = [];
  for (const feature of data.features) {
    const attrs = feature.attributes ?? {};
    const paths = feature.geometry?.paths ?? [];
    for (const path of paths) {
      if (path.length < 2) {
        continue;
      }
      const points: LatLng[] = [];
      for (const coord of path) {
        const lng = coord[0];
        const lat = coord[1];
        if (typeof lng !== "number" || typeof lat !== "number") {
          continue;
        }
        points.push({ lat, lng });
      }
      if (points.length < 2) {
        continue;
      }

      const fullStreetName =
        typeof attrs.FullStreetName === "string" ? attrs.FullStreetName : null;
      const highwayName =
        typeof attrs.HighwayName === "string" ? attrs.HighwayName : null;
      const classification =
        typeof attrs.Classification === "string" ? attrs.Classification : null;

      features.push({
        classification,
        layerId,
        name: fullStreetName ?? highwayName,
        path: points,
      });
    }
  }

  return features;
}

async function queryNearbyStreetCenterlines(
  parcel: ParcelData,
  options: { searchRadiusMeters: number }
): Promise<StreetFeature[]> {
  const extent = getPolygonExtent(parcel.polygon);
  if (!extent) {
    return [];
  }
  const expanded = expandExtentMeters(extent, options.searchRadiusMeters);
  const all = await Promise.all(
    STREET_CENTERLINE_LAYER_IDS.map((layerId) =>
      queryStreetLayer(layerId, expanded)
    )
  );
  return all.flat();
}

export async function inferParcelAccessPoints(
  parcel: ParcelData,
  options?: {
    maxAccessPoints?: number;
    maxRoadDistanceMeters?: number;
    minPointSeparationMeters?: number;
    searchRadiusMeters?: number;
  }
): Promise<CandidateAccessPoint[]> {
  const maxAccessPoints = Math.max(1, options?.maxAccessPoints ?? 2);
  const maxRoadDistanceMeters = Math.max(
    5,
    options?.maxRoadDistanceMeters ?? 40
  );
  const minPointSeparationMeters = Math.max(
    3,
    options?.minPointSeparationMeters ?? 20
  );
  const searchRadiusMeters = Math.max(20, options?.searchRadiusMeters ?? 120);

  const boundaryCandidates = buildBoundaryCandidatePoints(parcel.polygon);
  if (boundaryCandidates.length === 0) {
    return [];
  }

  const streets = await queryNearbyStreetCenterlines(parcel, {
    searchRadiusMeters,
  });
  if (streets.length === 0) {
    return [];
  }

  const origin = parcel.centroid;
  const cosLat = Math.max(Math.cos((origin.lat * Math.PI) / 180), 1e-6);
  const scored: CandidateAccessPoint[] = [];

  for (const candidate of boundaryCandidates) {
    const p = pointToLocalMeters(candidate, origin, cosLat);
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestStreetName: string | null = null;
    let bestStreetClassification: string | null = null;

    for (const street of streets) {
      for (let i = 0; i < street.path.length - 1; i++) {
        const aRaw = street.path[i];
        const bRaw = street.path[i + 1];
        if (!(aRaw && bRaw)) {
          continue;
        }
        const a = pointToLocalMeters(aRaw, origin, cosLat);
        const b = pointToLocalMeters(bRaw, origin, cosLat);
        const distance = distancePointToSegmentMeters(p, a, b);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestStreetName = street.name;
          bestStreetClassification = street.classification;
        }
      }
    }

    if (bestDistance <= maxRoadDistanceMeters) {
      scored.push({
        distanceToRoadMeters: bestDistance,
        nearStreetClassification: bestStreetClassification,
        nearStreetName: bestStreetName,
        point: candidate,
      });
    }
  }

  scored.sort((a, b) => a.distanceToRoadMeters - b.distanceToRoadMeters);

  const selected: CandidateAccessPoint[] = [];
  for (const candidate of scored) {
    const tooClose = selected.some(
      (chosen) =>
        distanceMeters(chosen.point, candidate.point) < minPointSeparationMeters
    );
    if (tooClose) {
      continue;
    }
    selected.push(candidate);
    if (selected.length >= maxAccessPoints) {
      break;
    }
  }

  return selected;
}

/**
 * Approx polygon area in m^2 (sanity-check only).
 *
 * Uses equirectangular projection around centroid; this is not a
 * geodesic-accurate computation, but it's plenty for mismatch detection.
 */
export function approximatePolygonAreaM2(points: LatLng[]): number {
  if (points.length < 3) {
    return 0;
  }

  const pts = [...points];
  const first = pts[0];
  const last = pts.at(-1);
  if (first && last && first.lat === last.lat && first.lng === last.lng) {
    pts.pop();
  }

  if (pts.length < 3) {
    return 0;
  }

  let lat0 = 0;
  let lng0 = 0;
  for (const p of pts) {
    lat0 += p.lat;
    lng0 += p.lng;
  }
  lat0 /= pts.length;
  lng0 /= pts.length;

  const R = 6_371_000;
  const cosLat0 = Math.cos((lat0 * Math.PI) / 180);

  const toXY = (p: LatLng): { x: number; y: number } => ({
    x: ((p.lng - lng0) * Math.PI * R * cosLat0) / 180,
    y: ((p.lat - lat0) * Math.PI * R) / 180,
  });

  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1Raw = pts.at(i);
    const p2Raw = pts.at((i + 1) % pts.length);
    if (!(p1Raw && p2Raw)) {
      continue;
    }
    const p1 = toXY(p1Raw);
    const p2 = toXY(p2Raw);
    area2 += p1.x * p2.y - p2.x * p1.y;
  }

  return Math.abs(area2) / 2;
}

export function buildPermitMapDataFromParcel(
  parcel: ParcelData,
  options: { includeAccessPoint?: boolean } = {}
): {
  mapData: PermitMapData;
  targetParcelDashed: string;
} {
  const includeAccessPoint = options.includeAccessPoint ?? true;

  const polygonLatLng = parcel.polygon;
  const polygonWebMercator = polygonLatLng.map((p) =>
    latLngToWebMercator(p.lat, p.lng)
  );

  const disturbedArea: MapFeature = {
    attributes: {
      source: "maricopa-assessor-parcels",
      apn: parcel.apn,
    },
    coordinates: polygonWebMercator,
    latLngCoordinates: polygonLatLng,
    layerIndex: 3,
    type: "polygon",
  };

  const points: MapFeature[] = [];
  const accessPoints: MapFeature[] = [];

  if (includeAccessPoint) {
    const { centroid } = parcel;

    const accessPoint: MapFeature = {
      attributes: {
        source: "parcel-centroid",
      },
      coordinates: [latLngToWebMercator(centroid.lat, centroid.lng)],
      latLngCoordinates: [centroid],
      layerIndex: 0,
      type: "point",
    };

    points.push(accessPoint);
    accessPoints.push(accessPoint);
  }

  const mapData: PermitMapData = {
    // Not used by drawing code; keep a sentinel value for logs.
    accessPoints,
    acreage: null,
    centroid: parcel.centroid,
    disturbedArea,
    permitId: "NEW",
    points,
    polygons: [disturbedArea],
    polylines: [],
  };

  return {
    mapData,
    targetParcelDashed: formatApnDashed(parcel.apn),
  };
}

export async function buildPermitMapDataFromSiteCoordinates(
  site: SiteCoordinatesInput,
  options: {
    includeAccessPoint?: boolean;
    /** If parcel acres / NOI disturbed acres exceeds this, we bail (needs boundary extraction). */
    maxAcreageRatio?: number;
  } = {}
): Promise<{
  mapData: PermitMapData;
  targetParcelDashed: string;
  parcel: ParcelData;
}> {
  const includeAccessPoint = options.includeAccessPoint ?? true;
  const envAllowFullParcelDraw = parseBooleanEnv(
    process.env.PERMIT_ALLOW_FULL_PARCEL_DRAW
  );
  const envMaxAcreageRatio = parsePositiveNumberEnv(
    process.env.PERMIT_MAP_MAX_ACREAGE_RATIO
  );
  const maxAcreageRatio = envAllowFullParcelDraw
    ? Number.POSITIVE_INFINITY
    : (options.maxAcreageRatio ?? envMaxAcreageRatio ?? 2);

  const parcel = await queryParcelByCoordinates(site.latitude, site.longitude);
  if (!parcel) {
    throw new Error(
      `No parcel found at ${site.latitude.toFixed(6)},${site.longitude.toFixed(6)}`
    );
  }

  // Sanity-check: if NOI disturbed acreage is MUCH smaller than parcel acreage,
  // don't blindly draw the full parcel.
  if (site.acresDisturbed && site.acresDisturbed > 0) {
    const areaM2 = approximatePolygonAreaM2(
      parcel.polygon as unknown as LatLng[]
    );
    const parcelAcres = m2ToAcres(areaM2);

    if (
      Number.isFinite(maxAcreageRatio) &&
      parcelAcres > 0 &&
      parcelAcres / site.acresDisturbed > maxAcreageRatio
    ) {
      throw new Error(
        `Parcel acreage (~${parcelAcres.toFixed(2)} ac) is much larger than NOI disturbed acreage (${site.acresDisturbed} ac). Boundary extraction required (not full parcel).`
      );
    }
  }

  const { mapData, targetParcelDashed } = buildPermitMapDataFromParcel(parcel, {
    includeAccessPoint: false,
  });

  if (includeAccessPoint) {
    const envAccessPointCount = parsePositiveNumberEnv(
      process.env.PERMIT_ACCESS_POINT_COUNT
    );
    const envMaxRoadDistanceMeters = parsePositiveNumberEnv(
      process.env.PERMIT_ACCESS_POINT_MAX_ROAD_DISTANCE_M
    );
    const envSearchRadiusMeters = parsePositiveNumberEnv(
      process.env.PERMIT_ACCESS_POINT_SEARCH_RADIUS_M
    );

    const inferredAccessPoints = await inferParcelAccessPoints(parcel, {
      maxAccessPoints: envAccessPointCount ?? 2,
      maxRoadDistanceMeters: envMaxRoadDistanceMeters ?? 40,
      searchRadiusMeters: envSearchRadiusMeters ?? 120,
    });

    const features =
      inferredAccessPoints.length > 0
        ? inferredAccessPoints.map((candidate) =>
            createAccessPointFeature(candidate.point, {
              source: "street-proximity-inferred",
              nearStreetClassification: candidate.nearStreetClassification,
              nearStreetName: candidate.nearStreetName,
            })
          )
        : [
            createAccessPointFeature(parcel.centroid, {
              source: "parcel-centroid",
            }),
          ];

    mapData.points.push(...features);
    mapData.accessPoints.push(...features);
  }

  return { mapData, parcel, targetParcelDashed };
}
