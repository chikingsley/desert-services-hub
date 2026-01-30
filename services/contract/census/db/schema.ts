/**
 * Census Database Schema
 *
 * All table definitions, indexes, and migrations.
 * Called once on import to ensure schema exists.
 */
import { db } from "./connection";

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
// Schema: Email Tasks
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS email_tasks (
    id INTEGER PRIMARY KEY,
    email_id INTEGER NOT NULL,
    task_description TEXT NOT NULL,
    task_type TEXT,
    priority TEXT,
    due_date TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (email_id) REFERENCES emails(id)
  )
`);

// ============================================
// Schema: Email Entities
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS email_entities (
    id INTEGER PRIMARY KEY,
    email_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_value TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (email_id) REFERENCES emails(id)
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
    monday_item_id TEXT UNIQUE NOT NULL,
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
  // Email linking additions
  "ALTER TABLE emails ADD COLUMN estimate_id INTEGER REFERENCES estimates(id)",
  "ALTER TABLE emails ADD COLUMN thread_id TEXT",
  // Attachments table additions (legacy migration)
  "ALTER TABLE attachments ADD COLUMN storage_bucket TEXT",
  "ALTER TABLE attachments ADD COLUMN storage_path TEXT",
  // Estimates table additions
  "ALTER TABLE estimates ADD COLUMN account_monday_id TEXT",
  "ALTER TABLE estimates ADD COLUMN account_domain TEXT",
  // Accounts table additions (from sync-accounts.ts)
  "ALTER TABLE accounts ADD COLUMN monday_account_id TEXT",
  "ALTER TABLE accounts ADD COLUMN monday_name TEXT",
];

for (const sql of migrations) {
  try {
    db.run(sql);
  } catch {
    // Column already exists - ignore
  }
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
  // Tasks & Entities
  "CREATE INDEX IF NOT EXISTS idx_email_tasks_email ON email_tasks(email_id)",
  "CREATE INDEX IF NOT EXISTS idx_email_entities_email ON email_entities(email_id)",
  // Accounts
  "CREATE INDEX IF NOT EXISTS idx_accounts_domain ON accounts(domain)",
  "CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type)",
  "CREATE INDEX IF NOT EXISTS idx_accounts_monday ON accounts(monday_account_id)",
  // Projects
  "CREATE INDEX IF NOT EXISTS idx_projects_account ON projects(account_id)",
  "CREATE INDEX IF NOT EXISTS idx_project_aliases_normalized ON project_aliases(normalized_alias)",
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
];

for (const sql of indexes) {
  db.run(sql);
}
