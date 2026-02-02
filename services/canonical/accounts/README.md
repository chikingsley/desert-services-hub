# Canonical Accounts Database

Unified contractor account database consolidating data from QuickBooks, SharePoint, and Monday CRM into a single deduplicated SQLite database.

**Status**: Complete (January 20, 2026)

## Key Numbers

| Metric | Value |
|--------|-------|
| Canonical Accounts | 1,103 |
| Name Variants | 1,945 |
| Contact Records | 58 |
| Garbage Entries | 98 (8.9%) |
| HIGH Confidence (2+ systems) | 229 (20.8%) |
| MEDIUM Confidence (1 system) | 148 (13.4%) |
| LOW Confidence (unlinked) | 628 (56.9%) |
| QB Matches | 182 (16.5%) |
| SharePoint Matches | 159 (14.4%) |
| Monday Matches | 152 (13.8%) |
| Matched in All 3 | 102 (9.2%) |

---

## Project Structure

```
accounts/
├── README.md                  This file
├── build_canonical_db.py      Python script to rebuild the database
│
├── scripts/                   TypeScript/Bun processing scripts
│   ├── match-contractors.ts       Cross-system account matching
│   ├── normalize-contractors.ts   Name normalization & dedup
│   ├── check-insurance.ts         Insurance requirements validation
│   ├── setup-insurance.ts         Insurance setup
│   ├── search-monday.ts           Monday.com integration
│   ├── smart-normalize.ts         Fuzzy matching (Union-Find)
│   └── parsers/                   Source data parsers
│       ├── parse-excel.ts
│       ├── parse-certs.ts
│       ├── parse-aia.ts
│       ├── parse-all-aia.ts
│       ├── parse-cp-invoices.ts
│       ├── parse-credit-memos.ts
│       ├── parse-contractor-pairs.ts
│       ├── parse-excel-noheader.ts
│       └── parse-signs.ts
│
├── config/                    Merge & normalization rules
│   ├── merge_rules.json
│   └── merge_rules.schema.json
│
├── data/
│   ├── canonical_accounts.db  Main SQLite database (296 KB)
│   ├── output/                Canonical results
│   │   ├── accounts_final.csv         Master account list
│   │   ├── accounts_smart.csv         Smart-grouped accounts
│   │   ├── accounts.csv               Base accounts
│   │   ├── contractor_contacts.csv    Extracted contacts
│   │   ├── contractor_wos_status.csv  WOS certification status
│   │   └── garbage_entries.csv        Flagged invalid entries
│   ├── links/                 Cross-system match files
│   │   ├── qb_matches_v2.csv
│   │   ├── sharepoint_matches.csv
│   │   ├── monday_matches.csv
│   │   ├── qb_internal_duplicates.csv
│   │   └── known_entity_relationships.csv
│   ├── raw/                   21 parsed CSVs (extracted from sources below)
│   └── sources/               Original SharePoint files & Excel workbooks
│       ├── aia jobs/              AIA job documents
│       ├── insurance certs/       Insurance certificate files
│       ├── Customer Signs/        389 sign files/folders
│       ├── Customer Rental Master 3-7-18.xlsx
│       ├── Rw.Location.Upload - Main Master.xlsx
│       ├── SWPPP Master 11-7-24.xlsx
│       ├── WT & SW Master.xlsx
│       └── quickbooks_export.xlsx
│
├── analysis/                  One-off analysis outputs & docs
│   ├── willmeng_*.csv / WILLMENG_*.md
│   ├── ar_mays_variants.csv
│   ├── chasse_variants.csv
│   ├── core_variants.csv
│   ├── layton_variants.csv / LAYTON_ANALYSIS.md
│   ├── merge_candidates.csv
│   └── ...
│
└── archive/                   Superseded/old files
    ├── contractors.db
    ├── normalize-contractors.ts (old version)
    ├── test-pdl.ts
    └── ...
```

---

## Database Schema

### `canonical_accounts` (1,103 rows)

Master account list with cross-system IDs and quality scores.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Unique identifier |
| canonical_name | TEXT UNIQUE | Standardized name (lowercase, deduped) |
| display_name | TEXT | Human-readable name |
| record_count | INTEGER | Total aggregated records |
| variant_count | INTEGER | Number of name variations |
| wos_status | TEXT | WOS_ONLY, NON_WOS_ONLY, DUAL_STATUS_*, UNKNOWN |
| qb_customer_id | TEXT | QuickBooks customer ID |
| qb_company_name | TEXT | QuickBooks company name |
| sp_id | TEXT | SharePoint ID |
| sp_name | TEXT | SharePoint display name |
| monday_id | TEXT | Monday CRM ID |
| monday_name | TEXT | Monday CRM display name |
| confidence_score | REAL | 0.0 - 0.95 |
| confidence_level | TEXT | HIGH, MEDIUM, LOW, GARBAGE |
| is_garbage | BOOLEAN | 1 if flagged invalid |
| garbage_reason | TEXT | Why it was flagged |
| notes | TEXT | Match type metadata |

### `account_variants` (1,945 rows)

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | |
| canonical_id | INTEGER FK | Links to canonical_accounts |
| variant_name | TEXT | Name as found in source data |
| source_file | TEXT | Origin file |

### `account_contacts` (58 rows)

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | |
| canonical_id | INTEGER FK | Links to canonical_accounts |
| contact_name | TEXT | Contact person |
| phone | TEXT | Phone number |
| email | TEXT | Email address |
| source | TEXT | Original variant it was extracted from |

---

## Confidence Scoring

| Level | Score | Criteria | Count |
|-------|-------|----------|-------|
| HIGH | 0.95 | Matched in 2+ systems | 229 |
| MEDIUM | 0.75 | Matched in 1 system | 148 |
| LOW | 0.50 | Valid name, no system matches | 628 |
| GARBAGE | 0.00 | Invalid (job numbers, contact info in name, etc.) | 98 |

---

## Common Queries

```sql
-- Connect
sqlite3 data/canonical_accounts.db

-- HIGH confidence accounts
SELECT canonical_name, display_name, record_count
FROM canonical_accounts
WHERE confidence_level = 'HIGH'
ORDER BY record_count DESC;

-- Accounts matched in all 3 systems
SELECT canonical_name, qb_company_name, sp_name, monday_name
FROM canonical_accounts
WHERE qb_customer_id != '' AND sp_id != '' AND monday_id != ''
ORDER BY record_count DESC;

-- Accounts with NO system matches (the gap)
SELECT canonical_name, display_name, record_count
FROM canonical_accounts
WHERE qb_customer_id = '' AND sp_id = '' AND monday_id = ''
  AND is_garbage = 0
ORDER BY record_count DESC;

-- All variants for a specific account
SELECT av.variant_name
FROM account_variants av
JOIN canonical_accounts ca ON av.canonical_id = ca.id
WHERE ca.canonical_name = 'willmeng';

-- Contact info
SELECT ca.canonical_name, ac.phone, ac.email
FROM account_contacts ac
JOIN canonical_accounts ca ON ac.canonical_id = ca.id
WHERE ac.phone != '' OR ac.email != '';

-- Garbage entries
SELECT canonical_name, garbage_reason
FROM canonical_accounts WHERE is_garbage = 1;

-- Confidence distribution
SELECT confidence_level, COUNT(*) as count
FROM canonical_accounts GROUP BY confidence_level ORDER BY count DESC;

-- WOS status breakdown
SELECT wos_status, COUNT(*) as count
FROM canonical_accounts WHERE is_garbage = 0
GROUP BY wos_status ORDER BY count DESC;
```

---

## Rebuilding the Database

If source CSVs are updated:

```bash
python3 build_canonical_db.py
```

This regenerates `canonical_accounts.db` from the CSV files in `data/output/`, `data/links/`, and `config/`.

---

## Known Gaps

- **65.8% of accounts** (726) have no external system matches
- **Contact extraction** is sparse (58 out of 1,103 accounts)
- **98 garbage entries** may contain recoverable data
