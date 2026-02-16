import { calculateBoundsFromCenter, calculateBoundsFromCorner } from "./bounds";
import { calculateConsensusConfidence, clusterSignals } from "./consensus";
import { geocodeAddress, geocodeIntersection } from "./geocoding";
import { getRoadGeometryByName } from "./roads";
import type {
  CornerPosition,
  ExtractedPlanHints,
  LatLng,
  LocationSignal,
  RehydrateOptions,
  RehydrateResult,
  RoadGeometry,
} from "./types";

function dedupeRoads(roads: ExtractedPlanHints["roads"]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const road of roads) {
    const key = road.name.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(road.name.trim());
  }

  return unique;
}

function pickSiteSizeMeters(hints: ExtractedPlanHints, options: RehydrateOptions): number {
  const defaultSize = options.defaultSiteSizeMeters ?? 150;
  const hinted = hints.estimatedSizeMeters ?? defaultSize;
  return Math.max(20, Math.min(1200, hinted));
}

function findBestCornerSignal(signals: LocationSignal[]): {
  coords: LatLng;
  cornerPosition: CornerPosition;
} | null {
  for (const signal of signals) {
    const corner = signal.metadata?.cornerPosition;
    if (
      signal.source === "intersection" &&
      signal.coords &&
      typeof corner === "string" &&
      corner !== "unknown"
    ) {
      return {
        coords: signal.coords,
        cornerPosition: corner as CornerPosition,
      };
    }
  }

  return null;
}

async function buildSignals(
  hints: ExtractedPlanHints,
  options: RehydrateOptions,
  log: string[],
): Promise<LocationSignal[]> {
  const signals: LocationSignal[] = [];

  if (hints.coordinates) {
    signals.push({
      source: "hint_coordinates",
      query: "document coordinates",
      coords: hints.coordinates,
      confidence: 0.95,
      metadata: { from: "hints.coordinates" },
    });
    log.push("signal: coordinates from document hints");
  }

  if (hints.address) {
    const addressQuery = `${hints.address}${hints.city ? `, ${hints.city}` : ""}${hints.state ? `, ${hints.state}` : ""}`;
    const coords = await geocodeAddress(addressQuery, options.googleMapsApiKey);

    signals.push({
      source: "address",
      query: addressQuery,
      coords,
      confidence: coords ? 0.9 : 0,
    });
    log.push(`signal: address geocode ${coords ? "ok" : "miss"}`);
  }

  const intersections = hints.intersections.slice(0, options.maxIntersections ?? 4);

  for (const intersection of intersections) {
    if (!(hints.city && hints.state)) {
      continue;
    }

    const coords = await geocodeIntersection(
      intersection.road1,
      intersection.road2,
      hints.city,
      hints.state,
      options.googleMapsApiKey,
    );

    signals.push({
      source: "intersection",
      query: `${intersection.road1} & ${intersection.road2}, ${hints.city}, ${hints.state}`,
      coords,
      confidence: coords ? 0.78 : 0,
      metadata: { cornerPosition: intersection.cornerPosition },
    });

    log.push(
      `signal: intersection ${intersection.road1} & ${intersection.road2} ${coords ? "ok" : "miss"}`,
    );
  }

  if (hints.projectName && hints.city && hints.state) {
    const query = `${hints.projectName}, ${hints.city}, ${hints.state}`;
    const coords = await geocodeAddress(query, options.googleMapsApiKey);

    signals.push({
      source: "project_grounding",
      query,
      coords,
      confidence: coords ? 0.6 : 0,
    });

    log.push(`signal: project grounding ${coords ? "ok" : "miss"}`);
  }

  const roadNames = dedupeRoads(hints.roads).slice(0, options.maxRoads ?? 5);
  for (const roadName of roadNames) {
    const query = `${roadName}${hints.city ? `, ${hints.city}` : ""}${hints.state ? `, ${hints.state}` : ""}`;
    const coords = await geocodeAddress(query, options.googleMapsApiKey);

    signals.push({
      source: "road_grounding",
      query,
      coords,
      confidence: coords ? 0.5 : 0,
    });

    log.push(`signal: road grounding ${roadName} ${coords ? "ok" : "miss"}`);
  }

  return signals;
}

async function buildRoadGeometry(
  hints: ExtractedPlanHints,
  consensusLocation: LatLng | null,
  options: RehydrateOptions,
  log: string[],
): Promise<RoadGeometry[]> {
  if (!options.enableRoadGeometry) {
    return [];
  }

  const roadNames = dedupeRoads(hints.roads).slice(0, options.maxRoads ?? 5);
  const results: RoadGeometry[] = [];

  for (const roadName of roadNames) {
    const geometry = await getRoadGeometryByName(roadName, {
      city: hints.city,
      state: hints.state,
      intersectionPoint: consensusLocation,
      searchRadiusMeters: 1000,
      googleMapsApiKey: options.googleMapsApiKey,
    });

    if (geometry) {
      results.push(geometry);
      log.push(`road geometry: ${roadName} (${geometry.points.length} pts)`);
    } else {
      log.push(`road geometry: ${roadName} miss`);
    }
  }

  return results;
}

export async function runRehydratedPipeline(
  hints: ExtractedPlanHints,
  options: RehydrateOptions = {},
): Promise<RehydrateResult> {
  const log: string[] = [];
  const clusterRadius = options.clusterRadiusMeters ?? 500;

  log.push("start: custom-map rehydrate pipeline");
  const signals = await buildSignals(hints, options, log);

  const validSignalCount = signals.filter((s) => s.coords !== null).length;
  log.push(`signals: ${signals.length} total, ${validSignalCount} valid`);

  const { clusters, outliers } = clusterSignals(signals, clusterRadius);
  const primaryCluster = clusters[0] ?? null;

  if (primaryCluster) {
    log.push(
      `cluster: primary size=${primaryCluster.signals.length} radius=${primaryCluster.radiusMeters.toFixed(1)}m`,
    );
  } else {
    log.push("cluster: none");
  }

  const consensusLocation = primaryCluster?.centroid ?? null;
  const consensusConfidence = calculateConsensusConfidence(primaryCluster, validSignalCount);

  const roadGeometries = await buildRoadGeometry(hints, consensusLocation, options, log);

  let suggestedBounds = null;
  if (consensusLocation) {
    const sizeMeters = pickSiteSizeMeters(hints, options);
    const aspectRatio = options.aspectRatio ?? 1;
    const cornerSignal = findBestCornerSignal(primaryCluster?.signals ?? []);

    if (cornerSignal) {
      suggestedBounds = calculateBoundsFromCorner(
        cornerSignal.coords,
        cornerSignal.cornerPosition,
        sizeMeters,
        aspectRatio,
      );
      log.push(`bounds: corner-based (${cornerSignal.cornerPosition})`);
    } else {
      suggestedBounds = calculateBoundsFromCenter(consensusLocation, sizeMeters, aspectRatio);
      log.push("bounds: center-based");
    }
  }

  return {
    signals,
    clusters,
    outliers,
    consensusLocation,
    consensusConfidence,
    suggestedBounds,
    roadGeometries,
    log,
  };
}
