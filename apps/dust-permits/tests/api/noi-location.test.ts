import { describe, expect, test } from "bun:test";
import type { ParcelData } from "@/lib/assessor";
import type { AzdeqCgpRecord } from "@/lib/noi-endpoints";
import {
  getNoiCoordinateCandidates,
  resolveParcelFromNoiRecord,
  shouldSkipParcelMapDraw,
} from "@/lib/noi-location";

function makeParcel(overrides: Partial<ParcelData> = {}): ParcelData {
  return {
    acres: 4.5,
    address: "4588 E CACTUS RD",
    apn: "16725167",
    centroid: { lat: 33.60117, lng: -111.98433 },
    owner: "PV LAND SPE LLC",
    polygon: [
      { lat: 33.601, lng: -111.9845 },
      { lat: 33.6013, lng: -111.9845 },
      { lat: 33.6013, lng: -111.9841 },
      { lat: 33.601, lng: -111.9841 },
    ],
    rawAttributes: {},
    ...overrides,
  };
}

describe("getNoiCoordinateCandidates", () => {
  test("returns primary point first, then unique outfalls", () => {
    const record: AzdeqCgpRecord = {
      ltfFacilityDetails: {
        latLongDetails: { latitude: "33.1000001", longitude: "-112.2000001" },
      },
      outfalls: [
        { latLongDetails: { latitude: "33.1000001", longitude: "-112.2000001" } },
        { latLongDetails: { latitude: "33.2", longitude: "-112.3" } },
      ],
    };

    expect(getNoiCoordinateCandidates(record)).toEqual([
      {
        index: 0,
        latitude: 33.1000001,
        longitude: -112.2000001,
        source: "primary",
      },
      {
        index: 1,
        latitude: 33.2,
        longitude: -112.3,
        source: "outfall",
      },
    ]);
  });
});

describe("resolveParcelFromNoiRecord", () => {
  test("falls back from primary coordinates to outfall coordinates", async () => {
    const calls: Array<[number, number]> = [];
    const parcel = makeParcel({ apn: "22082018N", owner: "SIMONCRE BUDDY LLC" });
    const record: AzdeqCgpRecord = {
      ltfFacilityDetails: {
        latLongDetails: { latitude: "33.393196", longitude: "-111.595311" },
      },
      outfalls: [
        { latLongDetails: { latitude: "33.39184", longitude: "-111.596083" } },
      ],
    };

    const resolved = await resolveParcelFromNoiRecord(record, {
      queryParcelByCoordinates: async (lat, lng) => {
        calls.push([lat, lng]);
        if (lat === 33.39184 && lng === -111.596083) {
          return parcel;
        }
        return null;
      },
      smartAddressLookup: async () => ({
        exact: [],
        searchedStreet: null,
        similar: [],
      }),
    });

    expect(calls).toEqual([
      [33.393196, -111.595311],
      [33.39184, -111.596083],
    ]);
    expect(resolved.parcelLookupSource).toBe("outfall");
    expect(resolved.parcel?.apn).toBe("22082018N");
  });

  test("falls back to exact address lookup when no coordinate hits a parcel", async () => {
    const parcel = makeParcel();
    const record: AzdeqCgpRecord = {
      ltfFacilityDetails: {
        latLongDetails: { latitude: "33.599498", longitude: "-111.98246" },
        placeAddress: {
          address: {
            address: "4588 E CACTUS RD",
            city: "PHOENIX",
            state: "AZ",
            zip: "85032",
          },
        },
      },
      outfalls: [],
    };

    const resolved = await resolveParcelFromNoiRecord(record, {
      queryParcelByCoordinates: async () => null,
      smartAddressLookup: async () => ({
        exact: [parcel],
        searchedStreet: null,
        similar: [],
      }),
    });

    expect(resolved.parcelLookupSource).toBe("address-exact");
    expect(resolved.parcel?.apn).toBe("16725167");
    expect(resolved.searchedAddress).toContain("4588 E CACTUS RD");
  });
});

describe("shouldSkipParcelMapDraw", () => {
  test("requires manual map when parcel acreage is much larger than disturbed acreage", () => {
    expect(
      shouldSkipParcelMapDraw({
        disturbedAcres: 1.1,
        parcelAcres: 4.94,
      })
    ).toBe(true);

    expect(
      shouldSkipParcelMapDraw({
        disturbedAcres: 11.14,
        parcelAcres: 22.14,
      })
    ).toBe(false);
  });
});
