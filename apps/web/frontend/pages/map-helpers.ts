export const PARCEL_TILE_URL =
  "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image&layers=show:0";

export const PARCEL_QUERY_URL =
  "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0/query";

export const TERRAIN_DEM_TILE_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export const USGS_3DEP_GET_SAMPLES_URL =
  "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples";

const STREET_CENTERLINE_SERVICE_BASE_URL =
  "https://gis.maricopa.gov/arcgis/rest/services/IndividualService/Street/MapServer";
const STREET_CENTERLINE_LAYER_IDS = [1, 2, 3] as const;

export interface ParcelInfo {
  acres: number | null;
  address: string | null;
  apn: string;
  owner: string | null;
}

export type LngLatTuple = [number, number];

export interface ParcelResult {
  geojson: GeoJSON.Feature<GeoJSON.Polygon, { APN: string }>;
  info: ParcelInfo;
}

export interface LowestPoint {
  approximate: boolean;
  elevationMeters: number;
  point: LngLatTuple;
  resolutionMeters: number | null;
  source: "terrain" | "3dep";
}

export interface AccessPointCandidate {
  distanceToRoadMeters: number;
  nearStreetClassification: string | null;
  nearStreetName: string | null;
  point: LngLatTuple;
}

interface EsriAttributes {
  APN?: string | number;
  LAND_SIZE?: number;
  OWNER_NAME?: string;
  PHYSICAL_ADDRESS?: string;
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
  resolution?: number;
  value?: string | number;
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

interface StreetFeature {
  classification: string | null;
  name: string | null;
  path: LngLatTuple[];
}

function pointToLocalMeters(
  point: LngLatTuple,
  origin: LngLatTuple,
  cosLat: number
): { x: number; y: number } {
  const R = 6_371_000;
  return {
    x: ((point[0] - origin[0]) * Math.PI * R * cosLat) / 180,
    y: ((point[1] - origin[1]) * Math.PI * R) / 180,
  };
}

function distancePointToSegmentMeters(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 <= 1e-9) {
    return Math.hypot(apx, apy);
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.hypot(p.x - cx, p.y - cy);
}

function distanceBetweenPointsMeters(a: LngLatTuple, b: LngLatTuple): number {
  const lat0 = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const cosLat = Math.max(Math.cos(lat0), 1e-6);
  const ax = pointToLocalMeters(a, a, cosLat);
  const bx = pointToLocalMeters(b, a, cosLat);
  return Math.hypot(bx.x - ax.x, bx.y - ax.y);
}

function getPolygonExtent(
  polygon: GeoJSON.Feature<GeoJSON.Polygon, { APN: string }>
): { xmax: number; xmin: number; ymax: number; ymin: number } | null {
  const ring = getOuterRing(polygon);
  if (ring.length < 3) {
    return null;
  }
  const first = ring[0];
  if (!first) {
    return null;
  }
  let xmin = first[0];
  let xmax = first[0];
  let ymin = first[1];
  let ymax = first[1];

  for (const point of ring) {
    if (point[0] < xmin) {
      xmin = point[0];
    }
    if (point[0] > xmax) {
      xmax = point[0];
    }
    if (point[1] < ymin) {
      ymin = point[1];
    }
    if (point[1] > ymax) {
      ymax = point[1];
    }
  }

  return { xmax, xmin, ymax, ymin };
}

function expandExtentMeters(
  extent: { xmax: number; xmin: number; ymax: number; ymin: number },
  padMeters: number
): { xmax: number; xmin: number; ymax: number; ymin: number } {
  const centerLat = (extent.ymin + extent.ymax) / 2;
  const latPad = padMeters / 111_320;
  const lngPad =
    padMeters /
    (111_320 * Math.max(Math.cos((centerLat * Math.PI) / 180), 1e-6));

  return {
    xmax: extent.xmax + lngPad,
    xmin: extent.xmin - lngPad,
    ymax: extent.ymax + latPad,
    ymin: extent.ymin - latPad,
  };
}

function addUniquePoint(points: LngLatTuple[], point: LngLatTuple): void {
  const key = `${point[0].toFixed(6)}:${point[1].toFixed(6)}`;
  const exists = points.some(
    (existing) => `${existing[0].toFixed(6)}:${existing[1].toFixed(6)}` === key
  );
  if (!exists) {
    points.push(point);
  }
}

function buildBoundaryCandidates(
  polygon: GeoJSON.Feature<GeoJSON.Polygon, { APN: string }>
): LngLatTuple[] {
  const ring = getOuterRing(polygon);
  if (ring.length < 4) {
    return [];
  }
  const openRing = ring.slice(0, -1);
  const candidates: LngLatTuple[] = [];

  for (let i = 0; i < openRing.length; i += 1) {
    const current = openRing[i];
    const next = openRing[(i + 1) % openRing.length];
    if (!(current && next)) {
      continue;
    }

    addUniquePoint(candidates, current);
    const segmentLength = distanceBetweenPointsMeters(current, next);
    if (segmentLength > 18) {
      addUniquePoint(candidates, [
        (current[0] + next[0]) / 2,
        (current[1] + next[1]) / 2,
      ]);
    }
  }

  return candidates;
}

async function queryStreetLayer(
  layerId: number,
  extent: { xmax: number; xmin: number; ymax: number; ymin: number }
): Promise<StreetFeature[]> {
  const params = new URLSearchParams({
    f: "json",
    geometry: `${extent.xmin},${extent.ymin},${extent.xmax},${extent.ymax}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outFields: "*",
    outSR: "4326",
    resultRecordCount: "200",
    returnGeometry: "true",
    spatialRel: "esriSpatialRelIntersects",
    where: "1=1",
  });

  const response = await fetch(
    `${STREET_CENTERLINE_SERVICE_BASE_URL}/${layerId}/query?${params.toString()}`
  );
  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as {
    error?: unknown;
    features?: Array<{
      attributes?: Record<string, unknown>;
      geometry?: { paths?: number[][][] };
    }>;
  };
  if (data.error || !data.features?.length) {
    return [];
  }

  const features: StreetFeature[] = [];
  for (const feature of data.features) {
    const attrs = feature.attributes ?? {};
    const paths = feature.geometry?.paths ?? [];
    for (const path of paths) {
      if (path.length < 2) {
        continue;
      }
      const coords: LngLatTuple[] = [];
      for (const pair of path) {
        const lng = pair[0];
        const lat = pair[1];
        if (typeof lng !== "number" || typeof lat !== "number") {
          continue;
        }
        coords.push([lng, lat]);
      }
      if (coords.length < 2) {
        continue;
      }
      const fullStreetName =
        typeof attrs.FullStreetName === "string" ? attrs.FullStreetName : null;
      const highwayName =
        typeof attrs.HighwayName === "string" ? attrs.HighwayName : null;
      const streetName =
        typeof attrs.StreetName === "string" ? attrs.StreetName : null;
      const prefixDirection =
        typeof attrs.PrefixDirection === "string"
          ? attrs.PrefixDirection
          : null;
      const postDirection =
        typeof attrs.PostDirection === "string" ? attrs.PostDirection : null;
      const streetType =
        typeof attrs.StreetType === "string" ? attrs.StreetType : null;
      const highwayType =
        typeof attrs.HighwayType === "string" ? attrs.HighwayType : null;
      const classification =
        typeof attrs.Classification === "string" ? attrs.Classification : null;
      const assembledStreetName = [
        prefixDirection,
        streetName,
        streetType,
        postDirection,
      ]
        .filter((part) => typeof part === "string" && part.trim().length > 0)
        .join(" ");
      const name = fullStreetName ?? highwayName ?? assembledStreetName ?? null;
      const resolvedClassification = classification ?? highwayType ?? null;

      features.push({
        classification: resolvedClassification,
        name,
        path: coords,
      });
    }
  }

  return features;
}

export async function inferParcelAccessPoints(
  polygon: GeoJSON.Feature<GeoJSON.Polygon, { APN: string }>,
  options?: {
    maxAccessPoints?: number;
    maxRoadDistanceMeters?: number;
    minPointSeparationMeters?: number;
    searchRadiusMeters?: number;
  }
): Promise<AccessPointCandidate[]> {
  const maxAccessPoints = Math.max(1, options?.maxAccessPoints ?? 2);
  const maxRoadDistanceMeters = Math.max(
    5,
    options?.maxRoadDistanceMeters ?? 200
  );
  const minPointSeparationMeters = Math.max(
    3,
    options?.minPointSeparationMeters ?? 20
  );
  const searchRadiusMeters = Math.max(20, options?.searchRadiusMeters ?? 500);

  const extent = getPolygonExtent(polygon);
  if (!extent) {
    return [];
  }
  const expandedExtent = expandExtentMeters(extent, searchRadiusMeters);

  const boundaryCandidates = buildBoundaryCandidates(polygon);
  if (boundaryCandidates.length === 0) {
    return [];
  }

  const streetLists = await Promise.all(
    STREET_CENTERLINE_LAYER_IDS.map((layerId) =>
      queryStreetLayer(layerId, expandedExtent)
    )
  );
  const streets = streetLists.flat();
  if (streets.length === 0) {
    return [];
  }

  const centerLng = (extent.xmin + extent.xmax) / 2;
  const centerLat = (extent.ymin + extent.ymax) / 2;
  const origin: LngLatTuple = [centerLng, centerLat];
  const cosLat = Math.max(Math.cos((centerLat * Math.PI) / 180), 1e-6);

  const scored: AccessPointCandidate[] = [];
  const allScored: AccessPointCandidate[] = [];
  for (const candidate of boundaryCandidates) {
    const p = pointToLocalMeters(candidate, origin, cosLat);
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestStreetName: string | null = null;
    let bestStreetClassification: string | null = null;

    for (const street of streets) {
      for (let i = 0; i < street.path.length - 1; i += 1) {
        const aRaw = street.path[i];
        const bRaw = street.path[i + 1];
        if (!(aRaw && bRaw)) {
          continue;
        }
        const a = pointToLocalMeters(aRaw, origin, cosLat);
        const b = pointToLocalMeters(bRaw, origin, cosLat);
        const distance = distancePointToSegmentMeters(p, a, b);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestStreetName = street.name;
          bestStreetClassification = street.classification;
        }
      }
    }

    const scoredCandidate = {
      distanceToRoadMeters: bestDistance,
      nearStreetClassification: bestStreetClassification,
      nearStreetName: bestStreetName,
      point: candidate,
    };
    allScored.push(scoredCandidate);

    if (bestDistance <= maxRoadDistanceMeters) {
      scored.push(scoredCandidate);
    }
  }

  const pool = scored.length > 0 ? scored : allScored;
  pool.sort((a, b) => a.distanceToRoadMeters - b.distanceToRoadMeters);
  const selected: AccessPointCandidate[] = [];
  for (const candidate of pool) {
    const tooClose = selected.some(
      (chosen) =>
        distanceBetweenPointsMeters(chosen.point, candidate.point) <
        minPointSeparationMeters
    );
    if (tooClose) {
      continue;
    }
    selected.push(candidate);
    if (selected.length >= maxAccessPoints) {
      break;
    }
  }

  return selected;
}
