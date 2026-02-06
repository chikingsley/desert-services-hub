/**
 * Hub Database Schema
 *
 * All table definitions, indexes, and migrations.
 * Called once on import to ensure schema exists.
 */
import { db } from "@lib/db/hub";

// ============================================
// Schema: Mailboxes
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS mailboxes (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    last_sync_at TEXT,
    email_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// ============================================
// Schema: Emails
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY,
    message_id TEXT UNIQUE NOT NULL,
    mailbox_id INTEGER NOT NULL,
    conversation_id TEXT,
    subject TEXT,
    from_email TEXT,
    from_name TEXT,
    to_emails TEXT,
    cc_emails TEXT,
    received_at TEXT NOT NULL,
    has_attachments INTEGER DEFAULT 0,
    attachment_names TEXT,
    body_preview TEXT,
    web_url TEXT,

    -- Classification
    classification TEXT,
    classification_confidence REAL,
    classification_method TEXT,

    -- Linking
    project_name TEXT,
    contractor_name TEXT,
    monday_estimate_id TEXT,
    notion_project_id TEXT,

    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id)
  )
`);

// ============================================
// Schema: Accounts (Contractors/GCs)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY,
    domain TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'contractor',
    contact_count INTEGER DEFAULT 0,
    email_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// ============================================
// Schema: Projects
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    account_id INTEGER,
    name TEXT NOT NULL,
    normalized_name TEXT,
    address TEXT,
    email_count INTEGER DEFAULT 0,
    first_seen TEXT,
    last_seen TEXT,
    monday_item_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  )
`);

// ============================================
// Schema: Project Aliases
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS project_aliases (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, normalized_alias)
  )
`);

// ============================================
// Schema: Company Aliases (for account name variations)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS company_aliases (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL,
    alias TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    UNIQUE(account_id, alias)
  )
`);

// ============================================
// Schema: Attachments
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY,
    email_id INTEGER NOT NULL,
    attachment_id TEXT NOT NULL,
    name TEXT NOT NULL,
    content_type TEXT,
    size INTEGER,
    storage_bucket TEXT,
    storage_path TEXT,
    extracted_text TEXT,
    extraction_status TEXT DEFAULT 'pending',
    extraction_error TEXT,
    extracted_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (email_id) REFERENCES emails(id),
    UNIQUE(email_id, attachment_id)
  )
`);

// ============================================
// Schema: Estimates (Monday.com ESTIMATING board)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS estimates (
    id INTEGER PRIMARY KEY,
    monday_item_id TEXT UNIQUE,
    name TEXT NOT NULL,
    estimate_number TEXT,
    contractor TEXT,
    group_id TEXT,
    group_title TEXT,
    monday_url TEXT,
    account_monday_id TEXT,
    account_domain TEXT,
    bid_status TEXT,
    bid_value REAL,
    awarded_value REAL,
    bid_source TEXT,
    awarded INTEGER DEFAULT 0,
    due_date TEXT,
    location TEXT,
    sharepoint_url TEXT,
    estimate_storage_bucket TEXT,
    estimate_storage_path TEXT,
    estimate_file_name TEXT,
    estimate_synced_at TEXT,
    plans_storage_path TEXT,
    contracts_storage_path TEXT,
    noi_storage_path TEXT,
    synced_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// ============================================
// Schema: Takeoffs (PDF measurement data)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS takeoffs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pdf_url TEXT,
    annotations TEXT NOT NULL DEFAULT '[]',
    page_scales TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// ============================================
// Migration: Replace old flat estimate_line_items with versioned schema
// Old table had estimate_id column, new one uses version_id.
// Migrate existing OCR data into versioned model.
// ============================================
{
  const tableInfo = db
    .query<{ name: string }, []>(
      "SELECT name FROM pragma_table_info('estimate_line_items') WHERE name = 'estimate_id'"
    )
    .get();

  if (tableInfo) {
    db.run(
      "ALTER TABLE estimate_line_items RENAME TO _estimate_line_items_old"
    );
  }
}

// ============================================
// Schema: Estimate Versions
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS estimate_versions (
    id TEXT PRIMARY KEY,
    estimate_id INTEGER NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'manual',
    total REAL NOT NULL DEFAULT 0,
    is_current INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// ============================================
// Schema: Estimate Sections
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS estimate_sections (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES estimate_versions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    title TEXT,
    show_subtotal INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// ============================================
// Schema: Estimate Line Items (versioned)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS estimate_line_items (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES estimate_versions(id) ON DELETE CASCADE,
    section_id TEXT REFERENCES estimate_sections(id),
    item_name TEXT,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'EA',
    unit_cost REAL NOT NULL DEFAULT 0,
    unit_price REAL NOT NULL DEFAULT 0,
    is_excluded INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// ============================================
// Schema: Catalog
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS catalog_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    selection_mode TEXT NOT NULL DEFAULT 'pick-many',
    supports_takeoff INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS catalog_subcategories (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    selection_mode TEXT NOT NULL DEFAULT 'pick-many',
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES catalog_categories(id) ON DELETE CASCADE
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS catalog_items (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    subcategory_id TEXT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'Each',
    notes TEXT,
    default_qty REAL NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_takeoff_item INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES catalog_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (subcategory_id) REFERENCES catalog_subcategories(id) ON DELETE SET NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS catalog_takeoff_bundles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    unit TEXT NOT NULL,
    tool_type TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS catalog_bundle_items (
    id TEXT PRIMARY KEY,
    bundle_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    is_required INTEGER DEFAULT 1,
    quantity_multiplier REAL DEFAULT 1.0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (bundle_id) REFERENCES catalog_takeoff_bundles(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE,
    UNIQUE(bundle_id, item_id)
  )
`);

// ============================================
// Migration: Migrate old flat line items → versioned model
// ============================================
{
  const oldTable = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='_estimate_line_items_old'"
    )
    .get();

  if (oldTable) {
    const estimateIds = db
      .query<{ estimate_id: number }, []>(
        "SELECT DISTINCT estimate_id FROM _estimate_line_items_old"
      )
      .all();

    for (const { estimate_id } of estimateIds) {
      const versionId = `ocr-migrate-${estimate_id}`;
      db.run(
        `INSERT OR IGNORE INTO estimate_versions (id, estimate_id, version_number, source, total, is_current)
         VALUES (?, ?, 1, 'ocr', (SELECT COALESCE(SUM(total), 0) FROM _estimate_line_items_old WHERE estimate_id = ?), 1)`,
        [versionId, estimate_id, estimate_id]
      );

      db.run(
        `INSERT OR IGNORE INTO estimate_line_items (id, version_id, item_name, description, quantity, unit, unit_cost, unit_price, sort_order)
         SELECT 'ocr-migrate-' || id, ?, item, COALESCE(description, item, ''), qty, COALESCE(unit, 'EA'), unit_cost, total, sort_order
         FROM _estimate_line_items_old WHERE estimate_id = ?`,
        [versionId, estimate_id]
      );
    }

    db.run("DROP TABLE _estimate_line_items_old");
  }
}

// ============================================
// Schema: SWPPP Work Orders (from SharePoint Excel)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS swppp_work_orders (
    id INTEGER PRIMARY KEY,
    row_number INTEGER NOT NULL,
    worksheet TEXT NOT NULL,
    date TEXT,
    contractor TEXT,
    job_name TEXT,
    address TEXT,
    contact TEXT,
    phone TEXT,
    work_description TEXT,
    date_entered TEXT,
    comments TEXT,
    invoice TEXT,
    work_completed TEXT,
    account_id INTEGER REFERENCES accounts(id),
    project_id INTEGER REFERENCES projects(id),
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(worksheet, row_number)
  )
`);

// ============================================
// Schema: Permits (Dust Control Permits)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS permits (
    id TEXT PRIMARY KEY,              -- D0063581 (Maricopa portal permit ID)
    project_name TEXT,
    account_id INTEGER REFERENCES accounts(id),
    project_id INTEGER REFERENCES projects(id),
    company_name TEXT,                -- original name from portal
    portal_company_id TEXT,           -- CMP005052 (Maricopa portal company ID)
    status TEXT,                      -- Draft, Submitted, Active, Superseded, Closed, Rejected, Pending Payment
    submitted_date TEXT,
    effective_date TEXT,
    expiration_date TEXT,
    closed_date TEXT,
    previous_app_id TEXT,             -- renewal chain tracking
    project_start_date TEXT,
    project_end_date TEXT,
    address TEXT,
    city TEXT,
    parcel TEXT,                      -- APN (Assessor's Parcel Number)
    is_block_permit INTEGER DEFAULT 0,
    is_accelerated INTEGER DEFAULT 0,
    invoice_number TEXT,
    invoice_charges REAL,
    invoice_balance REAL,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )
`);

// ============================================
// Migration: Make monday_item_id nullable
// SQLite can't ALTER NOT NULL constraints, so recreate the table.
// ============================================
{
  const col = db
    .query<{ notnull: number }, []>(
      "SELECT \"notnull\" FROM pragma_table_info('estimates') WHERE name = 'monday_item_id'"
    )
    .get();

  if (col?.notnull === 1) {
    // Build column list dynamically from current table
    const cols = db
      .query<{ name: string; type: string; dflt_value: string | null }, []>(
        "SELECT name, type, dflt_value FROM pragma_table_info('estimates')"
      )
      .all();

    const colDefs = cols.map((c) => {
      if (c.name === "id") {
        return "id INTEGER PRIMARY KEY";
      }
      if (c.name === "monday_item_id") {
        return "monday_item_id TEXT UNIQUE";
      }
      if (c.name === "name") {
        return "name TEXT NOT NULL";
      }
      let def = `${c.name} ${c.type}`;
      if (c.dflt_value != null) {
        const needsParens = c.dflt_value.includes("(");
        def += needsParens
          ? ` DEFAULT (${c.dflt_value})`
          : ` DEFAULT ${c.dflt_value}`;
      }
      return def;
    });

    const colNames = cols.map((c) => c.name).join(", ");

    db.run("PRAGMA foreign_keys = OFF");
    db.run("BEGIN TRANSACTION");
    try {
      db.run(`CREATE TABLE estimates_new (${colDefs.join(", ")})`);
      db.run(
        `INSERT INTO estimates_new (${colNames}) SELECT ${colNames} FROM estimates`
      );
      db.run("DROP TABLE estimates");
      db.run("ALTER TABLE estimates_new RENAME TO estimates");
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      throw e;
    }
    db.run("PRAGMA foreign_keys = ON");
  }
}

// ============================================
// Migrations (add columns to existing tables)
// ============================================

const migrations = [
  // Emails table additions
  "ALTER TABLE emails ADD COLUMN account_id INTEGER REFERENCES accounts(id)",
  "ALTER TABLE emails ADD COLUMN project_id INTEGER REFERENCES projects(id)",
  "ALTER TABLE emails ADD COLUMN body_full TEXT",
  "ALTER TABLE emails ADD COLUMN body_html TEXT",
  "ALTER TABLE emails ADD COLUMN from_domain TEXT",
  "ALTER TABLE emails ADD COLUMN is_internal INTEGER DEFAULT 0",
  "ALTER TABLE emails ADD COLUMN is_forwarded INTEGER DEFAULT 0",
  "ALTER TABLE emails ADD COLUMN original_sender_email TEXT",
  "ALTER TABLE emails ADD COLUMN original_sender_domain TEXT",
  "ALTER TABLE emails ADD COLUMN categories TEXT",
  "ALTER TABLE emails ADD COLUMN normalized_subject TEXT",
  // Email linking additions
  "ALTER TABLE emails ADD COLUMN estimate_id INTEGER REFERENCES estimates(id)",
  "ALTER TABLE emails ADD COLUMN thread_id TEXT",
  // Cross-mailbox matching (RFC 2822 Message-ID)
  "ALTER TABLE emails ADD COLUMN internet_message_id TEXT",
  // Attachments table additions
  "ALTER TABLE attachments ADD COLUMN storage_bucket TEXT",
  "ALTER TABLE attachments ADD COLUMN storage_path TEXT",
  // Estimates table additions
  "ALTER TABLE estimates ADD COLUMN account_monday_id TEXT",
  "ALTER TABLE estimates ADD COLUMN account_domain TEXT",
  // Accounts table additions (from sync-accounts.ts)
  "ALTER TABLE accounts ADD COLUMN monday_account_id TEXT",
  "ALTER TABLE accounts ADD COLUMN monday_name TEXT",
  // Platform extraction columns (from platform-extraction.ts)
  "ALTER TABLE emails ADD COLUMN is_platform_email INTEGER DEFAULT 0",
  "ALTER TABLE emails ADD COLUMN platform_name TEXT",
  "ALTER TABLE emails ADD COLUMN real_sender_name TEXT",
  "ALTER TABLE emails ADD COLUMN real_sender_company TEXT",
  "ALTER TABLE emails ADD COLUMN real_sender_email TEXT",
  "ALTER TABLE emails ADD COLUMN real_sender_domain TEXT",
  "ALTER TABLE emails ADD COLUMN is_excluded INTEGER DEFAULT 0",
  // Estimate extraction tracking columns
  "ALTER TABLE estimates ADD COLUMN extraction_status TEXT",
  "ALTER TABLE estimates ADD COLUMN extraction_error TEXT",
  "ALTER TABLE estimates ADD COLUMN extracted_at TEXT",
  "ALTER TABLE estimates ADD COLUMN extracted_grand_total REAL",
  "ALTER TABLE estimates ADD COLUMN extracted_job_name TEXT",
  "ALTER TABLE estimates ADD COLUMN extracted_estimator TEXT",
  // Project contract cascade columns
  "ALTER TABLE projects ADD COLUMN project_number TEXT",
  "ALTER TABLE projects ADD COLUMN contractor TEXT",
  "ALTER TABLE projects ADD COLUMN awarded_value REAL",
  "ALTER TABLE projects ADD COLUMN location_city TEXT",
  "ALTER TABLE projects ADD COLUMN location_state TEXT",
  "ALTER TABLE projects ADD COLUMN location_zip TEXT",
  "ALTER TABLE projects ADD COLUMN contract_status TEXT DEFAULT 'Pending'",
  "ALTER TABLE projects ADD COLUMN dust_permit_status TEXT DEFAULT 'Not Needed'",
  "ALTER TABLE projects ADD COLUMN noi_status TEXT DEFAULT 'Not Needed'",
  "ALTER TABLE projects ADD COLUMN swppp_status TEXT DEFAULT 'Not Needed'",
  "ALTER TABLE projects ADD COLUMN signs_status TEXT DEFAULT 'Not Needed'",
  "ALTER TABLE projects ADD COLUMN outlook_folder TEXT",
  "ALTER TABLE projects ADD COLUMN notes TEXT",
  "ALTER TABLE projects ADD COLUMN linked_estimate_ids TEXT",
  // Web app estimate fields
  "ALTER TABLE estimates ADD COLUMN service_type TEXT",
  "ALTER TABLE estimates ADD COLUMN takeoff_id TEXT REFERENCES takeoffs(id)",
  "ALTER TABLE estimates ADD COLUMN base_number TEXT",
  "ALTER TABLE estimates ADD COLUMN job_address TEXT",
  "ALTER TABLE estimates ADD COLUMN client_name TEXT",
  "ALTER TABLE estimates ADD COLUMN client_email TEXT",
  "ALTER TABLE estimates ADD COLUMN client_phone TEXT",
  "ALTER TABLE estimates ADD COLUMN client_address TEXT",
  "ALTER TABLE estimates ADD COLUMN estimator TEXT",
  "ALTER TABLE estimates ADD COLUMN estimator_email TEXT",
  "ALTER TABLE estimates ADD COLUMN notes TEXT",
  "ALTER TABLE estimates ADD COLUMN is_locked INTEGER DEFAULT 0",
];

for (const sql of migrations) {
  try {
    db.run(sql);
  } catch {
    // Column already exists - ignore
  }
}

// Drop stale index from old flat estimate_line_items schema
try {
  db.run("DROP INDEX IF EXISTS idx_eli_estimate");
} catch {
  // Index may not exist
}

// ============================================
// Indexes
// ============================================
const indexes = [
  // Emails
  "CREATE INDEX IF NOT EXISTS idx_emails_mailbox ON emails(mailbox_id)",
  "CREATE INDEX IF NOT EXISTS idx_emails_received ON emails(received_at)",
  "CREATE INDEX IF NOT EXISTS idx_emails_classification ON emails(classification)",
  "CREATE INDEX IF NOT EXISTS idx_emails_conversation ON emails(conversation_id)",
  "CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id)",
  "CREATE INDEX IF NOT EXISTS idx_emails_project ON emails(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_emails_estimate ON emails(estimate_id)",
  "CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id)",
  "CREATE INDEX IF NOT EXISTS idx_emails_internet_msg_id ON emails(internet_message_id)",
  // Platform extraction indexes
  "CREATE INDEX IF NOT EXISTS idx_emails_platform ON emails(is_platform_email)",
  "CREATE INDEX IF NOT EXISTS idx_emails_platform_name ON emails(platform_name)",
  "CREATE INDEX IF NOT EXISTS idx_emails_excluded ON emails(is_excluded)",
  // Accounts
  "CREATE INDEX IF NOT EXISTS idx_accounts_domain ON accounts(domain)",
  "CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type)",
  "CREATE INDEX IF NOT EXISTS idx_accounts_monday ON accounts(monday_account_id)",
  // Projects
  "CREATE INDEX IF NOT EXISTS idx_projects_account ON projects(account_id)",
  "CREATE INDEX IF NOT EXISTS idx_project_aliases_normalized ON project_aliases(normalized_alias)",
  // Company Aliases
  "CREATE INDEX IF NOT EXISTS idx_company_aliases_account ON company_aliases(account_id)",
  "CREATE INDEX IF NOT EXISTS idx_company_aliases_alias ON company_aliases(alias)",
  // Email normalized subject
  "CREATE INDEX IF NOT EXISTS idx_emails_normalized_subject ON emails(normalized_subject)",
  // Attachments
  "CREATE INDEX IF NOT EXISTS idx_attachments_email ON attachments(email_id)",
  "CREATE INDEX IF NOT EXISTS idx_attachments_status ON attachments(extraction_status)",
  // Estimates
  "CREATE INDEX IF NOT EXISTS idx_estimates_monday_id ON estimates(monday_item_id)",
  "CREATE INDEX IF NOT EXISTS idx_estimates_number ON estimates(estimate_number)",
  "CREATE INDEX IF NOT EXISTS idx_estimates_contractor ON estimates(contractor)",
  "CREATE INDEX IF NOT EXISTS idx_estimates_synced ON estimates(synced_at)",
  "CREATE INDEX IF NOT EXISTS idx_estimates_account ON estimates(account_monday_id)",
  "CREATE INDEX IF NOT EXISTS idx_estimates_domain ON estimates(account_domain)",
  // Estimate versions
  "CREATE INDEX IF NOT EXISTS idx_ev_estimate ON estimate_versions(estimate_id)",
  "CREATE INDEX IF NOT EXISTS idx_ev_current ON estimate_versions(is_current)",
  // Estimate sections
  "CREATE INDEX IF NOT EXISTS idx_es_version ON estimate_sections(version_id)",
  // Estimate line items
  "CREATE INDEX IF NOT EXISTS idx_eli_version ON estimate_line_items(version_id)",
  "CREATE INDEX IF NOT EXISTS idx_eli_section ON estimate_line_items(section_id)",
  // Estimate extraction status
  "CREATE INDEX IF NOT EXISTS idx_estimates_extraction ON estimates(extraction_status)",
  // Estimate service type
  "CREATE INDEX IF NOT EXISTS idx_estimates_service_type ON estimates(service_type)",
  // Takeoffs
  "CREATE INDEX IF NOT EXISTS idx_estimates_takeoff ON estimates(takeoff_id)",
  // SWPPP Work Orders
  "CREATE INDEX IF NOT EXISTS idx_swppp_wo_worksheet ON swppp_work_orders(worksheet)",
  "CREATE INDEX IF NOT EXISTS idx_swppp_wo_job_name ON swppp_work_orders(job_name)",
  "CREATE INDEX IF NOT EXISTS idx_swppp_wo_contractor ON swppp_work_orders(contractor)",
  "CREATE INDEX IF NOT EXISTS idx_swppp_wo_account ON swppp_work_orders(account_id)",
  "CREATE INDEX IF NOT EXISTS idx_swppp_wo_project ON swppp_work_orders(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_swppp_wo_invoice ON swppp_work_orders(invoice)",
  // Permits
  "CREATE INDEX IF NOT EXISTS idx_permits_status ON permits(status)",
  "CREATE INDEX IF NOT EXISTS idx_permits_account ON permits(account_id)",
  "CREATE INDEX IF NOT EXISTS idx_permits_project ON permits(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_permits_expiration ON permits(expiration_date)",
  "CREATE INDEX IF NOT EXISTS idx_permits_portal_company ON permits(portal_company_id)",
  "CREATE INDEX IF NOT EXISTS idx_permits_parcel ON permits(parcel)",
];

for (const sql of indexes) {
  db.run(sql);
}
