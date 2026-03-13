import { afterEach, describe, expect, mock, test } from "bun:test";
import { CONTACTS_COLUMNS, ESTIMATING_COLUMNS } from "@monday/types/schema";

const mondayQueries: string[] = [];
const updateCalls: Array<{
  boardId: string;
  columnValues: Record<string, unknown>;
  itemId: string;
}> = [];

let mockMondayQuery: (graphql: string) => Promise<unknown> = async () => ({
  boards: [],
  items: [],
});

mock.module("@trigger.dev/sdk", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
  schemaTask: <T>(definition: T) => definition,
}));

mock.module("@monday/client/query", () => ({
  query: async (graphql: string) => {
    mondayQueries.push(graphql);
    return (await mockMondayQuery(graphql)) as Record<string, unknown>;
  },
}));

mock.module("@monday/client/search", () => ({
  updateItem: async (payload: {
    boardId: string;
    columnValues: Record<string, unknown>;
    itemId: string;
  }) => {
    updateCalls.push(payload);
  },
}));

describe("monday relation backfill task", () => {
  afterEach(() => {
    mondayQueries.length = 0;
    updateCalls.length = 0;
    mockMondayQuery = async () => ({ boards: [], items: [] });
    process.env.MONDAY_RELATION_BACKFILL_QUEUE_CONCURRENCY = undefined;
  });

  test("uses conservative default queue concurrency", async () => {
    process.env.MONDAY_RELATION_BACKFILL_QUEUE_CONCURRENCY = undefined;

    const cacheBuster = `monday-relation-backfill-default-${Date.now()}-${Math.random()}`;
    const { mondayRelationBackfill } = await import(
      `../../../apps/trigger-dev/src/trigger/monday-relation-backfill.ts?${cacheBuster}`
    );

    expect((mondayRelationBackfill as { queue?: unknown }).queue).toEqual({
      concurrencyLimit: 1,
      name: "monday-relation-backfill",
    });
  });

  test("honors queue concurrency env override", async () => {
    process.env.MONDAY_RELATION_BACKFILL_QUEUE_CONCURRENCY = "4";

    const cacheBuster = `monday-relation-backfill-override-${Date.now()}-${Math.random()}`;
    const { mondayRelationBackfill } = await import(
      `../../../apps/trigger-dev/src/trigger/monday-relation-backfill.ts?${cacheBuster}`
    );

    expect((mondayRelationBackfill as { queue?: unknown }).queue).toEqual({
      concurrencyLimit: 4,
      name: "monday-relation-backfill",
    });
  });

  test("backfills contractors from direct contacts when legacy contact column is empty", async () => {
    const estimateId = "900001";
    const contactId = "900101";
    const accountId = "900201";

    mockMondayQuery = async (graphql: string) => {
      if (graphql.includes("boards(ids:")) {
        return {
          boards: [
            {
              items_page: {
                cursor: null,
                items: [
                  {
                    id: estimateId,
                    name: "Test estimate",
                    group: { id: "topics", title: "Open" },
                    column_values: [
                      {
                        id: ESTIMATING_COLUMNS.CONTRACTORS_DIRECT.id,
                        linked_item_ids: [],
                      },
                      {
                        id: ESTIMATING_COLUMNS.CONTACTS_DIRECT.id,
                        linked_item_ids: [contactId],
                      },
                      {
                        id: ESTIMATING_COLUMNS.CONTACTS.id,
                        linked_item_ids: [],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        };
      }

      if (graphql.includes(`"${CONTACTS_COLUMNS.CONTRACTOR.id}"`)) {
        return {
          items: [
            {
              id: contactId,
              column_values: [
                {
                  id: CONTACTS_COLUMNS.CONTRACTOR.id,
                  linked_item_ids: [accountId],
                },
              ],
            },
          ],
        };
      }

      return { boards: [], items: [] };
    };

    const cacheBuster = `monday-relation-backfill-direct-contacts-${Date.now()}-${Math.random()}`;
    const { mondayRelationBackfill } = await import(
      `../../../apps/trigger-dev/src/trigger/monday-relation-backfill.ts?${cacheBuster}`
    );

    const task = mondayRelationBackfill as {
      run: (payload: {
        dryRun: boolean;
        itemIds?: string[];
        scope: "estimating-account";
      }) => Promise<{
        results: Array<{ failed: number; resolved: number; scope: string }>;
      }>;
    };

    const result = await task.run({
      scope: "estimating-account",
      dryRun: false,
    });

    expect(result.results).toEqual([
      {
        scope: "estimating-account",
        total: 1,
        skipped: 0,
        resolved: 1,
        failed: 0,
      },
    ]);
    expect(updateCalls).toEqual([
      {
        boardId: "7943937851",
        itemId: estimateId,
        columnValues: {
          [ESTIMATING_COLUMNS.CONTRACTORS_DIRECT.id]: {
            item_ids: [Number(accountId)],
          },
        },
      },
    ]);
  });
});
