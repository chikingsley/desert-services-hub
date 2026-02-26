import { db } from "@lib/db/client";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const LOAD_TEST_QUEUE_NAME = "load-test-db-ping";
const MAX_HOLD_MS = 5_000;

function readPositiveIntEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return parsed;
  }

  return fallback;
}

const LOAD_TEST_QUEUE_CONCURRENCY = readPositiveIntEnv(
  "LOAD_TEST_DB_PING_QUEUE_CONCURRENCY",
  2
);

const loadTestSchema = z.object({
  holdMs: z.number().int().min(0).max(MAX_HOLD_MS).default(250),
  label: z.string().trim().max(120).optional(),
});

export const loadTestDbPing = schemaTask({
  id: "load-test-db-ping",
  queue: {
    name: LOAD_TEST_QUEUE_NAME,
    concurrencyLimit: LOAD_TEST_QUEUE_CONCURRENCY,
  },
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
