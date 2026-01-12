-- Migration: Fix catalog data - takeoff flags, descriptions, and names
-- Run with: sqlite3 data/app.db < scripts/migrations/003-fix-catalog-data.sql

-- ============================================================
-- 1. FIX TAKEOFF FLAGS
-- ============================================================

-- Remove takeoff flag from items that should NOT be takeoff items
UPDATE catalog_items SET is_takeoff_item = 0 WHERE code IN (
  -- ERTECs (hidden anyway)
  'CM-007', 'CM-008', 'CM-009', 'CM-010', 'CM-011',
  -- Other BMPs (specified, not counted from plans)
  'CM-012', 'CM-013', 'CM-014', 'CM-015',
  -- Temporary Fencing services/parts (not measured on plans)
  'TF-001', 'TF-003', 'TF-004', 'TF-005', 'TF-006', 'TF-007', 'TF-008', 'TF-009'
);

-- Keep takeoff items that ARE measured on plans:
-- CM-001 Rock Entrance (count)
-- CM-003 Compost Filter Sock (LF)
-- CM-004 Wire-Backed Silt Fence (LF)
-- CM-005 Drop Inlet Protection (count)
-- CM-006 Curb Inlet Protection (count)

-- ============================================================
-- 2. HIDE ERTEC ITEMS
-- ============================================================

UPDATE catalog_items SET is_active = 0 WHERE code IN (
  'CM-007', 'CM-008', 'CM-009', 'CM-010', 'CM-011'
);

-- ============================================================
-- 3. UPDATE NAMES AND DESCRIPTIONS
-- ============================================================

-- Temporary Fencing
UPDATE catalog_items SET
  name = 'Fence Panel Rental',
  description = '6'' chain-link panel rental - billed per linear foot monthly ($100 min)'
WHERE code = 'TF-002';

UPDATE catalog_items SET
  description = 'HDPE mesh screen attached to fence panels - 85% opacity for privacy & dust control'
WHERE code = 'TF-003';

UPDATE catalog_items SET
  name = 'Fencing Trip Charge',
  description = 'Service call for fence installation, relocations, or repairs'
WHERE code = 'TF-005';

-- Roll-Off Dumpsters
UPDATE catalog_items SET
  name = '10 yd Roll-Off',
  description = '10 cubic yard dumpster for small jobs - includes 2 tons disposal'
WHERE code = 'RO-009';

UPDATE catalog_items SET
  name = '15 yd Roll-Off',
  description = '15 cubic yard dumpster for residential/light commercial - includes 2 tons disposal'
WHERE code = 'RO-001';

UPDATE catalog_items SET
  name = '20 yd Roll-Off',
  description = '20 cubic yard dumpster for mid-size projects - includes 2 tons disposal'
WHERE code = 'RO-002';

UPDATE catalog_items SET
  name = '30 yd Roll-Off',
  description = '30 cubic yard dumpster for large projects - includes 3 tons disposal'
WHERE code = 'RO-003';

UPDATE catalog_items SET
  name = '40 yd Roll-Off',
  description = '40 cubic yard dumpster for major construction - includes 4 tons disposal'
WHERE code = 'RO-004';

UPDATE catalog_items SET
  name = '15 yd Roll-Off (Inert)'
WHERE code = 'RO-005';

-- Water Trucks
UPDATE catalog_items SET
  name = 'Water Truck - On Call',
  description = 'On-demand water truck for dust control or compaction (2 hr min)'
WHERE code = 'WT-001';

UPDATE catalog_items SET
  name = 'Water Truck - Scheduled MWF',
  description = 'Monday/Wednesday/Friday scheduled service (2 hr min)'
WHERE code = 'WT-002';

UPDATE catalog_items SET
  name = 'Water Truck - Daily 1x',
  description = 'Monday-Friday once daily service (2 hr min)'
WHERE code = 'WT-003';

UPDATE catalog_items SET
  name = 'Water Truck - Daily 2x',
  description = 'Monday-Friday twice daily service (2 hr min)'
WHERE code = 'WT-004';

UPDATE catalog_items SET
  name = 'Water Truck - Full Time',
  description = 'Dedicated on-site water truck (8 hr/day)'
WHERE code = 'WT-005';

UPDATE catalog_items SET
  name = 'Water Truck - 4000 Gallon',
  description = 'Large capacity truck for perk tests, flow tests, or lot washing (2 hr min)'
WHERE code = 'WT-006';

UPDATE catalog_items SET
  name = 'Water Truck - 2000 Gallon',
  description = 'Standard truck for perk tests, flow tests, or lot washing (2 hr min)'
WHERE code = 'WT-007';

UPDATE catalog_items SET
  name = 'Water Truck - After Hours',
  description = '2000 gallon truck for nights & weekends (2 hr min)'
WHERE code = 'WT-008';

UPDATE catalog_items SET
  name = 'Water Truck - Extra Person',
  description = 'Additional crew member for flagging, hose handling, or site coordination'
WHERE code = 'WT-009';

UPDATE catalog_items SET
  name = 'Water Truck - Tank Fill/Pump',
  description = 'Pump water from site or fill customer tanks'
WHERE code = 'WT-010';

-- Tank Services
UPDATE catalog_items SET
  name = 'Waste Tank - Weekly Service'
WHERE code = 'TANK-003';

UPDATE catalog_items SET
  name = 'Waste Tank - 2x/Week Service'
WHERE code = 'TANK-004';

UPDATE catalog_items SET
  name = 'Full Tank System - Weekly Service'
WHERE code = 'TANK-005';

UPDATE catalog_items SET
  name = 'Full Tank System - 2x/Week Service'
WHERE code = 'TANK-006';

-- Street Sweeping
UPDATE catalog_items SET
  name = 'Street Sweeper - On Call'
WHERE code = 'SS-001';

UPDATE catalog_items SET
  name = 'Street Sweeper - Scheduled M-F'
WHERE code = 'SS-002';

UPDATE catalog_items SET
  name = 'Street Sweeper - Full Day',
  description = 'Full-day dedicated sweeper for high-traffic sites or final clean-up (8 hr min)'
WHERE code = 'SS-003';

-- Pressure Washing
UPDATE catalog_items SET
  name = 'Pressure Wash - Regular Hours'
WHERE code = 'PW-001';

UPDATE catalog_items SET
  name = 'Pressure Wash - After Hours'
WHERE code = 'PW-002';

UPDATE catalog_items SET
  name = 'Pressure Wash - Extra Labor'
WHERE code = 'PW-005';

-- Water Equipment
UPDATE catalog_items SET
  name = 'Water Buffalo - Daily'
WHERE code = 'WE-001';

UPDATE catalog_items SET
  name = 'Water Buffalo - Weekly'
WHERE code = 'WE-002';

UPDATE catalog_items SET
  name = 'Water Buffalo - Monthly'
WHERE code = 'WE-003';

UPDATE catalog_items SET
  name = 'Water Donkey - Monthly'
WHERE code = 'WE-004';

UPDATE catalog_items SET
  name = 'Water Donkey - Hoses'
WHERE code = 'WE-005';

UPDATE catalog_items SET
  name = 'Water Donkey - Delivery'
WHERE code = 'WE-006';

UPDATE catalog_items SET
  name = 'Water Ramps - Monthly'
WHERE code = 'WE-008';

UPDATE catalog_items SET
  name = 'Water Ramps - Hoses'
WHERE code = 'WE-009';

UPDATE catalog_items SET
  name = 'Water Ramps - Delivery'
WHERE code = 'WE-010';

-- ============================================================
-- 4. VERIFY CHANGES
-- ============================================================

SELECT '=== Takeoff Items (should be 5) ===' as info;
SELECT code, name, is_takeoff_item FROM catalog_items WHERE is_takeoff_item = 1 ORDER BY code;

SELECT '' as spacer;
SELECT '=== Hidden Items (ERTECs) ===' as info;
SELECT code, name, is_active FROM catalog_items WHERE code LIKE 'CM-0%' AND is_active = 0;

SELECT '' as spacer;
SELECT '=== Updated Names (sample) ===' as info;
SELECT code, name FROM catalog_items WHERE code IN ('TF-002', 'WT-001', 'RO-001') ORDER BY code;
