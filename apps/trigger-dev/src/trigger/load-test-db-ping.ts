import { db } from "@lib/db/client";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { taskQueue } from "./queue";

const MAX_HOLD_MS = 5000;
const LOAD_TEST_DB_PING_QUEUE = taskQueue(
  "load-test-db-ping",
  "LOAD_TEST_DB_PING_QUEUE_CONCURRENCY",
  2
);
const loadTestSchema = z.object({
  holdMs: z.number().int().min(0).max(MAX_HOLD_MS).default(250),
  label: z.string().trim().max(120).optional(),
});

export const loadTestDbPing = schemaTask({
  id: "load-test-db-ping",
  queue: LOAD_TEST_DB_PING_QUEUE,
  schema: loadTestSchema,
  maxDuration: 60,
  retry: { maxAttempts: 1 },
  run: async ({ holdMs, label }) => {
    const boundedHoldMs = Math.max(0, Math.min(MAX_HOLD_MS, holdMs));
    const holdSeconds = boundedHoldMs / 1000;

    await db.run("SELECT pg_sleep($1)", [holdSeconds]);

    logger.info("load-test-db-ping complete", {
      holdMs: boundedHoldMs,
      label: label ?? null,
    });

    return {
      ok: true as const,
      holdMs: boundedHoldMs,
      label: label ?? null,
    };
  },
});
