import { afterEach, describe, expect, mock, test } from "bun:test";

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
  tasks: {
    trigger: async () => ({}),
  },
}));

mock.module("@documents-intake/db/intake-document", () => ({
  propagateMissingDocumentProjectIds: async () => {},
}));

mock.module("@monday/sync/estimate-sync/item-sync", () => ({
  syncEstimateItem: async () => false,
}));

mock.module("@monday/sync/pipeline", () => ({
  processItemFiles: async () => 0,
}));

mock.module("@monday/sync/project-seed/sync", () => ({
  markStaleProjectSeeds: async () => ({ movedToLost: 0 }),
  syncProjectSeedsFromEstimates: async () => ({
    estimatesScanned: 0,
    movedToLost: 0,
    projectsCreated: 0,
    projectsUpdated: 0,
    promotedToActive: 0,
    seedGroups: 0,
  }),
}));

describe("monday sync queue configuration", () => {
  afterEach(() => {
    mock.restore();
    process.env.MONDAY_SYNC_ITEM_QUEUE_CONCURRENCY = undefined;
    process.env.MONDAY_SYNC_PIPELINE_QUEUE_CONCURRENCY = undefined;
  });

  test("uses conservative default queue concurrency limits", async () => {
    process.env.MONDAY_SYNC_ITEM_QUEUE_CONCURRENCY = undefined;
    process.env.MONDAY_SYNC_PIPELINE_QUEUE_CONCURRENCY = undefined;

    const cacheBuster = `monday-sync-defaults-${Date.now()}-${Math.random()}`;
    const {
      mondaySync,
      mondaySyncIncremental,
      mondaySyncItem,
      mondaySyncTargeted,
    } = await import(
      `../../../apps/trigger-dev/src/trigger/monday-sync.ts?${cacheBuster}`
    );

    expect((mondaySyncItem as { queue?: unknown }).queue).toEqual({
      concurrencyLimit: 2,
      name: "monday-sync-item",
    });
    expect((mondaySyncTargeted as { queue?: unknown }).queue).toEqual({
      concurrencyLimit: 1,
      name: "monday-sync-pipeline",
    });
    expect((mondaySyncIncremental as { queue?: unknown }).queue).toEqual({
      concurrencyLimit: 1,
      name: "monday-sync-pipeline",
    });
    expect((mondaySync as { queue?: unknown }).queue).toEqual({
      concurrencyLimit: 1,
      name: "monday-sync-pipeline",
    });
  });

  test("honors env overrides for queue concurrency limits", async () => {
    process.env.MONDAY_SYNC_ITEM_QUEUE_CONCURRENCY = "5";
    process.env.MONDAY_SYNC_PIPELINE_QUEUE_CONCURRENCY = "3";

    const cacheBuster = `monday-sync-overrides-${Date.now()}-${Math.random()}`;
    const {
      mondaySync,
      mondaySyncIncremental,
      mondaySyncItem,
      mondaySyncTargeted,
    } = await import(
      `../../../apps/trigger-dev/src/trigger/monday-sync.ts?${cacheBuster}`
    );

    expect((mondaySyncItem as { queue?: unknown }).queue).toEqual({
      concurrencyLimit: 5,
      name: "monday-sync-item",
    });
    expect((mondaySyncTargeted as { queue?: unknown }).queue).toEqual({
      concurrencyLimit: 3,
      name: "monday-sync-pipeline",
    });
    expect((mondaySyncIncremental as { queue?: unknown }).queue).toEqual({
      concurrencyLimit: 3,
      name: "monday-sync-pipeline",
    });
    expect((mondaySync as { queue?: unknown }).queue).toEqual({
      concurrencyLimit: 3,
      name: "monday-sync-pipeline",
    });
  });
});
