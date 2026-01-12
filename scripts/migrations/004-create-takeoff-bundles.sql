-- Migration: Create takeoff bundles schema
-- Run with: sqlite3 data/app.db < scripts/migrations/004-create-takeoff-bundles.sql

-- ============================================================
-- 1. CREATE TAKEOFF BUNDLES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS catalog_takeoff_bundles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL,                    -- LF, SF, Each
  tool_type TEXT NOT NULL,               -- count, linear, area
  color TEXT NOT NULL DEFAULT '#3b82f6',
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. CREATE BUNDLE ITEMS TABLE (links bundles to catalog items)
-- ============================================================

CREATE TABLE IF NOT EXISTS catalog_bundle_items (
  id TEXT PRIMARY KEY,
  bundle_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  is_required INTEGER DEFAULT 1,         -- 1 = always included, 0 = optional
  quantity_multiplier REAL DEFAULT 1.0,  -- e.g., 1.0 means same qty as measured
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bundle_id) REFERENCES catalog_takeoff_bundles(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE,
  UNIQUE(bundle_id, item_id)
);

-- ============================================================
-- 3. CREATE INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON catalog_bundle_items(bundle_id);
CREATE INDEX IF NOT EXISTS idx_bundle_items_item ON catalog_bundle_items(item_id);

-- ============================================================
-- 4. SEED TEMPORARY FENCING BUNDLE
-- ============================================================

-- Create the bundle
INSERT INTO catalog_takeoff_bundles (id, name, description, unit, tool_type, color, sort_order)
VALUES (
  'bundle-temp-fencing',
  'Temporary Fencing',
  'Chain-link fence installation - measures linear feet and creates Install, Rental, and optional add-ons',
  'LF',
  'linear',
  '#f97316',
  0
);

-- Add bundle items (get item IDs from catalog_items)
INSERT INTO catalog_bundle_items (id, bundle_id, item_id, is_required, sort_order)
SELECT
  'bi-tf-' || code,
  'bundle-temp-fencing',
  id,
  CASE
    WHEN code IN ('TF-001', 'TF-002') THEN 1  -- Install/Remove and Rental are required
    ELSE 0  -- Privacy Screen, Trip Charge are optional
  END,
  CASE code
    WHEN 'TF-001' THEN 0
    WHEN 'TF-002' THEN 1
    WHEN 'TF-003' THEN 2
    WHEN 'TF-005' THEN 3
    ELSE 10
  END
FROM catalog_items
WHERE code IN ('TF-001', 'TF-002', 'TF-003', 'TF-005');

-- ============================================================
-- 5. VERIFY
-- ============================================================

SELECT '=== Takeoff Bundles ===' as info;
SELECT id, name, unit, tool_type FROM catalog_takeoff_bundles;

SELECT '' as spacer;
SELECT '=== Bundle Items ===' as info;
SELECT
  b.name as bundle,
  i.code,
  i.name as item_name,
  bi.is_required,
  bi.sort_order
FROM catalog_bundle_items bi
JOIN catalog_takeoff_bundles b ON bi.bundle_id = b.id
JOIN catalog_items i ON bi.item_id = i.id
ORDER BY b.name, bi.sort_order;
