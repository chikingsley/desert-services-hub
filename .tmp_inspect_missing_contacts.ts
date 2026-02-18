import { chunk } from "./apps/background-jobs/workers/estimate-poller/lib/sql-utils";
import { collectEstimateContactPairs } from "./apps/background-jobs/workers/estimate-poller/lib/sync-relations";
import { query } from "./packages/monday/src/client/query";
import { ESTIMATING_COLUMNS, CONTACTS_COLUMNS, BOARD_IDS } from "./packages/monday/src/types/schema";
import { db } from "@lib/db/hub";

type EstRow = { id: number; monday_item_id: string };
type ContactRow = { id: number; monday_item_id: string };

async function fetchEstimateItems(ids: string[]) {
  const out: Array<{ id: string; columnValues: Array<{ id: string; linkedItemIds?: string[] }> }> = [];
  for (const batch of chunk(ids, 25)) {
    const res = await query<{items: Array<{id:string; column_values:Array<{id:string; linked_item_ids?: string[]}>}>}>(`
      query {
        items(ids: [${batch.join(",")}]) {
          id
          column_values(ids: ["${ESTIMATING_COLUMNS.CONTACTS_DIRECT.id}", "${ESTIMATING_COLUMNS.CONTACTS.id}"]) {
            id
            ... on BoardRelationValue { linked_item_ids }
          }
        }
      }
    `);
    for (const i of res.items) {
      out.push({ id: i.id, columnValues: i.column_values.map((c) => ({ id: c.id, linkedItemIds: c.linked_item_ids })) });
    }
  }
  return out;
}

async function fetchContactItems(ids: string[]) {
  const fetched = new Set<string>();
  for (const batch of chunk(ids, 100)) {
    try {
      const res = await query<{items:Array<{id:string; name:string; board:{id:string}; group:{id:string; title:string}; column_values:Array<{id:string; text:string|null}>}>}>(`
        query {
          items(ids: [${batch.join(",")}]) {
            id
            name
            board { id }
            group { id title }
            column_values(ids:["${CONTACTS_COLUMNS.EMAIL.id}"]) { id text }
          }
        }
      `);
      for (const it of res.items) fetched.add(it.id);
    } catch {
      // ignore batch failures for diagnostics
    }
  }
  return fetched;
}

const estimates = (await db.query<EstRow>(`SELECT id, monday_item_id FROM estimates WHERE monday_item_id ~ '^[0-9]+$'`).all()) as EstRow[];
const estimateIdByMonday = new Map(estimates.map((r) => [r.monday_item_id, r.id] as const));

const contacts = (await db.query<ContactRow>(`SELECT id, monday_item_id FROM contacts WHERE monday_item_id ~ '^[0-9]+$'`).all()) as ContactRow[];
const contactIdByMonday = new Map(contacts.map((r) => [r.monday_item_id, r.id] as const));

const items = await fetchEstimateItems(estimates.map((e) => e.monday_item_id));
const pairs = collectEstimateContactPairs(items).pairs;

const missing = new Set<string>();
for (const p of pairs) {
  if (!estimateIdByMonday.has(p.estimateMondayId)) continue;
  if (!contactIdByMonday.has(p.contactMondayId)) missing.add(p.contactMondayId);
}

const missingIds = [...missing].sort();
const fetched = await fetchContactItems(missingIds);

const examples: Array<{estimate_monday_id:string; contact_monday_id:string; source:string}> = [];
for (const p of pairs) {
  if (missing.has(p.contactMondayId)) {
    examples.push({ estimate_monday_id: p.estimateMondayId, contact_monday_id: p.contactMondayId, source: p.source });
    if (examples.length >= 20) break;
  }
}

const notFetchable = missingIds.filter((id) => !fetched.has(id));

console.log(JSON.stringify({
  missing_count: missingIds.length,
  fetched_by_items_query: fetched.size,
  not_fetchable_count: notFetchable.length,
  missing_ids: missingIds,
  not_fetchable_ids: notFetchable,
  sample_pairs: examples,
  contacts_board_id: BOARD_IDS.CONTACTS,
}, null, 2));
