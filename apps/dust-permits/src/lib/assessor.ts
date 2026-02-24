/**
 * Maricopa County Assessor API Integration
 *
 * Functions to lookup parcel data from the Maricopa County ArcGIS and Assessor APIs.
 *
 * Two APIs are used:
 * 1. ArcGIS MapServer (public, no auth) - parcel geometry by coordinates
 * 2. Assessor API (requires token) - detailed parcel info by APN or address search
 */

import { config } from "@/portal/utils/config";

// =============================================================================
// Types
// =============================================================================

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ParcelData {
  acres: number | null;
  address: string | null;
  apn: string;
  centroid: LatLng;
  owner: string | null;
  polygon: LatLng[];
  rawAttributes: Record<string, unknown>;
}

export interface PropertySearchResult {
  address: string;
  apn: string;
  city: string | null;
  owner: string | null;
}

// =============================================================================
// Constants
// =============================================================================

const ARCGIS_PARCEL_URL =
  "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0/query";

const REGEX_ADDRESS_PARSING =
  /^\d*\s*[NSEW]?\s*(.+?)(?:\s+(?:ST|AVE|RD|DR|BLVD|LN|WAY|CT|CIR|PL|PKWY|HWY|TRL))?$/;
const REGEX_STREET_WORDS = /\s+/;
const REGEX_DIRECTIONAL = /^[NSEW]$/;
const REGEX_NUMERIC_PREFIX = /^\d+/;

// =============================================================================
// Public Functions
// =============================================================================

/**
 * Query Maricopa County ArcGIS MapServer for parcel at coordinates.
 *
 * Uses the public REST API - no authentication required.
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @returns Parcel data with APN, polygon, centroid, and attributes
 */
export async function queryParcelByCoordinates(
  lat: number,
  lng: number
): Promise<ParcelData | null> {
  const params = new URLSearchParams({
    f: "json",
    geometry: JSON.stringify({ x: lng, y: lat }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outFields: "*",
    outSR: "4326",
    returnGeometry: "true",
    spatialRel: "esriSpatialRelIntersects",
  });

  const url = `${ARCGIS_PARCEL_URL}?${params.toString()}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    console.error("[Assessor] ArcGIS error:", data.error);
    return null;
  }

  if (!data.features || data.features.length === 0) {
    return null;
  }

  const feature = data.features[0];
  const attrs = feature.attributes || {};
  const rings = feature.geometry?.rings?.[0] || [];

  // Convert ESRI rings to lat/lng array
  const polygon = rings.map((coord: [number, number]) => ({
    lat: coord[1],
    lng: coord[0],
  }));

  // Calculate centroid
  let centroidLat = 0;
  let centroidLng = 0;
  for (const point of polygon) {
    centroidLat += point.lat;
    centroidLng += point.lng;
  }
  if (polygon.length > 0) {
    centroidLat /= polygon.length;
    centroidLng /= polygon.length;
  }

  // Extract common fields (different parcels may have different attribute names)
  const apn = attrs.APN || attrs.PARCEL_ID || attrs.PARCELNUMB || "";
  const address = attrs.SITUS || attrs.SITUS_ADDR || attrs.ADDRESS || null;
  const owner = attrs.OWNER || attrs.OWNER_NAME || null;
  const acres = attrs.ACRES || attrs.GIS_ACRES || null;

  return {
    acres: acres ? Number(acres) : null,
    address: address ? String(address) : null,
    apn: String(apn),
    centroid: { lat: centroidLat, lng: centroidLng },
    owner: owner ? String(owner) : null,
    polygon,
    rawAttributes: attrs,
  };
}

/**
 * Query parcel by APN (Assessor Parcel Number).
 *
 * Uses the ArcGIS MapServer with a WHERE clause.
 *
 * @param apn - Assessor Parcel Number (with or without dashes)
 * @returns Parcel data or null if not found
 */
export async function queryParcelByAPN(
  apn: string
): Promise<ParcelData | null> {
  // Clean APN - remove dashes and spaces
  const cleanApn = apn.replaceAll(/[-\s.]/g, "");

  const params = new URLSearchParams({
    f: "json",
    outFields: "*",
    outSR: "4326",
    returnGeometry: "true",
    where: `APN = '${cleanApn}'`,
  });

  const url = `${ARCGIS_PARCEL_URL}?${params.toString()}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    console.error("[Assessor] ArcGIS error:", data.error);
    return null;
  }

  if (!data.features || data.features.length === 0) {
    return null;
  }

  const feature = data.features[0];
  const attrs = feature.attributes || {};
  const rings = feature.geometry?.rings?.[0] || [];

  const polygon = rings.map((coord: [number, number]) => ({
    lat: coord[1],
    lng: coord[0],
  }));

  let centroidLat = 0;
  let centroidLng = 0;
  for (const point of polygon) {
    centroidLat += point.lat;
    centroidLng += point.lng;
  }
  if (polygon.length > 0) {
    centroidLat /= polygon.length;
    centroidLng /= polygon.length;
  }

  const address = attrs.SITUS || attrs.SITUS_ADDR || attrs.ADDRESS || null;
  const owner = attrs.OWNER || attrs.OWNER_NAME || null;
  const acres = attrs.ACRES || attrs.GIS_ACRES || null;

  return {
    acres: acres ? Number(acres) : null,
    address: address ? String(address) : null,
    apn: String(attrs.APN || cleanApn),
    centroid: { lat: centroidLat, lng: centroidLng },
    owner: owner ? String(owner) : null,
    polygon,
    rawAttributes: attrs,
  };
}

/**
 * Query parcels by address using the public ArcGIS MapServer.
 *
 * Searches PHYSICAL_ADDRESS field with LIKE query.
 * No authentication required.
 *
 * @param address - Street address to search (e.g., "16155 W Elwood St")
 * @returns Array of matching parcels (may return multiple for same address)
 */
export async function queryParcelsByAddress(
  address: string
): Promise<ParcelData[]> {
  // Normalize address for search - uppercase and escape single quotes
  const searchAddress = address.toUpperCase().replaceAll(/'/g, "''");

  const params = new URLSearchParams({
    f: "json",
    outFields: "*",
    outSR: "4326",
    returnGeometry: "true",
    where: `PHYSICAL_ADDRESS LIKE '%${searchAddress}%'`,
  });

  const url = `${ARCGIS_PARCEL_URL}?${params.toString()}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    console.error("[Assessor] ArcGIS error:", data.error);
    return [];
  }

  if (!data.features || data.features.length === 0) {
    return [];
  }

  return data.features.map(
    (feature: {
      attributes: Record<string, unknown>;
      geometry?: { rings?: number[][][] };
    }) => {
      const attrs = feature.attributes || {};
      const rings = feature.geometry?.rings?.[0] || [];

      const polygon: LatLng[] = rings.map((coord: number[]) => ({
        lat: coord[1] ?? 0,
        lng: coord[0] ?? 0,
      }));

      let centroidLat = 0;
      let centroidLng = 0;
      for (const point of polygon) {
        centroidLat += point.lat;
        centroidLng += point.lng;
      }
      if (polygon.length > 0) {
        centroidLat /= polygon.length;
        centroidLng /= polygon.length;
      }

      const addr =
        attrs.PHYSICAL_ADDRESS || attrs.SITUS || attrs.SITUS_ADDR || null;
      const owner = attrs.OWNER_NAME || attrs.OWNER || null;
      const acres = attrs.LAND_SIZE || attrs.ACRES || attrs.GIS_ACRES || null;

      return {
        acres: acres ? Number(acres) : null,
        address: addr ? String(addr) : null,
        apn: String(attrs.APN || ""),
        centroid: { lat: centroidLat, lng: centroidLng },
        owner: owner ? String(owner) : null,
        polygon,
        rawAttributes: attrs,
      };
    }
  );
}

/**
 * Search for similar addresses when exact match fails.
 *
 * Extracts street name from address and searches for all addresses
 * on that street in the given city. Returns candidates sorted by
 * street number proximity to the original.
 *
 * @param address - Original address that wasn't found
 * @param city - City to search in (optional, improves accuracy)
 * @returns Array of similar addresses with APNs
 */
export async function findSimilarAddresses(
  address: string,
  city?: string
): Promise<ParcelData[]> {
  // Extract street name - look for main word after optional number and direction
  const upper = address.toUpperCase();
  const streetMatch = upper.match(REGEX_ADDRESS_PARSING);

  if (!streetMatch?.[1]) {
    return [];
  }

  // Get the main street word (skip direction letters)
  const streetWords = streetMatch[1].trim().split(REGEX_STREET_WORDS);
  const streetName =
    streetWords.find((w) => w.length > 2 && !REGEX_DIRECTIONAL.test(w)) ||
    streetWords[0];

  if (!streetName || streetName.length < 3) {
    return [];
  }

  // Build query - search street name, optionally filter by city
  let whereClause = `PHYSICAL_ADDRESS LIKE '%${streetName.replaceAll(/'/g, "''")}%'`;
  if (city) {
    whereClause += ` AND PHYSICAL_CITY = '${city.toUpperCase().replaceAll(/'/g, "''")}'`;
  }

  const params = new URLSearchParams({
    f: "json",
    outFields: "*",
    outSR: "4326",
    resultRecordCount: "50",
    returnGeometry: "true",
    where: whereClause,
  });

  const url = `${ARCGIS_PARCEL_URL}?${params.toString()}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.error || !data.features || data.features.length === 0) {
    return [];
  }

  const parcels = data.features.map(
    (feature: {
      attributes: Record<string, unknown>;
      geometry?: { rings?: number[][][] };
    }) => {
      const attrs = feature.attributes || {};
      const rings = feature.geometry?.rings?.[0] || [];

      const polygon: LatLng[] = rings.map((coord: number[]) => ({
        lat: coord[1] ?? 0,
        lng: coord[0] ?? 0,
      }));

      let centroidLat = 0;
      let centroidLng = 0;
      for (const point of polygon) {
        centroidLat += point.lat;
        centroidLng += point.lng;
      }
      if (polygon.length > 0) {
        centroidLat /= polygon.length;
        centroidLng /= polygon.length;
      }

      const addr =
        attrs.PHYSICAL_ADDRESS || attrs.SITUS || attrs.SITUS_ADDR || null;
      const owner = attrs.OWNER_NAME || attrs.OWNER || null;
      const acres = attrs.LAND_SIZE || attrs.ACRES || attrs.GIS_ACRES || null;

      return {
        acres: acres ? Number(acres) : null,
        address: addr ? String(addr) : null,
        apn: String(attrs.APN || ""),
        centroid: { lat: centroidLat, lng: centroidLng },
        owner: owner ? String(owner) : null,
        polygon,
        rawAttributes: attrs,
      };
    }
  );

  // Sort by street number proximity to original
  const originalNum = Number.parseInt(
    address.match(REGEX_NUMERIC_PREFIX)?.[0] || "0",
    10
  );
  if (originalNum > 0) {
    parcels.sort((a: ParcelData, b: ParcelData) => {
      const aNum = Number.parseInt(
        a.address?.match(REGEX_NUMERIC_PREFIX)?.[0] || "0",
        10
      );
      const bNum = Number.parseInt(
        b.address?.match(REGEX_NUMERIC_PREFIX)?.[0] || "0",
        10
      );
      return Math.abs(aNum - originalNum) - Math.abs(bNum - originalNum);
    });
  }

  return parcels;
}

/**
 * Smart address lookup - tries exact match first, then similar addresses.
 *
 * @param address - Address to search
 * @param city - City (optional, helps narrow similar address search)
 * @returns Object with exact matches and similar candidates
 */
export async function smartAddressLookup(
  address: string,
  city?: string
): Promise<{
  exact: ParcelData[];
  similar: ParcelData[];
  searchedStreet: string | null;
}> {
  // First try exact match
  const exact = await queryParcelsByAddress(address);

  if (exact.length > 0) {
    return { exact, searchedStreet: null, similar: [] };
  }

  // Extract street name for reporting
  const upper = address.toUpperCase();
  const streetMatch = upper.match(REGEX_ADDRESS_PARSING);
  const streetWords = streetMatch?.[1]?.trim().split(REGEX_STREET_WORDS) || [];
  const streetName =
    streetWords.find((w) => w.length > 2 && !REGEX_DIRECTIONAL.test(w)) ||
    streetWords[0] ||
    null;

  // No exact match - find similar addresses
  const similar = await findSimilarAddresses(address, city);

  return { exact: [], searchedStreet: streetName, similar };
}

/**
 * Fetch additional parcel details from Assessor's API.
 *
 * Requires ASSESSOR_API_KEY to be set.
 *
 * @param apn - Assessor Parcel Number
 * @returns Detailed parcel data or null if not found/not authorized
 */
export async function fetchAssessorDetails(
  apn: string
): Promise<Record<string, unknown> | null> {
  const token = config.assessorApiKey;
  if (!token) {
    console.warn("[Assessor] ASSESSOR_API_KEY not configured");
    return null;
  }

  const cleanApn = apn.replaceAll(/[-\s.]/g, "");
  const url = `${config.assessorApiUrl}/parcel/${cleanApn}`;

  const response = await fetch(url, {
    headers: {
      AUTHORIZATION: token,
      "User-Agent": "auto-permit",
    },
  });

  if (!response.ok) {
    console.warn(`[Assessor] API returned ${response.status}`);
    return null;
  }

  return response.json();
}

/**
 * Search properties by address or query string.
 *
 * Requires ASSESSOR_API_KEY to be set.
 *
 * @param query - Address or search string
 * @returns Search results or throws if not configured
 */
export async function searchProperties(
  query: string
): Promise<PropertySearchResult[]> {
  const token = config.assessorApiKey;
  if (!token) {
    throw new Error("ASSESSOR_API_KEY not configured");
  }

  const encodedQuery = encodeURIComponent(query);
  const url = `${config.assessorApiUrl}/search/property/?q=${encodedQuery}`;

  const response = await fetch(url, {
    headers: {
      AUTHORIZATION: token,
      "User-Agent": "auto-permit",
    },
  });

  if (!response.ok) {
    throw new Error(`Assessor API error: ${response.status}`);
  }

  const data = await response.json();

  // Map response to our type (adjust based on actual API response structure)
  if (Array.isArray(data)) {
    return data.map((item: Record<string, unknown>) => ({
      address: String(item.address || item.situs || ""),
      apn: String(item.apn || item.APN || ""),
      city: item.city ? String(item.city) : null,
      owner: item.owner ? String(item.owner) : null,
    }));
  }

  return [];
}
