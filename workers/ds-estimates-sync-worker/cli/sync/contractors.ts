/**
 * Sync CONTRACTORS board → accounts table in hub.db
 *
 * READ ONLY from Monday - only pulls data, never updates Monday.
 */

import { Database } from "bun:sqlite";
import { getItemsRich, type MondayItemRich } from "../../monday/client";
import { BOARD_IDS, CONTRACTORS_COLUMNS } from "../../monday/types";

const HUB_DB_PATH =
  "/Users/chiejimofor/Documents/Github/desert-services-hub/apps/contract-ui/contract/hub.db";

// Groups to skip (templates, test data)
const SKIP_GROUPS = ["Shell Accounts", "Test Accounts"];

// Top-level regex patterns
const PROTOCOL_REGEX = /^https?:\/\//;
const WWW_PREFIX_REGEX = /^www\./;

interface SyncOptions {
  limit?: number;
  dryRun?: boolean;
  skipFiles?: boolean; // unused for contractors, but included for interface consistency
}

interface ContractorData {
  mondayAccountId: string;
  name: string;
  domain: string | null;
  industry: string | null;
  description: string | null;
  employeeCount: string | null;
  headquarters: string | null;
  companyProfileUrl: string | null;
  accountType: string | null;
  projectTypes: string | null;
  sharepointUrl: string | null;
  lastContacted: string | null;
  domainActive: number;
  prefFenceVendor: string | null;
  prefPortoVendor: string | null;
  prefStormVendor: string | null;
  groupId: string;
  groupTitle: string;
}

function extractContractorData(item: MondayItemRich): ContractorData {
  const cols = item.columns;

  // Extract domain from link column (format: "domain - url" or just domain)
  let domain = cols[CONTRACTORS_COLUMNS.DOMAIN.id] ?? null;
  if (domain) {
    // Strip any "- http..." suffix from link column display
    domain = domain.split(" - ")[0].trim();
    // Strip protocol and trailing path just in case
    domain = domain
      .replace(PROTOCOL_REGEX, "")
      .replace(WWW_PREFIX_REGEX, "")
      .split("/")[0];
  }

  return {
    mondayAccountId: item.id,
    name: item.name,
    domain,
    industry: cols[CONTRACTORS_COLUMNS.INDUSTRY.id] ?? null,
    description: cols[CONTRACTORS_COLUMNS.DESCRIPTION.id] ?? null,
    employeeCount: cols[CONTRACTORS_COLUMNS.EMPLOYEE_COUNT.id] ?? null,
    headquarters: cols[CONTRACTORS_COLUMNS.HEADQUARTERS.id] ?? null,
    companyProfileUrl: cols[CONTRACTORS_COLUMNS.COMPANY_PROFILE.id] ?? null,
    accountType: cols[CONTRACTORS_COLUMNS.ACCOUNT_TYPE.id] ?? null,
    projectTypes: cols[CONTRACTORS_COLUMNS.PROJECT_TYPES.id] ?? null,
    sharepointUrl: cols[CONTRACTORS_COLUMNS.SHAREPOINT_URL.id] ?? null,
    lastContacted: cols[CONTRACTORS_COLUMNS.LAST_CONTACTED.id] ?? null,
    domainActive:
      cols[CONTRACTORS_COLUMNS.DOMAIN_ACTIVE.id] === "Active" ? 1 : 0,
    prefFenceVendor: cols[CONTRACTORS_COLUMNS.PREF_FENCE_VENDOR.id] ?? null,
    prefPortoVendor: cols[CONTRACTORS_COLUMNS.PREF_PORTO_VENDOR.id] ?? null,
    prefStormVendor: cols[CONTRACTORS_COLUMNS.PREF_STORM_VENDOR.id] ?? null,
    groupId: item.groupId,
    groupTitle: item.groupTitle,
  };
}

function upsertContractor(db: Database, data: ContractorData): void {
  db.run(
    `INSERT INTO accounts (
      monday_account_id, monday_name, name, domain,
      industry, description, employee_count, headquarters,
      company_profile_url, account_type, project_types,
      sharepoint_url, last_contacted, domain_active,
      pref_fence_vendor, pref_porto_vendor, pref_storm_vendor,
      group_id, group_title,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(monday_account_id) DO UPDATE SET
      monday_name = excluded.monday_name,
      name = excluded.name,
      domain = COALESCE(excluded.domain, accounts.domain),
      industry = excluded.industry,
      description = excluded.description,
      employee_count = excluded.employee_count,
      headquarters = excluded.headquarters,
      company_profile_url = excluded.company_profile_url,
      account_type = excluded.account_type,
      project_types = excluded.project_types,
      sharepoint_url = excluded.sharepoint_url,
      last_contacted = excluded.last_contacted,
      domain_active = excluded.domain_active,
      pref_fence_vendor = excluded.pref_fence_vendor,
      pref_porto_vendor = excluded.pref_porto_vendor,
      pref_storm_vendor = excluded.pref_storm_vendor,
      group_id = excluded.group_id,
      group_title = excluded.group_title,
      updated_at = datetime('now')`,
    [
      data.mondayAccountId,
      data.name,
      data.name,
      data.domain,
      data.industry,
      data.description,
      data.employeeCount,
      data.headquarters,
      data.companyProfileUrl,
      data.accountType,
      data.projectTypes,
      data.sharepointUrl,
      data.lastContacted,
      data.domainActive,
      data.prefFenceVendor,
      data.prefPortoVendor,
      data.prefStormVendor,
      data.groupId,
      data.groupTitle,
    ]
  );
}

export async function syncContractors(
  options: SyncOptions = {}
): Promise<void> {
  const { limit, dryRun = false } = options;

  console.log("=".repeat(60));
  console.log("CONTRACTORS SYNC (Monday → hub.db)");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (limit) {
    console.log(`Limit: ${limit}`);
  }
  console.log();

  // Fetch items from Monday
  console.log("Fetching contractors from Monday...");
  const fetchOptions = limit && limit > 0 ? { maxItems: limit } : {};
  let items = await getItemsRich(BOARD_IDS.CONTRACTORS, fetchOptions);

  // Filter out template/test groups
  items = items.filter((item) => !SKIP_GROUPS.includes(item.groupTitle));

  // Apply exact limit
  if (limit && limit > 0 && items.length > limit) {
    items = items.slice(0, limit);
  }

  console.log(`Fetched ${items.length} contractors\n`);

  if (items.length === 0) {
    console.log("No contractors to sync.");
    return;
  }

  const db = dryRun
    ? new Database(HUB_DB_PATH, { readonly: true })
    : new Database(HUB_DB_PATH);

  // Check if monday_account_id has unique constraint, add if missing
  if (!dryRun) {
    try {
      db.run(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_monday_unique ON accounts(monday_account_id)"
      );
    } catch {
      // Index may already exist
    }
  }

  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      const data = extractContractorData(item);

      if (dryRun) {
        console.log(
          `  [would sync] ${data.name} (${data.domain ?? "no domain"})`
        );
      } else {
        upsertContractor(db, data);
      }
      synced++;
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

  if (dryRun) {
    console.log(
      "\nThis was a dry run. Run without --dry-run to apply changes."
    );
  }
}
