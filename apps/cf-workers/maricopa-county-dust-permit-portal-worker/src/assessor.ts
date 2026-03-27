/**
 * Maricopa County parcel lookup (public ArcGIS MapServer).
 */

import type { LatLng } from "./permit-map";

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

const ARCGIS_PARCEL_URL =
  "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0/query";

const REGEX_ADDRESS_PARSING =
  /^\d*\s*[NSEW]?\s*(.+?)(?:\s+(?:ST|AVE|RD|DR|BLVD|LN|WAY|CT|CIR|PL|PKWY|HWY|TRL))?$/;
const REGEX_STREET_WORDS = /\s+/;
const REGEX_DIRECTIONAL = /^[NSEW]$/;
const REGEX_NUMERIC_PREFIX = /^\d+/;

interface AssessorFeature {
  attributes?: Record<string, unknown>;
  geometry?: { rings?: number[][][] };
}

interface AssessorResponse {
  error?: unknown;
  features?: AssessorFeature[];
}

const toLatLng = (coord: number[]): LatLng => {
  const [lng = 0, lat = 0] = coord;
  return { lat, lng };
};

const pickFirstDefined = (...values: unknown[]): unknown => {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
};

const calculatePolygonCentroid = (polygon: LatLng[]): LatLng => {
  if (polygon.length === 0) {
    return { lat: 0, lng: 0 };
  }

  let centroidLat = 0;
  let centroidLng = 0;
  for (const point of polygon) {
    centroidLat += point.lat;
    centroidLng += point.lng;
  }

  return {
    lat: centroidLat / polygon.length,
    lng: centroidLng / polygon.length,
  };
};

const getParcelApn = (
  attributes: Record<string, unknown>,
  apnFallback: string
): string =>
  String(
    pickFirstDefined(
      attributes.APN,
      attributes.PARCEL_ID,
      attributes.PARCELNUMB,
      apnFallback
    )
  );

const getParcelAddress = (
  attributes: Record<string, unknown>
): string | null => {
  const value = pickFirstDefined(
    attributes.PHYSICAL_ADDRESS,
    attributes.SITUS,
    attributes.SITUS_ADDR,
    attributes.ADDRESS
  );
  return value ? String(value) : null;
};

const getParcelOwner = (attributes: Record<string, unknown>): string | null => {
  const value = pickFirstDefined(attributes.OWNER_NAME, attributes.OWNER);
  return value ? String(value) : null;
};

const getParcelAcres = (attributes: Record<string, unknown>): number | null => {
  const value = pickFirstDefined(
    attributes.LAND_SIZE,
    attributes.ACRES,
    attributes.GIS_ACRES
  );
  return value ? Number(value) : null;
};

const toParcelData = (
  feature: AssessorFeature,
  apnFallback = ""
): ParcelData => {
  const attributes = feature.attributes ?? {};
  const [outerRing] = feature.geometry?.rings ?? [];
  const polygon = (outerRing ?? []).map(toLatLng);

  return {
    acres: getParcelAcres(attributes),
    address: getParcelAddress(attributes),
    apn: getParcelApn(attributes, apnFallback),
    centroid: calculatePolygonCentroid(polygon),
    owner: getParcelOwner(attributes),
    polygon,
    rawAttributes: attributes,
  };
};

const fetchParcelFeatures = async (
  params: URLSearchParams
): Promise<AssessorFeature[]> => {
  const response = await fetch(`${ARCGIS_PARCEL_URL}?${params.toString()}`);
  const data = (await response.json()) as AssessorResponse;
  if (data.error || !data.features?.length) {
    return [];
  }
  return data.features;
};

const queryParcelsByWhere = async (
  where: string,
  resultRecordCount?: number
): Promise<ParcelData[]> => {
  const params = new URLSearchParams({
    f: "json",
    outFields: "*",
    outSR: "4326",
    returnGeometry: "true",
    where,
    ...(resultRecordCount
      ? { resultRecordCount: String(resultRecordCount) }
      : {}),
  });

  const features = await fetchParcelFeatures(params);
  return features.map((feature) => toParcelData(feature));
};

export const queryParcelByCoordinates = async (
  lat: number,
  lng: number
): Promise<ParcelData | null> => {
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

  const [feature] = await fetchParcelFeatures(params);
  return feature ? toParcelData(feature) : null;
};

export const queryParcelByAPN = async (
  apn: string
): Promise<ParcelData | null> => {
  const cleanApn = apn.replaceAll(/[-\s.]/g, "");
  const params = new URLSearchParams({
    f: "json",
    outFields: "*",
    outSR: "4326",
    returnGeometry: "true",
    where: `APN = '${cleanApn}'`,
  });

  const [feature] = await fetchParcelFeatures(params);
  return feature ? toParcelData(feature, cleanApn) : null;
};

export const queryParcelsByAddress = (
  address: string
): Promise<ParcelData[]> => {
  const searchAddress = address.toUpperCase().replaceAll("'", "''");
  return queryParcelsByWhere(`PHYSICAL_ADDRESS LIKE '%${searchAddress}%'`);
};

export const findSimilarAddresses = async (
  address: string,
  city?: string
): Promise<ParcelData[]> => {
  const upper = address.toUpperCase();
  const [, streetBody] = upper.match(REGEX_ADDRESS_PARSING) ?? [];
  if (!streetBody) {
    return [];
  }

  const streetWords = streetBody.trim().split(REGEX_STREET_WORDS);
  const streetName =
    streetWords.find(
      (word) => word.length > 2 && !REGEX_DIRECTIONAL.test(word)
    ) ?? streetWords[0];
  if (!streetName || streetName.length < 3) {
    return [];
  }

  let where = `PHYSICAL_ADDRESS LIKE '%${streetName.replaceAll("'", "''")}%'`;
  if (city) {
    where += ` AND PHYSICAL_CITY = '${city.toUpperCase().replaceAll("'", "''")}'`;
  }

  const parcels = await queryParcelsByWhere(where, 50);
  const originalNumber = Number.parseInt(
    address.match(REGEX_NUMERIC_PREFIX)?.[0] ?? "0",
    10
  );
  if (originalNumber <= 0) {
    return parcels;
  }

  parcels.sort((left, right) => {
    const leftNumber = Number.parseInt(
      left.address?.match(REGEX_NUMERIC_PREFIX)?.[0] ?? "0",
      10
    );
    const rightNumber = Number.parseInt(
      right.address?.match(REGEX_NUMERIC_PREFIX)?.[0] ?? "0",
      10
    );
    return (
      Math.abs(leftNumber - originalNumber) -
      Math.abs(rightNumber - originalNumber)
    );
  });

  return parcels;
};

export const smartAddressLookup = async (
  address: string,
  city?: string
): Promise<{
  exact: ParcelData[];
  searchedStreet: string | null;
  similar: ParcelData[];
}> => {
  const exact = await queryParcelsByAddress(address);
  if (exact.length > 0) {
    return { exact, searchedStreet: null, similar: [] };
  }

  const upper = address.toUpperCase();
  const [, streetBody] = upper.match(REGEX_ADDRESS_PARSING) ?? [];
  const streetWords = streetBody?.trim().split(REGEX_STREET_WORDS) ?? [];
  const searchedStreet =
    streetWords.find(
      (word) => word.length > 2 && !REGEX_DIRECTIONAL.test(word)
    ) ??
    streetWords[0] ??
    null;

  return {
    exact: [],
    searchedStreet,
    similar: await findSimilarAddresses(address, city),
  };
};
