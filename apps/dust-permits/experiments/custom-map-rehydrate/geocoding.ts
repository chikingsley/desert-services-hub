import type { LatLng } from "./types";

const GOOGLE_GEOCODE_ENDPOINT =
  "https://maps.googleapis.com/maps/api/geocode/json";

interface GeocodeResponse {
  error_message?: string;
  results?: Array<{
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
  status?: string;
}

function getApiKey(provided?: string): string | null {
  return (
    provided ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_KEY ||
    null
  );
}

export async function geocodeAddress(
  address: string,
  apiKey?: string
): Promise<LatLng | null> {
  const query = address.trim();
  if (!query) {
    return null;
  }

  const key = getApiKey(apiKey);
  if (!key) {
    return null;
  }

  const url = `${GOOGLE_GEOCODE_ENDPOINT}?address=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as GeocodeResponse;
  const firstResult = data.results?.[0];
  const location = firstResult?.geometry?.location;

  if (
    data.status === "OK" &&
    typeof location?.lat === "number" &&
    typeof location.lng === "number"
  ) {
    return { lat: location.lat, lng: location.lng };
  }

  return null;
}

export async function geocodeIntersection(
  road1: string,
  road2: string,
  city: string,
  state: string,
  apiKey?: string
): Promise<LatLng | null> {
  const q1 = `${road1} & ${road2}, ${city}, ${state}`;
  const firstTry = await geocodeAddress(q1, apiKey);
  if (firstTry) {
    return firstTry;
  }

  const q2 = `${road1} and ${road2}, ${city}, ${state}`;
  return geocodeAddress(q2, apiKey);
}
