-- Migration: Add takeoff support to catalog
-- Run with: sqlite3 data/app.db < scripts/migrations/002-add-takeoff-support.sql

-- 1. Add supports_takeoff column to catalog_categories
ALTER TABLE catalog_categories ADD COLUMN supports_takeoff INTEGER DEFAULT 0;

-- 2. Add is_takeoff_item column to catalog_items
ALTER TABLE catalog_items ADD COLUMN is_takeoff_item INTEGER DEFAULT 0;

-- 3. Mark categories that support takeoff
UPDATE catalog_categories SET supports_takeoff = 1
WHERE id IN ('control-measures', 'temp-fencing');

-- 4. Fix Rumble Grates unit (should be EA/Mo, not Month)
UPDATE catalog_items SET unit = 'EA/Mo'
WHERE name = 'Rumble Grates Rental';

-- 5. Enable takeoff for measurable items in supported categories
-- Only items with EA, LF, or SF units (not Month, EA/Mo, etc.)
UPDATE catalog_items
SET is_takeoff_item = 1
WHERE category_id IN ('control-measures', 'temp-fencing')
  AND unit IN ('Each', 'EA', 'LF', 'SF');

-- Verify changes
SELECT 'Categories with takeoff support:' as info;
SELECT id, name, supports_takeoff FROM catalog_categories WHERE supports_takeoff = 1;

SELECT '' as spacer;
SELECT 'Takeoff-enabled items:' as info;
SELECT i.name, i.unit, i.is_takeoff_item, c.name as category
FROM catalog_items i
JOIN catalog_categories c ON i.category_id = c.id
WHERE i.is_takeoff_item = 1
ORDER BY c.sort_order, i.sort_order;
