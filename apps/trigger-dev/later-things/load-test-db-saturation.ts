import { databasePath } from "@lib/db/client";
import { logger, schemaTask } from "@trigger.dev/sdk";
import postgres from "postgres";
import { z } from "zod";
import { taskQueue } from "./queue";

const MAX_HOLD_MS = 10_000;
const MAX_CONNECTIONS = 200;
const FALLBACK_TRIGGER_DB_URL =
  "postgresql://postgres:9a56bd3fe251b45f68197d9616a99220@postgres:5432/main?sslmode=disable";
const LOAD_TEST_DB_SATURATION_QUEUE = taskQueue(
  "load-test-db-saturation-hi",
  "LOAD_TEST_DB_SATURATION_QUEUE_CONCURRENCY",
  4
);
const loadTestSchema = z.object({
  holdMs: z.number().int().min(0).max(MAX_HOLD_MS).default(2500),
  connections: z.number().int().min(1).max(MAX_CONNECTIONS).default(40),
  label: z.string().trim().max(120).optional(),
});

async function closeClients(clients: postgres.Sql[]): Promise<void> {
  await Promise.allSettled(clients.map((client) => client.end()));
}

export const loadTestDbSaturation = schemaTask({
  id: "load-test-db-saturation",
  queue: LOAD_TEST_DB_SATURATION_QUEUE,
  schema: loadTestSchema,
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async ({ holdMs, connections, label }) => {
    const dbUrl = (
      process.env.LOAD_TEST_DB_URL ??
      process.env.DIRECT_URL ??
      databasePath ??
      FALLBACK_TRIGGER_DB_URL
    ).trim();
    if (!dbUrl) {
      throw new Error("DATABASE_URL is not configured for saturation test");
    }
    const targetHost = (() => {
      try {
        return new URL(dbUrl).host;
      } catch {
        return "unknown";
      }
    })();

    const boundedHoldMs = Math.max(0, Math.min(MAX_HOLD_MS, holdMs));
    const boundedConnections = Math.max(
      1,
      Math.min(MAX_CONNECTIONS, connections)
    );
    const sleepSeconds = boundedHoldMs / 1000;

    const clients = Array.from(
      { length: boundedConnections },
      () => postgres(dbUrl, { max: 1, prepare: false })
    );

    try {
      await Promise.all(
        clients.map((client) =>
          client.unsafe("SELECT pg_sleep($1)", [sleepSeconds])
        )
      );
    } finally {
      await closeClients(clients);
    }

    logger.info("load-test-db-saturation complete", {
      holdMs: boundedHoldMs,
      connections: boundedConnections,
      label: label ?? null,
      targetHost,
    });

    return {
      ok: true as const,
      holdMs: boundedHoldMs,
      connections: boundedConnections,
      label: label ?? null,
      targetHost,
    };
  },
});
