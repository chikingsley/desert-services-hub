import { Database } from "bun:sqlite";
import { join } from "node:path";

// Initialize SQLite database using Bun's native driver
// Database file is co-located with this module
const dbPath = join(import.meta.dir, "app.db");
const db = new Database(dbPath, { create: true });

// Enable WAL mode for better performance
db.run("PRAGMA journal_mode = WAL");

// ============================================
// Takeoffs Table
// ============================================
db.run(`
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

// ============================================
// Quotes Tables
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    base_number TEXT NOT NULL,
    takeoff_id TEXT,
    job_name TEXT NOT NULL,
    job_address TEXT,
    client_name TEXT,
    client_email TEXT,
    client_phone TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    is_locked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (takeoff_id) REFERENCES takeoffs(id) ON DELETE SET NULL
  )
`);

db.run(`
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

db.run(`
  CREATE TABLE IF NOT EXISTS quote_sections (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT,
    show_subtotal INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (version_id) REFERENCES quote_versions(id) ON DELETE CASCADE
  )
`);

db.run(`
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

// ============================================
// Catalog Tables
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS catalog_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    selection_mode TEXT NOT NULL DEFAULT 'pick-many',
    supports_takeoff INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES catalog_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (subcategory_id) REFERENCES catalog_subcategories(id) ON DELETE SET NULL
  )
`);

// Takeoff Bundles - groups of catalog items measured together
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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bundle_id) REFERENCES catalog_takeoff_bundles(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE,
    UNIQUE(bundle_id, item_id)
  )
`);

// ============================================
// Monday.com Cache
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS monday_cache (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    board_title TEXT NOT NULL,
    name TEXT NOT NULL,
    group_id TEXT,
    group_title TEXT,
    column_values TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// ============================================
// Indexes
// ============================================
db.run(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_base_number ON quotes(base_number)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_monday_cache_board ON monday_cache(board_id)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON catalog_bundle_items(bundle_id)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_bundle_items_item ON catalog_bundle_items(item_id)"
);

// ============================================
// FTS5 for fuzzy search (optional - may fail on some systems)
// ============================================
try {
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS monday_search_vectors USING fts5(
      item_id UNINDEXED,
      board_id UNINDEXED,
      name,
      content
    )
  `);
} catch {
  // FTS5 might not be available, fuzzy search will be limited
}

export { db };
