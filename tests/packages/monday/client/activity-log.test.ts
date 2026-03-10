import { afterEach, describe, expect, mock, test } from "bun:test";

interface ActivityLogResponse {
  boards: {
    activity_logs: Array<{
      created_at: string;
      data: string;
      entity: string;
      event: string;
      id: string;
      user_id: string;
    }>;
  }[];
}

const BOARD_ID = "7943937851";
const SINCE = new Date("2026-02-10T00:00:00.000Z");

let queryCalls = 0;
let mockPages: ActivityLogResponse[] = [];
let queryError: Error | null = null;
const baseTimestamp = new Date("2026-02-01T00:00:00.000Z");

mock.module("@monday/client/query", () => ({
  query: async () => {
    if (queryError) {
      throw queryError;
    }

    queryCalls += 1;
    return mockPages.shift() ?? { boards: [{ activity_logs: [] }] };
  },
}));

const { getChangedItemIds } = await import("@monday/client/activity-log");

function createLog(
  id: number
): ActivityLogResponse["boards"][number]["activity_logs"][number] {
  const createdAt = String(1_700_000_000_000_000 * 10); // arbitrary stable timestamp
  return {
    created_at: createdAt,
    data: JSON.stringify({ pulse_id: id }),
    entity: "pulse",
    event: "update_column_value",
    id: String(id),
    user_id: "user-1",
  };
}

describe("getChangedItemIds", () => {
  afterEach(() => {
    queryError = null;
  });

  test("stops after reaching maxItemIds cap", async () => {
    queryCalls = 0;
    mockPages = [
      {
        boards: [
          {
            activity_logs: [createLog(1), createLog(2)],
          },
        ],
      },
      {
        boards: [
          {
            activity_logs: [createLog(3), createLog(5), createLog(6)],
          },
        ],
      },
      {
        boards: [{ activity_logs: [createLog(7)] }],
      },
    ];

    const result = await getChangedItemIds(BOARD_ID, SINCE, {
      maxItemIds: 3,
      pageSize: 2,
    });

    expect(result.itemIds).toHaveLength(5);
    expect(result.metadata).toEqual({
      truncated: true,
      reason: "max_item_ids",
    });
    expect(queryCalls).toBe(2);
  });

  test("respects explicit maxPages", async () => {
    queryCalls = 0;
    mockPages = [
      { boards: [{ activity_logs: [createLog(1), createLog(2)] }] },
      { boards: [{ activity_logs: [createLog(3), createLog(4)] }] },
      { boards: [{ activity_logs: [createLog(5)] }] },
    ];

    const result = await getChangedItemIds(BOARD_ID, SINCE, {
      maxPages: 1,
      maxItemIds: 10,
      pageSize: 2,
    });

    expect(result.itemIds).toHaveLength(2);
    expect(result.metadata).toEqual({
      truncated: true,
      reason: "max_pages",
    });
    expect(queryCalls).toBe(1);
  });

  test("returns unique pulse IDs across pages", async () => {
    queryCalls = 0;
    mockPages = [
      {
        boards: [
          {
            activity_logs: [createLog(1), createLog(2), createLog(1)],
          },
        ],
      },
      { boards: [{ activity_logs: [createLog(2), createLog(3)] }] },
      { boards: [{ activity_logs: [] }] },
    ];

    const result = await getChangedItemIds(BOARD_ID, SINCE, {
      maxPages: 10,
      pageSize: 3,
    });

    expect(result.itemIds).toEqual(["1", "2", "3"]);
    expect(result.totalEvents).toBe(5);
    expect(result.metadata).toEqual({
      truncated: false,
      reason: undefined,
    });
  });

  test("respects deadline", async () => {
    queryCalls = 0;
    mockPages = [
      { boards: [{ activity_logs: [createLog(1)] }] },
      { boards: [{ activity_logs: [createLog(2)] }] },
    ];

    const result = await getChangedItemIds(BOARD_ID, baseTimestamp, {
      deadlineMs: baseTimestamp.getTime(),
      maxPages: 10,
      pageSize: 2,
    });

    expect(result.itemIds).toHaveLength(0);
    expect(result.metadata).toEqual({
      truncated: true,
      reason: "deadline",
    });
    expect(queryCalls).toBe(0);
  });

  test("returns truncated state on query error", async () => {
    queryCalls = 0;
    queryError = new Error("network failure");
    mockPages = [
      {
        boards: [{ activity_logs: [createLog(1), createLog(2)] }],
      },
    ];

    const result = await getChangedItemIds(BOARD_ID, baseTimestamp, {
      maxPages: 10,
      pageSize: 2,
    });

    expect(result.itemIds).toHaveLength(0);
    expect(result.metadata).toEqual({
      truncated: true,
      reason: "error",
    });
    expect(queryCalls).toBe(0);
  });
});
