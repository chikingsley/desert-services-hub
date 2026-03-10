import { afterEach, describe, expect, test } from "bun:test";
import { handleMaricopaLookup } from "@/api/maricopa";

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
});

describe("Maricopa lookup API", () => {
  test("resolves parcels from an NOI identifier", async () => {
    globalThis.fetch = installFetchStub(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.href.startsWith("https://my.azdeq.gov/deq-search/service/permit/cgp")) {
        return jsonResponse([
          {
            companyName: "TEST CONTRACTOR",
            facilityName: "MARICOPA TEST PROJECT",
            ltfIdno: "114575",
            ltfFacilityDetails: {
              facilityCounty: { countyCode: "04013" },
              latLongDetails: {
                latitude: "33.3001",
                longitude: "-112.1234",
              },
            },
            permitAuthCode: "AZC114575",
          },
        ]);
      }

      if (
        url.pathname === "/arcgis/rest/services/Parcels/MapServer/0/query"
      ) {
        expect(url.searchParams.get("geometryType")).toBe("esriGeometryPoint");
        return jsonResponse({
          features: [
            {
              attributes: {
                APN: "50072958",
                GIS_ACRES: 1.25,
                OWNER_NAME: "TEST OWNER LLC",
                PHYSICAL_ADDRESS: "16155 W ELWOOD ST",
              },
              geometry: {
                rings: [
                  [
                    [-112.124, 33.301],
                    [-112.123, 33.301],
                    [-112.123, 33.3],
                    [-112.124, 33.3],
                    [-112.124, 33.301],
                  ],
                ],
              },
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${url.href}`);
    });

    const response = await handleMaricopaLookup({ identifier: "114575" });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.query.mode).toBe("identifier");
    expect(data.noi.permitAuthCode).toBe("AZC114575");
    expect(data.parcels).toHaveLength(1);
    expect(data.parcels[0].apn).toBe("50072958");
    expect(data.parcels[0].apnDashed).toBe("500-72-958");
  });

  test("returns exact address candidates from assessor search", async () => {
    let queryCount = 0;

    globalThis.fetch = installFetchStub(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (
        url.pathname === "/arcgis/rest/services/Parcels/MapServer/0/query"
      ) {
        queryCount += 1;
        return jsonResponse({
          features:
            queryCount === 1
              ? [
                  {
                    attributes: {
                      APN: "50072958",
                      GIS_ACRES: 1.25,
                      OWNER_NAME: "TEST OWNER LLC",
                      PHYSICAL_ADDRESS: "16155 W ELWOOD ST",
                    },
                    geometry: {
                      rings: [
                        [
                          [-112.124, 33.301],
                          [-112.123, 33.301],
                          [-112.123, 33.3],
                          [-112.124, 33.3],
                          [-112.124, 33.301],
                        ],
                      ],
                    },
                  },
                ]
              : [],
        });
      }

      throw new Error(`Unexpected fetch: ${url.href}`);
    });

    const response = await handleMaricopaLookup({
      address: "16155 W Elwood St",
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.query.mode).toBe("address");
    expect(data.query.searchStrategy).toBe("exact");
    expect(data.addressLookup.exact).toHaveLength(1);
    expect(data.parcels[0].apnDashed).toBe("500-72-958");
  });
});
