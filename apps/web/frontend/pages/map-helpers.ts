export const PARCEL_TILE_URL =
  "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image&layers=show:0";

export const PARCEL_QUERY_URL =
  "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0/query";

export const TERRAIN_DEM_TILE_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export const USGS_3DEP_GET_SAMPLES_URL =
  "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples";

export interface ParcelInfo {
  apn: string;
  address: string | null;
  owner: string | null;
  acres: number | null;
}

export type LngLatTuple = [number, number];

export interface ParcelResult {
  info: ParcelInfo;
  geojson: GeoJSON.Feature<GeoJSON.Polygon, { APN: string }>;
}

export interface LowestPoint {
  point: LngLatTuple;
  elevationMeters: number;
  source: "terrain" | "3dep";
  approximate: boolean;
  resolutionMeters: number | null;
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

function degreesToMeters(lat: number): { latScale: number; lngScale: number } {
  const latScale = 111_320;
  const lngScale = Math.max(111_320 * Math.cos((lat * Math.PI) / 180), 1e-6);
  return { latScale, lngScale };
}

function getOuterRing(
  polygon: GeoJSON.Feature<GeoJSON.Polygon, { APN: string }>
): LngLatTuple[] {
  const coords = polygon.geometry.coordinates[0] ?? [];
  if (coords.length < 4) {
    return [];
  }

  const ring: LngLatTuple[] = coords.map((c) => [c[0], c[1]]);
  const first = ring[0];
  const last = ring.at(-1);
  if (!(first && last)) {
    return [];
  }

  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

function dedupePoints(points: LngLatTuple[]): LngLatTuple[] {
  const seen = new Set<string>();
  const deduped: LngLatTuple[] = [];
  for (const [lng, lat] of points) {
    const key = `${lng.toFixed(7)}:${lat.toFixed(7)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push([lng, lat]);
  }
  return deduped;
}

function capPoints(points: LngLatTuple[], maxPoints: number): LngLatTuple[] {
  if (points.length <= maxPoints) {
    return points;
  }
  const stride = Math.ceil(points.length / maxPoints);
  return points.filter((_, idx) => idx % stride === 0).slice(0, maxPoints);
}

export function buildParcelSamplePoints(
  polygon: GeoJSON.Feature<GeoJSON.Polygon, { APN: string }>,
  options?: {
    spacingMeters?: number;
    outwardMeters?: number;
    maxPoints?: number;
  }
): LngLatTuple[] {
  const ring = getOuterRing(polygon);
  if (ring.length < 4) {
    return [];
  }

  const spacingMeters = Math.max(options?.spacingMeters ?? 8, 2);
  const outwardMeters = Math.max(options?.outwardMeters ?? 3, 0);
  const maxPoints = Math.max(options?.maxPoints ?? 180, 20);

  let sumLng = 0;
  let sumLat = 0;
  const uniqueVertices = ring.slice(0, -1);
  for (const [lng, lat] of uniqueVertices) {
    sumLng += lng;
    sumLat += lat;
  }
  const centroidLng = sumLng / uniqueVertices.length;
  const centroidLat = sumLat / uniqueVertices.length;
  const { latScale, lngScale } = degreesToMeters(centroidLat);

  const boundary: LngLatTuple[] = [];
  for (let i = 0; i < ring.length - 1; i += 1) {
    const current = ring[i];
    const next = ring[i + 1];
    if (!(current && next)) {
      continue;
    }

    const segmentDx = (next[0] - current[0]) * lngScale;
    const segmentDy = (next[1] - current[1]) * latScale;
    const segmentLength = Math.hypot(segmentDx, segmentDy);
    const steps = Math.max(1, Math.ceil(segmentLength / spacingMeters));

    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      boundary.push([
        current[0] + (next[0] - current[0]) * t,
        current[1] + (next[1] - current[1]) * t,
      ]);
    }
  }

  const around: LngLatTuple[] = [];
  if (outwardMeters > 0) {
    for (const [lng, lat] of boundary) {
      const dx = (lng - centroidLng) * lngScale;
      const dy = (lat - centroidLat) * latScale;
      const length = Math.hypot(dx, dy);
      if (length < 1e-3) {
        continue;
      }
      const ux = dx / length;
      const uy = dy / length;
      around.push([
        lng + (ux * outwardMeters) / lngScale,
        lat + (uy * outwardMeters) / latScale,
      ]);
    }
  }

  const points = dedupePoints([
    ...boundary,
    ...around,
    [centroidLng, centroidLat],
  ]);
  return capPoints(points, maxPoints);
}

interface TerrainQueryable {
  queryTerrainElevation?: (
    lngLat: { lng: number; lat: number },
    options?: { exaggerated?: boolean }
  ) => number | null | undefined;
}

export function findLowestTerrainPoint(
  map: TerrainQueryable,
  points: LngLatTuple[]
): LowestPoint | null {
  if (!map.queryTerrainElevation || points.length === 0) {
    return null;
  }

  let best: LowestPoint | null = null;
  for (const [lng, lat] of points) {
    const value = map.queryTerrainElevation(
      { lng, lat },
      { exaggerated: false }
    );
    if (!Number.isFinite(value)) {
      continue;
    }

    if (!best || (value as number) < best.elevationMeters) {
      best = {
        point: [lng, lat],
        elevationMeters: value as number,
        source: "terrain",
        approximate: true,
        resolutionMeters: null,
      };
    }
  }

  return best;
}

interface UsgsSample {
  location?: {
    x?: number;
    y?: number;
  };
  value?: string | number;
  resolution?: number;
}

interface UsgsSampleResponse {
  samples?: UsgsSample[];
}

function toFiniteNumber(value: unknown): number | null {
  let n = Number.NaN;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string") {
    n = Number(value);
  }
  return Number.isFinite(n) ? n : null;
}

export async function fetch3DepSamples(
  points: LngLatTuple[]
): Promise<LowestPoint[]> {
  if (points.length === 0) {
    return [];
  }

  const all: LowestPoint[] = [];
  const chunkSize = 200;

  for (let i = 0; i < points.length; i += chunkSize) {
    const chunk = points.slice(i, i + chunkSize);
    const body = new URLSearchParams({
      geometryType: "esriGeometryMultipoint",
      geometry: JSON.stringify({
        points: chunk,
        spatialReference: { wkid: 4326 },
      }),
      returnFirstValueOnly: "true",
      f: "pjson",
    });

    const response = await fetch(USGS_3DEP_GET_SAMPLES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body,
    });

    if (!response.ok) {
      continue;
    }

    const data: UsgsSampleResponse = await response.json();
    for (const sample of data.samples ?? []) {
      const lng = toFiniteNumber(sample.location?.x);
      const lat = toFiniteNumber(sample.location?.y);
      const elevationMeters = toFiniteNumber(sample.value);
      const resolutionMeters = toFiniteNumber(sample.resolution);
      if (!(lng != null && lat != null && elevationMeters != null)) {
        continue;
      }
      all.push({
        point: [lng, lat],
        elevationMeters,
        source: "3dep",
        approximate: false,
        resolutionMeters,
      });
    }
  }

  return all;
}

export function findLowestPoint(samples: LowestPoint[]): LowestPoint | null {
  if (samples.length === 0) {
    return null;
  }
  return samples.reduce((lowest, sample) =>
    sample.elevationMeters < lowest.elevationMeters ? sample : lowest
  );
}

export function metersToFeet(value: number): number {
  return value * 3.280_84;
}

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
