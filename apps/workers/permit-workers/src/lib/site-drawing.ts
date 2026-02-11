/**
 * Site Drawing Helpers
 *
 * Converts a known site location (lat/lng from NOI) into a deterministic
 * disturbed-area polygon for Page 2 by snapping to the Maricopa Assessor
 * parcel that contains the point.
 */

import type { MapFeature, PermitMapData } from "@/lib/dust-features";
import { latLngToWebMercator, type LatLng } from "@/lib/dust-features";
import { queryParcelByCoordinates, type ParcelData } from "@/lib/assessor";

export interface SiteCoordinatesInput {
  latitude: number;
  longitude: number;
  acresDisturbed?: number | null;
}

export function formatApnClean(apn: string): string {
  return apn.replace(/[-\s.]/g, "").toUpperCase();
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
  return m2 / 4046.8564224;
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

  const pts = points.slice();
  const first = pts[0];
  const last = pts[pts.length - 1];
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
    const p1 = toXY(pts[i]!);
    const p2 = toXY(pts[(i + 1) % pts.length]!);
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
    type: "polygon",
    coordinates: polygonWebMercator,
    latLngCoordinates: polygonLatLng,
    attributes: {
      source: "maricopa-assessor-parcels",
      apn: parcel.apn,
    },
    layerIndex: 3,
  };

  const points: MapFeature[] = [];
  const accessPoints: MapFeature[] = [];

  if (includeAccessPoint) {
    const centroid = parcel.centroid;

    const accessPoint: MapFeature = {
      type: "point",
      coordinates: [latLngToWebMercator(centroid.lat, centroid.lng)],
      latLngCoordinates: [centroid],
      attributes: {
        source: "parcel-centroid",
      },
      layerIndex: 0,
    };

    points.push(accessPoint);
    accessPoints.push(accessPoint);
  }

  const mapData: PermitMapData = {
    // Not used by drawing code; keep a sentinel value for logs.
    permitId: "NEW",
    polygons: [disturbedArea],
    points,
    polylines: [],
    disturbedArea,
    accessPoints,
    centroid: parcel.centroid,
    acreage: null,
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
  const maxAcreageRatio = options.maxAcreageRatio ?? 2.0;

  const parcel = await queryParcelByCoordinates(site.latitude, site.longitude);
  if (!parcel) {
    throw new Error(
      `No parcel found at ${site.latitude.toFixed(6)},${site.longitude.toFixed(6)}`
    );
  }

  // Sanity-check: if NOI disturbed acreage is MUCH smaller than parcel acreage,
  // don't blindly draw the full parcel.
  if (site.acresDisturbed && site.acresDisturbed > 0) {
    const areaM2 = approximatePolygonAreaM2(parcel.polygon as unknown as LatLng[]);
    const parcelAcres = m2ToAcres(areaM2);

    if (parcelAcres > 0 && parcelAcres / site.acresDisturbed > maxAcreageRatio) {
      throw new Error(
        `Parcel acreage (~${parcelAcres.toFixed(2)} ac) is much larger than NOI disturbed acreage (${site.acresDisturbed} ac). Boundary extraction required (not full parcel).`
      );
    }
  }

  const { mapData, targetParcelDashed } = buildPermitMapDataFromParcel(parcel, {
    includeAccessPoint,
  });

  return { mapData, targetParcelDashed, parcel };
}
