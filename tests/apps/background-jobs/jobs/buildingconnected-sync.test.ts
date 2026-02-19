import { describe, expect, test } from "bun:test";
import { runBuildingConnectedSync } from "@background-jobs/jobs/buildingconnected-sync";
import type { BuildingConnectedSyncResult } from "../../../../packages/documents/bc-sync/processing";

function sampleSyncResult(): BuildingConnectedSyncResult {
  return {
    attachmentsPerMinute: 12,
    elapsedMs: 5000,
    errors: [],
    failed: 0,
    processed: 1,
    skipped: 0,
    succeeded: 1,
  };
}

describe("runBuildingConnectedSync", () => {
  test("skips sync when disabled", async () => {
    let called = false;
    const result = await runBuildingConnectedSync(
      { batchSize: 10, enabled: false },
      () => {
        called = true;
        return Promise.resolve(sampleSyncResult());
      }
    );

    expect(called).toBe(false);
    expect(result).toEqual({
      attempted: false,
      outcome: "disabled",
    });
  });

  test("runs sync when enabled and normalizes invalid batch size", async () => {
    let receivedBatch = 0;
    const result = await runBuildingConnectedSync(
      { batchSize: 0, enabled: true },
      ({ batchSize }) => {
        receivedBatch = batchSize;
        return Promise.resolve(sampleSyncResult());
      }
    );

    expect(receivedBatch).toBe(50);
    expect(result.attempted).toBe(true);
    expect(result.outcome).toBe("success");
    expect(result.syncResult?.processed).toBe(1);
  });

  test("returns error outcome when sync throws", async () => {
    const result = await runBuildingConnectedSync(
      { batchSize: 20, enabled: true },
      () => Promise.reject(new Error("boom"))
    );

    expect(result.attempted).toBe(true);
    expect(result.outcome).toBe("error");
    expect(result.error).toBe("boom");
  });
});
