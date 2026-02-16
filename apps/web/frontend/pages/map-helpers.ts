export const PARCEL_TILE_URL =
  "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image&layers=show:0";

export const PARCEL_QUERY_URL =
  "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0/query";

export interface ParcelInfo {
  apn: string;
  address: string | null;
  owner: string | null;
  acres: number | null;
}

export interface ParcelResult {
  info: ParcelInfo;
  geojson: GeoJSON.Feature<GeoJSON.Polygon, { APN: string }>;
}

interface EsriAttributes {
  APN?: string | number;
  PHYSICAL_ADDRESS?: string;
  OWNER_NAME?: string;
  LAND_SIZE?: number;
}

interface EsriFeature {
  attributes?: EsriAttributes;
  geometry?: {
    rings?: number[][][];
  };
}

interface EsriQueryResult {
  features: EsriFeature[];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isFeatureCollection(
  value: unknown
): value is GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  GeoJSON.GeoJsonProperties
> {
  if (!isObjectRecord(value)) {
    return false;
  }
  return value.type === "FeatureCollection" && Array.isArray(value.features);
}

export function isEsriQueryResult(value: unknown): value is EsriQueryResult {
  if (!isObjectRecord(value)) {
    return false;
  }
  return Array.isArray(value.features);
}

export function parseEsriFeature(feature: EsriFeature): ParcelResult | null {
  const a = feature.attributes ?? {};
  const rings: number[][][] = feature.geometry?.rings ?? [];
  if (!rings.length) {
    return null;
  }

  return {
    info: {
      apn: String(a.APN || ""),
      address: a.PHYSICAL_ADDRESS ?? null,
      owner: a.OWNER_NAME ?? null,
      acres: a.LAND_SIZE ?? null,
    },
    geojson: {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: rings.map((ring: number[][]) =>
          ring.map((c: number[]) => [c[0], c[1]])
        ),
      },
      properties: { APN: String(a.APN || "") },
    },
  };
}

export const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export async function fetchApnLabels(map: {
  getBounds(): {
    getWest(): number;
    getSouth(): number;
    getEast(): number;
    getNorth(): number;
  };
  getSource(id: string): unknown;
}): Promise<GeoJSON.FeatureCollection | null> {
  const b = map.getBounds();
  const params = new URLSearchParams({
    geometry: `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`,
    geometryType: "esriGeometryEnvelope",
    spatialRel: "esriSpatialRelIntersects",
    inSR: "4326",
    outSR: "4326",
    outFields: "APN",
    returnGeometry: "true",
    f: "geojson",
    resultRecordCount: "1000",
  });
  const res = await fetch(`${PARCEL_QUERY_URL}?${params}`);
  if (!res.ok) {
    return null;
  }
  const fc: unknown = await res.json();
  if (!isFeatureCollection(fc)) {
    return null;
  }
  return fc;
}
