/**
 * KML fixture → PermitMapData (real file on disk, no HTTP mocks).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { kmlToPermitMapData, parseKml } from "../../src/kml";

const fixtureDir = dirname(fileURLToPath(import.meta.url));

const TENANT_IMPROVEMENT_KML = join(
  fixtureDir,
  "../text-fixtures/Tenant Improvement West 202 Logistics Project - ycglobal.kml"
);

describe("kml (fixture file)", () => {
  test("parseKml extracts Active Construction Area polygon and point placemarks", () => {
    const kml = readFileSync(TENANT_IMPROVEMENT_KML, "utf8");
    const parsed = parseKml(kml);

    expect(parsed.polygons.length).toBeGreaterThanOrEqual(1);
    const active = parsed.polygons.find(
      (p) => p.name === "Active Construction Area"
    );
    expect(active).toBeDefined();
    expect(active?.coordinates.length).toBeGreaterThanOrEqual(3);

    expect(parsed.points.length).toBeGreaterThanOrEqual(1);
  });

  test("kmlToPermitMapData builds disturbed area + access points from fixture", () => {
    const kml = readFileSync(TENANT_IMPROVEMENT_KML, "utf8");
    const mapData = kmlToPermitMapData(kml);

    expect(mapData.disturbedArea).not.toBeNull();
    expect(mapData.disturbedArea?.type).toBe("polygon");
    expect(mapData.disturbedArea?.attributes).toMatchObject({
      name: "Active Construction Area",
      source: "kml",
    });

    expect(mapData.centroid).not.toBeNull();
    expect(mapData.centroid?.lat).toBeGreaterThan(33.4);
    expect(mapData.centroid?.lat).toBeLessThan(33.5);
    expect(mapData.centroid?.lng).toBeGreaterThan(-112.2);
    expect(mapData.centroid?.lng).toBeLessThan(-112.16);

    expect(mapData.points.length).toBeGreaterThanOrEqual(2);
    expect(mapData.accessPoints.length).toBe(mapData.points.length);

    const entranceNames = mapData.points
      .map((p) => p.attributes.name)
      .filter((n) => typeof n === "string");
    expect(entranceNames.some((n) => String(n).includes("Site Entrance"))).toBe(
      true
    );
  });
});
