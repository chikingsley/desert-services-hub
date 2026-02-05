#!/usr/bin/env bun

/**
 * One-time extraction of Procurement workspace boards from Monday.com
 *
 * Extracts all data from the old Procurement workspace into a local SQLite database.
 * This is a one-time dump - the boards are no longer actively used.
 *
 * Usage:
 *   bun scripts/extract-procurement.ts
 *   bun scripts/extract-procurement.ts --dry-run
 *
 * Output: scripts/procurement.db
 */

import { Database } from "bun:sqlite";
import { getItemsRich, type MondayItemRich } from "../monday/client";

const DB_PATH = "./scripts/procurement.db";

// Board IDs for Procurement workspace
const BOARDS = {
  OPEN_BIDS: 7_505_227_263,
  BIDS_SENT: 7_505_653_112,
  CHECKLIST: 7_844_326_622,
  DUST_PERMITS_WM: 7_816_215_167,
  SIGNAGE: 7_887_806_194,
  SWPPP_MASTER: 8_304_407_803,
  INSPECTIONS_WM: 8_781_744_032,
} as const;

// Column mappings per board (column_id -> friendly_name)
const _OPEN_BIDS_COLUMNS = {
  name: "name",
  text6__1: "contractor_name",
  text3__1: "contact_name",
  phone__1: "phone",
  email__1: "email",
  date: "due_date",
  location__1: "location",
  status__1: "sent_via",
  status1__1: "status",
  text__1: "estimate_number",
  numbers__1: "bid_amount",
  dropdown_1_mkm99hgx: "service_lines",
  dropdown_mkm9dkf5: "project_type",
  numbers_mkm9r4wq: "site_sqft",
  numbers_mkm9wtzv: "building_sqft",
  dup__of_swppp__1: "certified_payroll",
  date__1: "date_received",
  date6__1: "sent_date",
};

const _BIDS_SENT_COLUMNS = {
  name: "name",
  text_1__1: "contractor_name",
  date8__1: "date_sent",
  date7__1: "date_won",
  location__1: "location",
  text__1: "estimate_number",
  numbers__1: "bid_amount",
  text7__1: "contact_name",
  phone__1: "phone",
  email__1: "email",
  status1__1: "status",
  date_mkm9nmy5: "project_end_date",
  tags_mkm974cg: "tags",
  numbers_mkm9ejjp: "acreage",
  dropdown_mkm9x6pr: "dropdown",
  numbers_1_mkm9b4q3: "building_sqft",
  color_mksncnn4: "sent_via",
  date_mksn9ep4: "date_received",
  date_mksn5mrj: "due_date",
  dropdown_mksnvhpm: "service_lines",
  color_mktap0yn: "tivan_records_match",
};

const _CHECKLIST_COLUMNS = {
  name: "name",
  text__1: "contractor",
  location_mkmfzfrc: "location",
  status: "contract_status",
  color_mkpf8bsg: "signage_status",
  color_mkpfnqa2: "dust_permit_status",
  color_mkpfrwgj: "swppp_plan_status",
  color_mkpfbvh0: "inspections_status",
  date_mkmfc6xn: "date_signed",
  text8__1: "estimate_number",
  text_mkpf4z6n: "extract_info",
  email_mkpfdxvb: "contract_email",
  text_mkpfegjb: "onsite_title",
  email_mkpfy49j: "onsite_email",
  phone_mkpfywyh: "onsite_phone",
  text_mkpfhy89: "onsite_contact",
};

const _DUST_PERMITS_COLUMNS = {
  name: "name",
  text__1: "contractor",
  status: "status",
  date4: "last_activity_date",
  status_1__1: "type",
  text1__1: "permit_number",
  date_1__1: "due_date_renewal",
  color_mkpt9x46: "county",
};

const _SIGNAGE_COLUMNS = {
  name: "name",
  status: "status",
  date4: "date_received",
  date__1: "projected_install_date",
  true___false__1: "same_as_install",
  dropdown__1: "signage_type",
  text__1: "onsite_contact_name",
  email__1: "onsite_contact_email",
  phone__1: "onsite_contact_phone",
  location__1: "site_location",
  text0__1: "initial_contact_name",
  email_1__1: "initial_contact_email",
  text6__1: "contractor",
};

const _SWPPP_MASTER_COLUMNS = {
  name: "name",
  date4: "install_date",
  status_mkmejf6y: "status",
  text_mkme3y65: "owner_contractor",
  text_mkmekmpq: "project_name",
  location_mkmee0sa: "address",
  text_mkmek920: "contact",
  phone_mkme6zwe: "phone",
  text_mkmeb0jv: "job_description",
  date_1_mkmenmv7: "date_entered",
  text_mkme8mas: "comments",
  text_mkmebg9t: "sw21_103_43",
  text_mkmez2vn: "work_completed",
  text_mkme7jmg: "item_id",
};

const _INSPECTIONS_COLUMNS = {
  name: "name",
  text_mkpcgvze: "company_name",
  date_mkpcg9ct: "install_date",
  location_mkpcz27f: "location",
  text_mkpccaf3: "contact",
  email_mkpc9km7: "email",
  phone_mkpca1ph: "phone",
  text_mkpcx154: "address",
  color_mkpc96w1: "status",
};

function createTables(db: Database): void {
  // Generic table structure: store raw JSON + extracted key fields
  // This preserves everything while making common fields queryable

  db.run(`
    CREATE TABLE IF NOT EXISTS open_bids (
      id INTEGER PRIMARY KEY,
      monday_id TEXT UNIQUE NOT NULL,
      name TEXT,
      group_id TEXT,
      group_title TEXT,
      contractor_name TEXT,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      due_date TEXT,
      location TEXT,
      sent_via TEXT,
      status TEXT,
      estimate_number TEXT,
      bid_amount REAL,
      service_lines TEXT,
      project_type TEXT,
      site_sqft REAL,
      building_sqft REAL,
      certified_payroll INTEGER,
      date_received TEXT,
      sent_date TEXT,
      raw_columns TEXT,
      extracted_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bids_sent (
      id INTEGER PRIMARY KEY,
      monday_id TEXT UNIQUE NOT NULL,
      name TEXT,
      group_id TEXT,
      group_title TEXT,
      contractor_name TEXT,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      date_sent TEXT,
      date_won TEXT,
      location TEXT,
      estimate_number TEXT,
      bid_amount REAL,
      status TEXT,
      project_end_date TEXT,
      tags TEXT,
      acreage REAL,
      building_sqft REAL,
      sent_via TEXT,
      date_received TEXT,
      due_date TEXT,
      service_lines TEXT,
      tivan_records_match TEXT,
      raw_columns TEXT,
      extracted_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS checklist (
      id INTEGER PRIMARY KEY,
      monday_id TEXT UNIQUE NOT NULL,
      name TEXT,
      group_id TEXT,
      group_title TEXT,
      contractor TEXT,
      location TEXT,
      contract_status TEXT,
      signage_status TEXT,
      dust_permit_status TEXT,
      swppp_plan_status TEXT,
      inspections_status TEXT,
      date_signed TEXT,
      estimate_number TEXT,
      extract_info TEXT,
      contract_email TEXT,
      onsite_title TEXT,
      onsite_email TEXT,
      onsite_phone TEXT,
      onsite_contact TEXT,
      raw_columns TEXT,
      extracted_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS dust_permits (
      id INTEGER PRIMARY KEY,
      monday_id TEXT UNIQUE NOT NULL,
      name TEXT,
      group_id TEXT,
      group_title TEXT,
      contractor TEXT,
      status TEXT,
      last_activity_date TEXT,
      type TEXT,
      permit_number TEXT,
      due_date_renewal TEXT,
      county TEXT,
      raw_columns TEXT,
      extracted_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS signage (
      id INTEGER PRIMARY KEY,
      monday_id TEXT UNIQUE NOT NULL,
      name TEXT,
      group_id TEXT,
      group_title TEXT,
      status TEXT,
      date_received TEXT,
      projected_install_date TEXT,
      same_as_install INTEGER,
      signage_type TEXT,
      onsite_contact_name TEXT,
      onsite_contact_email TEXT,
      onsite_contact_phone TEXT,
      site_location TEXT,
      initial_contact_name TEXT,
      initial_contact_email TEXT,
      contractor TEXT,
      raw_columns TEXT,
      extracted_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS swppp_master (
      id INTEGER PRIMARY KEY,
      monday_id TEXT UNIQUE NOT NULL,
      name TEXT,
      group_id TEXT,
      group_title TEXT,
      install_date TEXT,
      status TEXT,
      owner_contractor TEXT,
      project_name TEXT,
      address TEXT,
      contact TEXT,
      phone TEXT,
      job_description TEXT,
      date_entered TEXT,
      comments TEXT,
      sw21_103_43 TEXT,
      work_completed TEXT,
      item_id TEXT,
      raw_columns TEXT,
      extracted_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS inspections (
      id INTEGER PRIMARY KEY,
      monday_id TEXT UNIQUE NOT NULL,
      name TEXT,
      group_id TEXT,
      group_title TEXT,
      company_name TEXT,
      install_date TEXT,
      location TEXT,
      contact TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      status TEXT,
      raw_columns TEXT,
      extracted_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create indexes for common lookups
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_open_bids_contractor ON open_bids(contractor_name)"
  );
  db.run("CREATE INDEX IF NOT EXISTS idx_open_bids_email ON open_bids(email)");
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_bids_sent_contractor ON bids_sent(contractor_name)"
  );
  db.run("CREATE INDEX IF NOT EXISTS idx_bids_sent_email ON bids_sent(email)");
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_checklist_contractor ON checklist(contractor)"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_dust_permits_permit ON dust_permits(permit_number)"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_inspections_company ON inspections(company_name)"
  );
}

function extractColumn(item: MondayItemRich, columnId: string): string | null {
  return item.columns[columnId] ?? null;
}

function extractNumber(item: MondayItemRich, columnId: string): number | null {
  const val = item.columns[columnId];
  if (val === null || val === undefined || val === "") {
    return null;
  }
  const num = Number.parseFloat(String(val));
  return Number.isNaN(num) ? null : num;
}

function extractBoolean(item: MondayItemRich, columnId: string): number | null {
  const val = item.columns[columnId];
  if (val === null || val === undefined) {
    return null;
  }
  // Monday checkboxes return "v" for checked
  return val === "v" || val === "true" || val === true ? 1 : 0;
}

async function extractOpenBids(db: Database): Promise<number> {
  console.log("\nFetching OPEN_BIDS...");
  const items = await getItemsRich(BOARDS.OPEN_BIDS);
  console.log(`  Got ${items.length} items`);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO open_bids (
      monday_id, name, group_id, group_title,
      contractor_name, contact_name, phone, email,
      due_date, location, sent_via, status,
      estimate_number, bid_amount, service_lines, project_type,
      site_sqft, building_sqft, certified_payroll,
      date_received, sent_date, raw_columns
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    stmt.run(
      item.id,
      item.name,
      item.groupId,
      item.groupTitle,
      extractColumn(item, "text6__1"),
      extractColumn(item, "text3__1"),
      extractColumn(item, "phone__1"),
      extractColumn(item, "email__1"),
      extractColumn(item, "date"),
      extractColumn(item, "location__1"),
      extractColumn(item, "status__1"),
      extractColumn(item, "status1__1"),
      extractColumn(item, "text__1"),
      extractNumber(item, "numbers__1"),
      extractColumn(item, "dropdown_1_mkm99hgx"),
      extractColumn(item, "dropdown_mkm9dkf5"),
      extractNumber(item, "numbers_mkm9r4wq"),
      extractNumber(item, "numbers_mkm9wtzv"),
      extractBoolean(item, "dup__of_swppp__1"),
      extractColumn(item, "date__1"),
      extractColumn(item, "date6__1"),
      JSON.stringify(item.columns)
    );
  }

  return items.length;
}

async function extractBidsSent(db: Database): Promise<number> {
  console.log("\nFetching BIDS_SENT...");
  const items = await getItemsRich(BOARDS.BIDS_SENT);
  console.log(`  Got ${items.length} items`);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO bids_sent (
      monday_id, name, group_id, group_title,
      contractor_name, contact_name, phone, email,
      date_sent, date_won, location, estimate_number,
      bid_amount, status, project_end_date, tags,
      acreage, building_sqft, sent_via, date_received,
      due_date, service_lines, tivan_records_match, raw_columns
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    stmt.run(
      item.id,
      item.name,
      item.groupId,
      item.groupTitle,
      extractColumn(item, "text_1__1"),
      extractColumn(item, "text7__1"),
      extractColumn(item, "phone__1"),
      extractColumn(item, "email__1"),
      extractColumn(item, "date8__1"),
      extractColumn(item, "date7__1"),
      extractColumn(item, "location__1"),
      extractColumn(item, "text__1"),
      extractNumber(item, "numbers__1"),
      extractColumn(item, "status1__1"),
      extractColumn(item, "date_mkm9nmy5"),
      extractColumn(item, "tags_mkm974cg"),
      extractNumber(item, "numbers_mkm9ejjp"),
      extractNumber(item, "numbers_1_mkm9b4q3"),
      extractColumn(item, "color_mksncnn4"),
      extractColumn(item, "date_mksn9ep4"),
      extractColumn(item, "date_mksn5mrj"),
      extractColumn(item, "dropdown_mksnvhpm"),
      extractColumn(item, "color_mktap0yn"),
      JSON.stringify(item.columns)
    );
  }

  return items.length;
}

async function extractChecklist(db: Database): Promise<number> {
  console.log("\nFetching CHECKLIST...");
  const items = await getItemsRich(BOARDS.CHECKLIST);
  console.log(`  Got ${items.length} items`);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO checklist (
      monday_id, name, group_id, group_title,
      contractor, location, contract_status, signage_status,
      dust_permit_status, swppp_plan_status, inspections_status,
      date_signed, estimate_number, extract_info,
      contract_email, onsite_title, onsite_email,
      onsite_phone, onsite_contact, raw_columns
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    stmt.run(
      item.id,
      item.name,
      item.groupId,
      item.groupTitle,
      extractColumn(item, "text__1"),
      extractColumn(item, "location_mkmfzfrc"),
      extractColumn(item, "status"),
      extractColumn(item, "color_mkpf8bsg"),
      extractColumn(item, "color_mkpfnqa2"),
      extractColumn(item, "color_mkpfrwgj"),
      extractColumn(item, "color_mkpfbvh0"),
      extractColumn(item, "date_mkmfc6xn"),
      extractColumn(item, "text8__1"),
      extractColumn(item, "text_mkpf4z6n"),
      extractColumn(item, "email_mkpfdxvb"),
      extractColumn(item, "text_mkpfegjb"),
      extractColumn(item, "email_mkpfy49j"),
      extractColumn(item, "phone_mkpfywyh"),
      extractColumn(item, "text_mkpfhy89"),
      JSON.stringify(item.columns)
    );
  }

  return items.length;
}

async function extractDustPermits(db: Database): Promise<number> {
  console.log("\nFetching DUST_PERMITS_WM...");
  const items = await getItemsRich(BOARDS.DUST_PERMITS_WM);
  console.log(`  Got ${items.length} items`);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO dust_permits (
      monday_id, name, group_id, group_title,
      contractor, status, last_activity_date, type,
      permit_number, due_date_renewal, county, raw_columns
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    stmt.run(
      item.id,
      item.name,
      item.groupId,
      item.groupTitle,
      extractColumn(item, "text__1"),
      extractColumn(item, "status"),
      extractColumn(item, "date4"),
      extractColumn(item, "status_1__1"),
      extractColumn(item, "text1__1"),
      extractColumn(item, "date_1__1"),
      extractColumn(item, "color_mkpt9x46"),
      JSON.stringify(item.columns)
    );
  }

  return items.length;
}

async function extractSignage(db: Database): Promise<number> {
  console.log("\nFetching SIGNAGE...");
  const items = await getItemsRich(BOARDS.SIGNAGE);
  console.log(`  Got ${items.length} items`);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO signage (
      monday_id, name, group_id, group_title,
      status, date_received, projected_install_date, same_as_install,
      signage_type, onsite_contact_name, onsite_contact_email, onsite_contact_phone,
      site_location, initial_contact_name, initial_contact_email, contractor, raw_columns
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    stmt.run(
      item.id,
      item.name,
      item.groupId,
      item.groupTitle,
      extractColumn(item, "status"),
      extractColumn(item, "date4"),
      extractColumn(item, "date__1"),
      extractBoolean(item, "true___false__1"),
      extractColumn(item, "dropdown__1"),
      extractColumn(item, "text__1"),
      extractColumn(item, "email__1"),
      extractColumn(item, "phone__1"),
      extractColumn(item, "location__1"),
      extractColumn(item, "text0__1"),
      extractColumn(item, "email_1__1"),
      extractColumn(item, "text6__1"),
      JSON.stringify(item.columns)
    );
  }

  return items.length;
}

async function extractSwpppMaster(db: Database): Promise<number> {
  console.log("\nFetching SWPPP_MASTER...");
  const items = await getItemsRich(BOARDS.SWPPP_MASTER);
  console.log(`  Got ${items.length} items`);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO swppp_master (
      monday_id, name, group_id, group_title,
      install_date, status, owner_contractor, project_name,
      address, contact, phone, job_description,
      date_entered, comments, sw21_103_43, work_completed,
      item_id, raw_columns
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    stmt.run(
      item.id,
      item.name,
      item.groupId,
      item.groupTitle,
      extractColumn(item, "date4"),
      extractColumn(item, "status_mkmejf6y"),
      extractColumn(item, "text_mkme3y65"),
      extractColumn(item, "text_mkmekmpq"),
      extractColumn(item, "location_mkmee0sa"),
      extractColumn(item, "text_mkmek920"),
      extractColumn(item, "phone_mkme6zwe"),
      extractColumn(item, "text_mkmeb0jv"),
      extractColumn(item, "date_1_mkmenmv7"),
      extractColumn(item, "text_mkme8mas"),
      extractColumn(item, "text_mkmebg9t"),
      extractColumn(item, "text_mkmez2vn"),
      extractColumn(item, "text_mkme7jmg"),
      JSON.stringify(item.columns)
    );
  }

  return items.length;
}

async function extractInspections(db: Database): Promise<number> {
  console.log("\nFetching INSPECTIONS_WM...");
  const items = await getItemsRich(BOARDS.INSPECTIONS_WM);
  console.log(`  Got ${items.length} items`);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO inspections (
      monday_id, name, group_id, group_title,
      company_name, install_date, location, contact,
      email, phone, address, status, raw_columns
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    stmt.run(
      item.id,
      item.name,
      item.groupId,
      item.groupTitle,
      extractColumn(item, "text_mkpcgvze"),
      extractColumn(item, "date_mkpcg9ct"),
      extractColumn(item, "location_mkpcz27f"),
      extractColumn(item, "text_mkpccaf3"),
      extractColumn(item, "email_mkpc9km7"),
      extractColumn(item, "phone_mkpca1ph"),
      extractColumn(item, "text_mkpcx154"),
      extractColumn(item, "color_mkpc96w1"),
      JSON.stringify(item.columns)
    );
  }

  return items.length;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  console.log("=".repeat(60));
  console.log("PROCUREMENT WORKSPACE EXTRACTION");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Output: ${DB_PATH}`);
  console.log();

  if (dryRun) {
    console.log("Dry run - would extract from these boards:");
    for (const [name, id] of Object.entries(BOARDS)) {
      console.log(`  - ${name} (${id})`);
    }
    return;
  }

  // Create/open database
  const db = new Database(DB_PATH);
  console.log("Creating tables...");
  createTables(db);

  const counts: Record<string, number> = {};

  // Extract each board
  counts.open_bids = await extractOpenBids(db);
  counts.bids_sent = await extractBidsSent(db);
  counts.checklist = await extractChecklist(db);
  counts.dust_permits = await extractDustPermits(db);
  counts.signage = await extractSignage(db);
  counts.swppp_master = await extractSwpppMaster(db);
  counts.inspections = await extractInspections(db);

  db.close();

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("EXTRACTION COMPLETE");
  console.log("=".repeat(60));
  console.log();

  let total = 0;
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table}: ${count.toLocaleString()} items`);
    total += count;
  }
  console.log(`  ${"─".repeat(30)}`);
  console.log(`  TOTAL: ${total.toLocaleString()} items`);
  console.log();
  console.log(`Database saved to: ${DB_PATH}`);
  console.log();
  console.log("Query examples:");
  console.log(
    '  sqlite3 scripts/procurement.db "SELECT COUNT(*) FROM bids_sent"'
  );
  console.log(
    '  sqlite3 scripts/procurement.db "SELECT name, email, phone FROM open_bids WHERE email IS NOT NULL LIMIT 10"'
  );
}

main().catch((err) => {
  console.error("Extraction failed:", err);
  process.exit(1);
});
