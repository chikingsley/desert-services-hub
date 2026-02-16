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

export interface SiteCoordinatesInput {
  latitude: number;
  longitude: number;
  acresDisturbed?: number | null;
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
    includeAccessPoint,
  });

  return { mapData, parcel, targetParcelDashed };
}
