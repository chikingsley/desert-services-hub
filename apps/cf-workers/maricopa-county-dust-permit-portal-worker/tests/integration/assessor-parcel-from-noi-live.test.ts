/**
 * Live Maricopa Assessor MapServer — uses NOI facility coordinates; no mocks.
 */

import { describe, expect, test } from "vitest";

import { queryParcelByCoordinates } from "../../src/assessor";
import { parseNoiCoordinates, resolveNoiRecord } from "../../src/noi-endpoints";
import {
  haversineMeters,
  KNOWN_MARICOPA_NOI_IDENTIFIER,
} from "../text-fixtures/live-integration";

describe("assessor (live ArcGIS, chained from NOI)", () => {
  test("NOI facility coordinates land in the assessor parcel (centroid nearby)", async () => {
    const { record } = await resolveNoiRecord(KNOWN_MARICOPA_NOI_IDENTIFIER);
    expect(record).not.toBeNull();
    if (record === null) {
      throw new Error("expected NOI record");
    }

    const { latitude, longitude } = parseNoiCoordinates(record);
    expect(latitude).not.toBeNull();
    expect(longitude).not.toBeNull();
    if (latitude === null || longitude === null) {
      throw new Error("expected NOI facility coordinates");
    }

    const parcel = await queryParcelByCoordinates(latitude, longitude);
    expect(parcel).not.toBeNull();
    if (parcel === null) {
      throw new Error("expected parcel at NOI coordinates");
    }

    expect(parcel.polygon.length).toBeGreaterThan(2);
    expect(parcel.apn.length).toBeGreaterThan(0);

    const noiPoint = { lat: latitude, lng: longitude };
    const meters = haversineMeters(noiPoint, parcel.centroid);
    // Facility point is on the parcel; centroid can be hundreds of meters away on large parcels.
    expect(meters).toBeLessThan(1500);
  });
});
