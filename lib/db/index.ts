import Database from "better-sqlite3";
import { join } from "node:path";

// Initialize SQLite database (server-side only)
const dbPath = join(process.cwd(), "desert-services.db");
const db = new Database(dbPath);

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS takeoffs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pdf_url TEXT,
    annotations TEXT NOT NULL DEFAULT '[]',
    page_scales TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    base_number TEXT NOT NULL,
    job_name TEXT NOT NULL,
    job_address TEXT,
    client_name TEXT,
    client_email TEXT,
    client_phone TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    is_locked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS quote_versions (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    total REAL NOT NULL DEFAULT 0,
    is_current INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS quote_sections (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (version_id) REFERENCES quote_versions(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS quote_line_items (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL,
    section_id TEXT,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'EA',
    unit_cost REAL NOT NULL DEFAULT 0,
    unit_price REAL NOT NULL DEFAULT 0,
    is_excluded INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (version_id) REFERENCES quote_versions(id) ON DELETE CASCADE
  )
`);

export { db };
