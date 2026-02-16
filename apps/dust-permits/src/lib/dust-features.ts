/**
 * Maricopa County Dust Permit FeatureServer API Integration
 *
 * Functions to query dust permit map features (polygons, points, polylines)
 * from the AQD DustControl FeatureServer REST API.
 *
 * API: https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer
 *
 * No authentication required - public REST API.
 */

// =============================================================================
// Types
// =============================================================================

export interface LatLng {
  lat: number;
  lng: number;
}

export interface WebMercatorCoord {
  x: number;
  y: number;
}

export interface MapFeature {
  type: "polygon" | "point" | "polyline";
  /** Coordinates in Web Mercator (WKID 102100) */
  coordinates: WebMercatorCoord[];
  /** Coordinates converted to lat/lng (WGS84) */
  latLngCoordinates: LatLng[];
  attributes: Record<string, unknown>;
  layerIndex: number;
}

export interface PermitMapData {
  permitId: string;
  polygons: MapFeature[];
  points: MapFeature[];
  polylines: MapFeature[];
  /** The primary disturbed area polygon (usually layer 3) */
  disturbedArea: MapFeature | null;
  /** Access points (usually layer 0) */
  accessPoints: MapFeature[];
  /** Centroid of the disturbed area in lat/lng */
  centroid: LatLng | null;
  /** Total acreage from attributes (if available) */
  acreage: number | null;
}

// =============================================================================
// Constants
// =============================================================================

const FEATURE_SERVER_URL =
  "https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer";

/**
 * FeatureServer Layer Indices
 *
 * Based on observed data:
 * - Layer 0: Points (Access Points, site center markers)
 * - Layer 1: Points (unused in observed permits)
 * - Layer 2: Points (unused in observed permits)
 * - Layer 3: Polygons (Disturbed Areas, site boundaries) - PRIMARY
 * - Layer 4: Polylines (Access roads, linear projects)
 * - Layer 5: Polygons (unused in observed permits)
 */
const LAYER_INDICES = {
  ALL: [0, 1, 2, 3, 4, 5],
  POINTS: 0,
  POLYGONS: 3,
  POLYLINES: 4,
} as const;

// =============================================================================
// Coordinate Conversion
// =============================================================================

/**
 * Convert Web Mercator (EPSG:3857 / WKID:102100) to lat/lng (WGS84).
 *
 * This is the standard formula - the FeatureServer returns Web Mercator,
 * but we often need lat/lng for display or other APIs.
 */
export function webMercatorToLatLng(x: number, y: number): LatLng {
  const lng = (x * 180) / 20_037_508.34;
  const lat =
    (Math.atan(Math.exp((y * Math.PI) / 20_037_508.34)) * 360) / Math.PI - 90;
  return { lat, lng };
}

/**
 * Convert lat/lng (WGS84) to Web Mercator (EPSG:3857 / WKID:102100).
 *
 * Useful when you have lat/lng and need to work with the ESRI map.
 */
export function latLngToWebMercator(
  lat: number,
  lng: number
): WebMercatorCoord {
  return {
    x: (lng * 20_037_508.34) / 180,
    y:
      Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) *
      (20_037_508.34 / Math.PI),
  };
}

/**
 * Calculate centroid of a polygon in Web Mercator coordinates.
 */
export function getPolygonCentroid(
  coords: WebMercatorCoord[]
): WebMercatorCoord {
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
}

/**
 * Calculate bounding extent of a polygon.
 */
export function getPolygonExtent(coords: WebMercatorCoord[]): {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
} {
  if (coords.length === 0) {
    return { xmax: 0, xmin: 0, ymax: 0, ymin: 0 };
  }

  const firstCoord = coords[0];
  if (!firstCoord) {
    return { xmax: 0, xmin: 0, ymax: 0, ymin: 0 };
  }

  let xmin = firstCoord.x;
  let ymin = firstCoord.y;
  let xmax = firstCoord.x;
  let ymax = firstCoord.y;

  for (const c of coords) {
    if (c.x < xmin) {
      xmin = c.x;
    }
    if (c.y < ymin) {
      ymin = c.y;
    }
    if (c.x > xmax) {
      xmax = c.x;
    }
    if (c.y > ymax) {
      ymax = c.y;
    }
  }

  return { xmax, xmin, ymax, ymin };
}

// =============================================================================
// Helper Functions
// =============================================================================

/** Categorize features by type into separate arrays. */
function categorizeFeatures(features: MapFeature[]): {
  polygons: MapFeature[];
  points: MapFeature[];
  polylines: MapFeature[];
} {
  const polygons: MapFeature[] = [];
  const points: MapFeature[] = [];
  const polylines: MapFeature[] = [];

  for (const feature of features) {
    switch (feature.type) {
      case "polygon": {
        polygons.push(feature);
        break;
      }
      case "point": {
        points.push(feature);
        break;
      }
      case "polyline": {
        polylines.push(feature);
        break;
      }
      default: {
        // Unknown feature type - skip
        break;
      }
    }
  }

  return { points, polygons, polylines };
}

/** Find the largest polygon (by vertex count) from a list. */
function findLargestPolygon(polygons: MapFeature[]): MapFeature | null {
  if (polygons.length === 0) {
    return null;
  }
  return polygons.reduce((largest, current) =>
    current.coordinates.length > largest.coordinates.length ? current : largest
  );
}

/** Extract acreage from feature attributes. */
function extractAcreage(attrs: Record<string, unknown>): number | null {
  const acreageValue =
    attrs.Acreage ?? attrs.ACREAGE ?? attrs.Shape__Area ?? null;
  if (acreageValue === null || acreageValue === undefined) {
    return null;
  }
  let acreage = Number(acreageValue);
  // Shape__Area is in square meters, convert to acres
  if (attrs.Shape__Area && !attrs.Acreage) {
    acreage *= 0.000_247_105;
  }
  return acreage;
}

// =============================================================================
// Public Functions
// =============================================================================

/**
 * Query all map features for a dust permit.
 *
 * Queries all FeatureServer layers for features associated with the given
 * permit ID (ImpactID field). Returns polygons, points, and polylines with
 * both Web Mercator and lat/lng coordinates.
 *
 * @param permitId - Dust permit ID (e.g., "D0064518")
 * @returns All map features for the permit
 */
export async function queryPermitMapFeatures(
  permitId: string
): Promise<PermitMapData> {
  const allFeatures: MapFeature[] = [];

  // Query all layers
  for (const layerIndex of LAYER_INDICES.ALL) {
    try {
      const features = await queryLayer(permitId, layerIndex);
      allFeatures.push(...features);
    } catch (error) {
      console.warn(`[DustFeatures] Layer ${layerIndex} query failed:`, error);
    }
  }

  // Categorize features by type
  const { polygons, points, polylines } = categorizeFeatures(allFeatures);

  // Identify the primary disturbed area (usually largest polygon from layer 3)
  const disturbedAreaPolygons = polygons.filter((p) => p.layerIndex === 3);
  const disturbedArea =
    findLargestPolygon(disturbedAreaPolygons) || polygons[0] || null;

  // Access points are typically from layer 0
  const accessPoints = points.filter((p) => p.layerIndex === 0);

  // Calculate centroid from disturbed area
  let centroid: LatLng | null = null;
  if (disturbedArea) {
    const webMercCentroid = getPolygonCentroid(disturbedArea.coordinates);
    centroid = webMercatorToLatLng(webMercCentroid.x, webMercCentroid.y);
  }

  // Extract acreage from attributes if available
  const acreage = disturbedArea?.attributes
    ? extractAcreage(disturbedArea.attributes)
    : null;

  return {
    accessPoints,
    acreage,
    centroid,
    disturbedArea,
    permitId,
    points,
    polygons,
    polylines,
  };
}

/** Convert coordinate array to WebMercatorCoord with lat/lng. */
function parseCoordinateArray(coordArray: number[][]): {
  coords: WebMercatorCoord[];
  latLng: LatLng[];
} {
  const coords = coordArray.map((coord) => ({
    x: coord[0] ?? 0,
    y: coord[1] ?? 0,
  }));
  const latLng = coords.map((c) => webMercatorToLatLng(c.x, c.y));
  return { coords, latLng };
}

/** Parse geometry from FeatureServer response into MapFeatures. */
function parseGeometry(
  geom: NonNullable<FeatureQueryResponse["features"]>[number]["geometry"],
  attributes: Record<string, unknown>,
  layerIndex: number
): MapFeature[] {
  if (!geom) {
    return [];
  }

  const features: MapFeature[] = [];

  if (geom.rings) {
    for (const ring of geom.rings) {
      const { coords, latLng } = parseCoordinateArray(ring);
      features.push({
        attributes,
        coordinates: coords,
        latLngCoordinates: latLng,
        layerIndex,
        type: "polygon",
      });
    }
  } else if (geom.paths) {
    for (const path of geom.paths) {
      const { coords, latLng } = parseCoordinateArray(path);
      features.push({
        attributes,
        coordinates: coords,
        latLngCoordinates: latLng,
        layerIndex,
        type: "polyline",
      });
    }
  } else if (geom.x !== undefined && geom.y !== undefined) {
    features.push({
      attributes,
      coordinates: [{ x: geom.x, y: geom.y }],
      latLngCoordinates: [webMercatorToLatLng(geom.x, geom.y)],
      layerIndex,
      type: "point",
    });
  }

  return features;
}

/**
 * Query a single layer for permit features.
 *
 * @param permitId - Dust permit ID
 * @param layerIndex - FeatureServer layer index (0-5)
 * @returns Array of features from that layer
 */
async function queryLayer(
  permitId: string,
  layerIndex: number
): Promise<MapFeature[]> {
  const params = new URLSearchParams({
    f: "json",
    outFields: "*",
    returnGeometry: "true",
    where: `ImpactID='${permitId}'`,
  });

  const url = `${FEATURE_SERVER_URL}/${layerIndex}/query?${params.toString()}`;
  const response = await fetch(url);
  const data = (await response.json()) as FeatureQueryResponse;

  if (data.error) {
    throw new Error(`FeatureServer error: ${data.error.message}`);
  }

  if (!data.features || data.features.length === 0) {
    return [];
  }

  const features: MapFeature[] = [];
  for (const feature of data.features) {
    const parsed = parseGeometry(
      feature.geometry,
      feature.attributes || {},
      layerIndex
    );
    features.push(...parsed);
  }

  return features;
}

/**
 * Check if a permit has map data (any features).
 *
 * Quick check without fetching all feature details.
 *
 * @param permitId - Dust permit ID
 * @returns True if the permit has at least one polygon
 */
export async function permitHasMapData(permitId: string): Promise<boolean> {
  // Check layer 3 (polygons) which is required for all permits
  const params = new URLSearchParams({
    f: "json",
    returnCountOnly: "true",
    where: `ImpactID='${permitId}'`,
  });

  const url = `${FEATURE_SERVER_URL}/${LAYER_INDICES.POLYGONS}/query?${params.toString()}`;
  const response = await fetch(url);
  const data = (await response.json()) as {
    count?: number;
    error?: { message: string };
  };

  if (data.error) {
    return false;
  }

  return (data.count ?? 0) > 0;
}

// =============================================================================
// Internal Types
// =============================================================================

interface FeatureQueryResponse {
  features?: {
    geometry?: {
      rings?: number[][][];
      paths?: number[][][];
      x?: number;
      y?: number;
    };
    attributes?: Record<string, unknown>;
  }[];
  error?: { message: string };
}
