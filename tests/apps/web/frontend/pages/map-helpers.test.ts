import { describe, expect, it } from "bun:test";
import {
  buildParcelSamplePoints,
  findLowestPoint,
  findLowestTerrainPoint,
  type LngLatTuple,
  type LowestPoint,
  metersToFeet,
} from "@/apps/web/frontend/pages/map-helpers";

function makeSquareParcel(): GeoJSON.Feature<GeoJSON.Polygon, { APN: string }> {
  return {
    type: "Feature",
    properties: { APN: "123-45-678" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-112.1, 33.45],
          [-112.0995, 33.45],
          [-112.0995, 33.4505],
          [-112.1, 33.4505],
          [-112.1, 33.45],
        ],
      ],
    },
  };
}

describe("map-helpers lowest-point utilities", () => {
  it("builds bounded parcel sample points including centroid", () => {
    const points = buildParcelSamplePoints(makeSquareParcel(), {
      spacingMeters: 5,
      outwardMeters: 3,
      maxPoints: 120,
    });

    expect(points.length).toBeGreaterThan(20);
    expect(points.length).toBeLessThanOrEqual(120);
  });

  it("finds lowest point from terrain map sampling", () => {
    const points: LngLatTuple[] = [
      [-112.1, 33.45],
      [-112.099, 33.451],
      [-112.098, 33.452],
    ];
    const map = {
      queryTerrainElevation: ({ lng }: { lng: number; lat: number }) =>
        lng === -112.099 ? 100 : 125,
    };

    const lowest = findLowestTerrainPoint(map, points);
    expect(lowest).not.toBeNull();
    expect(lowest?.elevationMeters).toBe(100);
    expect(lowest?.source).toBe("terrain");
    expect(lowest?.approximate).toBe(true);
  });

  it("finds minimum from mixed sample set and converts feet", () => {
    const samples: LowestPoint[] = [
      {
        point: [-112.1, 33.45],
        elevationMeters: 100,
        source: "terrain",
        approximate: true,
        resolutionMeters: null,
      },
      {
        point: [-112.0995, 33.4502],
        elevationMeters: 95,
        source: "3dep",
        approximate: false,
        resolutionMeters: 1,
      },
    ];

    const lowest = findLowestPoint(samples);
    expect(lowest?.source).toBe("3dep");
    expect(Math.round(metersToFeet(100))).toBe(328);
  });
});
