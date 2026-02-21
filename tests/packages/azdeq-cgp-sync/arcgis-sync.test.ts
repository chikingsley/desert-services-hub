import { describe, expect, test } from "bun:test";
import { ARCGIS_LAYER_BY_KEY } from "../../../packages/azdeq-cgp-sync/src/arcgis-constants";
import { buildArcGisRecordId } from "../../../packages/azdeq-cgp-sync/src/arcgis-sync";
import type { ArcGisFeature } from "../../../packages/azdeq-cgp-sync/src/arcgis-types";

const EXAMPLE_LAYER = ARCGIS_LAYER_BY_KEY.get("AZPDES:0");

describe("buildArcGisRecordId", () => {
  test("uses configured object id field value when present", () => {
    if (!EXAMPLE_LAYER) {
      throw new Error("Missing expected ArcGIS test layer config");
    }
    const feature: ArcGisFeature = {
      attributes: {
        OBJECTID: 123,
      },
      geometry: null,
    };
    expect(buildArcGisRecordId(EXAMPLE_LAYER, feature, "OBJECTID")).toBe("123");
  });

  test("falls back to deterministic hash-based id", () => {
    if (!EXAMPLE_LAYER) {
      throw new Error("Missing expected ArcGIS test layer config");
    }
    const one: ArcGisFeature = {
      attributes: {
        NAME: "Example",
      },
      geometry: {
        x: -112.1,
        y: 33.5,
      },
    };
    const two: ArcGisFeature = {
      attributes: {
        NAME: "Example",
      },
      geometry: {
        x: -112.1,
        y: 33.5,
      },
    };

    expect(buildArcGisRecordId(EXAMPLE_LAYER, one, "OBJECTID")).toBe(
      buildArcGisRecordId(EXAMPLE_LAYER, two, "OBJECTID")
    );
  });
});
