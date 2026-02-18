import { getItemsRich } from "./packages/monday/src/client/rich";
import { BOARD_IDS } from "./packages/monday/src/types/schema";
import { collectEstimateContactPairs } from "./apps/background-jobs/workers/estimate-poller/lib/sync-relations";
import { db } from "@lib/db/hub";

type ContactRow = { monday_item_id: string };

let items = await getItemsRich(BOARD_IDS.ESTIMATING);
items = items.filter((i) => !["Shell Estimates ( Do Not Move)", "Sales Team Estimates"].includes(i.groupTitle));

const pairs = collectEstimateContactPairs(
  items.map((i) => ({ id: i.id, columnValues: i.columnValues.map((c) => ({ id: c.id, linkedItemIds: c.linkedItemIds })) }))
).pairs;

const contacts = (await db.query<ContactRow>(`SELECT monday_item_id FROM contacts WHERE monday_item_id ~ '^[0-9]+$'`).all()) as ContactRow[];
const local = new Set(contacts.map((c) => c.monday_item_id));

const missing = new Set<string>();
const samplePairs: Array<{estimate_monday_id:string;contact_monday_id:string;source:string}> = [];
for (const p of pairs) {
  if (!local.has(p.contactMondayId)) {
    missing.add(p.contactMondayId);
    if (samplePairs.length < 20) samplePairs.push({estimate_monday_id:p.estimateMondayId,contact_monday_id:p.contactMondayId,source:p.source});
  }
}

const missingIds = [...missing].sort();
console.log(JSON.stringify({
  estimate_items: items.length,
  pair_count: pairs.length,
  local_contact_count: local.size,
  missing_count: missingIds.length,
  missing_ids: missingIds,
  sample_pairs: samplePairs
}, null, 2));
