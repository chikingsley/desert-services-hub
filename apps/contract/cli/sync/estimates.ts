/**
 * Sync ESTIMATING board → estimates table in hub.db
 *
 * READ ONLY from Monday - only pulls data, never updates Monday.
 * File downloads are optional (controlled by --skip-files flag).
 */

import { Database } from "bun:sqlite";
import { getItemsRich, type MondayItemRich, query } from "@monday/client";
import { BOARD_IDS, ESTIMATING_COLUMNS } from "@monday/types";

const HUB_DB_PATH =
  "/Users/chiejimofor/Documents/Github/desert-services-hub/lib/db/hub.db";

// Groups to skip (templates, sales items)
const SKIP_GROUPS = ["Shell Estimates ( Do Not Move)", "Sales Team Estimates"];

// Top-level regex patterns
const PROTOCOL_REGEX = /^https?:\/\//;
const WWW_PREFIX_REGEX = /^www\./;

interface SyncOptions {
  limit?: number;
  dryRun?: boolean;
  skipFiles?: boolean;
}

interface EstimateData {
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
  sharepointUrl: string | null;
}

function parseNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/[,$]/g, "");
  const num = Number.parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

/**
 * Extract linked account ID from the CONTRACTORS_DIRECT board_relation column
 */
function extractAccountId(item: MondayItemRich): string | null {
  const accountsColumnId = ESTIMATING_COLUMNS.CONTRACTORS_DIRECT.id;
  const colValue = item.columnValues.find((cv) => cv.id === accountsColumnId);
  const linkedIds = colValue?.linkedItemIds;
  return linkedIds?.[0] ?? null;
}

/**
 * Batch fetch domains from CONTRACTORS board
 */
async function fetchAccountDomains(
  accountIds: string[]
): Promise<Map<string, string>> {
  const domainMap = new Map<string, string>();
  if (accountIds.length === 0) {
    return domainMap;
  }

  // Dedupe
  const uniqueIds = [...new Set(accountIds)];

  // Batch in groups of 100
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const batch = uniqueIds.slice(i, i + 100);
    const result = await query<{
      items: Array<{
        id: string;
        column_values: Array<{ id: string; text: string | null }>;
      }>;
    }>(`
      query {
        items(ids: [${batch.join(",")}]) {
          id
          column_values(ids: ["company_domain"]) {
            id
            text
          }
        }
      }
    `);

    for (const item of result.items) {
      const domainCol = item.column_values.find(
        (cv) => cv.id === "company_domain"
      );
      if (domainCol?.text) {
        // Clean domain (strip "- url" suffix, protocol, www, trailing path)
        let domain = domainCol.text.split(" - ")[0].trim();
        domain = domain
          .replace(PROTOCOL_REGEX, "")
          .replace(WWW_PREFIX_REGEX, "")
          .split("/")[0];
        domainMap.set(item.id, domain);
      }
    }
  }

  return domainMap;
}

function extractEstimateData(
  item: MondayItemRich,
  domainMap: Map<string, string>
): EstimateData {
  const cols = item.columns;
  const accountMondayId = extractAccountId(item);
  const accountDomain = accountMondayId
    ? (domainMap.get(accountMondayId) ?? null)
    : null;

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
    sharepointUrl: cols[ESTIMATING_COLUMNS.SHAREPOINT_URL.id] ?? null,
  };
}

function upsertEstimate(db: Database, data: EstimateData): void {
  db.run(
    `INSERT INTO estimates (
      monday_item_id, name, estimate_number, contractor,
      group_id, group_title, monday_url,
      account_monday_id, account_domain,
      bid_status, bid_value, awarded_value, bid_source,
      awarded, due_date, location, sharepoint_url,
      synced_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(monday_item_id) DO UPDATE SET
      name = excluded.name,
      estimate_number = COALESCE(excluded.estimate_number, estimates.estimate_number),
      contractor = excluded.contractor,
      group_id = excluded.group_id,
      group_title = excluded.group_title,
      monday_url = excluded.monday_url,
      account_monday_id = COALESCE(excluded.account_monday_id, estimates.account_monday_id),
      account_domain = COALESCE(excluded.account_domain, estimates.account_domain),
      bid_status = excluded.bid_status,
      bid_value = excluded.bid_value,
      awarded_value = excluded.awarded_value,
      bid_source = excluded.bid_source,
      awarded = excluded.awarded,
      due_date = excluded.due_date,
      location = excluded.location,
      sharepoint_url = COALESCE(excluded.sharepoint_url, estimates.sharepoint_url),
      synced_at = datetime('now'),
      updated_at = datetime('now')`,
    [
      data.mondayItemId,
      data.name,
      data.estimateNumber,
      data.contractor,
      data.groupId,
      data.groupTitle,
      data.mondayUrl,
      data.accountMondayId,
      data.accountDomain,
      data.bidStatus,
      data.bidValue,
      data.awardedValue,
      data.bidSource,
      data.awarded ? 1 : 0,
      data.dueDate,
      data.location,
      data.sharepointUrl,
    ]
  );
}

export async function syncEstimates(options: SyncOptions = {}): Promise<void> {
  const { limit, dryRun = false, skipFiles = true } = options;

  console.log("=".repeat(60));
  console.log("ESTIMATES SYNC (Monday → hub.db)");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (limit) {
    console.log(`Limit: ${limit}`);
  }
  console.log(`Skip files: ${skipFiles}`);
  console.log();

  // Fetch items from Monday
  console.log("Fetching estimates from Monday...");
  const fetchOptions = limit && limit > 0 ? { maxItems: limit } : {};
  let items = await getItemsRich(BOARD_IDS.ESTIMATING, fetchOptions);

  // Filter out template/test groups
  const beforeFilter = items.length;
  items = items.filter((item) => !SKIP_GROUPS.includes(item.groupTitle));
  const filtered = beforeFilter - items.length;

  // Apply exact limit
  if (limit && limit > 0 && items.length > limit) {
    items = items.slice(0, limit);
  }

  console.log(
    `Fetched ${items.length} estimates (filtered ${filtered} from skip groups)\n`
  );

  if (items.length === 0) {
    console.log("No estimates to sync.");
    return;
  }

  // Collect account IDs and fetch domains
  console.log("Fetching account domains...");
  const accountIds = items
    .map((item) => extractAccountId(item))
    .filter((id): id is string => id !== null);
  const domainMap = await fetchAccountDomains(accountIds);
  console.log(
    `Fetched ${domainMap.size} domains for ${accountIds.length} linked accounts\n`
  );

  const db = dryRun
    ? new Database(HUB_DB_PATH, { readonly: true })
    : new Database(HUB_DB_PATH);

  let synced = 0;
  let withAccount = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      const data = extractEstimateData(item, domainMap);

      if (dryRun) {
        const accountInfo = data.accountMondayId
          ? `→ ${data.contractor} (${data.accountDomain ?? "no domain"})`
          : "no account";
        console.log(`  [would sync] ${data.name} ${accountInfo}`);
      } else {
        upsertEstimate(db, data);
      }
      synced++;
      if (data.accountMondayId) {
        withAccount++;
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      errors.push(`${item.name}: ${errMsg}`);
      skipped++;
    }
  }

  db.close();

  console.log(`\n${"=".repeat(60)}`);
  console.log("RESULTS");
  console.log("=".repeat(60));
  console.log(`Synced: ${synced}`);
  console.log(
    `With account link: ${withAccount} (${Math.round((withAccount / synced) * 100)}%)`
  );
  if (skipped > 0) {
    console.log(`Skipped: ${skipped}`);
  }
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const err of errors.slice(0, 5)) {
      console.log(`  - ${err}`);
    }
    if (errors.length > 5) {
      console.log(`  ... and ${errors.length - 5} more`);
    }
  }

  if (!skipFiles) {
    console.log(
      "\n(File downloads not yet implemented in unified CLI - use original sync script)"
    );
  }

  if (dryRun) {
    console.log(
      "\nThis was a dry run. Run without --dry-run to apply changes."
    );
  }
}
