import { afterEach, describe, expect, test } from "bun:test";
import { handlePimaLookup } from "@/api/pima";
import {
  formatPimaParcelId,
  resetPimaServiceCatalogCacheForTests,
} from "@/lib/pima-gis";

const realFetch = globalThis.fetch;

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function installFetchStub(
  handler: (input: RequestInfo | URL) => Promise<Response>
): typeof fetch {
  return handler as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  resetPimaServiceCatalogCacheForTests();
});

describe("Pima GIS helpers", () => {
  test("formats parcel ids with dashes", () => {
    expect(formatPimaParcelId("141020050")).toBe("141-02-0050");
    expect(formatPimaParcelId("141-02-0050")).toBe("141-02-0050");
  });
});

describe("Pima lookup API", () => {
  test("resolves parcels from an NOI identifier", async () => {
    globalThis.fetch = installFetchStub(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.href.startsWith("https://my.azdeq.gov/deq-search/service/permit/cgp")) {
        return jsonResponse([
          {
            companyName: "CTI COMPANIES LLC",
            facilityName: "DLA-TUCSON DISPOSITION SERVICES WAREHOUSE REFLOW PROJECT",
            ltfIdno: "114964",
            ltfFacilityDetails: {
              facilityCounty: { countyCode: "04019" },
              latLongDetails: {
                latitude: "32.159457",
                longitude: "-110.842543",
              },
            },
            permitAuthCode: "AZC114964",
          },
        ]);
      }

      if (
        url.href ===
        "https://pimamaps.pima.gov/Geocortex/Essentials/PublicPM/REST/sites/mainsite/map?f=pjson"
      ) {
        return jsonResponse({
          mapServices: [
            {
              connectionString:
                "url=https://pimamaps.pima.gov/arcgis/rest/services/Addresses/Addresses/MapServer;token=test-token",
              displayName: "Addresses",
            },
            {
              connectionString:
                "url=https://pimamaps.pima.gov/arcgis/rest/services/LandRecords/ParcelsGroup/MapServer;token=test-token",
              displayName: "Parcels Group",
            },
          ],
        });
      }

      if (
        url.pathname ===
        "/arcgis/rest/services/LandRecords/ParcelsGroup/MapServer/0/query"
      ) {
        expect(url.searchParams.get("token")).toBe("test-token");
        expect(url.searchParams.get("geometryType")).toBe("esriGeometryPoint");
        return jsonResponse({
          features: [
            {
              attributes: {
                ADDRESS_OL: null,
                GISACRES: 577.25564632,
                MAIL1: "UNITED STATES OF AMERICA",
                PARCEL: "141020050",
                PARCEL_USE: "9400",
              },
              geometry: {
                rings: [
                  [
                    [-110.843, 32.159],
                    [-110.842, 32.159],
                    [-110.842, 32.158],
                    [-110.843, 32.158],
                    [-110.843, 32.159],
                  ],
                ],
              },
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${url.href}`);
    });

    const response = await handlePimaLookup({ identifier: "114964" });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.query.mode).toBe("identifier");
    expect(data.noi.permitAuthCode).toBe("AZC114964");
    expect(data.parcels).toHaveLength(1);
    expect(data.parcels[0].parcel).toBe("141020050");
    expect(data.parcels[0].parcelDashed).toBe("141-02-0050");
    expect(data.parcels[0].owner).toBe("UNITED STATES OF AMERICA");
  });

  test("falls back from address points to parcel lookup by coordinates", async () => {
    globalThis.fetch = installFetchStub(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (
        url.href ===
        "https://pimamaps.pima.gov/Geocortex/Essentials/PublicPM/REST/sites/mainsite/map?f=pjson"
      ) {
        return jsonResponse({
          mapServices: [
            {
              connectionString:
                "url=https://pimamaps.pima.gov/arcgis/rest/services/Addresses/Addresses/MapServer;token=test-token",
              displayName: "Addresses",
            },
            {
              connectionString:
                "url=https://pimamaps.pima.gov/arcgis/rest/services/LandRecords/ParcelsGroup/MapServer;token=test-token",
              displayName: "Parcels Group",
            },
          ],
        });
      }

      if (
        url.pathname ===
        "/arcgis/rest/services/Addresses/Addresses/MapServer/0/query"
      ) {
        return jsonResponse({
          features: [
            {
              attributes: {
                ADDRESS: "7600 S KOLB RD",
                ADR_PRIM: "N",
                PARCEL: null,
                ZIPCITY: "TUCSON",
                ZIPCODE: "85756",
              },
              geometry: {
                x: -110.84125308622241,
                y: 32.113436007927163,
              },
            },
          ],
        });
      }

      if (
        url.pathname ===
        "/arcgis/rest/services/LandRecords/ParcelsGroup/MapServer/0/query"
      ) {
        return jsonResponse({
          features: [
            {
              attributes: {
                ADDRESS_OL: null,
                GISACRES: 577.25564632,
                MAIL1: "UNITED STATES OF AMERICA",
                PARCEL: "141020050",
                PARCEL_USE: "9400",
              },
              geometry: {
                rings: [
                  [
                    [-110.842, 32.114],
                    [-110.841, 32.114],
                    [-110.841, 32.113],
                    [-110.842, 32.113],
                    [-110.842, 32.114],
                  ],
                ],
              },
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${url.href}`);
    });

    const response = await handlePimaLookup({ address: "7600 S Kolb Rd" });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.query.mode).toBe("address");
    expect(data.addressCandidates).toHaveLength(1);
    expect(data.addressCandidates[0].parcel).toBeNull();
    expect(data.addressCandidates[0].resolvedParcels).toHaveLength(1);
    expect(data.parcels).toHaveLength(1);
    expect(data.parcels[0].parcelDashed).toBe("141-02-0050");
  });
});
