import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { db } from "@lib/db/client";
import type { MondayItemRich } from "@monday/client/rich";
import {
  CONTACTS_COLUMNS,
  CONTRACTORS_COLUMNS,
  ESTIMATING_COLUMNS,
} from "@monday/types/schema";

const TEST_PREFIX = "_TEST_DELETE_ME_EST_SYNC_";
const TEST_MONDAY_PREFIX = `${TEST_PREFIX}MONDAY_`;

const REL_ESTIMATE_ID = "9900010001";
const REL_ACCOUNT_ID = "9900011001";
const REL_CONTACT_ID = "9900012001";
const REL_ACCOUNT_DOMAIN = "test-estimate-sync-link.example.com";

let mockItems: MondayItemRich[] = [];
let mockMondayQuery: (graphql: string) => Promise<unknown> = async () => ({
  items: [],
});

mock.module("@monday/client/rich", () => ({
  getItemsRich: async () => mockItems,
}));

mock.module("@monday/client/query", () => ({
  query: async (graphql: string) =>
    (await mockMondayQuery(graphql)) as Record<string, unknown>,
}));

const { syncEstimates } = await import("@monday/sync/estimate-sync/full-sync");

function makeItem(
  mondayItemId: string,
  options: {
    accountId?: string | null;
    directContactIds?: string[];
    legacyContactIds?: string[];
  } = {}
): MondayItemRich {
  const accountId = options.accountId ?? null;
  const directContactIds = options.directContactIds ?? [];
  const legacyContactIds = options.legacyContactIds ?? [];

  return {
    id: mondayItemId,
    name: `${TEST_PREFIX}Estimate ${mondayItemId}`,
    groupId: "group-test",
    groupTitle: "Open",
    url: `https://monday.com/boards/7943937851/pulses/${mondayItemId}`,
    columns: {
      [ESTIMATING_COLUMNS.ESTIMATE_ID.id]: "E-TEST-001",
      [ESTIMATING_COLUMNS.CONTRACTOR.id]: "Test Contractor",
      [ESTIMATING_COLUMNS.BID_STATUS.id]: "Bid Sent",
      [ESTIMATING_COLUMNS.BID_VALUE.id]: "1000",
      [ESTIMATING_COLUMNS.AWARDED_VALUE.id]: "0",
      [ESTIMATING_COLUMNS.BID_SOURCE.id]: "Referral",
      [ESTIMATING_COLUMNS.AWARDED.id]: "No",
      [ESTIMATING_COLUMNS.DUE_DATE.id]: "2026-02-11",
      [ESTIMATING_COLUMNS.LOCATION.id]: "Phoenix",
      [ESTIMATING_COLUMNS.SHAREPOINT_URL.id]: null,
    },
    columnValues: [
      {
        id: ESTIMATING_COLUMNS.CONTRACTORS_DIRECT.id,
        type: "board_relation",
        text: null,
        value: null,
        linkedItemIds: accountId ? [accountId] : [],
      },
      {
        id: ESTIMATING_COLUMNS.CONTACTS_DIRECT.id,
        type: "board_relation",
        text: null,
        value: null,
        linkedItemIds: directContactIds,
      },
      {
        id: ESTIMATING_COLUMNS.CONTACTS.id,
        type: "board_relation",
        text: null,
        value: null,
        linkedItemIds: legacyContactIds,
      },
    ],
  };
}

async function cleanupTestRows(): Promise<void> {
  await db
    .query(
      "DELETE FROM estimates WHERE monday_item_id LIKE $1 OR monday_item_id = $2"
    )
    .run(`${TEST_MONDAY_PREFIX}%`, REL_ESTIMATE_ID);
  await db
    .query("DELETE FROM contacts WHERE monday_item_id = $1")
    .run(REL_CONTACT_ID);
  await db
    .query("DELETE FROM accounts WHERE monday_account_id = $1 OR domain = $2")
    .run(REL_ACCOUNT_ID, REL_ACCOUNT_DOMAIN);
}

beforeEach(async () => {
  mockItems = [];
  mockMondayQuery = async () => ({ items: [] });
  await cleanupTestRows();
});

afterAll(async () => {
  await cleanupTestRows();

  const remaining = (await db
    .query(
      "SELECT count(*)::int AS count FROM estimates WHERE monday_item_id LIKE $1"
    )
    .get(`${TEST_MONDAY_PREFIX}%`)) as { count: number } | null;
  if ((remaining?.count ?? 0) > 0) {
    throw new Error(
      `Cleanup failed for estimate sync integration tests: ${remaining?.count} rows remain`
    );
  }
});

describe("syncEstimates integration", () => {
  test("creates a baseline current version for newly synced estimates", async () => {
    const mondayItemId = `${TEST_MONDAY_PREFIX}NEW_1`;
    mockItems = [makeItem(mondayItemId)];

    const result = await syncEstimates();
    expect(result.errors).toBe(0);
    expect(result.upserted).toBe(1);

    const estimate = (await db
      .query("SELECT id FROM estimates WHERE monday_item_id = $1")
      .get(mondayItemId)) as { id: number } | null;
    expect(estimate).toBeTruthy();
    if (!estimate) {
      throw new Error("Expected synced estimate row");
    }

    const versions = (await db
      .query(
        `SELECT version_number, is_current, source
         FROM estimate_versions
         WHERE estimate_id = $1`
      )
      .all(estimate.id)) as Array<{
      version_number: number;
      is_current: number;
      source: string;
    }>;

    expect(versions).toHaveLength(1);
    expect(versions[0]?.version_number).toBe(1);
    expect(versions[0]?.is_current).toBe(1);
    expect(versions[0]?.source).toBe("sync");
  });

  test("heals previously poisoned estimate rows (missing versions)", async () => {
    const mondayItemId = `${TEST_MONDAY_PREFIX}POISONED_1`;
    const inserted = (await db.run(
      `INSERT INTO estimates (monday_item_id, name, bid_status)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [mondayItemId, `${TEST_PREFIX}Poisoned`, "Bid Sent"]
    )) as Array<{ id: number }>;
    const estimateId = inserted[0]?.id;
    expect(estimateId).toBeTruthy();
    if (!estimateId) {
      throw new Error("Expected inserted poisoned estimate id");
    }

    const beforeCount = (await db
      .query(
        "SELECT count(*)::int AS count FROM estimate_versions WHERE estimate_id = $1"
      )
      .get(estimateId)) as { count: number } | null;
    expect(beforeCount?.count).toBe(0);

    mockItems = [makeItem(mondayItemId)];
    const first = await syncEstimates();
    expect(first.errors).toBe(0);

    const afterFirst = (await db
      .query(
        "SELECT count(*)::int AS count FROM estimate_versions WHERE estimate_id = $1"
      )
      .get(estimateId)) as { count: number } | null;
    expect(afterFirst?.count).toBe(1);

    const second = await syncEstimates();
    expect(second.errors).toBe(0);

    const afterSecond = (await db
      .query(
        "SELECT count(*)::int AS count FROM estimate_versions WHERE estimate_id = $1"
      )
      .get(estimateId)) as { count: number } | null;
    expect(afterSecond?.count).toBe(1);
  });

  test("syncs estimate-contact and contact-account links from Monday relations", async () => {
    mockItems = [
      makeItem(REL_ESTIMATE_ID, {
        accountId: REL_ACCOUNT_ID,
        directContactIds: [REL_CONTACT_ID],
      }),
    ];

    mockMondayQuery = (graphql: string) => {
      if (graphql.includes(CONTRACTORS_COLUMNS.DOMAIN.id)) {
        return Promise.resolve({
          items: [
            {
              id: REL_ACCOUNT_ID,
              name: "Rel Account",
              column_values: [
                {
                  id: CONTRACTORS_COLUMNS.DOMAIN.id,
                  text: REL_ACCOUNT_DOMAIN,
                },
              ],
            },
          ],
        });
      }

      if (graphql.includes(CONTACTS_COLUMNS.CONTRACTOR.id)) {
        return Promise.resolve({
          items: [
            {
              id: REL_CONTACT_ID,
              name: "Rel Contact",
              group: { id: "group-rel", title: "Contacts" },
              column_values: [
                {
                  id: CONTACTS_COLUMNS.EMAIL.id,
                  text: "rel.contact@example.com",
                },
                { id: CONTACTS_COLUMNS.PHONE.id, text: "602-555-0100" },
                { id: CONTACTS_COLUMNS.MOBILE_PHONE.id, text: null },
                { id: CONTACTS_COLUMNS.OFFICE_PHONE.id, text: null },
                { id: CONTACTS_COLUMNS.COMPANY_PHONE.id, text: null },
                { id: CONTACTS_COLUMNS.COMPANY_FAX.id, text: null },
                { id: CONTACTS_COLUMNS.TITLE.id, text: "Estimator" },
                { id: CONTACTS_COLUMNS.PRIORITY.id, text: "Medium" },
                {
                  id: CONTACTS_COLUMNS.CONTRACTOR.id,
                  text: null,
                  linked_item_ids: [REL_ACCOUNT_ID],
                },
              ],
            },
          ],
        });
      }

      return Promise.resolve({ items: [] });
    };

    const result = await syncEstimates();
    expect(result.errors).toBe(0);
    expect(result.linkStats.mondayPairsUnique).toBe(1);
    expect(result.linkStats.estimateContactsResolved).toBe(1);
    expect(result.linkStats.missingContact).toBe(0);

    const link = (await db
      .query(
        `SELECT ec.source, c.account_id, a.monday_account_id
         FROM estimate_contacts ec
         JOIN estimates e ON e.id = ec.estimate_id
         JOIN contacts c ON c.id = ec.contact_id
         LEFT JOIN accounts a ON a.id = c.account_id
         WHERE e.monday_item_id = $1 AND c.monday_item_id = $2
         LIMIT 1`
      )
      .get(REL_ESTIMATE_ID, REL_CONTACT_ID)) as {
      source: string;
      account_id: number | null;
      monday_account_id: string | null;
    } | null;

    expect(link).toBeTruthy();
    expect(link?.source).toBe("monday.direct_contacts");
    expect(link?.account_id).toBeTruthy();
    expect(link?.monday_account_id).toBe(REL_ACCOUNT_ID);
  });
});
