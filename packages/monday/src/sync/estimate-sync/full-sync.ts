/**
 * Quiet estimate sync: Monday ESTIMATING board -> Supabase Postgres estimates table.
 *
 * Reuses the Monday client from @monday/client and the shared Postgres repository layer
 * connection from @lib/db/client. Returns stats instead of printing.
 */

import { db } from "@lib/db/client";
import { ensureEstimateHasCurrentVersion } from "@lib/db/repositories/estimate-version";
import { getItemsRich, type MondayItemRich } from "@monday/client/rich";
import { SKIP_GROUPS } from "@monday/sync/helpers";
import { BOARD_IDS, ESTIMATING_COLUMNS } from "@monday/types/schema";
import { extractAccountId, parseLocationCoords, parseNumber } from "./fields";
import { itemHasEstimateFiles } from "./file-assets";
import { upsertEstimateRow } from "./repository";
import { fetchAccountSnapshots, fetchContactSnapshots } from "./sync-monday";
import {
  collectEstimateContactPairs,
  type LinkStats,
  type MondayAccountSnapshot,
  syncAccountsToDb,
  syncContactsToDb,
  syncEstimateContactLinks,
  uniqueNumericIds,
} from "./sync-relations";
import type { EstimateUpsertRow } from "./types";

// ── Types ──────────────────────────────────────────────────────────────

interface EstimateRowWithoutAccount
  extends Omit<EstimateUpsertRow, "accountId"> {}

interface ContactIdRow {
  id: number;
  monday_item_id: string;
}

export interface SyncResult {
  fetched: number;
  upserted: number;
  errors: number;
  changes: StatusChange[];
  estimateFileItemIds: string[];
  linkStats: LinkStats;
}

export interface StatusChange {
  mondayItemId: string;
  name: string;
  oldStatus: string | null;
  newStatus: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────

function extractEstimateRow(
  item: MondayItemRich,
  accountSnapshots: Map<string, MondayAccountSnapshot>
): EstimateRowWithoutAccount {
  const cols = item.columns;
  const accountMondayId = extractAccountId(item);
  const accountDomain = accountMondayId
    ? (accountSnapshots.get(accountMondayId)?.domain ?? null)
    : null;
  const coords = parseLocationCoords(item);

  return {
    mondayItemId: item.id,
    name: item.name,
    estimateNumber: cols[ESTIMATING_COLUMNS.ESTIMATE_ID.id] ?? null,
    contractor: cols[ESTIMATING_COLUMNS.CONTRACTOR.id] ?? null,
    groupId: item.groupId,
    groupTitle: item.groupTitle,
    mondayUrl: item.url,
    accountMondayId,
    accountDomain,
    bidStatus: cols[ESTIMATING_COLUMNS.BID_STATUS.id] ?? null,
    bidValue: parseNumber(cols[ESTIMATING_COLUMNS.BID_VALUE.id]),
    awardedValue: parseNumber(cols[ESTIMATING_COLUMNS.AWARDED_VALUE.id]),
    bidSource: cols[ESTIMATING_COLUMNS.BID_SOURCE.id] ?? null,
    awarded: cols[ESTIMATING_COLUMNS.AWARDED.id] === "Yes",
    dueDate: cols[ESTIMATING_COLUMNS.DUE_DATE.id] ?? null,
    location: cols[ESTIMATING_COLUMNS.LOCATION.id] ?? null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    sharepointUrl: cols[ESTIMATING_COLUMNS.SHAREPOINT_URL.id] ?? null,
  };
}

/**
 * Snapshot current bid_status for all estimates, keyed by monday_item_id.
 * Used to detect status changes after upsert.
 */
async function snapshotStatuses(): Promise<Map<string, string | null>> {
  const rows = await db
    .query<{ monday_item_id: string; bid_status: string | null }>(
      "SELECT monday_item_id, bid_status FROM estimates WHERE monday_item_id IS NOT NULL"
    )
    .all();

  const map = new Map<string, string | null>();
  for (const row of rows) {
    map.set(row.monday_item_id, row.bid_status);
  }
  return map;
}

// ── Main sync orchestrator ─────────────────────────────────────────────

/**
 * Run a full sync cycle: fetch all estimates from Monday, upsert into Supabase Postgres,
 * sync estimate<->contact/account links, and detect status changes.
 */
export async function syncEstimates(): Promise<SyncResult> {
  const before = await snapshotStatuses();

  let items = await getItemsRich(BOARD_IDS.ESTIMATING);
  items = items.filter((item) => !SKIP_GROUPS.includes(item.groupTitle));
  const estimateFileItemIds = items
    .filter((item) => itemHasEstimateFiles(item.columnValues))
    .map((item) => item.id);

  const pairCollection = collectEstimateContactPairs(items);
  const contactIds = uniqueNumericIds(
    pairCollection.pairs.map((pair) => pair.contactMondayId)
  );

  const contactSnapshots = await fetchContactSnapshots(contactIds);
  const contactAccountIds = uniqueNumericIds(
    [...contactSnapshots.values()].map(
      (snapshot) => snapshot.contractorMondayId
    )
  );
  const directEstimateAccountIds = uniqueNumericIds(
    items.map((item) => extractAccountId(item))
  );

  const accountSnapshots = await fetchAccountSnapshots([
    ...directEstimateAccountIds,
    ...contactAccountIds,
  ]);
  const { accountIdByMondayId, synced: accountsSynced } =
    await syncAccountsToDb(accountSnapshots);
  const { synced: contactsSynced } = await syncContactsToDb(
    contactSnapshots,
    accountIdByMondayId
  );
  const contactIdByMondayId = new Map<string, number>();
  const allContactIds = (await db
    .query<ContactIdRow>(
      `SELECT id, monday_item_id
       FROM contacts
       WHERE monday_item_id ~ '^[0-9]+$'`
    )
    .all()) as ContactIdRow[];
  for (const row of allContactIds) {
    contactIdByMondayId.set(row.monday_item_id, row.id);
  }

  let upserted = 0;
  let errors = 0;
  const estimateIdByMondayId = new Map<string, number>();

  for (const item of items) {
    try {
      const row = extractEstimateRow(item, accountSnapshots);
      const estimateAccountId = row.accountMondayId
        ? (accountIdByMondayId.get(row.accountMondayId) ?? null)
        : null;
      const estimateId = await upsertEstimateRow({
        ...row,
        accountId: estimateAccountId,
      });
      if (estimateId) {
        estimateIdByMondayId.set(row.mondayItemId, estimateId);
        await ensureEstimateHasCurrentVersion(estimateId, {
          source: "sync",
          total: row.bidValue ?? 0,
        });
      }
      upserted++;
    } catch {
      errors++;
    }
  }

  const linkSync = await syncEstimateContactLinks(
    pairCollection.pairs,
    estimateIdByMondayId,
    contactIdByMondayId
  );

  const changes: StatusChange[] = [];
  for (const item of items) {
    const oldStatus = before.get(item.id) ?? null;
    const newStatus = item.columns[ESTIMATING_COLUMNS.BID_STATUS.id] ?? null;

    if (oldStatus !== newStatus && before.has(item.id)) {
      changes.push({
        mondayItemId: item.id,
        name: item.name,
        oldStatus,
        newStatus,
      });
    }
  }

  const linkStats: LinkStats = {
    mondayPairsDirect: pairCollection.mondayPairsDirect,
    mondayPairsLegacy: pairCollection.mondayPairsLegacy,
    mondayPairsUnique: pairCollection.pairs.length,
    estimateContactsResolved: linkSync.resolved,
    missingEstimate: linkSync.missingEstimate,
    missingContact: linkSync.missingContact,
    touchedEstimates: linkSync.touchedEstimates,
    contactsSynced,
    accountsSynced,
  };

  return {
    fetched: items.length,
    upserted,
    errors,
    changes,
    estimateFileItemIds,
    linkStats,
  };
}
