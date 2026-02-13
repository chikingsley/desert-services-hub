export type LatLng = {
  lat: number;
  lng: number;
};

export type Bounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type Direction = "north" | "south" | "east" | "west" | "unknown";

export type CornerPosition =
  | "northwest"
  | "northeast"
  | "southwest"
  | "southeast"
  | "unknown";

export interface ExtractedRoad {
  name: string;
  direction: Direction;
  isPrimary: boolean;
}

export interface ExtractedIntersection {
  road1: string;
  road2: string;
  cornerPosition: CornerPosition;
}

export interface ExtractedPlanHints {
  projectName: string | null;
  parcelNumber: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  county: string | null;
  roads: ExtractedRoad[];
  intersections: ExtractedIntersection[];
  scaleInfo: string | null;
  estimatedSizeMeters: number | null;
  coordinates: LatLng | null;
}

export type SignalSource =
  | "hint_coordinates"
  | "address"
  | "intersection"
  | "project_grounding"
  | "road_grounding";

export interface LocationSignal {
  source: SignalSource;
  query: string;
  coords: LatLng | null;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface LocationCluster {
  centroid: LatLng;
  signals: LocationSignal[];
  radiusMeters: number;
  totalConfidence: number;
}

export interface RoadGeometry {
  roadName: string;
  points: LatLng[];
}

export interface RehydrateOptions {
  googleMapsApiKey?: string;
  clusterRadiusMeters?: number;
  maxIntersections?: number;
  maxRoads?: number;
  enableRoadGeometry?: boolean;
  defaultSiteSizeMeters?: number;
  aspectRatio?: number;
}

export interface RehydrateResult {
  signals: LocationSignal[];
  clusters: LocationCluster[];
  outliers: LocationSignal[];
  consensusLocation: LatLng | null;
  consensusConfidence: number;
  suggestedBounds: Bounds | null;
  roadGeometries: RoadGeometry[];
  log: string[];
}
