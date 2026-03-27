/**
 * Live AZDEQ NOI/CGP API — no mocks.
 */

import { describe, expect, test } from "vitest";

import {
  getCountyCode,
  isMaricopaCountyCode,
  parseNoiAcres,
  parseNoiCoordinates,
  resolveNoiRecord,
} from "../../src/noi-endpoints";
import { KNOWN_MARICOPA_NOI_IDENTIFIER } from "../text-fixtures/live-integration";

describe("noi-endpoints (live AZDEQ)", () => {
  test("resolveNoiRecord returns Maricopa CGP with coordinates and acreage", async () => {
    const { identifier, record, records } = await resolveNoiRecord(
      KNOWN_MARICOPA_NOI_IDENTIFIER
    );

    expect(identifier.ltfId).toBe("114575");
    expect(identifier.permitAuthCode).toBe("AZC114575");
    expect(records.length).toBeGreaterThan(0);
    expect(record).not.toBeNull();
    if (record === null) {
      throw new Error("expected NOI record");
    }

    expect(isMaricopaCountyCode(getCountyCode(record))).toBe(true);

    const { latitude, longitude } = parseNoiCoordinates(record);
    expect(latitude).not.toBeNull();
    expect(longitude).not.toBeNull();
    if (latitude === null || longitude === null) {
      throw new Error("expected NOI facility coordinates");
    }
    expect(Math.abs(latitude)).toBeLessThan(90);
    expect(Math.abs(longitude)).toBeLessThan(180);

    const acres = parseNoiAcres(record);
    expect(acres).not.toBeNull();
    if (acres === null) {
      throw new Error("expected acreage on NOI record");
    }
    expect(acres).toBeGreaterThan(0);
  });
});
