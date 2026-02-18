import { chunk } from "./apps/background-jobs/workers/estimate-poller/lib/sql-utils";
import { collectEstimateContactPairs, sanitizeMondayId } from "./apps/background-jobs/workers/estimate-poller/lib/sync-relations";
import { db } from "@lib/db/hub";
import { query } from "./packages/monday/src/client/query";
import { ESTIMATING_COLUMNS } from "./packages/monday/src/types/schema";

type EstimateRow = { id: number; monday_item_id: string };
type ContactRow = { id: number; monday_item_id: string };

const FETCH_BATCH_SIZE = 25;

async function fetchItemsByIds(ids: string[]) {
  const all: Array<{id:string; columnValues:Array<{id:string; linkedItemIds?:string[]}>}> = [];
  for (const batch of chunk(ids, FETCH_BATCH_SIZE)) {
    const result = await query<{items:Array<{id:string; column_values:Array<{id:string; linked_item_ids?:string[]}>}>}>(`
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
    for (const item of result.items) {
      all.push({ id:item.id, columnValues:item.column_values.map((cv)=>({id:cv.id, linkedItemIds:cv.linked_item_ids})) });
    }
  }
  return all;
}

const estimates = (await db.query<EstimateRow>(`SELECT id, monday_item_id FROM estimates WHERE monday_item_id ~ '^[0-9]+$' ORDER BY id`).all()) as EstimateRow[];
const requested = estimates.map((r)=>sanitizeMondayId(r.monday_item_id)).filter((x):x is string => Boolean(x));
const items = await fetchItemsByIds(requested);
const returned = new Set(items.map((i)=>i.id));

const pairs = collectEstimateContactPairs(items).pairs;
const contacts = (await db.query<ContactRow>(`SELECT id, monday_item_id FROM contacts WHERE monday_item_id ~ '^[0-9]+$'`).all()) as ContactRow[];
const contactMap = new Map<string, number>(contacts.map((c)=>[sanitizeMondayId(c.monday_item_id)!, c.id]));

const missingContactIds = new Set<string>();
const sample: Array<{estimate_monday_id:string;contact_monday_id:string;source:string}> = [];
for (const p of pairs) {
  if (!contactMap.has(p.contactMondayId)) {
    missingContactIds.add(p.contactMondayId);
    if (sample.length < 30) sample.push({estimate_monday_id:p.estimateMondayId, contact_monday_id:p.contactMondayId, source:p.source});
  }
}

console.log(JSON.stringify({
  requested_estimates: requested.length,
  returned_estimates: returned.size,
  coverage: requested.length ? Number((returned.size/requested.length).toFixed(6)) : 1,
  pair_count: pairs.length,
  missing_contact_count: missingContactIds.size,
  missing_contact_ids: [...missingContactIds].sort(),
  sample_pairs: sample
}, null, 2));
