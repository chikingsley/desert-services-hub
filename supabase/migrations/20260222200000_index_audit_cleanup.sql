-- ============================================================================
-- Index Audit Cleanup — 2026-02-22
--
-- P0: Drop duplicate indexes, drop redundant prefix indexes, add missing FK indexes
-- P1: Drop massive unused indexes
--
-- Expected savings: ~930 MB of index space + reduced write overhead
--
-- IMPORTANT: All DROP/CREATE use CONCURRENTLY to avoid table locks.
-- This means this file CANNOT run inside a transaction block.
-- Run with: psql -f <file> (NOT inside BEGIN/COMMIT)
-- ============================================================================


-- ============================================================================
-- P0-A: DROP EXACT DUPLICATE INDEXES (~109 MB)
-- These are identical indexes (same columns, same conditions) on the same table.
-- ============================================================================

-- documents: Two identical unique indexes on (email_id, outlook_attachment_id)
--   WHERE source = 'email_attachment' AND outlook_attachment_id IS NOT NULL
-- Keep: idx_documents_email_att_upsert (28K scans)
-- Drop: idx_documents_email_attachment_upsert (0 scans, 44 MB)
DROP INDEX CONCURRENTLY IF EXISTS idx_documents_email_attachment_upsert;

-- documents: Two identical indexes on (outlook_attachment_id)
--   WHERE outlook_attachment_id IS NOT NULL
-- Keep: idx_documents_outlook_attachment_id (45K scans)
-- Drop: idx_documents_outlook_att (8.7K scans, 64 MB)
DROP INDEX CONCURRENTLY IF EXISTS idx_documents_outlook_att;

-- documents: Two identical unique indexes on (monday_asset_id)
--   WHERE monday_asset_id IS NOT NULL
-- Keep: idx_documents_monday_asset_uniq (3.8K scans)
-- Drop: idx_documents_monday_asset_id (0 scans, 232 KB)
DROP INDEX CONCURRENTLY IF EXISTS idx_documents_monday_asset_id;

-- documents: Two identical indexes on (monday_item_id)
--   WHERE monday_item_id IS NOT NULL
-- Keep: idx_documents_monday_item (4.9K scans)
-- Drop: idx_documents_monday_item_id (785 scans, 168 KB)
DROP INDEX CONCURRENTLY IF EXISTS idx_documents_monday_item_id;

-- contacts: Unique constraint + duplicate non-unique index on (monday_item_id)
-- Keep: contacts_monday_item_id_key (unique, 13K scans)
-- Drop: idx_contacts_monday (non-unique, 959 scans, 496 KB)
DROP INDEX CONCURRENTLY IF EXISTS idx_contacts_monday;

-- estimates: Unique constraint + duplicate non-unique index on (monday_item_id)
-- Keep: estimates_monday_item_id_key (unique, 58K scans)
-- Drop: idx_estimates_monday_id (non-unique, 28.5K scans, 296 KB)
DROP INDEX CONCURRENTLY IF EXISTS idx_estimates_monday_id;

-- accounts: Unique constraint + duplicate non-unique index on (domain)
-- Keep: accounts_domain_key (unique constraint index)
-- Drop: idx_accounts_domain (non-unique, 1.4K scans, 312 KB)
DROP INDEX CONCURRENTLY IF EXISTS idx_accounts_domain;


-- ============================================================================
-- P0-B: DROP REDUNDANT PREFIX INDEXES (~22 MB)
-- These single-column indexes are covered by composite indexes that have
-- the same column as the leading (leftmost) column.
-- ============================================================================

-- contact_emails: (contact_id) covered by unique (contact_id, email_id, relationship)
-- Drop: idx_contact_emails_contact (3.7K scans, 21 MB)
DROP INDEX CONCURRENTLY IF EXISTS idx_contact_emails_contact;

-- estimate_emails: (estimate_id) covered by unique (estimate_id, email_id)
-- Drop: idx_estimate_emails_estimate (15.7K scans, 336 KB)
DROP INDEX CONCURRENTLY IF EXISTS idx_estimate_emails_estimate;

-- estimate_contacts: (estimate_id) covered by PK (estimate_id, contact_id)
-- Drop: idx_estimate_contacts_estimate (756 scans, 216 KB)
DROP INDEX CONCURRENTLY IF EXISTS idx_estimate_contacts_estimate;

-- project_estimates: (project_id) covered by PK (project_id, estimate_id)
-- Drop: idx_project_estimates_project (90.7K scans, 200 KB)
DROP INDEX CONCURRENTLY IF EXISTS idx_project_estimates_project;

-- qb_jobs: (qb_customer_id) covered by unique (qb_customer_id, job_name)
-- Drop: idx_qb_jobs_customer (10K scans, 64 KB)
DROP INDEX CONCURRENTLY IF EXISTS idx_qb_jobs_customer;

-- contacts: (contact_type) covered by (contact_type, is_active)
-- Drop: idx_contacts_contact_type (55 scans, 112 KB)
DROP INDEX CONCURRENTLY IF EXISTS idx_contacts_contact_type;


-- ============================================================================
-- P0-C: ADD MISSING FOREIGN KEY INDEXES
-- Postgres does NOT auto-create indexes on FK columns. Without these,
-- JOINs and ON DELETE CASCADE operations require full table scans.
-- ============================================================================

-- project_match_reviews.account_id_hint → accounts (152K rows, 271 MB table)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_match_reviews_account
  ON project_match_reviews (account_id_hint);

-- contract_packets.estimate_id → estimates (3.3K rows)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contract_packets_estimate
  ON contract_packets (estimate_id);


-- ============================================================================
-- P1-A: DROP MASSIVE UNUSED INDEXES ON emails (~327 MB)
-- All have 0-1 scans since stats reset. The emails table is 19 GB and every
-- index adds write overhead on each of the 1M+ rows.
-- ============================================================================

-- Expression index for dedup partitioning. Complex CASE expression, 0 scans, 118 MB.
-- Likely from a removed dedup feature.
DROP INDEX CONCURRENTLY IF EXISTS idx_emails_active_dedup_partition;

-- thread_id btree. 89 MB, only 1 scan ever.
-- conversation_id index (232M scans) serves thread lookups instead.
DROP INDEX CONCURRENTLY IF EXISTS idx_emails_thread;

-- platform_name btree. 59 MB, 0 scans.
DROP INDEX CONCURRENTLY IF EXISTS idx_emails_platform_name;

-- normalized_subject btree. 56 MB, 0 scans.
DROP INDEX CONCURRENTLY IF EXISTS idx_emails_normalized_subject;

-- rules_evaluated_at partial (WHERE IS NULL). 4.5 MB, 0 scans.
-- Rules system tables are empty; feature appears inactive.
DROP INDEX CONCURRENTLY IF EXISTS idx_emails_rules_evaluated;


-- ============================================================================
-- P1-B: DROP UNUSED INDEXES ON OTHER TABLES (~53 MB)
-- ============================================================================

-- documents: GIN full-text search index. 52 MB, 0 scans.
-- If FTS on documents is reintroduced, recreate this index.
DROP INDEX CONCURRENTLY IF EXISTS idx_documents_search;

-- contacts: is_active alone. 120 KB, 0 scans.
-- Covered by idx_contacts_contact_type_active for combined lookups.
DROP INDEX CONCURRENTLY IF EXISTS idx_contacts_is_active;

-- contacts: contractor_monday_id. 192 KB, 0 scans.
DROP INDEX CONCURRENTLY IF EXISTS idx_contacts_contractor_monday;

-- estimate_versions: is_current. 120 KB, 0 scans.
-- The partial unique idx_estimate_versions_one_current covers the useful case.
DROP INDEX CONCURRENTLY IF EXISTS idx_ev_current;


-- ============================================================================
-- P1-C: DROP UNUSED MATERIALIZED VIEW INDEXES (~28 MB)
-- Both MVs show 100% sequential scans — all their indexes have 0 scans.
-- ============================================================================

-- email_list_dedup_mv (352K rows, all indexes 0 scans)
DROP INDEX CONCURRENTLY IF EXISTS idx_email_list_dedup_mv_received;       -- 11 MB
DROP INDEX CONCURRENTLY IF EXISTS idx_email_list_dedup_mv_id;             -- 7.8 MB
DROP INDEX CONCURRENTLY IF EXISTS idx_email_list_dedup_mv_from_domain;    -- 2.6 MB
DROP INDEX CONCURRENTLY IF EXISTS idx_email_list_dedup_mv_classification; -- 2.4 MB

-- project_email_dedup_mv (18K rows, all indexes 0 scans)
DROP INDEX CONCURRENTLY IF EXISTS idx_project_email_dedup_mv_project_last;  -- 544 KB
DROP INDEX CONCURRENTLY IF EXISTS idx_project_email_dedup_mv_permit_signal; -- 88 KB


-- ============================================================================
-- SUMMARY
--
-- P0-A: 7 duplicate indexes dropped       → ~109 MB saved
-- P0-B: 6 redundant prefix indexes dropped → ~22 MB saved
-- P0-C: 2 missing FK indexes added         → faster JOINs + cascades
-- P1-A: 5 unused email indexes dropped     → ~327 MB saved
-- P1-B: 4 unused indexes on other tables   → ~53 MB saved
-- P1-C: 6 unused MV indexes dropped        → ~28 MB saved
--
-- TOTAL: 28 indexes dropped, 2 indexes added → ~539 MB reclaimed
-- ============================================================================
