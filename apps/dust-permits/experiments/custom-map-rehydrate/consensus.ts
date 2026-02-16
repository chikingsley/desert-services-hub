import type { LatLng, LocationCluster, LocationSignal } from "./types";

export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return 2 * R * Math.asin(Math.sqrt(h));
}

function centroid(points: LatLng[]): LatLng {
  const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), {
    lat: 0,
    lng: 0,
  });

  return {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length,
  };
}

function clusterRadiusMeters(c: LatLng, points: LatLng[]): number {
  let maxDistance = 0;
  for (const p of points) {
    maxDistance = Math.max(maxDistance, haversineDistanceMeters(c, p));
  }
  return maxDistance;
}

export function clusterSignals(
  signals: LocationSignal[],
  radiusMeters = 500,
): { clusters: LocationCluster[]; outliers: LocationSignal[] } {
  const validSignals = signals.filter((s) => s.coords !== null);
  const remaining = new Set(validSignals.map((_, index) => index));
  const clusters: LocationCluster[] = [];

  while (remaining.size > 0) {
    const seed = remaining.values().next().value as number;
    remaining.delete(seed);

    const clusterIndexes = new Set<number>([seed]);
    let changed = true;

    while (changed) {
      changed = false;
      const candidates = Array.from(remaining);

      for (const idx of candidates) {
        const candidate = validSignals[idx];
        if (!candidate?.coords) {
          continue;
        }

        let isNearCluster = false;
        for (const memberIdx of clusterIndexes) {
          const member = validSignals[memberIdx];
          if (!member?.coords) {
            continue;
          }

          const d = haversineDistanceMeters(member.coords, candidate.coords);
          if (d <= radiusMeters) {
            isNearCluster = true;
            break;
          }
        }

        if (isNearCluster) {
          clusterIndexes.add(idx);
          remaining.delete(idx);
          changed = true;
        }
      }
    }

    const clusterSignals = Array.from(clusterIndexes)
      .map((idx) => validSignals[idx])
      .filter((s): s is LocationSignal => Boolean(s));

    const clusterPoints = clusterSignals
      .map((s) => s.coords)
      .filter((c): c is LatLng => c !== null);

    const c = centroid(clusterPoints);

    clusters.push({
      centroid: c,
      signals: clusterSignals,
      radiusMeters: clusterRadiusMeters(c, clusterPoints),
      totalConfidence: clusterSignals.reduce((sum, s) => sum + s.confidence, 0),
    });
  }

  clusters.sort((a, b) => {
    if (b.totalConfidence !== a.totalConfidence) {
      return b.totalConfidence - a.totalConfidence;
    }
    return b.signals.length - a.signals.length;
  });

  const outliers =
    clusters.length <= 1
      ? []
      : clusters
          .slice(1)
          .filter((c) => c.signals.length === 1)
          .flatMap((c) => c.signals);

  return { clusters, outliers };
}

export function calculateConsensusConfidence(
  primaryCluster: LocationCluster | null,
  signalCount: number,
): number {
  if (!primaryCluster || signalCount <= 0) {
    return 0;
  }

  const clusterFraction = primaryCluster.signals.length / signalCount;
  const confidenceDensity = primaryCluster.totalConfidence / signalCount;
  const compactnessScore = 1 - Math.min(primaryCluster.radiusMeters / 1500, 1);

  const score = 0.45 * clusterFraction + 0.35 * confidenceDensity + 0.2 * compactnessScore;

  return Number(Math.max(0, Math.min(1, score)).toFixed(3));
}
