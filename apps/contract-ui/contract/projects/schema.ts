/**
 * Projects DB Schema
 *
 * Tracks project data independently from Monday.
 * Will eventually merge back into hub.db and sync to Monday PROJECTS board.
 */

import { Database } from "bun:sqlite";

const DB_PATH = import.meta.dir + "/projects.db";

export const db = new Database(DB_PATH, { create: true });

// SQLite safety + concurrency defaults
db.run("PRAGMA busy_timeout = 5000;");
db.run("PRAGMA foreign_keys = ON;");
try {
  const current = db
    .query<{ journal_mode: string }, []>("PRAGMA journal_mode")
    .get()?.journal_mode;
  if (current && current.toLowerCase() !== "wal") {
    db.run("PRAGMA journal_mode = WAL;");
  }
} catch {}

// Initialize schema
db.run(`
  -- Monday columns tracking: what to keep, delete, add
  CREATE TABLE IF NOT EXISTS monday_columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    column_name TEXT NOT NULL,
    monday_id TEXT,
    monday_type TEXT,
    action TEXT NOT NULL CHECK (action IN ('keep', 'delete', 'add', 'copy_at_creation')),
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Projects table - the real data
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_number TEXT UNIQUE NOT NULL,
    project_name TEXT NOT NULL,
    contractor TEXT,
    po_number TEXT,
    awarded_value REAL,
    start_date TEXT,
    end_date TEXT,
    location_address TEXT,
    location_city TEXT,
    location_state TEXT,
    location_zip TEXT,
    project_status TEXT DEFAULT 'Active',

    -- Deliverable statuses
    contract_status TEXT DEFAULT 'Pending',
    dust_permit_status TEXT DEFAULT 'Not Needed',
    noi_status TEXT DEFAULT 'Not Needed',
    swppp_status TEXT DEFAULT 'Not Needed',
    signs_status TEXT DEFAULT 'Not Needed',

    -- File references (paths or URLs)
    contract_file TEXT,
    dust_permit_file TEXT,
    sov_file TEXT,

    -- Monday linkage
    monday_item_id TEXT,
    linked_estimate_ids TEXT, -- JSON array of estimate monday IDs

    -- Meta
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Tasks/deliverables table for granular tracking if needed
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    task_type TEXT NOT NULL, -- 'contract', 'dust_permit', 'noi', 'swppp', 'signs', 'other'
    task_name TEXT NOT NULL,
    status TEXT DEFAULT 'Pending',
    due_date TEXT,
    notes TEXT,
    file_path TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_projects_number ON projects(project_number);
  CREATE INDEX IF NOT EXISTS idx_projects_contractor ON projects(contractor);
  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
`);

function ensureProjectsColumns() {
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(projects)")
    .all()
    .map((c) => c.name);

  const addColumn = (name: string, sqlType: string) => {
    if (columns.includes(name)) return;
    db.run(`ALTER TABLE projects ADD COLUMN ${name} ${sqlType}`);
  };

  addColumn("award_notice_date", "TEXT");
  addColumn("award_notice_mailbox", "TEXT");
  addColumn("award_notice_message_id", "TEXT");
  addColumn("award_notice_type", "TEXT"); // CONTRACT, LOI, NTP, PO, WORK_REQUEST, etc.

  addColumn("contract_received_mailbox", "TEXT");
  addColumn("contract_received_message_id", "TEXT");
}

ensureProjectsColumns();

// Schema initialized at DB_PATH
