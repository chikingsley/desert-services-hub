import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CgpSqliteRepository } from "../../../packages/azdeq-cgp-sync/src/sqlite-repo";
import {
  hashPermitPayload,
  normalizePermitRecord,
  runCgpLtfIdRangeSync,
} from "../../../packages/azdeq-cgp-sync/src/sync";
import type { CgpPermitRecord } from "../../../packages/azdeq-cgp-sync/src/types";

const EXAMPLE_RECORD: CgpPermitRecord = {
  ltfIdno: "114921",
  permitType: "CGP",
  dateApplied: "02/20/2026",
  dateSubmitted: "02/19/2026",
  projType: "ADOT",
  facilityName: "F056201C- BOB STUMP MEMORIAL HWY (SR 303L) 51ST AVE TO I-17",
  companyName: "ARIZONA DEPARTMENT OF TRANSPORTATION - CENTRAL DISTRICT",
  rcoName: "RANDY EVERETT",
  ltfFacilityDetails: {
    placeAddress: null,
    facilityCounty: { countyCode: "04013" },
    ltfCatName:
      "AZPDES, Stormwater Construction General Permit Greater than 5 Acres",
    issuedDate: "02/20/2026",
    ltfStatus: "ISSUED",
    latLongDetails: {
      latitude: "33.769176",
      longitude: "-112.132648",
    },
  },
  companyAddress: {
    address: {
      address: "2140 W HILTON AVE",
      aptSuite: null,
      city: "PHOENIX",
      state: "AZ",
      zip: "85009",
      countyCode: "04013",
    },
  },
  swpppDetails: {
    fname: "Mike",
    lname: "Ming",
    email: "mike@arguscs.com",
    phone: "6022375967",
    ext: null,
  },
  permitAuthCode: "AZC114921",
  totalProjectArea: null,
  permitProjectArea: "275.28",
  conStartDate: "02/23/2026",
  conEndDate: "08/28/2028",
  commonAreaInd: "N",
  outfalls: [],
};

const TEMP_DIRS: string[] = [];

function createTempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "azdeq-cgp-sync-test-"));
  TEMP_DIRS.push(dir);
  return join(dir, "sync.sqlite");
}

function createRecord(id: number): CgpPermitRecord {
  return {
    ...EXAMPLE_RECORD,
    ltfIdno: `${id}`,
    permitAuthCode: `AZC${id}`,
    facilityName: `FACILITY ${id}`,
  };
}

afterEach(() => {
  for (const dir of TEMP_DIRS.splice(0, TEMP_DIRS.length)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("normalizePermitRecord", () => {
  test("maps and parses key fields", () => {
    const normalized = normalizePermitRecord(EXAMPLE_RECORD);

    expect(normalized.ltfIdno).toBe("114921");
    expect(normalized.permitAuthCode).toBe("AZC114921");
    expect(normalized.countyCode).toBe("04013");
    expect(normalized.status).toBe("ISSUED");
    expect(normalized.permitCategoryName).toContain("Greater than 5 Acres");
    expect(normalized.submittedDateIso).toBe("2026-02-19");
    expect(normalized.appliedDateIso).toBe("2026-02-20");
    expect(normalized.issuedDateIso).toBe("2026-02-20");
    expect(normalized.permitProjectArea).toBe(275.28);
    expect(normalized.totalProjectArea).toBeNull();
    expect(normalized.facilityLatitude).toBe(33.769_176);
    expect(normalized.facilityLongitude).toBe(-112.132_648);
  });

  test("keeps nulls when values are empty or invalid", () => {
    const invalidRecord: CgpPermitRecord = {
      ...EXAMPLE_RECORD,
      dateApplied: "not-a-date",
      dateSubmitted: null,
      conStartDate: "13/99/2026",
      permitProjectArea: "not-a-number",
      ltfFacilityDetails: {
        ...EXAMPLE_RECORD.ltfFacilityDetails,
        latLongDetails: {
          latitude: "nope",
          longitude: "also-nope",
        },
      },
    };

    const normalized = normalizePermitRecord(invalidRecord);
    expect(normalized.appliedDateIso).toBeNull();
    expect(normalized.submittedDateIso).toBeNull();
    expect(normalized.constructionStartDateIso).toBeNull();
    expect(normalized.permitProjectArea).toBeNull();
    expect(normalized.facilityLatitude).toBeNull();
    expect(normalized.facilityLongitude).toBeNull();
  });
});

describe("hashPermitPayload", () => {
  test("is stable for identical payloads", () => {
    const one = hashPermitPayload(EXAMPLE_RECORD);
    const two = hashPermitPayload({ ...EXAMPLE_RECORD });
    expect(one).toBe(two);
  });

  test("changes when payload changes", () => {
    const one = hashPermitPayload(EXAMPLE_RECORD);
    const changed = hashPermitPayload({
      ...EXAMPLE_RECORD,
      companyName: "DIFFERENT",
    });
    expect(one).not.toBe(changed);
  });
});

describe("runCgpLtfIdRangeSync", () => {
  test("pulls all ids in range and upserts found records", async () => {
    const dbPath = createTempDbPath();
    const originalFetch = globalThis.fetch;
    const seenIds: string[] = [];
    const attemptsById = new Map<string, number>();

    const mockedFetch = ((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const ltfid = url.searchParams.get("ltfid") ?? "";
      seenIds.push(ltfid);
      const attempts = (attemptsById.get(ltfid) ?? 0) + 1;
      attemptsById.set(ltfid, attempts);

      if (ltfid === "4" && attempts <= 3) {
        return new Response("temporary server error", {
          status: 500,
          headers: { "content-type": "text/plain" },
        });
      }

      if (ltfid === "3" || ltfid === "5") {
        return new Response(JSON.stringify([createRecord(Number(ltfid))]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof globalThis.fetch;
    globalThis.fetch = mockedFetch;

    try {
      const summary = await runCgpLtfIdRangeSync({
        dbPath,
        startId: 3,
        endId: 6,
        concurrency: 2,
        progressEvery: 2,
        retryFailedPasses: 2,
        failedRetryDelayMs: 0,
      });

      expect(summary.requestedLtfIds).toBe(4);
      expect(summary.matchedLtfIds).toBe(2);
      expect(summary.fetchedRecords).toBe(2);
      expect(summary.insertedRecords).toBe(2);
      expect(summary.updatedRecords).toBe(0);
      expect(summary.unchangedRecords).toBe(0);
      expect(summary.failedAttemptCount).toBe(1);
      expect(summary.failedLtfIdCount).toBe(0);
      expect(summary.failedLtfIds).toEqual([]);
      expect(new Set(seenIds)).toEqual(new Set(["3", "4", "5", "6"]));

      const repository = new CgpSqliteRepository(dbPath);
      repository.init();
      expect(repository.countPermits()).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("rejects invalid ranges", async () => {
    const dbPath = createTempDbPath();
    await expect(
      runCgpLtfIdRangeSync({
        dbPath,
        startId: 10,
        endId: 9,
      })
    ).rejects.toThrow("startId must be <= endId.");
  });
});
