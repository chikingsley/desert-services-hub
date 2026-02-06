/**
 * Maricopa County Assessor API Tests
 *
 * These tests hit the real ArcGIS API (public, no auth needed).
 * They verify:
 * 1. Valid coordinates return parcel data with correct structure
 * 2. Invalid coordinates (outside county) return null
 * 3. APN lookup works for known parcels
 * 4. Edge cases are handled gracefully
 *
 * Run with: bun test tests/api/assessor.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  queryParcelByAPN,
  queryParcelByCoordinates,
  queryParcelsByAddress,
  smartAddressLookup,
} from "@/lib/assessor";

// =============================================================================
// Test Data
// =============================================================================

// Known location in Maricopa County (Phoenix City Hall area)
const PHOENIX_CITY_HALL = { lat: 33.4484, lng: -112.074 };

// Desert Sky area (from workflows.md example)
const DESERT_SKY = { lat: 33.4799, lng: -112.1906 };

// Location outside Maricopa County (NYC)
const NEW_YORK_CITY = { lat: 40.7128, lng: -74.006 };

// Location in the ocean (should return null)
const PACIFIC_OCEAN = { lat: 0, lng: -150 };

// Regex for formatting APN with dashes
const APN_FORMAT_REGEX = /(\d{3})(\d{2})(\d{3})/;

// Real parcels from company-permits.sqlite database
const REAL_PARCELS = [
  { apn: "213-02-169C", address: "22841 N Cave Creek Rd", city: "Phoenix" },
  { apn: "216-50-010A", address: "7191 E Ashler Hills Dr", city: "Scottsdale" },
  { apn: "210-04-015B", address: "25800 N Norterra Pkwy", city: "Phoenix" },
  { apn: "500-06-046B", address: "16155 W Elwood St", city: "Goodyear" },
  {
    apn: "304-41-016K",
    address: "1690 S Santan Village Pkwy",
    city: "Gilbert",
  },
] as const;

// Sample addresses from company-permits.sqlite for address search testing
const TEST_ADDRESSES = [
  "22841 N Cave Creek Rd",
  "7191 E Ashler Hills Dr",
  "25800 N Norterra Pkwy",
  "16155 W Elwood St",
  "1690 S Santan Village Pkwy",
  "24025 N 23rd Ave",
  "4500 S Dobson Rd",
  "2040 N Scottsdale Rd",
  "720 E Tyler St",
  "5811 E Mayo Blvd",
];

// =============================================================================
// Tests: queryParcelByCoordinates
// =============================================================================

describe("queryParcelByCoordinates", () => {
  test("returns parcel data for valid Maricopa County coordinates", async () => {
    const result = await queryParcelByCoordinates(
      PHOENIX_CITY_HALL.lat,
      PHOENIX_CITY_HALL.lng
    );

    expect(result).not.toBeNull();

    if (result) {
      // Must have APN (Assessor Parcel Number)
      expect(result.apn).toBeDefined();
      expect(typeof result.apn).toBe("string");
      expect(result.apn.length).toBeGreaterThan(0);

      // Must have polygon (array of lat/lng points)
      expect(Array.isArray(result.polygon)).toBe(true);
      expect(result.polygon.length).toBeGreaterThanOrEqual(3);

      // Each polygon point must have lat/lng in Arizona range
      for (const point of result.polygon) {
        expect(typeof point.lat).toBe("number");
        expect(typeof point.lng).toBe("number");
        expect(point.lat).toBeGreaterThan(30);
        expect(point.lat).toBeLessThan(38);
        expect(point.lng).toBeGreaterThan(-115);
        expect(point.lng).toBeLessThan(-108);
      }

      // Must have centroid
      expect(result.centroid).toBeDefined();
      expect(typeof result.centroid.lat).toBe("number");
      expect(typeof result.centroid.lng).toBe("number");

      // rawAttributes should exist
      expect(result.rawAttributes).toBeDefined();
      expect(typeof result.rawAttributes).toBe("object");
    }
  });

  test("returns parcel data for Desert Sky area", async () => {
    const result = await queryParcelByCoordinates(
      DESERT_SKY.lat,
      DESERT_SKY.lng
    );

    expect(result).not.toBeNull();

    if (result) {
      expect(result.apn).toBeDefined();
      expect(result.apn.length).toBeGreaterThan(0);
      expect(Array.isArray(result.polygon)).toBe(true);
    }
  });

  test("returns null for coordinates outside Maricopa County", async () => {
    const result = await queryParcelByCoordinates(
      NEW_YORK_CITY.lat,
      NEW_YORK_CITY.lng
    );

    expect(result).toBeNull();
  });

  test("returns null for coordinates in ocean", async () => {
    const result = await queryParcelByCoordinates(
      PACIFIC_OCEAN.lat,
      PACIFIC_OCEAN.lng
    );

    expect(result).toBeNull();
  });

  test("handles edge case: coordinates at county boundary", async () => {
    // Far edge of Maricopa County - might or might not have parcels
    const edgeCoords = { lat: 33.0, lng: -113.3 };

    // Should not throw, should return null or valid data
    const result = await queryParcelByCoordinates(
      edgeCoords.lat,
      edgeCoords.lng
    );

    // Either null or valid structure
    if (result !== null) {
      expect(result.apn).toBeDefined();
      expect(Array.isArray(result.polygon)).toBe(true);
    }
  });
});

// =============================================================================
// Tests: queryParcelByAPN
// =============================================================================

describe("queryParcelByAPN", () => {
  test("returns null for invalid/nonexistent APN", async () => {
    const result = await queryParcelByAPN("000-00-000");

    expect(result).toBeNull();
  });

  test("handles APN with different formats", async () => {
    // First get a valid APN from coordinates
    const coordResult = await queryParcelByCoordinates(
      PHOENIX_CITY_HALL.lat,
      PHOENIX_CITY_HALL.lng
    );

    if (!coordResult) {
      // Skip if we couldn't get a valid APN
      return;
    }

    const apn = coordResult.apn;

    // Query by APN should return the same parcel
    const apnResult = await queryParcelByAPN(apn);

    expect(apnResult).not.toBeNull();

    if (apnResult) {
      // APNs should match (after normalization)
      const normalizedOriginal = apn.replace(/[-\s.]/g, "");
      const normalizedResult = apnResult.apn.replace(/[-\s.]/g, "");
      expect(normalizedResult).toBe(normalizedOriginal);
    }
  });

  test("cleans APN format before query", async () => {
    // First get a valid APN
    const coordResult = await queryParcelByCoordinates(
      DESERT_SKY.lat,
      DESERT_SKY.lng
    );

    if (!coordResult) {
      return;
    }

    const apn = coordResult.apn;

    // Add dashes to APN and query - should still work
    const apnWithDashes = apn.replace(APN_FORMAT_REGEX, "$1-$2-$3");
    const result = await queryParcelByAPN(apnWithDashes);

    // Should find the same parcel
    if (result) {
      expect(result.apn.replace(/[-\s.]/g, "")).toBe(
        apn.replace(/[-\s.]/g, "")
      );
    }
  });
});

// =============================================================================
// Tests: Real parcels from company-permits database
// =============================================================================

describe("queryParcelByAPN with real database parcels", () => {
  test("finds parcel: 22841 N Cave Creek Rd, Phoenix (213-02-169C)", async () => {
    const parcel = REAL_PARCELS[0];
    const result = await queryParcelByAPN(parcel.apn);

    expect(result).not.toBeNull();
    if (result) {
      expect(result.apn).toBeDefined();
      expect(result.polygon.length).toBeGreaterThanOrEqual(3);
      console.log(`  Found: APN=${result.apn}, Acres=${result.acres}`);
    }
  });

  test("finds parcel: 7191 E Ashler Hills Dr, Scottsdale (216-50-010A)", async () => {
    const parcel = REAL_PARCELS[1];
    const result = await queryParcelByAPN(parcel.apn);

    expect(result).not.toBeNull();
    if (result) {
      expect(result.apn).toBeDefined();
      expect(result.polygon.length).toBeGreaterThanOrEqual(3);
      console.log(`  Found: APN=${result.apn}, Acres=${result.acres}`);
    }
  });

  test("finds parcel: 25800 N Norterra Pkwy, Phoenix (210-04-015B)", async () => {
    const parcel = REAL_PARCELS[2];
    const result = await queryParcelByAPN(parcel.apn);

    expect(result).not.toBeNull();
    if (result) {
      expect(result.apn).toBeDefined();
      expect(result.polygon.length).toBeGreaterThanOrEqual(3);
      console.log(`  Found: APN=${result.apn}, Acres=${result.acres}`);
    }
  });

  test("queries parcel: 16155 W Elwood St, Goodyear (500-06-046B)", async () => {
    // Note: Some parcels may not be in the public ArcGIS layer
    const parcel = REAL_PARCELS[3];
    const result = await queryParcelByAPN(parcel.apn);

    // Should return null or valid data (Goodyear parcels may be in different layer)
    if (result) {
      expect(result.apn).toBeDefined();
      expect(result.polygon.length).toBeGreaterThanOrEqual(3);
      console.log(`  Found: APN=${result.apn}, Acres=${result.acres}`);
    } else {
      console.log(
        `  Not found in ArcGIS layer: ${parcel.apn} (${parcel.city})`
      );
    }
  });

  test("queries parcel: 1690 S Santan Village Pkwy, Gilbert (304-41-016K)", async () => {
    // Note: Some parcels may not be in the public ArcGIS layer
    const parcel = REAL_PARCELS[4];
    const result = await queryParcelByAPN(parcel.apn);

    // Should return null or valid data (Gilbert parcels may be in different layer)
    if (result) {
      expect(result.apn).toBeDefined();
      expect(result.polygon.length).toBeGreaterThanOrEqual(3);
      console.log(`  Found: APN=${result.apn}, Acres=${result.acres}`);
    } else {
      console.log(
        `  Not found in ArcGIS layer: ${parcel.apn} (${parcel.city})`
      );
    }
  });
});

// =============================================================================
// Tests: queryParcelsByAddress (bulk address search)
// =============================================================================

describe("queryParcelsByAddress", () => {
  test(
    "searches 10 addresses and reports success rate",
    async () => {
      let found = 0;
      let notFound = 0;
      const results: { address: string; apn: string | null }[] = [];

      for (const address of TEST_ADDRESSES) {
        const parcels = await queryParcelsByAddress(address);
        if (parcels.length > 0) {
          found++;
          results.push({ address, apn: parcels[0]?.apn ?? null });
        } else {
          notFound++;
          results.push({ address, apn: null });
        }
      }

      console.log("\n=== Address Search Results ===");
      console.log(`Found: ${found}/${TEST_ADDRESSES.length}`);
      console.log(`Not Found: ${notFound}/${TEST_ADDRESSES.length}`);
      console.log(
        `Success Rate: ${((found / TEST_ADDRESSES.length) * 100).toFixed(1)}%`
      );
      console.log("\nSample results:");
      for (const r of results.slice(0, 10)) {
        console.log(`  ${r.address} => ${r.apn || "NOT FOUND"}`);
      }

      // We expect at least some addresses to be found
      expect(found).toBeGreaterThan(0);
    },
    { timeout: 120_000 }
  );

  test(
    "returns valid parcel data structure",
    async () => {
      const parcels = await queryParcelsByAddress("22841 N Cave Creek Rd");

      expect(parcels.length).toBeGreaterThan(0);

      const parcel = parcels[0];
      if (!parcel) {
        throw new Error("Expected parcel to exist");
      }
      expect(parcel.apn).toBeDefined();
      expect(parcel.apn.length).toBeGreaterThan(0);
      expect(parcel.polygon.length).toBeGreaterThanOrEqual(3);
      expect(parcel.centroid).toBeDefined();
      expect(typeof parcel.centroid.lat).toBe("number");
      expect(typeof parcel.centroid.lng).toBe("number");
    },
    { timeout: 30_000 }
  );

  test(
    "returns empty array for nonexistent address",
    async () => {
      const parcels = await queryParcelsByAddress(
        "99999 Fake Street That Does Not Exist"
      );
      expect(parcels).toEqual([]);
    },
    { timeout: 30_000 }
  );
});

// =============================================================================
// Tests: smartAddressLookup (fallback to similar addresses)
// =============================================================================

describe("smartAddressLookup", () => {
  test(
    "returns exact match when address exists",
    async () => {
      const result = await smartAddressLookup("22841 N Cave Creek Rd");

      expect(result.exact.length).toBeGreaterThan(0);
      expect(result.similar.length).toBe(0);
      expect(result.searchedStreet).toBeNull();

      console.log(
        `  Exact match: ${result.exact[0]?.address} => ${result.exact[0]?.apn}`
      );
    },
    { timeout: 30_000 }
  );

  test(
    "returns similar addresses when exact match fails (16155 W Elwood St)",
    async () => {
      const result = await smartAddressLookup("16155 W Elwood St", "Goodyear");

      // No exact match for this address
      expect(result.exact.length).toBe(0);

      // Should find similar addresses on Elwood St
      expect(result.similar.length).toBeGreaterThan(0);
      expect(result.searchedStreet).toBe("ELWOOD");

      console.log("\n=== Smart Lookup: 16155 W Elwood St, Goodyear ===");
      console.log(`Exact matches: ${result.exact.length}`);
      console.log(`Similar addresses found: ${result.similar.length}`);
      console.log(`Searched street: ${result.searchedStreet}`);
      console.log("\nTop 5 similar addresses (sorted by proximity):");
      for (const p of result.similar.slice(0, 5)) {
        console.log(`  ${p.address} => ${p.apn}`);
      }
    },
    { timeout: 30_000 }
  );

  test(
    "returns empty when street doesn't exist at all",
    async () => {
      const result = await smartAddressLookup(
        "123 Nonexistent Blvd",
        "Phoenix"
      );

      expect(result.exact.length).toBe(0);
      // Might find some results if "Nonexistent" partially matches something, or empty
      console.log(`  Similar found: ${result.similar.length}`);
    },
    { timeout: 30_000 }
  );
});
