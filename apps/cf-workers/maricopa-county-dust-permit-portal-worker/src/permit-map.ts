import { queryParcelByAPN, queryParcelByCoordinates } from "./assessor";
import {
  parseNoiAcres,
  parseNoiCoordinates,
  resolveNoiRecord,
} from "./noi-endpoints";
import { handleMaricopaCreatePost, handleMaricopaDeletePost } from "./portal-http";

/**
 * Maricopa permit-map types, GIS helpers, KML parsing, FeatureServer queries,
 * and the worker routes that expose them.
 */

type JsonBody = Record<string, unknown>;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface WebMercatorCoord {
  x: number;
  y: number;
}

export interface MapFeature {
  attributes: Record<string, unknown>;
  coordinates: WebMercatorCoord[];
  latLngCoordinates: LatLng[];
  layerIndex: number;
  type: "polygon" | "point" | "polyline";
}

export interface PermitMapData {
  accessPoints: MapFeature[];
  acreage: number | null;
  centroid: LatLng | null;
  disturbedArea: MapFeature | null;
  permitId: string;
  points: MapFeature[];
  polygons: MapFeature[];
  polylines: MapFeature[];
}

export interface BuildPermitMapDataFromPolygonOptions {
  acreage?: number | null;
  centroid?: LatLng | null;
  includeCentroidPoint?: boolean;
  permitId?: string;
  pointAttributes?: Record<string, unknown>;
  polygonAttributes?: Record<string, unknown>;
}

interface FeatureQueryResponse {
  error?: { message: string };
  features?: {
    attributes?: Record<string, unknown>;
    geometry?: {
      paths?: number[][][];
      rings?: number[][][];
      x?: number;
      y?: number;
    };
  }[];
}

interface KmlPolygon {
  coordinates: LatLng[];
  name: string | null;
}

interface KmlPoint {
  coordinate: LatLng;
  name: string | null;
}

export interface ParsedKml {
  points: KmlPoint[];
  polygons: KmlPolygon[];
}

const FEATURE_SERVER_URL =
  "https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer";

const FEATURE_SERVER_LAYER_INDICES = {
  all: [0, 1, 2, 3, 4, 5],
  polygons: 3,
} as const;

const PLACEMARK_REGEX = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/gi;
const NAME_REGEX = /<name>([\s\S]*?)<\/name>/i;
const POLYGON_COORDS_REGEX =
  /<Polygon[\s\S]*?<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i;
const POINT_COORDS_REGEX =
  /<Point[\s\S]*?<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i;

const jsonOk = (data: JsonBody): Response =>
  Response.json({
    success: true,
    timestamp: new Date().toISOString(),
    ...data,
  });

const jsonError = (error: string, status = 400): Response =>
  Response.json({ error, success: false }, { status });

export const webMercatorToLatLng = (x: number, y: number): LatLng => {
  const lng = (x * 180) / 20_037_508.34;
  const lat =
    (Math.atan(Math.exp((y * Math.PI) / 20_037_508.34)) * 360) / Math.PI - 90;
  return { lat, lng };
};

export const latLngToWebMercator = (
  lat: number,
  lng: number
): WebMercatorCoord => ({
  x: (lng * 20_037_508.34) / 180,
  y:
    Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) *
    (20_037_508.34 / Math.PI),
});

export const getPolygonCentroid = (
  coords: WebMercatorCoord[]
): WebMercatorCoord => {
  if (coords.length === 0) {
    return { x: 0, y: 0 };
  }

  let sumX = 0;
  let sumY = 0;
  for (const coord of coords) {
    sumX += coord.x;
    sumY += coord.y;
  }

  return { x: sumX / coords.length, y: sumY / coords.length };
};

const buildPointFeature = (
  latLng: LatLng,
  attributes: Record<string, unknown>
): MapFeature => ({
  attributes,
  coordinates: [latLngToWebMercator(latLng.lat, latLng.lng)],
  latLngCoordinates: [latLng],
  layerIndex: 0,
  type: "point",
});

export const buildPermitMapDataFromPolygon = (
  polygonLatLng: LatLng[],
  options: BuildPermitMapDataFromPolygonOptions = {}
): PermitMapData => {
  const polygonCoordinates = polygonLatLng.map((point) =>
    latLngToWebMercator(point.lat, point.lng)
  );

  let centroid = options.centroid ?? null;
  if (!centroid && polygonCoordinates.length > 0) {
    const { x, y } = getPolygonCentroid(polygonCoordinates);
    centroid = webMercatorToLatLng(x, y);
  }

  const disturbedArea: MapFeature = {
    attributes: options.polygonAttributes ?? {},
    coordinates: polygonCoordinates,
    latLngCoordinates: polygonLatLng,
    layerIndex: 3,
    type: "polygon",
  };

  const points: MapFeature[] = [];
  const accessPoints: MapFeature[] = [];

  if (options.includeCentroidPoint && centroid) {
    const point = buildPointFeature(
      centroid,
      options.pointAttributes ?? { source: "centroid" }
    );
    points.push(point);
    accessPoints.push(point);
  }

  return {
    accessPoints,
    acreage: options.acreage ?? null,
    centroid,
    disturbedArea,
    permitId: options.permitId ?? "NEW",
    points,
    polygons: [disturbedArea],
    polylines: [],
  };
};

const parseCoordinateText = (text: string): LatLng[] => {
  const points: LatLng[] = [];
  for (const token of text.trim().split(/[\s\n\r\t]+/)) {
    if (token.length === 0) {
      continue;
    }

    const [lngStr, latStr] = token.split(",");
    const lng = Number.parseFloat(lngStr ?? "");
    const lat = Number.parseFloat(latStr ?? "");
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      points.push({ lat, lng });
    }
  }

  return points;
};

export const parseKml = (kml: string): ParsedKml => {
  const polygons: KmlPolygon[] = [];
  const points: KmlPoint[] = [];

  for (const match of kml.matchAll(PLACEMARK_REGEX)) {
    const body = match[1] ?? "";
    const name = body.match(NAME_REGEX)?.[1]?.trim() ?? null;

    const polygonMatch = body.match(POLYGON_COORDS_REGEX);
    if (polygonMatch?.[1]) {
      const coordinates = parseCoordinateText(polygonMatch[1]);
      if (coordinates.length >= 3) {
        polygons.push({ coordinates, name });
      }
      continue;
    }

    const pointMatch = body.match(POINT_COORDS_REGEX);
    if (pointMatch?.[1]) {
      const [coordinate] = parseCoordinateText(pointMatch[1]);
      if (coordinate) {
        points.push({ coordinate, name });
      }
    }
  }

  return { points, polygons };
};

export const kmlToPermitMapData = (kml: string): PermitMapData => {
  const { points, polygons } = parseKml(kml);

  const [firstPolygon, ...restPolygons] = polygons;
  if (!firstPolygon) {
    throw new Error("No polygon found in KML");
  }

  let largestPolygon = firstPolygon;
  for (const polygon of restPolygons) {
    if (polygon.coordinates.length > largestPolygon.coordinates.length) {
      largestPolygon = polygon;
    }
  }

  const mapData = buildPermitMapDataFromPolygon(largestPolygon.coordinates, {
    includeCentroidPoint: false,
    polygonAttributes: { name: largestPolygon.name, source: "kml" },
  });

  for (const { coordinate, name } of points) {
    const feature: MapFeature = {
      attributes: { name, source: "kml" },
      coordinates: [latLngToWebMercator(coordinate.lat, coordinate.lng)],
      latLngCoordinates: [coordinate],
      layerIndex: 0,
      type: "point",
    };
    mapData.points.push(feature);
    mapData.accessPoints.push(feature);
  }

  return mapData;
};

const categorizeFeatures = (
  features: MapFeature[]
): {
  points: MapFeature[];
  polygons: MapFeature[];
  polylines: MapFeature[];
} => ({
  points: features.filter((feature) => feature.type === "point"),
  polygons: features.filter((feature) => feature.type === "polygon"),
  polylines: features.filter((feature) => feature.type === "polyline"),
});

const findLargestPolygon = (polygons: MapFeature[]): MapFeature | null => {
  const [firstPolygon] = polygons;
  if (!firstPolygon) {
    return null;
  }

  let largestPolygon = firstPolygon;
  for (let index = 1; index < polygons.length; index += 1) {
    const polygon = polygons[index];
    if (
      polygon &&
      polygon.coordinates.length > largestPolygon.coordinates.length
    ) {
      largestPolygon = polygon;
    }
  }

  return largestPolygon;
};

const extractAcreage = (attributes: Record<string, unknown>): number | null => {
  const acreageValue =
    attributes.Acreage ?? attributes.ACREAGE ?? attributes.Shape__Area ?? null;
  if (acreageValue === null || acreageValue === undefined) {
    return null;
  }

  let acreage = Number(acreageValue);
  if (attributes.Shape__Area && !attributes.Acreage) {
    acreage *= 0.000_247_105;
  }
  return acreage;
};

const parseCoordinateArray = (
  coordinates: number[][]
): {
  coords: WebMercatorCoord[];
  latLng: LatLng[];
} => {
  const coords = coordinates.map((coordinate) => {
    const [x = 0, y = 0] = coordinate;
    return { x, y };
  });
  const latLng = coords.map((coord) => webMercatorToLatLng(coord.x, coord.y));
  return { coords, latLng };
};

const parseGeometry = (
  geometry: NonNullable<FeatureQueryResponse["features"]>[number]["geometry"],
  attributes: Record<string, unknown>,
  layerIndex: number
): MapFeature[] => {
  if (!geometry) {
    return [];
  }

  const features: MapFeature[] = [];

  if (geometry.rings) {
    for (const ring of geometry.rings) {
      const { coords, latLng } = parseCoordinateArray(ring);
      features.push({
        attributes,
        coordinates: coords,
        latLngCoordinates: latLng,
        layerIndex,
        type: "polygon",
      });
    }
    return features;
  }

  if (geometry.paths) {
    for (const path of geometry.paths) {
      const { coords, latLng } = parseCoordinateArray(path);
      features.push({
        attributes,
        coordinates: coords,
        latLngCoordinates: latLng,
        layerIndex,
        type: "polyline",
      });
    }
    return features;
  }

  if (geometry.x !== undefined && geometry.y !== undefined) {
    features.push({
      attributes,
      coordinates: [{ x: geometry.x, y: geometry.y }],
      latLngCoordinates: [webMercatorToLatLng(geometry.x, geometry.y)],
      layerIndex,
      type: "point",
    });
  }

  return features;
};

const queryFeatureServerLayer = async (
  permitId: string,
  layerIndex: number
): Promise<MapFeature[]> => {
  const params = new URLSearchParams({
    f: "json",
    outFields: "*",
    returnGeometry: "true",
    where: `ImpactID='${permitId}'`,
  });

  const response = await fetch(
    `${FEATURE_SERVER_URL}/${layerIndex}/query?${params.toString()}`
  );
  const data = (await response.json()) as FeatureQueryResponse;

  if (data.error) {
    throw new Error(`FeatureServer error: ${data.error.message}`);
  }

  if (!data.features?.length) {
    return [];
  }

  const features: MapFeature[] = [];
  for (const feature of data.features) {
    features.push(
      ...parseGeometry(feature.geometry, feature.attributes ?? {}, layerIndex)
    );
  }

  return features;
};

export const normalizeDustApplicationId = (value: string): string => {
  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) {
    return normalized;
  }
  return normalized.startsWith("D") ? normalized : `D${normalized}`;
};

export const queryPermitMapFeatures = async (
  permitId: string
): Promise<PermitMapData> => {
  const normalizedPermitId = normalizeDustApplicationId(permitId);
  const allFeatures: MapFeature[] = [];

  for (const layerIndex of FEATURE_SERVER_LAYER_INDICES.all) {
    try {
      allFeatures.push(
        ...(await queryFeatureServerLayer(normalizedPermitId, layerIndex))
      );
    } catch {
      // Individual layers are frequently empty for otherwise valid applications.
    }
  }

  const { polygons, points, polylines } = categorizeFeatures(allFeatures);
  const disturbedArea =
    findLargestPolygon(
      polygons.filter((polygon) => polygon.layerIndex === 3)
    ) ??
    polygons[0] ??
    null;

  let centroid: LatLng | null = null;
  if (disturbedArea) {
    const { x, y } = getPolygonCentroid(disturbedArea.coordinates);
    centroid = webMercatorToLatLng(x, y);
  }

  return {
    accessPoints: points.filter((point) => point.layerIndex === 0),
    acreage: disturbedArea ? extractAcreage(disturbedArea.attributes) : null,
    centroid,
    disturbedArea,
    permitId: normalizedPermitId,
    points,
    polygons,
    polylines,
  };
};

export const permitHasMapData = async (permitId: string): Promise<boolean> => {
  const normalizedPermitId = normalizeDustApplicationId(permitId);
  const params = new URLSearchParams({
    f: "json",
    returnCountOnly: "true",
    where: `ImpactID='${normalizedPermitId}'`,
  });

  const response = await fetch(
    `${FEATURE_SERVER_URL}/${FEATURE_SERVER_LAYER_INDICES.polygons}/query?${params.toString()}`
  );
  const data = (await response.json()) as {
    count?: number;
    error?: { message: string };
  };

  if (data.error) {
    return false;
  }

  return (data.count ?? 0) > 0;
};

const readJson = async (request: Request): Promise<JsonBody | null> => {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null
      ? (body as JsonBody)
      : null;
  } catch {
    return null;
  }
};

const getString = (body: JsonBody | null, key: string): string | null => {
  if (!body) {
    return null;
  }

  const value = body[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
};

const handlePage2MapKmlPost = async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const body = await readJson(request);
  const kml = getString(body, "kml");
  if (!kml) {
    return jsonError("Body must include a non-empty 'kml' string", 400);
  }

  try {
    return jsonOk({ mapData: kmlToPermitMapData(kml) });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : String(error),
      422
    );
  }
};

const handlePage2MapRenewalPost = async (
  request: Request
): Promise<Response> => {
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const body = await readJson(request);
  const sourcePermitId = getString(body, "sourcePermitId");
  if (!sourcePermitId) {
    return jsonError("Body must include 'sourcePermitId'", 400);
  }

  try {
    const permitId = normalizeDustApplicationId(sourcePermitId);
    const mapData = await queryPermitMapFeatures(permitId);

    if (!mapData.disturbedArea) {
      return jsonError(`No map data found for ${permitId}`, 404);
    }

    const parcel = mapData.centroid
      ? await queryParcelByCoordinates(
          mapData.centroid.lat,
          mapData.centroid.lng
        )
      : null;

    return jsonOk({ mapData, parcel, sourcePermitId: permitId });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : String(error),
      422
    );
  }
};

const handlePage2MapParcelPost = async (
  request: Request
): Promise<Response> => {
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const body = await readJson(request);
  if (!body) {
    return jsonError("Invalid JSON body", 400);
  }

  const apn = getString(body, "apn");
  const noiIdentifier = getString(body, "noiIdentifier");

  if (!apn && !noiIdentifier) {
    return jsonError("Provide 'apn' or 'noiIdentifier'", 400);
  }

  try {
    if (apn) {
      const parcel = await queryParcelByAPN(apn);
      if (!parcel) {
        return jsonError(`No parcel found for APN ${apn}`, 404);
      }

      return jsonOk({ parcel, source: "apn" });
    }

    const { record } = await resolveNoiRecord(noiIdentifier ?? "");
    if (!record) {
      return jsonError(`No NOI record found for ${noiIdentifier}`, 404);
    }

    const { latitude, longitude } = parseNoiCoordinates(record);
    const acres = parseNoiAcres(record);
    const parcel =
      latitude !== null && longitude !== null
        ? await queryParcelByCoordinates(latitude, longitude)
        : null;

    return jsonOk({
      acres,
      coordinates: { latitude, longitude },
      parcel,
      record,
      source: "noi",
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : String(error),
      422
    );
  }
};

const worker = {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case "/api/health": {
          return Response.json({
            ok: true,
            service: "maricopa-county-dust-permit-portal-worker",
          });
        }
        case "/api/page2-map/kml": {
          return await handlePage2MapKmlPost(request);
        }
        case "/api/page2-map/renewal": {
          return await handlePage2MapRenewalPost(request);
        }
        case "/api/page2-map/parcel": {
          return await handlePage2MapParcelPost(request);
        }
        case "/api/create": {
          return await handleMaricopaCreatePost(request, env);
        }
        case "/api/delete": {
          return await handleMaricopaDeletePost(request, env);
        }
        default: {
          return new Response("Not Found", { status: 404 });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonError(message, 500);
    }
  },
};

export default worker satisfies ExportedHandler<Env>;
