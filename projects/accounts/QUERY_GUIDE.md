# Canonical Accounts Database - Query Guide

Quick reference for common queries against `canonical_accounts.db`.

## Connection

Using SQLite CLI:
```bash
sqlite3 /projects/accounts/data/canonical_accounts.db
```

Using Python:
```python
import sqlite3
conn = sqlite3.connect('/projects/accounts/data/canonical_accounts.db')
cursor = conn.cursor()
cursor.execute("SELECT * FROM canonical_accounts LIMIT 1")
```

---

## Basic Queries

### Count Total Accounts by Confidence Level

```sql
SELECT confidence_level, COUNT(*) as count
FROM canonical_accounts
GROUP BY confidence_level
ORDER BY count DESC;
```

**Output**:
- LOW: 628
- HIGH: 229
- MEDIUM: 148
- GARBAGE: 98

---

### List All HIGH Confidence Accounts

```sql
SELECT id, canonical_name, display_name, record_count, qb_customer_id, sp_id, monday_id
FROM canonical_accounts
WHERE confidence_level = 'HIGH'
ORDER BY record_count DESC;
```

---

### Find Accounts Matched in Multiple Systems

**All 3 systems**:
```sql
SELECT canonical_name, qb_company_name, sp_name, monday_name
FROM canonical_accounts
WHERE qb_customer_id != ''
  AND sp_id != ''
  AND monday_id != ''
ORDER BY record_count DESC;
```

**Any 2 systems**:
```sql
SELECT canonical_name,
       CASE WHEN qb_customer_id != '' THEN 'QB' ELSE '' END as has_qb,
       CASE WHEN sp_id != '' THEN 'SP' ELSE '' END as has_sp,
       CASE WHEN monday_id != '' THEN 'Monday' ELSE '' END as has_monday
FROM canonical_accounts
WHERE (qb_customer_id != '' AND (sp_id != '' OR monday_id != ''))
   OR (sp_id != '' AND monday_id != '')
ORDER BY canonical_name;
```

---

### Find Accounts WITHOUT System Matches

```sql
SELECT canonical_name, display_name, record_count, variant_count
FROM canonical_accounts
WHERE qb_customer_id = ''
  AND sp_id = ''
  AND monday_id = ''
  AND is_garbage = 0
ORDER BY record_count DESC;
```

---

### Search for Specific Account

**By canonical name**:
```sql
SELECT * FROM canonical_accounts
WHERE canonical_name LIKE '%willmeng%';
```

**By display name**:
```sql
SELECT * FROM canonical_accounts
WHERE display_name LIKE '%Willmeng%';
```

**By QuickBooks ID**:
```sql
SELECT * FROM canonical_accounts
WHERE qb_customer_id = 'Layton Construction Company:Cavasson MOB & Retail';
```

---

## Variant Analysis

### Get All Variants for a Specific Account

```sql
SELECT av.id, av.variant_name, av.source_file
FROM account_variants av
JOIN canonical_accounts ca ON av.canonical_id = ca.id
WHERE ca.canonical_name = 'willmeng'
ORDER BY av.id;
```

---

### Find Most Varied Accounts

```sql
SELECT canonical_name, variant_count, COUNT(av.id) as actual_variants
FROM canonical_accounts ca
LEFT JOIN account_variants av ON ca.id = av.canonical_id
GROUP BY ca.id
ORDER BY actual_variants DESC
LIMIT 20;
```

---

### Search Across All Variants

```sql
SELECT ca.canonical_name, ca.display_name, av.variant_name
FROM account_variants av
JOIN canonical_accounts ca ON av.canonical_id = ca.id
WHERE av.variant_name LIKE '%core construction job%'
ORDER BY ca.canonical_name;
```

---

## Contact Information

### Extract All Contacts

```sql
SELECT ca.canonical_name, ac.contact_name, ac.phone, ac.email
FROM account_contacts ac
JOIN canonical_accounts ca ON ac.canonical_id = ca.id
WHERE ac.phone != '' OR ac.email != ''
ORDER BY ca.canonical_name;
```

---

### Find Contractors by Phone

```sql
SELECT ca.canonical_name, ac.phone, COUNT(*) as references
FROM account_contacts ac
JOIN canonical_accounts ca ON ac.canonical_id = ca.id
WHERE ac.phone != ''
GROUP BY ac.phone
ORDER BY references DESC;
```

---

### Find Contractors by Email Domain

```sql
SELECT ca.canonical_name, ac.email, COUNT(*) as references
FROM account_contacts ac
JOIN canonical_accounts ca ON ac.canonical_id = ca.id
WHERE ac.email LIKE '%@%.com'
GROUP BY SUBSTR(ac.email, INSTR(ac.email, '@'))
ORDER BY references DESC;
```

---

## WOS Status Queries

### List Accounts by WOS Status

```sql
SELECT wos_status, COUNT(*) as count
FROM canonical_accounts
WHERE is_garbage = 0
GROUP BY wos_status
ORDER BY count DESC;
```

---

### Find WOS-Only Certified Contractors

```sql
SELECT canonical_name, display_name, record_count
FROM canonical_accounts
WHERE wos_status = 'WOS_ONLY'
  AND is_garbage = 0
ORDER BY record_count DESC;
```

---

### Find Non-WOS Contractors

```sql
SELECT canonical_name, display_name, record_count
FROM canonical_accounts
WHERE wos_status LIKE '%NON_WOS%'
  AND is_garbage = 0
ORDER BY record_count DESC;
```

---

## Garbage/Problem Data

### List All Garbage Entries

```sql
SELECT id, canonical_name, display_name, garbage_reason
FROM canonical_accounts
WHERE is_garbage = 1
ORDER BY canonical_name;
```

---

### Count Garbage Reasons

```sql
SELECT garbage_reason, COUNT(*) as count
FROM canonical_accounts
WHERE is_garbage = 1
GROUP BY garbage_reason
ORDER BY count DESC;
```

---

### Most Common Garbage Categories

```sql
SELECT
  CASE
    WHEN garbage_reason LIKE '%job_number%' THEN 'Contains Job Number'
    WHEN garbage_reason LIKE '%phone%' THEN 'Contains Phone'
    WHEN garbage_reason LIKE '%email%' THEN 'Contains Email'
    WHEN garbage_reason LIKE '%short_name%' THEN 'Very Short Name'
    ELSE garbage_reason
  END as category,
  COUNT(*) as count
FROM canonical_accounts
WHERE is_garbage = 1
GROUP BY category
ORDER BY count DESC;
```

---

## Statistics & Reporting

### Account Size Distribution

```sql
SELECT
  CASE
    WHEN record_count > 300 THEN 'Large (>300)'
    WHEN record_count > 100 THEN 'Medium (100-300)'
    WHEN record_count > 20 THEN 'Small (20-100)'
    ELSE 'Minimal (<20)'
  END as size_category,
  COUNT(*) as count,
  AVG(record_count) as avg_records,
  SUM(record_count) as total_records
FROM canonical_accounts
WHERE is_garbage = 0
GROUP BY size_category
ORDER BY total_records DESC;
```

---

### Top 50 Contractors by Record Count

```sql
SELECT
  ROW_NUMBER() OVER (ORDER BY record_count DESC) as rank,
  canonical_name,
  display_name,
  record_count,
  variant_count,
  confidence_level,
  CASE WHEN qb_customer_id != '' THEN 'QB' ELSE '' END as in_qb,
  CASE WHEN sp_id != '' THEN 'SP' ELSE '' END as in_sp,
  CASE WHEN monday_id != '' THEN 'Mon' ELSE '' END as in_monday
FROM canonical_accounts
WHERE is_garbage = 0
ORDER BY record_count DESC
LIMIT 50;
```

---

### Confidence Level Summary

```sql
SELECT
  confidence_level,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM canonical_accounts WHERE is_garbage = 0), 1) as percent,
  AVG(record_count) as avg_records,
  SUM(record_count) as total_records
FROM canonical_accounts
WHERE is_garbage = 0
GROUP BY confidence_level
ORDER BY count DESC;
```

---

## Export Queries

### Export HIGH Confidence to CSV

```sql
.headers on
.mode csv
.output /tmp/high_confidence_accounts.csv
SELECT * FROM canonical_accounts WHERE confidence_level = 'HIGH' ORDER BY record_count DESC;
```

---

### Export All Variants with Canonical Names

```sql
.headers on
.mode csv
.output /tmp/all_variants.csv
SELECT ca.canonical_name, av.variant_name
FROM account_variants av
JOIN canonical_accounts ca ON av.canonical_id = ca.id
ORDER BY ca.canonical_name, av.variant_name;
```

---

### Export Contact Information

```sql
.headers on
.mode csv
.output /tmp/contacts.csv
SELECT ca.canonical_name, ac.phone, ac.email, ac.source
FROM account_contacts ac
JOIN canonical_accounts ca ON ac.canonical_id = ca.id
WHERE ac.phone != '' OR ac.email != ''
ORDER BY ca.canonical_name;
```

---

## Advanced Queries

### Find Duplicate QuickBooks Entries

```sql
SELECT qb_customer_id, COUNT(*) as count, GROUP_CONCAT(canonical_name, ', ') as accounts
FROM canonical_accounts
WHERE qb_customer_id != '' AND is_garbage = 0
GROUP BY qb_customer_id
HAVING count > 1
ORDER BY count DESC;
```

---

### Find Accounts with Inconsistent External IDs

```sql
SELECT canonical_name, display_name,
       COUNT(DISTINCT qb_customer_id) as qb_count,
       COUNT(DISTINCT sp_id) as sp_count,
       COUNT(DISTINCT monday_id) as mon_count
FROM canonical_accounts
WHERE is_garbage = 0
GROUP BY canonical_name
HAVING (qb_count > 1 OR sp_count > 1 OR mon_count > 1)
ORDER BY canonical_name;
```

---

### Confidence Score Histogram

```sql
SELECT
  ROUND(confidence_score * 100) as score_percent,
  COUNT(*) as count
FROM canonical_accounts
WHERE is_garbage = 0
GROUP BY ROUND(confidence_score * 100)
ORDER BY score_percent DESC;
```

---

### Data Quality Metrics

```sql
SELECT
  COUNT(*) as total_accounts,
  SUM(CASE WHEN confidence_level = 'HIGH' THEN 1 ELSE 0 END) as high_conf,
  SUM(CASE WHEN qb_customer_id != '' THEN 1 ELSE 0 END) as in_qb,
  SUM(CASE WHEN sp_id != '' THEN 1 ELSE 0 END) as in_sp,
  SUM(CASE WHEN monday_id != '' THEN 1 ELSE 0 END) as in_monday,
  ROUND(100.0 * SUM(CASE WHEN qb_customer_id != '' THEN 1 ELSE 0 END) / COUNT(*), 1) as pct_in_qb,
  ROUND(100.0 * SUM(CASE WHEN sp_id != '' THEN 1 ELSE 0 END) / COUNT(*), 1) as pct_in_sp,
  ROUND(100.0 * SUM(CASE WHEN monday_id != '' THEN 1 ELSE 0 END) / COUNT(*), 1) as pct_in_monday
FROM canonical_accounts
WHERE is_garbage = 0;
```

---

## Performance Tips

### Create Indexes for Faster Queries

```sql
CREATE INDEX idx_canonical_name ON canonical_accounts(canonical_name);
CREATE INDEX idx_confidence_level ON canonical_accounts(confidence_level);
CREATE INDEX idx_qb_customer_id ON canonical_accounts(qb_customer_id);
CREATE INDEX idx_sp_id ON canonical_accounts(sp_id);
CREATE INDEX idx_monday_id ON canonical_accounts(monday_id);
CREATE INDEX idx_variant_canonical_id ON account_variants(canonical_id);
CREATE INDEX idx_contact_canonical_id ON account_contacts(canonical_id);
```

### Run Query Statistics

```sql
PRAGMA table_info(canonical_accounts);
PRAGMA table_info(account_variants);
PRAGMA table_info(account_contacts);
```

---

## Common Issues & Solutions

### Issue: Query returns no results
- Check spelling of names (case-insensitive queries use LIKE '%term%')
- Verify is_garbage = 0 to exclude flagged entries
- Use LIKE instead of = for substring matching

### Issue: Need to find similar names
```sql
SELECT canonical_name FROM canonical_accounts
WHERE canonical_name LIKE 'will%' OR display_name LIKE '%Willm%';
```

### Issue: Export data with special characters
Use .mode csv in sqlite3 for proper escaping

---

## Database Schema Validation

### Check table structure

```sql
.schema canonical_accounts
.schema account_variants
.schema account_contacts
```

### Verify data integrity

```sql
SELECT COUNT(*) as total FROM canonical_accounts;
SELECT COUNT(*) as variants FROM account_variants;
SELECT COUNT(*) as contacts FROM account_contacts;

-- Check for orphaned records
SELECT COUNT(*) FROM account_variants WHERE canonical_id NOT IN (SELECT id FROM canonical_accounts);
SELECT COUNT(*) FROM account_contacts WHERE canonical_id NOT IN (SELECT id FROM canonical_accounts);
```
