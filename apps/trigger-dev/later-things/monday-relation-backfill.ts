import { runMondayRelationBackfill } from "@monday/relation-backfill";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { taskQueue } from "./queue";

const MONDAY_RELATION_BACKFILL_QUEUE = taskQueue(
  "monday-relation-backfill",
  "MONDAY_RELATION_BACKFILL_QUEUE_CONCURRENCY",
  1
);

export const mondayRelationBackfill = schemaTask({
  id: "monday-relation-backfill",
  queue: MONDAY_RELATION_BACKFILL_QUEUE,
  schema: z.object({
    scope: z
      .enum(["all", "estimating-contacts", "estimating-account"])
      .default("all"),
    itemIds: z.array(z.string().min(1)).optional(),
    dryRun: z.boolean().default(false),
  }),
  maxDuration: 1800,
  retry: { maxAttempts: 1 },
  run: async ({ scope, itemIds, dryRun }) => {
    logger.info("Starting Monday relation backfill", {
      scope,
      dryRun,
      itemIds: itemIds?.length ?? "all",
    });

    return runMondayRelationBackfill({
      scope,
      dryRun,
      itemIds,
      activeOnly: true,
    });
  },
});
