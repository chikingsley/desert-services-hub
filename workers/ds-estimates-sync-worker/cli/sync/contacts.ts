/**
 * Sync CONTACTS board → contacts table in hub.db
 *
 * READ ONLY from Monday - only pulls data, never updates Monday.
 */

import { Database } from "bun:sqlite";
import { getItemsRich, type MondayItemRich } from "../../monday/client";
import { BOARD_IDS, CONTACTS_COLUMNS } from "../../monday/types";

const HUB_DB_PATH =
  "/Users/chiejimofor/Documents/Github/desert-services-hub/apps/contract-ui/contract/hub.db";

// Groups to skip
const SKIP_GROUPS = ["Shell Contacts", "Test Contacts"];

interface SyncOptions {
  limit?: number;
  dryRun?: boolean;
  skipFiles?: boolean; // unused for contacts
}

interface ContactData {
  mondayItemId: string;
  name: string;
  email: string | null;
  phone: string | null;
  mobilePhone: string | null;
  officePhone: string | null;
  companyPhone: string | null;
  companyFax: string | null;
  title: string | null;
  priority: string | null;
  contractorMondayId: string | null;
  projectMondayIds: string | null; // JSON array
  territoryOwner: string | null;
  importedAccountName: string | null;
  importedPhone: string | null;
  contractorMatched: string | null;
  phoneMatched: string | null;
  groupId: string;
  groupTitle: string;
}

function extractContactData(item: MondayItemRich): ContactData {
  const cols = item.columns;

  // Extract contractor link from board relation
  const contractorColValue = item.columnValues.find(
    (cv) => cv.id === CONTACTS_COLUMNS.CONTRACTOR.id
  );
  const contractorMondayId = contractorColValue?.linkedItemIds?.[0] ?? null;

  // Extract project links as JSON array
  const projectsColValue = item.columnValues.find(
    (cv) => cv.id === CONTACTS_COLUMNS.PROJECTS.id
  );
  const projectMondayIds = projectsColValue?.linkedItemIds?.length
    ? JSON.stringify(projectsColValue.linkedItemIds)
    : null;

  return {
    mondayItemId: item.id,
    name: item.name,
    email: cols[CONTACTS_COLUMNS.EMAIL.id] ?? null,
    phone: cols[CONTACTS_COLUMNS.PHONE.id] ?? null,
    mobilePhone: cols[CONTACTS_COLUMNS.MOBILE_PHONE.id] ?? null,
    officePhone: cols[CONTACTS_COLUMNS.OFFICE_PHONE.id] ?? null,
    companyPhone: cols[CONTACTS_COLUMNS.COMPANY_PHONE.id] ?? null,
    companyFax: cols[CONTACTS_COLUMNS.COMPANY_FAX.id] ?? null,
    title: cols[CONTACTS_COLUMNS.TITLE.id] ?? null,
    priority: cols[CONTACTS_COLUMNS.PRIORITY.id] ?? null,
    contractorMondayId,
    projectMondayIds,
    territoryOwner: cols[CONTACTS_COLUMNS.TERRITORY_OWNER.id] ?? null,
    importedAccountName:
      cols[CONTACTS_COLUMNS.IMPORTED_ACCOUNT_NAME.id] ?? null,
    importedPhone: cols[CONTACTS_COLUMNS.IMPORTED_PHONE.id] ?? null,
    contractorMatched: cols[CONTACTS_COLUMNS.CONTRACTOR_MATCHED.id] ?? null,
    phoneMatched: cols[CONTACTS_COLUMNS.PHONE_MATCHED.id] ?? null,
    groupId: item.groupId,
    groupTitle: item.groupTitle,
  };
}

function upsertContact(db: Database, data: ContactData): void {
  // First, look up account_id from contractor monday ID if we have one
  let accountId: number | null = null;
  if (data.contractorMondayId) {
    const account = db
      .query<{ id: number }, [string]>(
        "SELECT id FROM accounts WHERE monday_account_id = ?"
      )
      .get(data.contractorMondayId);
    accountId = account?.id ?? null;
  }

  db.run(
    `INSERT INTO contacts (
      monday_item_id, name, email, phone, mobile_phone, office_phone,
      company_phone, company_fax, title, priority,
      account_id, contractor_monday_id, project_monday_ids,
      territory_owner, imported_account_name, imported_phone,
      contractor_matched, phone_matched, group_id, group_title,
      synced_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(monday_item_id) DO UPDATE SET
      name = excluded.name,
      email = COALESCE(excluded.email, contacts.email),
      phone = COALESCE(excluded.phone, contacts.phone),
      mobile_phone = COALESCE(excluded.mobile_phone, contacts.mobile_phone),
      office_phone = COALESCE(excluded.office_phone, contacts.office_phone),
      company_phone = COALESCE(excluded.company_phone, contacts.company_phone),
      company_fax = COALESCE(excluded.company_fax, contacts.company_fax),
      title = excluded.title,
      priority = excluded.priority,
      account_id = COALESCE(excluded.account_id, contacts.account_id),
      contractor_monday_id = COALESCE(excluded.contractor_monday_id, contacts.contractor_monday_id),
      project_monday_ids = excluded.project_monday_ids,
      territory_owner = excluded.territory_owner,
      imported_account_name = excluded.imported_account_name,
      imported_phone = excluded.imported_phone,
      contractor_matched = excluded.contractor_matched,
      phone_matched = excluded.phone_matched,
      group_id = excluded.group_id,
      group_title = excluded.group_title,
      synced_at = datetime('now'),
      updated_at = datetime('now')`,
    [
      data.mondayItemId,
      data.name,
      data.email,
      data.phone,
      data.mobilePhone,
      data.officePhone,
      data.companyPhone,
      data.companyFax,
      data.title,
      data.priority,
      accountId,
      data.contractorMondayId,
      data.projectMondayIds,
      data.territoryOwner,
      data.importedAccountName,
      data.importedPhone,
      data.contractorMatched,
      data.phoneMatched,
      data.groupId,
      data.groupTitle,
    ]
  );
}

export async function syncContacts(options: SyncOptions = {}): Promise<void> {
  const { limit, dryRun = false } = options;

  console.log("=".repeat(60));
  console.log("CONTACTS SYNC (Monday → hub.db)");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (limit) {
    console.log(`Limit: ${limit}`);
  }
  console.log();

  // Fetch items from Monday
  console.log("Fetching contacts from Monday...");
  const fetchOptions = limit && limit > 0 ? { maxItems: limit } : {};
  let items = await getItemsRich(BOARD_IDS.CONTACTS, fetchOptions);

  // Filter out template/test groups
  items = items.filter((item) => !SKIP_GROUPS.includes(item.groupTitle));

  // Apply exact limit
  if (limit && limit > 0 && items.length > limit) {
    items = items.slice(0, limit);
  }

  console.log(`Fetched ${items.length} contacts\n`);

  if (items.length === 0) {
    console.log("No contacts to sync.");
    return;
  }

  const db = dryRun
    ? new Database(HUB_DB_PATH, { readonly: true })
    : new Database(HUB_DB_PATH);

  let synced = 0;
  let withContractor = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      const data = extractContactData(item);

      if (dryRun) {
        const contractorInfo = data.contractorMondayId
          ? `→ contractor ${data.contractorMondayId}`
          : "no contractor";
        console.log(`  [would sync] ${data.name} (${contractorInfo})`);
      } else {
        upsertContact(db, data);
      }
      synced++;
      if (data.contractorMondayId) {
        withContractor++;
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
    `With contractor link: ${withContractor} (${Math.round((withContractor / synced) * 100)}%)`
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

  if (dryRun) {
    console.log(
      "\nThis was a dry run. Run without --dry-run to apply changes."
    );
  }
}
