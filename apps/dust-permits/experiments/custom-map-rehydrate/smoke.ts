#!/usr/bin/env bun

import { calculateBoundsFromCenter, calculateBoundsFromCorner } from "./bounds";
import { clusterSignals } from "./consensus";
import type { LocationSignal } from "./types";

const signals: LocationSignal[] = [
  {
    source: "hint_coordinates",
    query: "doc",
    coords: { lat: 33.5613, lng: -112.3916 },
    confidence: 0.95,
  },
  {
    source: "address",
    query: "sample address",
    coords: { lat: 33.5614, lng: -112.3915 },
    confidence: 0.9,
  },
  {
    source: "intersection",
    query: "A & B",
    coords: { lat: 33.5615, lng: -112.3917 },
    confidence: 0.78,
  },
  {
    source: "road_grounding",
    query: "far away outlier",
    coords: { lat: 33.7, lng: -112.1 },
    confidence: 0.4,
  },
];

const { clusters, outliers } = clusterSignals(signals, 500);

console.log("clusters:", clusters.length);
console.log("outliers:", outliers.length);
console.log("primary centroid:", clusters[0]?.centroid);

const centerBounds = calculateBoundsFromCenter(
  { lat: 33.5613, lng: -112.3916 },
  200,
  1.4
);

const cornerBounds = calculateBoundsFromCorner(
  { lat: 33.5613, lng: -112.3916 },
  "northwest",
  200,
  1.4
);

console.log("center bounds:", centerBounds);
console.log("corner bounds:", cornerBounds);
