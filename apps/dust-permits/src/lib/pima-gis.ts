/**
 * Pima County public GIS helpers.
 *
 * Resolves live service URLs/tokens from PimaMaps at runtime so callers do not
 * depend on a hardcoded ArcGIS token that may rotate.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PimaParcelData {
  acres: number | null;
  address: string | null;
  centroid: LatLng | null;
  owner: string | null;
  parcel: string;
  parcelDashed: string;
  parcelUse: string | null;
  polygon?: LatLng[];
  rawAttributes: Record<string, unknown>;
}

export interface PimaAddressCandidate {
  address: string;
  city: string | null;
  coordinates: LatLng | null;
  parcel: string | null;
  primary: boolean | null;
  zip: string | null;
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
  features?: Array<ArcGisFeature<Attributes, Geometry>>;
}

interface ArcGisPolygonGeometry {
  rings?: number[][][];
}

interface ArcGisPointGeometry {
  x?: number;
  y?: number;
}

interface PimaMapService {
  connectionString?: string | null;
  displayName?: string | null;
}

interface PimaMapConfigResponse {
  mapServices?: PimaMapService[] | null;
}

interface PimaServiceEndpoint {
  token: string | null;
  url: string;
}

interface PimaServiceCatalog {
  addresses: PimaServiceEndpoint;
  parcels: PimaServiceEndpoint;
}

interface PimaParcelAttributes {
  ADDRESS_OL?: string | null;
  GISACRES?: number | string | null;
  MAIL1?: string | null;
  PARCEL?: string | null;
  PARCEL_USE?: string | null;
  [key: string]: unknown;
}

interface PimaAddressAttributes {
  ADDRESS?: string | null;
  ADR_PRIM?: string | null;
  PARCEL?: string | null;
  ZIPCITY?: string | null;
  ZIPCODE?: string | null;
  [key: string]: unknown;
}

const PIMA_MAP_CONFIG_URL =
  "https://pimamaps.pima.gov/Geocortex/Essentials/PublicPM/REST/sites/mainsite/map?f=pjson";
const PIMA_PARCELS_SERVICE_PATH = "/LandRecords/ParcelsGroup/MapServer";
const PIMA_ADDRESSES_SERVICE_PATH = "/Addresses/Addresses/MapServer";
const PIMA_SERVICE_CACHE_TTL_MS = 5 * 60_000;

let cachedPimaServiceCatalog:
  | {
      expiresAt: number;
      value: PimaServiceCatalog;
    }
  | null = null;

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeParcelId(value: string | null | undefined): string | null {
  const raw = clean(value);
  if (!raw) {
    return null;
  }
  const digits = raw.replaceAll(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

export function formatPimaParcelId(value: string | null | undefined): string {
  const normalized = normalizeParcelId(value);
  if (!normalized) {
    return "";
  }
  if (normalized.length === 9) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 5)}-${normalized.slice(5)}`;
  }
  return normalized;
}

function parseConnectionString(value: string | null | undefined): {
  token: string | null;
  url: string | null;
} {
  const raw = clean(value);
  if (!raw) {
    return { token: null, url: null };
  }

  const parts = raw.split(";");
  const record = new Map<string, string>();
  for (const part of parts) {
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
}

function findServiceByPath(
  services: PimaMapService[],
  servicePath: string
): PimaServiceEndpoint | null {
  for (const service of services) {
    const parsed = parseConnectionString(service.connectionString);
    if (parsed.url?.includes(servicePath)) {
      return {
        token: parsed.token,
        url: parsed.url,
      };
    }
  }
  return null;
}

async function getPimaServiceCatalog(): Promise<PimaServiceCatalog> {
  if (
    cachedPimaServiceCatalog &&
    cachedPimaServiceCatalog.expiresAt > Date.now()
  ) {
    return cachedPimaServiceCatalog.value;
  }

  const response = await fetch(PIMA_MAP_CONFIG_URL);
  if (!response.ok) {
    throw new Error(
      `Pima map config request failed with status ${response.status}`
    );
  }

  const json = (await response.json()) as PimaMapConfigResponse;
  const mapServices = Array.isArray(json.mapServices) ? json.mapServices : [];
  const parcels = findServiceByPath(mapServices, PIMA_PARCELS_SERVICE_PATH);
  const addresses = findServiceByPath(mapServices, PIMA_ADDRESSES_SERVICE_PATH);

  if (!parcels?.url) {
    throw new Error("Unable to resolve Pima parcel service from map config");
  }
  if (!addresses?.url) {
    throw new Error("Unable to resolve Pima address service from map config");
  }

  const value = { addresses, parcels };
  cachedPimaServiceCatalog = {
    expiresAt: Date.now() + PIMA_SERVICE_CACHE_TTL_MS,
    value,
  };
  return value;
}

async function fetchArcGisJson<T>(
  url: string,
  params: URLSearchParams,
  token: string | null
): Promise<T> {
  if (token) {
    params.set("token", token);
  }

  const response = await fetch(`${url}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`ArcGIS request failed with status ${response.status}`);
  }

  const json = (await response.json()) as {
    error?: ArcGisError;
  };
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
}

function extractPolygon(
  geometry: ArcGisPolygonGeometry | undefined
): LatLng[] | undefined {
  const rings = geometry?.rings;
  if (!Array.isArray(rings) || rings.length === 0) {
    return undefined;
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

  return polygon.length > 0 ? polygon : undefined;
}

function computeCentroid(polygon: LatLng[] | undefined): LatLng | null {
  if (!polygon || polygon.length === 0) {
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
}

function parseParcelFeature(
  feature: ArcGisFeature<PimaParcelAttributes, ArcGisPolygonGeometry>,
  includeGeometry: boolean
): PimaParcelData | null {
  const attrs = feature.attributes ?? {};
  const parcel = normalizeParcelId(attrs.PARCEL);
  if (!parcel) {
    return null;
  }

  const polygon = extractPolygon(feature.geometry);
  const centroid = computeCentroid(polygon);

  return {
    acres: parseNumber(attrs.GISACRES),
    address: clean(attrs.ADDRESS_OL),
    centroid,
    owner: clean(attrs.MAIL1),
    parcel,
    parcelDashed: formatPimaParcelId(parcel),
    parcelUse: clean(attrs.PARCEL_USE),
    ...(includeGeometry && polygon ? { polygon } : {}),
    rawAttributes: attrs,
  };
}

function parseAddressFeature(
  feature: ArcGisFeature<PimaAddressAttributes, ArcGisPointGeometry>
): PimaAddressCandidate | null {
  const attrs = feature.attributes ?? {};
  const address = clean(attrs.ADDRESS);
  if (!address) {
    return null;
  }

  const lat = parseNumber(feature.geometry?.y);
  const lng = parseNumber(feature.geometry?.x);
  const parcel = normalizeParcelId(attrs.PARCEL);
  const primaryRaw = clean(attrs.ADR_PRIM)?.toUpperCase() ?? null;

  return {
    address,
    city: clean(attrs.ZIPCITY),
    coordinates:
      lat !== null && lng !== null
        ? {
            lat,
            lng,
          }
        : null,
    parcel,
    primary:
      primaryRaw === null ? null : primaryRaw === "Y" || primaryRaw === "YES",
    zip: clean(attrs.ZIPCODE),
  };
}

function buildAddressLikePattern(address: string): string {
  const normalized = address
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/g, " ")
    .trim();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const pattern = `%${tokens.join("%")}%`;
  return pattern.replaceAll("'", "''");
}

export async function queryPimaParcelsByCoordinates(
  lat: number,
  lng: number,
  options?: {
    distanceFeet?: number;
    includeGeometry?: boolean;
  }
): Promise<PimaParcelData[]> {
  const { parcels } = await getPimaServiceCatalog();
  const params = new URLSearchParams({
    f: "json",
    geometry: JSON.stringify({ x: lng, y: lat }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outFields: "PARCEL,GISACRES,ADDRESS_OL,PARCEL_USE,MAIL1",
    outSR: "4326",
    returnGeometry: "true",
    spatialRel: "esriSpatialRelIntersects",
    where: "1=1",
  });

  if (
    typeof options?.distanceFeet === "number" &&
    Number.isFinite(options.distanceFeet) &&
    options.distanceFeet > 0
  ) {
    params.set("distance", String(options.distanceFeet));
    params.set("units", "esriSRUnit_Foot");
  }

  const json = await fetchArcGisJson<
    ArcGisQueryResponse<PimaParcelAttributes, ArcGisPolygonGeometry>
  >(`${parcels.url}/0/query`, params, parcels.token);

  return (json.features ?? [])
    .map((feature) => parseParcelFeature(feature, options?.includeGeometry === true))
    .filter((value): value is PimaParcelData => value !== null);
}

export async function queryPimaParcelByParcelId(
  parcelId: string,
  options?: { includeGeometry?: boolean }
): Promise<PimaParcelData[]> {
  const normalized = normalizeParcelId(parcelId);
  if (!normalized) {
    return [];
  }

  const { parcels } = await getPimaServiceCatalog();
  const params = new URLSearchParams({
    f: "json",
    outFields: "PARCEL,GISACRES,ADDRESS_OL,PARCEL_USE,MAIL1",
    outSR: "4326",
    returnGeometry: "true",
    where: `PARCEL='${normalized}'`,
  });

  const json = await fetchArcGisJson<
    ArcGisQueryResponse<PimaParcelAttributes, ArcGisPolygonGeometry>
  >(`${parcels.url}/0/query`, params, parcels.token);

  return (json.features ?? [])
    .map((feature) => parseParcelFeature(feature, options?.includeGeometry === true))
    .filter((value): value is PimaParcelData => value !== null);
}

export async function queryPimaAddressesByAddress(
  address: string,
  options?: { limit?: number }
): Promise<PimaAddressCandidate[]> {
  const { addresses } = await getPimaServiceCatalog();
  const params = new URLSearchParams({
    f: "json",
    outFields: "ADDRESS,PARCEL,ZIPCITY,ZIPCODE,ADR_PRIM",
    outSR: "4326",
    returnGeometry: "true",
    where: `UPPER(ADDRESS) LIKE '${buildAddressLikePattern(address)}'`,
  });

  if (typeof options?.limit === "number" && options.limit > 0) {
    params.set("resultRecordCount", String(Math.floor(options.limit)));
  }

  const json = await fetchArcGisJson<
    ArcGisQueryResponse<PimaAddressAttributes, ArcGisPointGeometry>
  >(`${addresses.url}/0/query`, params, addresses.token);

  return (json.features ?? [])
    .map((feature) => parseAddressFeature(feature))
    .filter((value): value is PimaAddressCandidate => value !== null)
    .sort((lhs, rhs) => Number(rhs.primary === true) - Number(lhs.primary === true));
}

export function dedupePimaParcels(parcels: PimaParcelData[]): PimaParcelData[] {
  const deduped = new Map<string, PimaParcelData>();
  for (const parcel of parcels) {
    if (!deduped.has(parcel.parcel)) {
      deduped.set(parcel.parcel, parcel);
    }
  }
  return [...deduped.values()];
}

export function resetPimaServiceCatalogCacheForTests(): void {
  cachedPimaServiceCatalog = null;
}
