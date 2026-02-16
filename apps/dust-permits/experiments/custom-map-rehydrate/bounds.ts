import type { Bounds, CornerPosition, LatLng } from "./types";

const METERS_PER_LAT_DEG = 111_000;

function metersPerLngDeg(lat: number): number {
  return Math.cos((lat * Math.PI) / 180) * METERS_PER_LAT_DEG;
}

export function calculateBoundsFromCenter(
  center: LatLng,
  sizeMeters: number,
  aspectRatio = 1,
): Bounds {
  const widthMeters = aspectRatio >= 1 ? sizeMeters : sizeMeters * aspectRatio;
  const heightMeters = aspectRatio >= 1 ? sizeMeters / aspectRatio : sizeMeters;

  const latDelta = heightMeters / METERS_PER_LAT_DEG / 2;
  const lngDelta = widthMeters / metersPerLngDeg(center.lat) / 2;

  return {
    north: center.lat + latDelta,
    south: center.lat - latDelta,
    east: center.lng + lngDelta,
    west: center.lng - lngDelta,
  };
}

export function calculateBoundsFromCorner(
  corner: LatLng,
  cornerPosition: CornerPosition,
  sizeMeters: number,
  aspectRatio = 1,
): Bounds {
  const widthMeters = aspectRatio >= 1 ? sizeMeters : sizeMeters * aspectRatio;
  const heightMeters = aspectRatio >= 1 ? sizeMeters / aspectRatio : sizeMeters;

  const latDelta = heightMeters / METERS_PER_LAT_DEG;
  const lngDelta = widthMeters / metersPerLngDeg(corner.lat);

  switch (cornerPosition) {
    case "northwest":
      return {
        north: corner.lat,
        south: corner.lat - latDelta,
        west: corner.lng,
        east: corner.lng + lngDelta,
      };
    case "northeast":
      return {
        north: corner.lat,
        south: corner.lat - latDelta,
        east: corner.lng,
        west: corner.lng - lngDelta,
      };
    case "southwest":
      return {
        south: corner.lat,
        north: corner.lat + latDelta,
        west: corner.lng,
        east: corner.lng + lngDelta,
      };
    case "southeast":
      return {
        south: corner.lat,
        north: corner.lat + latDelta,
        east: corner.lng,
        west: corner.lng - lngDelta,
      };
    default:
      return calculateBoundsFromCenter(corner, sizeMeters, aspectRatio);
  }
}

export type RefinementAdjustment = {
  shiftMeters: { north: number; east: number };
  scaleFactor: number;
};

export function applyAdjustment(currentBounds: Bounds, adjustment: RefinementAdjustment): Bounds {
  const center = {
    lat: (currentBounds.north + currentBounds.south) / 2,
    lng: (currentBounds.east + currentBounds.west) / 2,
  };

  const latShift = adjustment.shiftMeters.north / METERS_PER_LAT_DEG;
  const lngShift = adjustment.shiftMeters.east / metersPerLngDeg(center.lat);

  const nextCenter = {
    lat: center.lat + latShift,
    lng: center.lng + lngShift,
  };

  const currentLatSpan = currentBounds.north - currentBounds.south;
  const currentLngSpan = currentBounds.east - currentBounds.west;

  const nextLatSpan = currentLatSpan * adjustment.scaleFactor;
  const nextLngSpan = currentLngSpan * adjustment.scaleFactor;

  return {
    north: nextCenter.lat + nextLatSpan / 2,
    south: nextCenter.lat - nextLatSpan / 2,
    east: nextCenter.lng + nextLngSpan / 2,
    west: nextCenter.lng - nextLngSpan / 2,
  };
}
