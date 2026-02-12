import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { db } from "@lib/db/hub";
import type { MondayItemRich } from "@monday/client";
import { ESTIMATING_COLUMNS } from "@monday/types";

const TEST_PREFIX = "_TEST_DELETE_ME_EST_SYNC_";
const TEST_MONDAY_PREFIX = `${TEST_PREFIX}MONDAY_`;

let mockItems: MondayItemRich[] = [];

mock.module("@monday/client", () => ({
  getItemsRich: async () => mockItems,
  query: async () => ({ items: [] }),
}));

const { syncEstimates } = await import("./sync");

function makeItem(mondayItemId: string): MondayItemRich {
  return {
    id: mondayItemId,
    name: `${TEST_PREFIX}Estimate ${mondayItemId}`,
    groupId: "group-test",
    groupTitle: "Open",
    url: `https://monday.com/boards/7943937851/pulses/${mondayItemId}`,
    columns: {
      [ESTIMATING_COLUMNS.ESTIMATE_ID.id]: "E-TEST-001",
      [ESTIMATING_COLUMNS.CONTRACTOR.id]: "Test Contractor",
      [ESTIMATING_COLUMNS.BID_STATUS.id]: "Bid Sent",
      [ESTIMATING_COLUMNS.BID_VALUE.id]: "1000",
      [ESTIMATING_COLUMNS.AWARDED_VALUE.id]: "0",
      [ESTIMATING_COLUMNS.BID_SOURCE.id]: "Referral",
      [ESTIMATING_COLUMNS.AWARDED.id]: "No",
      [ESTIMATING_COLUMNS.DUE_DATE.id]: "2026-02-11",
      [ESTIMATING_COLUMNS.LOCATION.id]: "Phoenix",
      [ESTIMATING_COLUMNS.SHAREPOINT_URL.id]: null,
    },
    columnValues: [],
  };
}

beforeEach(async () => {
  mockItems = [];
  await db
    .prepare("DELETE FROM estimates WHERE monday_item_id LIKE ?")
    .run(`${TEST_MONDAY_PREFIX}%`);
});

afterAll(async () => {
  await db
    .prepare("DELETE FROM estimates WHERE monday_item_id LIKE ?")
    .run(`${TEST_MONDAY_PREFIX}%`);

  const remaining = (await db
    .prepare(
      "SELECT count(*)::int AS count FROM estimates WHERE monday_item_id LIKE ?"
    )
    .get(`${TEST_MONDAY_PREFIX}%`)) as { count: number } | null;
  if ((remaining?.count ?? 0) > 0) {
    throw new Error(
      `Cleanup failed for estimate sync integration tests: ${remaining?.count} rows remain`
    );
  }
});

describe("syncEstimates integration", () => {
  test("creates a baseline current version for newly synced estimates", async () => {
    const mondayItemId = `${TEST_MONDAY_PREFIX}NEW_1`;
    mockItems = [makeItem(mondayItemId)];

    const result = await syncEstimates();
    expect(result.errors).toBe(0);
    expect(result.upserted).toBe(1);

    const estimate = (await db
      .prepare("SELECT id FROM estimates WHERE monday_item_id = ?")
      .get(mondayItemId)) as { id: number } | null;
    expect(estimate).toBeTruthy();
    if (!estimate) {
      throw new Error("Expected synced estimate row");
    }

    const versions = (await db
      .prepare(
        `SELECT version_number, is_current, source
         FROM estimate_versions
         WHERE estimate_id = ?`
      )
      .all(estimate.id)) as Array<{
      version_number: number;
      is_current: number;
      source: string;
    }>;

    expect(versions).toHaveLength(1);
    expect(versions[0]?.version_number).toBe(1);
    expect(versions[0]?.is_current).toBe(1);
    expect(versions[0]?.source).toBe("sync");
  });

  test("heals previously poisoned estimate rows (missing versions)", async () => {
    const mondayItemId = `${TEST_MONDAY_PREFIX}POISONED_1`;
    const inserted = (await db.run(
      `INSERT INTO estimates (monday_item_id, name, bid_status)
       VALUES (?, ?, ?)
       RETURNING id`,
      [mondayItemId, `${TEST_PREFIX}Poisoned`, "Bid Sent"]
    )) as Array<{ id: number }>;
    const estimateId = inserted[0]?.id;
    expect(estimateId).toBeTruthy();
    if (!estimateId) {
      throw new Error("Expected inserted poisoned estimate id");
    }

    const beforeCount = (await db
      .prepare(
        "SELECT count(*)::int AS count FROM estimate_versions WHERE estimate_id = ?"
      )
      .get(estimateId)) as { count: number } | null;
    expect(beforeCount?.count).toBe(0);

    mockItems = [makeItem(mondayItemId)];
    const first = await syncEstimates();
    expect(first.errors).toBe(0);

    const afterFirst = (await db
      .prepare(
        "SELECT count(*)::int AS count FROM estimate_versions WHERE estimate_id = ?"
      )
      .get(estimateId)) as { count: number } | null;
    expect(afterFirst?.count).toBe(1);

    const second = await syncEstimates();
    expect(second.errors).toBe(0);

    const afterSecond = (await db
      .prepare(
        "SELECT count(*)::int AS count FROM estimate_versions WHERE estimate_id = ?"
      )
      .get(estimateId)) as { count: number } | null;
    expect(afterSecond?.count).toBe(1);
  });
});
