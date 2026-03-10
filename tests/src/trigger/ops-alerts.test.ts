import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("@trigger.dev/sdk", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
  query: {
    execute: async () => ({ format: "json", results: [] }),
  },
  schedules: {
    task: <T>(definition: T) => definition,
  },
}));

mock.module("@lib/db/client", () => ({
  db: {
    run: () => Promise.resolve([]),
    query: () => ({
      all: () => Promise.resolve([]),
      get: async () => null,
      run: () => Promise.resolve([]),
    }),
  },
}));

describe("ops-alerts slot error selection", () => {
  afterEach(() => {
    mock.restore();
  });

  test("selects recent failed runs with slot-exhaustion error messages", async () => {
    const cacheBuster = `ops-alerts-${Date.now()}-${Math.random()}`;
    const { selectRecentDbSlotErrors } = await import(
      `../../../apps/trigger-dev/src/trigger/ops-alerts.ts?${cacheBuster}`
    );

    const now = Date.parse("2026-02-26T02:00:00.000Z");
    const rows = [
      {
        run_id: "run_recent_slots",
        task_identifier: "monday-sync-item",
        status: "System failure",
        error: {
          message:
            "PostgresError: remaining connection slots are reserved for roles with the SUPERUSER attribute",
        },
        triggered_at: "2026-02-26T01:59:45.000Z",
      },
      {
        run_id: "run_recent_other",
        task_identifier: "monday-sync-item",
        status: "Failed",
        error: { message: "network reset by peer" },
        triggered_at: "2026-02-26T01:59:50.000Z",
      },
      {
        run_id: "run_old_slots",
        task_identifier: "monday-sync-item",
        status: "Failed",
        error: { message: "too many clients already" },
        triggered_at: "2026-02-26T01:58:00.000Z",
      },
      {
        run_id: "run_non_terminal",
        task_identifier: "monday-sync-item",
        status: "Executing",
        error: { message: "too many clients already" },
        triggered_at: "2026-02-26T01:59:50.000Z",
      },
    ];

    const selected = selectRecentDbSlotErrors(rows, now);

    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      runId: "run_recent_slots",
      taskIdentifier: "monday-sync-item",
      status: "System failure",
    });
    expect(selected[0].errorMessage).toContain("remaining connection slots");
  });

  test("extracts nested error messages from structured payloads", async () => {
    const cacheBuster = `ops-alerts-nested-${Date.now()}-${Math.random()}`;
    const { getRunErrorMessage, hasDbSlotError } = await import(
      `../../../apps/trigger-dev/src/trigger/ops-alerts.ts?${cacheBuster}`
    );

    const message = getRunErrorMessage({
      error: { message: "PostgresError: too many clients already" },
    });

    expect(message).toContain("too many clients already");
    expect(hasDbSlotError(message)).toBe(true);
  });
});
