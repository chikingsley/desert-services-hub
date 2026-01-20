# Canonical Accounts Database - Complete Index

## Quick Links

- **Main Database**: `/projects/accounts/data/canonical_accounts.db` (296 KB)
- **Build Script**: `/projects/accounts/build_canonical_db.py`

---

## Documentation Files

### 1. README_CANONICAL_DB.md
**Executive Summary & Getting Started**
- Project overview and key numbers
- Database structure overview
- Quick start guide
- Usage scenarios

### 2. CANONICAL_DB_SUMMARY.md
**Complete Technical Specification**
- Detailed database schema (3 tables)
- Confidence scoring system
- Key statistics and metrics
- Data integration details
- WOS certification status
- Usage examples and SQL queries
- Maintenance procedures

### 3. QUERY_GUIDE.md
**40+ Pre-built SQL Queries**
- Basic account queries
- Variant lookups
- Contact information extraction
- WOS status queries
- Garbage entry filtering
- Statistics and reporting
- Advanced queries
- Performance tips

### 4. INDEX.md
**This File - Navigation & Overview**

---

## Database Overview

### Three Tables

**canonical_accounts** (1,103 rows)
- Master list of all unique contractors
- 17 columns with IDs for QB, SharePoint, Monday
- Confidence scores and quality flags
- WOS status indicators

**account_variants** (1,945 rows)
- Name variations for each canonical account
- Preserves audit trail
- Source tracking

**account_contacts** (58 rows)
- Extracted phone numbers and emails
- Associated with canonical accounts
- Source tracking

### Key Metrics

- 1,103 unique canonical accounts
- 1,945 account name variants
- 58 contact records
- 229 HIGH confidence accounts (20.8%)
- 148 MEDIUM confidence accounts (13.4%)
- 628 LOW confidence accounts (56.9%)
- 98 GARBAGE entries (8.9%)

---

## Getting Started

### Step 1: Review Documentation
Start with **README_CANONICAL_DB.md** for executive overview

### Step 2: Understand Schema
Read **CANONICAL_DB_SUMMARY.md** sections on table structure

### Step 3: Try Sample Queries
Copy queries from **QUERY_GUIDE.md** into SQLite

### Step 4: Access the Database

Using SQLite CLI:
```bash
sqlite3 /projects/accounts/data/canonical_accounts.db
SELECT COUNT(*) FROM canonical_accounts;
```

Using Python:
```python
import sqlite3
conn = sqlite3.connect('/projects/accounts/data/canonical_accounts.db')
cursor = conn.cursor()
cursor.execute('SELECT * FROM canonical_accounts LIMIT 5')
print(cursor.fetchall())
```

---

## Common Tasks

### Find All HIGH Confidence Accounts
**Document**: QUERY_GUIDE.md → "List All HIGH Confidence Accounts"
**Purpose**: Primary billing/accounting reference

### Get Account Variants
**Document**: QUERY_GUIDE.md → "Get All Variants for a Specific Account"
**Purpose**: Audit trail and name normalization

### Extract Contact Information
**Document**: QUERY_GUIDE.md → "Extract All Contacts"
**Purpose**: Customer outreach, compliance

### Check System Coverage
**Document**: QUERY_GUIDE.md → "Find Accounts Matched in Multiple Systems"
**Purpose**: Data quality assessment

### Identify Problematic Data
**Document**: QUERY_GUIDE.md → "List All Garbage Entries"
**Purpose**: Data cleanup and validation

---

## Data Quality Levels

### HIGH Confidence (0.95) - 229 Accounts
Matched in 2+ systems
- Use for: Primary billing, accounting, reporting
- Examples: Willmeng, AR Mays, Layton, Chasse Building Team
- Status: Ready for production

### MEDIUM Confidence (0.75) - 148 Accounts
Matched in 1 system
- Use for: Secondary verification, audit trails
- Status: Standard procedures

### LOW Confidence (0.5) - 628 Accounts
No external system matches but valid names
- Use for: Research, supplementary data, follow-up
- Status: Requires manual verification

### GARBAGE (0.0) - 98 Accounts
Flagged as invalid or problematic
- Use for: Exclusion lists, cleanup targets
- Status: Review before any production use

---

## System Integration

### QuickBooks (QB)
- 182 accounts matched (16.5%)
- Customer IDs provided
- EXACT and STARTS_WITH matches

### SharePoint (SP)
- 159 accounts matched (14.4%)
- Folder IDs provided
- EXACT and STARTS_WITH matches

### Monday CRM
- 152 accounts matched (13.8%)
- Item IDs provided
- EXACT and STARTS_WITH matches

### Multi-System
- All 3 systems: 102 accounts (9.2%)
- 2 systems: 127 accounts (11.5%)
- 1 system: 148 accounts (13.4%)
- None: 726 accounts (65.8%)

---

## Top 10 Accounts

1. Willmeng - 380 records
2. AR Mays - 376 records
3. Chasse Building Team - 324 records
4. Core Construction - 254 records
5. Haydon Building Corp - 219 records
6. Ryan Companies - 215 records
7. MT Builders - 194 records
8. FCL Builders - 182 records
9. LGE Design Build - 173 records
10. Brycon - 169 records

---

## Query Examples by Use Case

### Billing & Accounting
```sql
SELECT canonical_name, qb_customer_id, record_count
FROM canonical_accounts
WHERE confidence_level IN ('HIGH', 'MEDIUM')
ORDER BY record_count DESC;
```
**Reference**: QUERY_GUIDE.md

### System Integration
```sql
SELECT canonical_name, qb_customer_id, sp_id, monday_id
FROM canonical_accounts
WHERE confidence_level = 'HIGH';
```
**Reference**: QUERY_GUIDE.md

### Compliance & Certification
```sql
SELECT canonical_name, wos_status
FROM canonical_accounts
WHERE wos_status = 'WOS_ONLY';
```
**Reference**: QUERY_GUIDE.md

### Data Quality Assessment
```sql
SELECT confidence_level, COUNT(*) as count
FROM canonical_accounts
GROUP BY confidence_level;
```
**Reference**: QUERY_GUIDE.md

---

## Maintenance

### Regenerate Database
When source CSV files are updated:
```bash
python3 /projects/accounts/build_canonical_db.py
```

### Source Files
- accounts_final.csv - Canonical account list
- qb_matches.csv - QB linking
- sharepoint_matches.csv - SharePoint linking
- monday_matches.csv - Monday linking
- garbage_entries.csv - Problematic entries
- contractor_wos_status.csv - WOS status

### Script Information
- **Location**: `/projects/accounts/build_canonical_db.py`
- **Language**: Python 3
- **Dependencies**: csv, json, sqlite3 (standard library)
- **Runtime**: ~5 seconds

---

## File Structure

```
/projects/accounts/
├── data/
│   ├── canonical_accounts.db          (Main database - 296 KB)
│   ├── canonical/
│   │   ├── accounts_final.csv
│   │   ├── merge_rules.json
│   │   ├── garbage_entries.csv
│   │   └── contractor_wos_status.csv
│   └── links/
│       ├── qb_matches.csv
│       ├── sharepoint_matches.csv
│       └── monday_matches.csv
├── build_canonical_db.py              (Build script)
├── README_CANONICAL_DB.md             (Executive summary)
├── CANONICAL_DB_SUMMARY.md            (Technical spec)
├── QUERY_GUIDE.md                     (SQL examples)
├── INDEX.md                           (This file)
└── ...
```

---

## Document Navigation

### If you need to...

**Understand what was created**
→ README_CANONICAL_DB.md

**Learn the database schema**
→ CANONICAL_DB_SUMMARY.md

**Query the database**
→ QUERY_GUIDE.md

**Know which table to use**
→ CANONICAL_DB_SUMMARY.md → Database Structure section

**Find specific accounts**
→ QUERY_GUIDE.md → "Search for Specific Account" section

**Get statistics**
→ QUERY_GUIDE.md → "Statistics & Reporting" section

**Extract contacts**
→ QUERY_GUIDE.md → "Contact Information" section

**Find problem data**
→ QUERY_GUIDE.md → "Garbage/Problem Data" section

**Export data**
→ QUERY_GUIDE.md → "Export Queries" section

**Check quality**
→ README_CANONICAL_DB.md → Data Quality Assessment section

**Regenerate database**
→ Build section or run: `python3 /projects/accounts/build_canonical_db.py`

---

## Key Numbers Reference

| Metric | Value |
|--------|-------|
| Total Canonical Accounts | 1,103 |
| HIGH Confidence | 229 (20.8%) |
| MEDIUM Confidence | 148 (13.4%) |
| LOW Confidence | 628 (56.9%) |
| GARBAGE Entries | 98 (8.9%) |
| Total Variants | 1,945 |
| Contact Records | 58 |
| QB Matches | 182 (16.5%) |
| SharePoint Matches | 159 (14.4%) |
| Monday Matches | 152 (13.8%) |
| All 3 Systems | 102 (9.2%) |
| Database Size | 296 KB |

---

## Quick Reference: Confidence Scores

- **0.95 (HIGH)**: 2+ systems matched, verified data
- **0.75 (MEDIUM)**: 1 system matched, good quality
- **0.50 (LOW)**: No external matches, valid data
- **0.00 (GARBAGE)**: Flagged as invalid

---

## Support Resources

### For Database Questions
1. Check README_CANONICAL_DB.md for overview
2. Check CANONICAL_DB_SUMMARY.md for detailed specs
3. Review build_canonical_db.py for logic

### For Query Questions
1. Search QUERY_GUIDE.md for similar examples
2. Modify example queries for your needs
3. Consult SQLite documentation for syntax

### For Data Questions
1. Review confidence level definitions
2. Check garbage_reason for flagged entries
3. Verify source system in match_type field

### For Technical Issues
1. Regenerate database: `python3 build_canonical_db.py`
2. Verify database integrity with `sqlite3 --version`
3. Check source CSV files are not corrupted

---

## Summary

The Canonical Accounts Database consolidates 1,103 contractor accounts from 7 data sources into a unified SQLite database with:

- Cross-system validation (QB, SharePoint, Monday)
- Confidence scoring for data quality
- Complete variant tracking
- WOS certification status
- Comprehensive documentation
- 40+ pre-built query examples

The database is **production-ready** for lookups, reporting, system integration, and compliance verification.

**Start here**: README_CANONICAL_DB.md
