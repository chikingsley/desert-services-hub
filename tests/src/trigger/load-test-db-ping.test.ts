import { afterEach, describe, expect, mock, test } from "bun:test";

const sleepCalls: number[] = [];

mock.module("@trigger.dev/sdk", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
  schedules: {
    task: <T>(definition: T) => definition,
  },
  schemaTask: <T>(definition: T) => definition,
}));

mock.module("@lib/db/client", () => ({
  db: {
    run: (query: string, params?: unknown[]) => {
      void query;
      const value = params?.[0];
      sleepCalls.push(Number(value));
      return Promise.resolve([]);
    },
  },
}));

describe("load-test-db-ping task", () => {
  afterEach(() => {
    mock.restore();
    sleepCalls.length = 0;
    process.env.LOAD_TEST_DB_PING_QUEUE_CONCURRENCY = undefined;
  });

  test("uses conservative default queue concurrency", async () => {
    process.env.LOAD_TEST_DB_PING_QUEUE_CONCURRENCY = undefined;
    const cacheBuster = `load-test-db-ping-default-${Date.now()}-${Math.random()}`;
    const { loadTestDbPing } = await import(
      `../../../apps/trigger-dev/src/trigger/load-test-db-ping.ts?${cacheBuster}`
    );

    expect((loadTestDbPing as { queue?: unknown }).queue).toEqual({
      concurrencyLimit: 2,
      name: "load-test-db-ping",
    });
  });

  test("honors queue concurrency env override", async () => {
    process.env.LOAD_TEST_DB_PING_QUEUE_CONCURRENCY = "7";
    const cacheBuster = `load-test-db-ping-override-${Date.now()}-${Math.random()}`;
    const { loadTestDbPing } = await import(
      `../../../apps/trigger-dev/src/trigger/load-test-db-ping.ts?${cacheBuster}`
    );

    expect((loadTestDbPing as { queue?: unknown }).queue).toEqual({
      concurrencyLimit: 7,
      name: "load-test-db-ping",
    });
  });

  test("clamps hold time to safety max before pg_sleep", async () => {
    const cacheBuster = `load-test-db-ping-clamp-${Date.now()}-${Math.random()}`;
    const { loadTestDbPing } = await import(
      `../../../apps/trigger-dev/src/trigger/load-test-db-ping.ts?${cacheBuster}`
    );

    const task = loadTestDbPing as {
      run: (payload: { holdMs: number; label?: string }) => Promise<unknown>;
    };

    await task.run({ holdMs: 8_000, label: "clamp-test" });
    expect(sleepCalls).toHaveLength(1);
    expect(sleepCalls[0]).toBe(5);
  });
});
