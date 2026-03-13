import { afterEach, describe, expect, mock, test } from "bun:test";

const runBackfillCalls: Array<Record<string, unknown>> = [];

mock.module("@monday/relation-backfill", () => ({
  runMondayRelationBackfill: async (options: Record<string, unknown>) => {
    runBackfillCalls.push(options);
    return {
      results: [
        {
          failed: 0,
          resolved: 2,
          scope: "estimating-account",
          skipped: 1,
          total: 3,
        },
      ],
    };
  },
}));

describe("backfill-rel command", () => {
  afterEach(() => {
    runBackfillCalls.length = 0;
  });

  test("parses scope, active-only, dry-run, and limit flags", async () => {
    const logSpy = mock(() => {});
    const errorSpy = mock(() => {});
    const originalLog = console.log;
    const originalError = console.error;
    console.log = logSpy;
    console.error = errorSpy;

    try {
      const cacheBuster = `backfill-rel-${Date.now()}-${Math.random()}`;
      const { backfillHandlers } = await import(
        `../../../../packages/monday/cli/commands/backfill.ts?${cacheBuster}`
      );

      await backfillHandlers["backfill-rel"]([
        "backfill-rel",
        "estimating-account",
        "--active-only",
        "--dry-run",
        "--limit",
        "5",
      ]);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    expect(runBackfillCalls).toEqual([
      {
        activeOnly: true,
        dryRun: true,
        limit: 5,
        scope: "estimating-account",
      },
    ]);
    expect(logSpy).toHaveBeenCalled();
  });

  test("rejects invalid limit values", async () => {
    const cacheBuster = `backfill-rel-invalid-${Date.now()}-${Math.random()}`;
    const { backfillHandlers } = await import(
      `../../../../packages/monday/cli/commands/backfill.ts?${cacheBuster}`
    );

    await expect(
      backfillHandlers["backfill-rel"]([
        "backfill-rel",
        "estimating-account",
        "--limit",
        "0",
      ])
    ).rejects.toThrow("Usage: backfill-rel");
  });
});
