import { geocodeAddress } from "./geocoding";
import type { LatLng, RoadGeometry } from "./types";

const GOOGLE_DIRECTIONS_ENDPOINT = "https://maps.googleapis.com/maps/api/directions/json";

function getApiKey(provided?: string): string | null {
  return provided || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_KEY || null;
}

export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

export async function getRoadGeometry(
  roadName: string,
  nearPoint: LatLng,
  options: { searchRadiusMeters?: number; googleMapsApiKey?: string } = {},
): Promise<LatLng[] | null> {
  const key = getApiKey(options.googleMapsApiKey);
  if (!key) {
    return null;
  }

  const searchRadiusMeters = options.searchRadiusMeters ?? 1000;

  const metersPerLatDeg = 111_000;
  const metersPerLngDeg = Math.cos((nearPoint.lat * Math.PI) / 180) * 111_000;

  const latOffset = searchRadiusMeters / metersPerLatDeg;
  const lngOffset = searchRadiusMeters / metersPerLngDeg;

  const roadNameLower = roadName.toLowerCase();
  const isNorthSouth =
    roadNameLower.includes("ave") ||
    roadNameLower.includes("street") ||
    roadNameLower.includes("st") ||
    roadNameLower.startsWith("n ") ||
    roadNameLower.startsWith("s ");

  const origin = isNorthSouth
    ? `${nearPoint.lat + latOffset},${nearPoint.lng}`
    : `${nearPoint.lat},${nearPoint.lng - lngOffset}`;

  const destination = isNorthSouth
    ? `${nearPoint.lat - latOffset},${nearPoint.lng}`
    : `${nearPoint.lat},${nearPoint.lng + lngOffset}`;

  const url = new URL(GOOGLE_DIRECTIONS_ENDPOINT);
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", key);

  const response = await fetch(url.toString());
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    status?: string;
    routes?: Array<{
      overview_polyline?: {
        points?: string;
      };
    }>;
  };

  const points = data.routes?.[0]?.overview_polyline?.points;
  if (data.status !== "OK" || !points) {
    return null;
  }

  return decodePolyline(points);
}

export async function getRoadGeometryByName(
  roadName: string,
  options: {
    city?: string | null;
    state?: string | null;
    intersectionPoint?: LatLng | null;
    searchRadiusMeters?: number;
    googleMapsApiKey?: string;
  } = {},
): Promise<RoadGeometry | null> {
  const nearPoint = options.intersectionPoint
    ? options.intersectionPoint
    : await geocodeAddress(
        `${roadName}, ${options.city ?? ""} ${options.state ?? ""}`,
        options.googleMapsApiKey,
      );

  if (!nearPoint) {
    return null;
  }

  const points = await getRoadGeometry(roadName, nearPoint, {
    searchRadiusMeters: options.searchRadiusMeters,
    googleMapsApiKey: options.googleMapsApiKey,
  });

  if (!(points && points.length > 1)) {
    return null;
  }

  return { roadName, points };
}
