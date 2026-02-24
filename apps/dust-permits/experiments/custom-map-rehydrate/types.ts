export interface LatLng {
  lat: number;
  lng: number;
}

export interface Bounds {
  east: number;
  north: number;
  south: number;
  west: number;
}

export type Direction = "north" | "south" | "east" | "west" | "unknown";

export type CornerPosition =
  | "northwest"
  | "northeast"
  | "southwest"
  | "southeast"
  | "unknown";

export interface ExtractedRoad {
  direction: Direction;
  isPrimary: boolean;
  name: string;
}

export interface ExtractedIntersection {
  cornerPosition: CornerPosition;
  road1: string;
  road2: string;
}

export interface ExtractedPlanHints {
  address: string | null;
  city: string | null;
  coordinateCandidates?: LatLng[];
  coordinates: LatLng | null;
  county: string | null;
  estimatedSizeMeters: number | null;
  intersections: ExtractedIntersection[];
  parcelNumber: string | null;
  projectName: string | null;
  roads: ExtractedRoad[];
  scaleInfo: string | null;
  state: string | null;
}

export type SignalSource =
  | "hint_coordinates"
  | "address"
  | "intersection"
  | "project_grounding"
  | "road_grounding";

export interface LocationSignal {
  confidence: number;
  coords: LatLng | null;
  metadata?: Record<string, unknown>;
  query: string;
  source: SignalSource;
}

export interface LocationCluster {
  centroid: LatLng;
  radiusMeters: number;
  signals: LocationSignal[];
  totalConfidence: number;
}

export interface RoadGeometry {
  points: LatLng[];
  roadName: string;
}

export interface RehydrateOptions {
  aspectRatio?: number;
  clusterRadiusMeters?: number;
  defaultSiteSizeMeters?: number;
  enableRoadGeometry?: boolean;
  googleMapsApiKey?: string;
  maxIntersections?: number;
  maxRoads?: number;
}

export interface RehydrateResult {
  clusters: LocationCluster[];
  consensusConfidence: number;
  consensusLocation: LatLng | null;
  log: string[];
  outliers: LocationSignal[];
  roadGeometries: RoadGeometry[];
  signals: LocationSignal[];
  suggestedBounds: Bounds | null;
}
