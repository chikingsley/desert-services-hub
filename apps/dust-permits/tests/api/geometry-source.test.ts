import { describe, expect, test } from "bun:test";
import {
  parseKmlGeometry,
  resolveGeometrySource,
  splitFormDataAndGeometrySource,
} from "@/lib/geometry-source";

const SAMPLE_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Active Construction Area</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              -112.1750,33.4540,0
              -112.1740,33.4540,0
              -112.1740,33.4550,0
              -112.1750,33.4550,0
              -112.1750,33.4540,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
    <Placemark>
      <name>Site Entrance #1</name>
      <Point>
        <coordinates>-112.1748,33.4542,0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>Site Entrance #2</name>
      <Point>
        <coordinates>-112.1742,33.4548,0</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`;

describe("geometry source helpers", () => {
  test("parses KML polygon and access points", () => {
    const geometry = parseKmlGeometry(SAMPLE_KML);

    expect(geometry.disturbedArea).toHaveLength(4);
    expect(geometry.accessPoints).toHaveLength(2);
    expect(geometry.centroid?.lat).toBeCloseTo(33.4545, 4);
    expect(geometry.centroid?.lng).toBeCloseTo(-112.1745, 4);
    expect(geometry.disturbedAcres).toBeGreaterThan(0);
  });

  test("resolves manual geometry without parcel lookup when target parcel is given", async () => {
    const geometry = await resolveGeometrySource({
      kind: "manual",
      disturbedArea: [
        { lat: 33.454, lng: -112.175 },
        { lat: 33.454, lng: -112.174 },
        { lat: 33.455, lng: -112.174 },
        { lat: 33.455, lng: -112.175 },
      ],
      accessPoints: [{ lat: 33.4542, lng: -112.1748 }],
      disturbedAcres: 2.5,
      targetParcel: "10329071",
    });

    expect(geometry.targetParcelDashed).toBe("103-29-071");
    expect(geometry.disturbedAcres).toBe(2.5);
    expect(geometry.disturbedAcresSource).toBe("explicit");
    expect(geometry.parcel).toBeNull();
    expect(geometry.mapData.disturbedArea?.latLngCoordinates).toHaveLength(4);
    expect(geometry.mapData.accessPoints).toHaveLength(1);
  });

  test("splits top-level geometrySource from mixed override files", () => {
    const split = splitFormDataAndGeometrySource({
      geometrySource: {
        kind: "kml-file",
        path: "/tmp/example.kml",
      },
      project: {
        name: "West 202 Logistics",
      },
      site: {
        acresDisturbed: 2.5,
      },
    });

    expect(split.geometrySource).toEqual({
      kind: "kml-file",
      path: "/tmp/example.kml",
    });
    expect(split.formData).toEqual({
      project: {
        name: "West 202 Logistics",
      },
      site: {
        acresDisturbed: 2.5,
      },
    });
  });
});
