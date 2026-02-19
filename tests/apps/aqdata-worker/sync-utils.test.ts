import { describe, expect, test } from "bun:test";
import {
  buildOutputPaths,
  parseCoordinatesFromResponse,
} from "../../../apps/aqdata-worker/src/services/sync";

describe("aqdata-worker sync utils", () => {
  test("parseCoordinatesFromResponse supports nested coordinates object", () => {
    const value = parseCoordinatesFromResponse({
      coordinates: {
        latitude: 33.4484,
        longitude: -112.074,
      },
    });

    expect(value).toEqual({
      latitude: 33.4484,
      longitude: -112.074,
    });
  });

  test("parseCoordinatesFromResponse supports flat lat/lng shape", () => {
    const value = parseCoordinatesFromResponse({
      lat: 33.4,
      lng: -112.1,
    });

    expect(value).toEqual({
      latitude: 33.4,
      longitude: -112.1,
    });
  });

  test("parseCoordinatesFromResponse returns null when incomplete", () => {
    const value = parseCoordinatesFromResponse({
      latitude: 33.4,
    });

    expect(value).toBeNull();
  });

  test("buildOutputPaths includes run type in file name", () => {
    const full = buildOutputPaths({
      companyOnly: false,
      dataDir: "/tmp/aq",
    });
    const company = buildOutputPaths({
      companyOnly: true,
      dataDir: "/tmp/aq",
    });

    expect(full.outputPath).toContain("/tmp/aq/aqdata-full-");
    expect(company.outputPath).toContain("/tmp/aq/aqdata-company-");
    expect(full.outputPath.endsWith(".json")).toBeTrue();
    expect(company.outputPath.endsWith(".json")).toBeTrue();
  });
});
