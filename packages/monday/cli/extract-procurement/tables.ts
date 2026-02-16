import type { Database } from "bun:sqlite";

export function createTables(db: Database): void {
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
