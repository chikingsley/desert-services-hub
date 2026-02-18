/**
 * Quiet estimate sync: Monday ESTIMATING board -> Supabase Postgres estimates table.
 *
 * Reuses the Monday client from @monday/client and the shared Postgres repository layer
 * connection from @lib/db/hub. Returns stats instead of printing.
 */

import { SKIP_GROUPS } from "@background-jobs/jobs/config";
import { db } from "@lib/db/hub";
import { ensureEstimateHasCurrentVersion } from "@lib/db/repositories/estimate-version";
import { getItemsRich, type MondayItemRich } from "@monday/client/rich";
import { BOARD_IDS, ESTIMATING_COLUMNS } from "@monday/types/schema";
import { fetchAccountSnapshots, fetchContactSnapshots } from "./sync-monday";
import {
  collectEstimateContactPairs,
  type LinkStats,
  type MondayAccountSnapshot,
  sanitizeMondayId,
  syncAccountsToDb,
  syncContactsToDb,
  syncEstimateContactLinks,
  uniqueNumericIds,
} from "./sync-relations";

// ── Types ──────────────────────────────────────────────────────────────

interface EstimateRow {
  mondayItemId: string;
  name: string;
  estimateNumber: string | null;
  contractor: string | null;
  groupId: string;
  groupTitle: string;
  mondayUrl: string;
  accountMondayId: string | null;
  accountDomain: string | null;
  bidStatus: string | null;
  bidValue: number | null;
  awardedValue: number | null;
  bidSource: string | null;
  awarded: boolean;
  dueDate: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  sharepointUrl: string | null;
}

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

function parseNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/[,$]/g, "");
  const num = Number.parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

function parseLocationCoords(
  item: MondayItemRich
): { lat: number; lng: number } | null {
  const col = item.columnValues.find(
    (cv) => cv.id === ESTIMATING_COLUMNS.LOCATION.id
  );
  if (!col?.value) {
    return null;
  }
  try {
    const parsed = JSON.parse(col.value) as {
      lat?: string | number;
      lng?: string | number;
    };
    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      (lat !== 0 || lng !== 0)
    ) {
      return { lat, lng };
    }
    return null;
  } catch {
    return null;
  }
}

function hasEstimateFiles(item: MondayItemRich): boolean {
  const estimateCol = item.columnValues.find(
    (cv) => cv.id === ESTIMATING_COLUMNS.ESTIMATE.id
  );
  if (!estimateCol?.value) {
    return false;
  }

  try {
    const parsed = JSON.parse(estimateCol.value) as {
      files?: Array<{ assetId?: number }>;
    };
    return parsed.files?.some((file) => file.assetId != null) ?? false;
  } catch {
    return false;
  }
}

function extractAccountId(item: MondayItemRich): string | null {
  const colValue = item.columnValues.find(
    (cv) => cv.id === ESTIMATING_COLUMNS.CONTRACTORS_DIRECT.id
  );
  return sanitizeMondayId(colValue?.linkedItemIds?.[0]);
}

function extractEstimateRow(
  item: MondayItemRich,
  accountSnapshots: Map<string, MondayAccountSnapshot>
): EstimateRow {
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
  items = items.filter((item) => !SKIP_GROUPS.has(item.groupTitle));
  const estimateFileItemIds = items
    .filter(hasEstimateFiles)
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
      const upsertResult = (await db.run(
        `INSERT INTO estimates (
          monday_item_id, name, estimate_number, contractor,
          group_id, group_title, monday_url,
          account_id, account_monday_id, account_domain,
          bid_status, bid_value, awarded_value, bid_source,
          awarded, due_date, location, lat, lng, sharepoint_url,
          synced_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())
        ON CONFLICT(monday_item_id) DO UPDATE SET
          name = excluded.name,
          estimate_number = COALESCE(excluded.estimate_number, estimates.estimate_number),
          contractor = excluded.contractor,
          group_id = excluded.group_id,
          group_title = excluded.group_title,
          monday_url = excluded.monday_url,
          account_id = COALESCE(excluded.account_id, estimates.account_id),
          account_monday_id = COALESCE(excluded.account_monday_id, estimates.account_monday_id),
          account_domain = COALESCE(excluded.account_domain, estimates.account_domain),
          bid_status = excluded.bid_status,
          bid_value = excluded.bid_value,
          awarded_value = excluded.awarded_value,
          bid_source = excluded.bid_source,
          awarded = excluded.awarded,
          due_date = excluded.due_date,
          location = excluded.location,
          lat = COALESCE(excluded.lat, estimates.lat),
          lng = COALESCE(excluded.lng, estimates.lng),
          sharepoint_url = COALESCE(excluded.sharepoint_url, estimates.sharepoint_url),
          synced_at = now(),
          updated_at = now()
        RETURNING id`,
        [
          row.mondayItemId,
          row.name,
          row.estimateNumber,
          row.contractor,
          row.groupId,
          row.groupTitle,
          row.mondayUrl,
          estimateAccountId,
          row.accountMondayId,
          row.accountDomain,
          row.bidStatus,
          row.bidValue,
          row.awardedValue,
          row.bidSource,
          row.awarded ? 1 : 0,
          row.dueDate,
          row.location,
          row.lat,
          row.lng,
          row.sharepointUrl,
        ]
      )) as Array<{ id: number }>;

      const estimateId = upsertResult[0]?.id;
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
