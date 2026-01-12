import { describe, expect, test } from "bun:test";
import type { ScalePresetConfig } from "../config";
import type {
  CountMarker,
  PolygonAnnotation,
  PolylineAnnotation,
} from "../takeoff-types";
import type { Scaled } from "../types";
import {
  calculatePolygonArea,
  calculatePolygonPerimeter,
  calculatePolylineLength,
  formatMeasurement,
  getAnnotationMeasurement,
  pdfPointsSquaredToSquareFeet,
  pdfPointsToFeet,
  summarizeByItem,
} from "./measurements";

// Helper to create a Scaled point (only x1/y1 are used in calculations)
function point(x: number, y: number, pageNumber = 1): Scaled {
  return {
    x1: x,
    y1: y,
    x2: x,
    y2: y,
    width: 0,
    height: 0,
    pageNumber,
  };
}

// Standard test scale: 1" = 20' means 72 points = 20 feet
const testScale: ScalePresetConfig = {
  id: "1_20",
  label: "1\" = 20'",
  pixelsPerFoot: 72 / 20, // 3.6 points per foot
};

describe("calculatePolylineLength", () => {
  test("returns 0 for empty array", () => {
    expect(calculatePolylineLength([])).toBe(0);
  });

  test("returns 0 for single point", () => {
    expect(calculatePolylineLength([point(0, 0)])).toBe(0);
  });

  test("calculates horizontal line length", () => {
    const points = [point(0, 0), point(100, 0)];
    expect(calculatePolylineLength(points)).toBe(100);
  });

  test("calculates vertical line length", () => {
    const points = [point(0, 0), point(0, 50)];
    expect(calculatePolylineLength(points)).toBe(50);
  });

  test("calculates diagonal line length (3-4-5 triangle)", () => {
    const points = [point(0, 0), point(3, 4)];
    expect(calculatePolylineLength(points)).toBe(5);
  });

  test("calculates multi-segment polyline", () => {
    // L-shaped path: 100 right, then 50 down
    const points = [point(0, 0), point(100, 0), point(100, 50)];
    expect(calculatePolylineLength(points)).toBe(150);
  });

  test("calculates complex polyline", () => {
    // Square outline (3 sides, not closed)
    const points = [point(0, 0), point(10, 0), point(10, 10), point(0, 10)];
    expect(calculatePolylineLength(points)).toBe(30);
  });
});

describe("calculatePolygonArea", () => {
  test("returns 0 for less than 3 points", () => {
    expect(calculatePolygonArea([])).toBe(0);
    expect(calculatePolygonArea([point(0, 0)])).toBe(0);
    expect(calculatePolygonArea([point(0, 0), point(1, 1)])).toBe(0);
  });

  test("calculates triangle area", () => {
    // Right triangle with base 10, height 10 -> area = 50
    const points = [point(0, 0), point(10, 0), point(0, 10)];
    expect(calculatePolygonArea(points)).toBe(50);
  });

  test("calculates square area", () => {
    // 10x10 square -> area = 100
    const points = [point(0, 0), point(10, 0), point(10, 10), point(0, 10)];
    expect(calculatePolygonArea(points)).toBe(100);
  });

  test("calculates rectangle area", () => {
    // 20x10 rectangle -> area = 200
    const points = [point(0, 0), point(20, 0), point(20, 10), point(0, 10)];
    expect(calculatePolygonArea(points)).toBe(200);
  });

  test("handles clockwise vs counter-clockwise (absolute value)", () => {
    // Counter-clockwise square
    const ccw = [point(0, 0), point(0, 10), point(10, 10), point(10, 0)];
    // Clockwise square (same points, different order)
    const cw = [point(0, 0), point(10, 0), point(10, 10), point(0, 10)];
    expect(calculatePolygonArea(ccw)).toBe(100);
    expect(calculatePolygonArea(cw)).toBe(100);
  });
});

describe("calculatePolygonPerimeter", () => {
  test("returns 0 for less than 3 points", () => {
    expect(calculatePolygonPerimeter([])).toBe(0);
    expect(calculatePolygonPerimeter([point(0, 0)])).toBe(0);
    expect(calculatePolygonPerimeter([point(0, 0), point(1, 1)])).toBe(0);
  });

  test("calculates triangle perimeter", () => {
    // Equilateral-ish triangle
    const points = [point(0, 0), point(10, 0), point(5, 10)];
    // Side 1: 10, Side 2: sqrt(25 + 100) ≈ 11.18, Side 3: sqrt(25 + 100) ≈ 11.18
    const expected = 10 + Math.sqrt(125) + Math.sqrt(125);
    expect(calculatePolygonPerimeter(points)).toBeCloseTo(expected, 5);
  });

  test("calculates square perimeter", () => {
    const points = [point(0, 0), point(10, 0), point(10, 10), point(0, 10)];
    expect(calculatePolygonPerimeter(points)).toBe(40);
  });

  test("calculates rectangle perimeter", () => {
    const points = [point(0, 0), point(20, 0), point(20, 10), point(0, 10)];
    expect(calculatePolygonPerimeter(points)).toBe(60);
  });
});

describe("pdfPointsToFeet", () => {
  test("converts points to feet using scale", () => {
    // At 1" = 20' scale, 72 points = 20 feet
    expect(pdfPointsToFeet(72, testScale)).toBe(20);
  });

  test("handles fractional results", () => {
    // 36 points should be 10 feet
    expect(pdfPointsToFeet(36, testScale)).toBe(10);
  });

  test("handles zero", () => {
    expect(pdfPointsToFeet(0, testScale)).toBe(0);
  });

  test("works with different scales", () => {
    const scale1to10: ScalePresetConfig = {
      id: "1_10",
      label: "1\" = 10'",
      pixelsPerFoot: 72 / 10,
    };
    // 72 points at 1" = 10' should be 10 feet
    expect(pdfPointsToFeet(72, scale1to10)).toBe(10);
  });
});

describe("pdfPointsSquaredToSquareFeet", () => {
  test("converts square points to square feet", () => {
    // At 1" = 20' scale: 72 points = 20 feet
    // So 72^2 points² = 20^2 = 400 sq ft
    expect(pdfPointsSquaredToSquareFeet(72 * 72, testScale)).toBe(400);
  });

  test("handles zero", () => {
    expect(pdfPointsSquaredToSquareFeet(0, testScale)).toBe(0);
  });

  test("handles small areas", () => {
    // 1 point² at our scale
    const sqFeet = pdfPointsSquaredToSquareFeet(1, testScale);
    // Should be 1 / (72/20)^2 = 1 / 12.96 ≈ 0.0772
    expect(sqFeet).toBeCloseTo(1 / testScale.pixelsPerFoot ** 2, 5);
  });
});

describe("formatMeasurement", () => {
  test("formats whole numbers without decimals", () => {
    expect(formatMeasurement(100, "LF")).toBe("100 LF");
    expect(formatMeasurement(42, "SF")).toBe("42 SF");
    expect(formatMeasurement(5, "EA")).toBe("5 EA");
  });

  test("rounds to whole numbers by default", () => {
    expect(formatMeasurement(99.6, "LF")).toBe("100 LF");
    expect(formatMeasurement(99.4, "LF")).toBe("99 LF");
  });

  test("respects decimal places parameter", () => {
    expect(formatMeasurement(99.567, "LF", 2)).toBe("99.57 LF");
    expect(formatMeasurement(100, "SF", 1)).toBe("100.0 SF");
  });

  test("handles zero", () => {
    expect(formatMeasurement(0, "LF")).toBe("0 LF");
  });
});

describe("getAnnotationMeasurement", () => {
  test("returns count for count markers", () => {
    const marker: CountMarker = {
      id: "1",
      type: "count",
      position: { boundingRect: point(0, 0), rects: [] },
      itemId: "inlet",
      label: "Inlet",
      color: "#ff0000",
      number: 1,
    };

    const result = getAnnotationMeasurement(marker, testScale);
    expect(result.value).toBe(1);
    expect(result.unit).toBe("EA");
    expect(result.formatted).toBe("1 EA");
  });

  test("calculates length for polyline", () => {
    const polyline: PolylineAnnotation = {
      id: "2",
      type: "polyline",
      points: [point(0, 0), point(72, 0)], // 72 points = 20 feet at our scale
      itemId: "fence",
      label: "Fence",
      color: "#00ff00",
      strokeWidth: 2,
    };

    const result = getAnnotationMeasurement(polyline, testScale);
    expect(result.value).toBe(20);
    expect(result.unit).toBe("LF");
    expect(result.formatted).toBe("20 LF");
  });

  test("calculates area for polygon", () => {
    // 72x72 point square = 20x20 feet = 400 sq ft
    const polygon: PolygonAnnotation = {
      id: "3",
      type: "polygon",
      points: [point(0, 0), point(72, 0), point(72, 72), point(0, 72)],
      itemId: "area",
      label: "Area",
      color: "#0000ff",
      strokeWidth: 2,
      fillOpacity: 0.3,
    };

    const result = getAnnotationMeasurement(polygon, testScale);
    expect(result.value).toBe(400);
    expect(result.unit).toBe("SF");
    expect(result.formatted).toBe("400 SF");
  });
});

describe("summarizeByItem", () => {
  const itemConfigs = [
    { id: "inlet", label: "Inlet", color: "#ff0000", type: "count" as const },
    { id: "fence", label: "Fence", color: "#00ff00", type: "linear" as const },
    { id: "area", label: "Area", color: "#0000ff", type: "area" as const },
  ];

  test("returns empty array for no annotations", () => {
    expect(summarizeByItem([], testScale, itemConfigs)).toEqual([]);
  });

  test("counts count markers", () => {
    const annotations: CountMarker[] = [
      {
        id: "1",
        type: "count",
        position: { boundingRect: point(0, 0), rects: [] },
        itemId: "inlet",
        label: "Inlet",
        color: "#ff0000",
        number: 1,
      },
      {
        id: "2",
        type: "count",
        position: { boundingRect: point(10, 10), rects: [] },
        itemId: "inlet",
        label: "Inlet",
        color: "#ff0000",
        number: 2,
      },
      {
        id: "3",
        type: "count",
        position: { boundingRect: point(20, 20), rects: [] },
        itemId: "inlet",
        label: "Inlet",
        color: "#ff0000",
        number: 3,
      },
    ];

    const result = summarizeByItem(annotations, testScale, itemConfigs);
    expect(result).toHaveLength(1);
    expect(result[0].itemId).toBe("inlet");
    expect(result[0].count).toBe(3);
    expect(result[0].totalValue).toBe(3);
    expect(result[0].unit).toBe("EA");
  });

  test("sums linear measurements", () => {
    const annotations: PolylineAnnotation[] = [
      {
        id: "1",
        type: "polyline",
        points: [point(0, 0), point(72, 0)],
        itemId: "fence",
        label: "Fence",
        color: "#00ff00",
        strokeWidth: 2,
      }, // 20 LF
      {
        id: "2",
        type: "polyline",
        points: [point(0, 0), point(36, 0)],
        itemId: "fence",
        label: "Fence",
        color: "#00ff00",
        strokeWidth: 2,
      }, // 10 LF
    ];

    const result = summarizeByItem(annotations, testScale, itemConfigs);
    expect(result).toHaveLength(1);
    expect(result[0].itemId).toBe("fence");
    expect(result[0].count).toBe(2);
    expect(result[0].totalValue).toBe(30); // 20 + 10
    expect(result[0].unit).toBe("LF");
  });

  test("sums area measurements", () => {
    const annotations: PolygonAnnotation[] = [
      {
        id: "1",
        type: "polygon",
        points: [point(0, 0), point(72, 0), point(72, 72), point(0, 72)],
        itemId: "area",
        label: "Area",
        color: "#0000ff",
        strokeWidth: 2,
        fillOpacity: 0.3,
      }, // 400 SF
      {
        id: "2",
        type: "polygon",
        points: [point(0, 0), point(36, 0), point(36, 36), point(0, 36)],
        itemId: "area",
        label: "Area",
        color: "#0000ff",
        strokeWidth: 2,
        fillOpacity: 0.3,
      }, // 100 SF
    ];

    const result = summarizeByItem(annotations, testScale, itemConfigs);
    expect(result).toHaveLength(1);
    expect(result[0].itemId).toBe("area");
    expect(result[0].count).toBe(2);
    expect(result[0].totalValue).toBe(500); // 400 + 100
    expect(result[0].unit).toBe("SF");
  });

  test("groups by item type", () => {
    const annotations = [
      {
        id: "1",
        type: "count" as const,
        position: { boundingRect: point(0, 0), rects: [] },
        itemId: "inlet",
        label: "Inlet",
        color: "#ff0000",
        number: 1,
      },
      {
        id: "2",
        type: "polyline" as const,
        points: [point(0, 0), point(72, 0)],
        itemId: "fence",
        label: "Fence",
        color: "#00ff00",
        strokeWidth: 2,
      },
    ];

    const result = summarizeByItem(annotations, testScale, itemConfigs);
    expect(result).toHaveLength(2);
    expect(result.find((s) => s.itemId === "inlet")?.count).toBe(1);
    expect(result.find((s) => s.itemId === "fence")?.totalValue).toBe(20);
  });

  test("skips items with no matching config", () => {
    const annotations: CountMarker[] = [
      {
        id: "1",
        type: "count",
        position: { boundingRect: point(0, 0), rects: [] },
        itemId: "unknown",
        label: "Unknown",
        color: "#999",
        number: 1,
      },
    ];

    const result = summarizeByItem(annotations, testScale, itemConfigs);
    expect(result).toHaveLength(0);
  });
});
