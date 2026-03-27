/**
 * Shared map-data types and helpers for Maricopa dust permit Page 2 flows.
 */

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
  for (const c of coords) {
    sumX += c.x;
    sumY += c.y;
  }
  return { x: sumX / coords.length, y: sumY / coords.length };
};

const FEATURE_SERVER_URL =
  "https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer";

const FEATURE_SERVER_LAYER_INDICES = {
  all: [0, 1, 2, 3, 4, 5],
  polygons: 3,
} as const;

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

const categorizeFeatures = (
  features: MapFeature[]
): {
  points: MapFeature[];
  polygons: MapFeature[];
  polylines: MapFeature[];
} => ({
  points: features.filter((f) => f.type === "point"),
  polygons: features.filter((f) => f.type === "polygon"),
  polylines: features.filter((f) => f.type === "polyline"),
});

const findLargestPolygon = (polygons: MapFeature[]): MapFeature | null => {
  const [first] = polygons;
  if (!first) {
    return null;
  }

  let largest = first;
  for (let i = 1; i < polygons.length; i += 1) {
    const current = polygons[i];
    if (current && current.coordinates.length > largest.coordinates.length) {
      largest = current;
    }
  }

  return largest;
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
  const coords = coordinates.map((coord) => {
    const [x = 0, y = 0] = coord;
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
