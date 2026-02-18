import { chunk } from "./apps/background-jobs/workers/estimate-poller/lib/sql-utils";
import { query } from "./packages/monday/src/client/query";
import { ESTIMATING_COLUMNS } from "./packages/monday/src/types/schema";
import { db } from "@lib/db/hub";

const estimateRows = (await db
  .query<{ monday_item_id: string }>(
    `SELECT monday_item_id FROM estimates WHERE monday_item_id ~ '^[0-9]+$'`
  )
  .all()) as Array<{ monday_item_id: string }>;

const estimateIds = estimateRows.map((r) => r.monday_item_id);
const allContactRefs = new Set<string>();
for (const batch of chunk(estimateIds, 25)) {
  const res = await query<{
    items: Array<{
      id: string;
      column_values: Array<{ id: string; linked_item_ids?: string[] }>;
    }>;
  }>(`
    query {
      items(ids: [${batch.join(",")}]) {
        id
        column_values(ids: ["${ESTIMATING_COLUMNS.CONTACTS_DIRECT.id}", "${ESTIMATING_COLUMNS.CONTACTS.id}"]) {
          id
          ... on BoardRelationValue {
            linked_item_ids
          }
        }
      }
    }
  `);
  for (const item of res.items) {
    for (const cv of item.column_values) {
      for (const id of cv.linked_item_ids ?? []) {
        if (/^\d+$/.test(id)) allContactRefs.add(id);
      }
    }
  }
}

const local = (await db
  .query<{ monday_item_id: string }>(
    `SELECT monday_item_id FROM contacts WHERE monday_item_id ~ '^[0-9]+$'`
  )
  .all()) as Array<{ monday_item_id: string }>;
const localSet = new Set(local.map((r) => r.monday_item_id));

const missing = [...allContactRefs].filter((id) => !localSet.has(id));
console.log(JSON.stringify({
  total_relation_contact_ids: allContactRefs.size,
  local_contact_ids: localSet.size,
  missing_count: missing.length,
  missing_sample: missing.slice(0, 20),
}, null, 2));
