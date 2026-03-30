export interface LatLng {
  lat: number;
  lng: number;
}

export interface ParcelSelectionPayload {
  ADDRESS_OL?: string | null;
  GISACRES?: number | null;
  JURIS_OL?: string | null;
  PARCEL: string;
  latitude: number;
  longitude: number;
}

interface ArcGisError {
  details?: string[];
  message?: string;
}

interface ArcGisFeature<Attributes, Geometry = unknown> {
  attributes?: Attributes;
  geometry?: Geometry;
}

interface ArcGisQueryResponse<Attributes, Geometry = unknown> {
  error?: ArcGisError;
  features?: ArcGisFeature<Attributes, Geometry>[];
}

interface ArcGisPolygonGeometry {
  rings?: number[][][];
}

interface PimaMapService {
  connectionString?: string | null;
}

interface PimaMapConfigResponse {
  mapServices?: PimaMapService[] | null;
}

interface PimaServiceEndpoint {
  token: string | null;
  url: string;
}

interface PimaParcelAttributes {
  ADDRESS_OL?: string | null;
  GISACRES?: number | string | null;
  PARCEL?: string | null;
}

interface JurisdictionAttributes {
  NAME?: string | null;
}

const PIMA_MAP_CONFIG_URL =
  "https://pimamaps.pima.gov/Geocortex/Essentials/PublicPM/REST/sites/mainsite/map?f=pjson";
const PIMA_PARCELS_SERVICE_PATH = "/LandRecords/ParcelsGroup/MapServer";
const PIMA_JURISDICTION_QUERY_URL =
  "https://gisdata.pima.gov/arcgis1/rest/services/GISOpenData/Boundaries/MapServer/11/query";

const clean = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseNumber = (
  value: number | string | null | undefined
): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeParcelId = (value: string): string =>
  value.replaceAll(/\D/g, "");

const parseConnectionString = (
  value: string | null | undefined
): {
  token: string | null;
  url: string | null;
} => {
  const raw = clean(value);
  if (!raw) {
    return { token: null, url: null };
  }

  const record = new Map<string, string>();
  for (const part of raw.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim().toLowerCase();
    const parsedValue = part.slice(separatorIndex + 1).trim();
    if (key.length > 0 && parsedValue.length > 0) {
      record.set(key, parsedValue);
    }
  }

  return {
    token: clean(record.get("token")),
    url: clean(record.get("url")),
  };
};

const resolveParcelService = async (): Promise<PimaServiceEndpoint> => {
  const response = await fetch(PIMA_MAP_CONFIG_URL);
  if (!response.ok) {
    throw new Error(
      `Pima map config request failed with status ${response.status}`
    );
  }

  const json = (await response.json()) as PimaMapConfigResponse;
  const services = Array.isArray(json.mapServices) ? json.mapServices : [];
  for (const service of services) {
    const parsed = parseConnectionString(service.connectionString);
    if (parsed.url?.includes(PIMA_PARCELS_SERVICE_PATH)) {
      return {
        token: parsed.token,
        url: parsed.url,
      };
    }
  }

  throw new Error("Unable to resolve Pima parcel service");
};

const fetchArcGisJson = async <T>(
  url: string,
  params: URLSearchParams,
  token?: string | null
): Promise<T> => {
  if (token) {
    params.set("token", token);
  }

  const response = await fetch(`${url}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`ArcGIS request failed with status ${response.status}`);
  }

  const json = (await response.json()) as { error?: ArcGisError };
  if (json.error) {
    const details =
      Array.isArray(json.error.details) && json.error.details.length > 0
        ? ` (${json.error.details.join("; ")})`
        : "";
    throw new Error(
      `ArcGIS error: ${json.error.message ?? "unknown error"}${details}`
    );
  }

  return json as T;
};

const extractPolygon = (
  geometry: ArcGisPolygonGeometry | undefined
): LatLng[] => {
  const rings = geometry?.rings;
  if (!Array.isArray(rings)) {
    return [];
  }

  const polygon: LatLng[] = [];
  for (const ring of rings) {
    if (!Array.isArray(ring)) {
      continue;
    }

    for (const coordinate of ring) {
      if (!Array.isArray(coordinate) || coordinate.length < 2) {
        continue;
      }

      const lng = parseNumber(coordinate[0]);
      const lat = parseNumber(coordinate[1]);
      if (lat !== null && lng !== null) {
        polygon.push({ lat, lng });
      }
    }
  }

  return polygon;
};

const computeCentroid = (polygon: LatLng[]): LatLng | null => {
  if (polygon.length === 0) {
    return null;
  }

  let latTotal = 0;
  let lngTotal = 0;
  for (const point of polygon) {
    latTotal += point.lat;
    lngTotal += point.lng;
  }

  return {
    lat: latTotal / polygon.length,
    lng: lngTotal / polygon.length,
  };
};

const queryJurisdictionName = async (point: LatLng): Promise<string | null> => {
  const params = new URLSearchParams({
    f: "json",
    geometry: JSON.stringify({ x: point.lng, y: point.lat }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outFields: "NAME",
    returnGeometry: "false",
    spatialRel: "esriSpatialRelIntersects",
    where: "1=1",
  });

  const json = await fetchArcGisJson<
    ArcGisQueryResponse<JurisdictionAttributes>
  >(PIMA_JURISDICTION_QUERY_URL, params);
  const name = json.features?.[0]?.attributes?.NAME;
  return clean(name);
};

export const buildParcelSelectionPayload = async (
  parcelId: string
): Promise<ParcelSelectionPayload> => {
  const normalizedParcelId = normalizeParcelId(parcelId);
  if (normalizedParcelId.length === 0) {
    throw new Error("Parcel id must contain digits");
  }

  const parcels = await resolveParcelService();
  const params = new URLSearchParams({
    f: "json",
    outFields: "PARCEL,GISACRES,ADDRESS_OL",
    outSR: "4326",
    returnGeometry: "true",
    where: `PARCEL='${normalizedParcelId}'`,
  });

  const json = await fetchArcGisJson<
    ArcGisQueryResponse<PimaParcelAttributes, ArcGisPolygonGeometry>
  >(`${parcels.url}/0/query`, params, parcels.token);

  const feature = json.features?.[0];
  if (!feature) {
    throw new Error(`No Pima parcel found for ${normalizedParcelId}`);
  }

  const polygon = extractPolygon(feature.geometry);
  const centroid = computeCentroid(polygon);
  if (!centroid) {
    throw new Error(`Pima parcel ${normalizedParcelId} is missing geometry`);
  }

  const jurisdiction = await queryJurisdictionName(centroid);
  return {
    ADDRESS_OL: clean(feature.attributes?.ADDRESS_OL),
    GISACRES: parseNumber(feature.attributes?.GISACRES),
    JURIS_OL: jurisdiction,
    PARCEL: normalizedParcelId,
    latitude: centroid.lat,
    longitude: centroid.lng,
  };
};
