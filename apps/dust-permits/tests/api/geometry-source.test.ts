import { describe, expect, test } from "bun:test";
import { resolveGeometrySource } from "@/lib/geometry-source";

const KML_FIXTURE =
  "/home/simon/github/desert-services-hub/apps/dust-permits/data/kml/Tenant Improvement West 202 Logistics Project - ycglobal.kml";

describe("geometrySource KML", () => {
  test("resolves the YCGlobal fixture into disturbed area + access points", async () => {
    const resolved = await resolveGeometrySource({
      kind: "kml-file",
      path: KML_FIXTURE,
      targetParcel: "10233002G",
    });

    expect(resolved.sourceKind).toBe("kml-file");
    expect(resolved.targetParcelDashed).toBe("102-33-002G");
    expect(resolved.disturbedAcres).toBeGreaterThan(2.9);
    expect(resolved.disturbedAcres).toBeLessThan(3.0);
    expect(resolved.mapData.disturbedArea?.type).toBe("polygon");
    expect(resolved.mapData.accessPoints).toHaveLength(2);
    expect(resolved.mapData.centroid?.lat).toBeGreaterThan(33.4);
    expect(resolved.mapData.centroid?.lat).toBeLessThan(33.5);
    expect(resolved.mapData.centroid?.lng).toBeGreaterThan(-112.2);
    expect(resolved.mapData.centroid?.lng).toBeLessThan(-112.16);
  });
});
