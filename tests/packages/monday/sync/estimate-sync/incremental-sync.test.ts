import { afterEach, describe, expect, mock, test } from "bun:test";

interface ChangedItemResult {
  itemIds: string[];
  latestTimestamp: Date | null;
  metadata: {
    truncated: boolean;
    reason?: "max_pages" | "max_item_ids" | "deadline" | "error";
  };
  totalEvents: number;
}

let changedItemResult: ChangedItemResult = {
  itemIds: [],
  latestTimestamp: null,
  totalEvents: 0,
  metadata: { truncated: false },
};
let changedItemError: Error | null = null;
const runCalls: Array<{ query: string; params: unknown[] }> = [];
let syncStateQueryResult: string | null = null;

mock.module("@lib/db/client", () => ({
  db: {
    query: () => ({
      get: async () =>
        syncStateQueryResult
          ? {
              value: syncStateQueryResult,
            }
          : null,
      all: async () => [],
      run: async () => [],
    }),
    run: (query: string, params: unknown[] = []) => {
      runCalls.push({ query, params });
      return Promise.resolve([]);
    },
  },
}));

mock.module("@monday/client/activity-log", () => ({
  getChangedItemIds: async () => {
    if (changedItemError) {
      throw changedItemError;
    }
    return changedItemResult;
  },
}));

afterEach(() => {
  changedItemResult = {
    itemIds: [],
    latestTimestamp: null,
    totalEvents: 0,
    metadata: { truncated: false },
  };
  syncStateQueryResult = null;
  runCalls.length = 0;
  changedItemError = null;
});

describe("syncEstimatesIncremental", () => {
  test("returns deduped estimate item IDs for small change sets", async () => {
    syncStateQueryResult = "2026-02-01T00:00:00.000Z";
    changedItemResult = {
      itemIds: ["111", "222", "111", "333"],
      latestTimestamp: new Date("2026-02-01T01:00:00.000Z"),
      totalEvents: 4,
      metadata: { truncated: false },
    };

    const { syncEstimatesIncremental } = await import(
      "@monday/sync/estimate-sync/incremental-sync"
    );
    const result = await syncEstimatesIncremental();

    expect(result.result.mode).toBe("incremental");
    expect(result.result.changedItemIds).toBe(3);
    expect(result.result.synced).toBe(3);
    expect(result.estimateItemIds).toEqual(["111", "222", "333"]);
    expect(result.estimateItemIds).toHaveLength(3);
    expect(result.latestTimestamp).toEqual(
      new Date("2026-02-01T01:00:00.000Z")
    );
    expect(runCalls).toHaveLength(0);
  });

  test("returns full-recommended mode when item count exceeds threshold", async () => {
    changedItemResult = {
      itemIds: Array.from({ length: 501 }, (_, i) => String(i + 1)),
      latestTimestamp: new Date("2026-02-01T01:00:00.000Z"),
      totalEvents: 501,
      metadata: { truncated: false },
    };

    const { syncEstimatesIncremental } = await import(
      "@monday/sync/estimate-sync/incremental-sync"
    );
    const result = await syncEstimatesIncremental();

    expect(result.result.mode).toBe("full_recommended");
    expect(result.result.changedItemIds).toBe(501);
    expect(result.result.synced).toBe(0);
    expect(result.estimateItemIds).toHaveLength(501);
    expect(result.latestTimestamp).toEqual(
      new Date("2026-02-01T01:00:00.000Z")
    );
    expect(runCalls).toHaveLength(0);
  });

  test("updates cursor when there are no changes", async () => {
    changedItemResult = {
      itemIds: [],
      latestTimestamp: new Date("2026-02-02T02:00:00.000Z"),
      totalEvents: 0,
      metadata: { truncated: false },
    };
    syncStateQueryResult = "2026-02-01T00:00:00.000Z";

    const { syncEstimatesIncremental } = await import(
      "@monday/sync/estimate-sync/incremental-sync"
    );
    const result = await syncEstimatesIncremental();

    expect(result.result.mode).toBe("incremental");
    expect(result.result.changedItemIds).toBe(0);
    expect(result.estimateItemIds).toEqual([]);
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]?.query).toContain("INSERT INTO sync_state");
    expect(result.latestTimestamp).toEqual(
      new Date("2026-02-02T02:00:00.000Z")
    );
  });

  test("falls back to full sync when activity log is truncated", async () => {
    changedItemResult = {
      itemIds: ["111", "222", "333"],
      latestTimestamp: new Date("2026-02-01T01:00:00.000Z"),
      totalEvents: 3,
      metadata: { truncated: true, reason: "max_pages" },
    };

    const { syncEstimatesIncremental } = await import(
      "@monday/sync/estimate-sync/incremental-sync"
    );
    const result = await syncEstimatesIncremental();

    expect(result.result.mode).toBe("full_recommended");
    expect(result.result.changedItemIds).toBe(3);
    expect(result.result.synced).toBe(0);
    expect(result.estimateItemIds).toEqual(["111", "222", "333"]);
    expect(result.latestTimestamp).toEqual(
      new Date("2026-02-01T01:00:00.000Z")
    );
  });

  test("falls back to full sync when activity log hits deadline", async () => {
    changedItemResult = {
      itemIds: ["111", "222", "333"],
      latestTimestamp: new Date("2026-02-01T01:00:00.000Z"),
      totalEvents: 3,
      metadata: { truncated: true, reason: "deadline" },
    };

    const { syncEstimatesIncremental } = await import(
      "@monday/sync/estimate-sync/incremental-sync"
    );
    const result = await syncEstimatesIncremental({ maxDurationMs: 1 });

    expect(result.result.mode).toBe("full_recommended");
    expect(result.result.changedItemIds).toBe(3);
    expect(result.result.synced).toBe(0);
    expect(result.estimateItemIds).toHaveLength(3);
    expect(result.result.metadata.reason).toBe("deadline");
    expect(result.latestTimestamp).toEqual(
      new Date("2026-02-01T01:00:00.000Z")
    );
  });

  test("falls back to full sync when activity log query fails", async () => {
    changedItemError = new Error("monday api unavailable");

    const { syncEstimatesIncremental } = await import(
      "@monday/sync/estimate-sync/incremental-sync"
    );
    const result = await syncEstimatesIncremental();

    expect(result.result.mode).toBe("full_recommended");
    expect(result.result.changedItemIds).toBe(0);
    expect(result.result.metadata.reason).toBe("error");
    expect(result.result.totalEvents).toBe(0);
    expect(result.estimateItemIds).toEqual([]);
    expect(result.latestTimestamp).toBeNull();
    expect(runCalls).toHaveLength(0);
  });
});
