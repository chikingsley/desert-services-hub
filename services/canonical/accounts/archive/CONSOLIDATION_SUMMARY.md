# Contractor Data Consolidation Summary

**Date:** 2026-01-20
**Status:** Complete

---

## Executive Summary

Successfully consolidated contractor data from 21 data sources into a canonical database of **1,103 unique contractors**.

### Key Metrics

| Stage | Count | Reduction |
|-------|-------|-----------|
| Raw records | 13,060 | - |
| Basic normalization | 2,181 | 83% deduped |
| Smart grouping | 1,771 | 19% merged |
| Final consolidation | 1,103 | 38% merged |

### Data Sources Processed

1. **Excel Files (16 sheets):** 8,200+ records
   - Customer Rental Master (6 sheets)
   - SWPPP Master (4 sheets)
   - WT & SW Master (1 sheet)
   - Rw.Location.Upload (6 sheets)

2. **AIA Jobs Folder:** 901 records from 40 contractors

3. **Insurance Certificates:** 2,493 records

4. **Signs/Other:** 2 records

---

## Cross-Reference Results

### QuickBooks Matching
- **Exact matches:** 246 (13.8%)
- **StartsWith matches:** 393 (22.1%)
- **Unmatched:** 1,132 (63.9%)
- **Total coverage:** 36.1%

### Notable Unmatched High-Volume Contractors
1. **AR Mays** - 371 records (QB has "A.R. Mays Construction" - different format)
2. **Willmeng** - 340 records (NOT in QuickBooks)
3. **Ryan Companies** - 198 records (NOT in QuickBooks)

### Known Entity Relationships
- 417 known relationships identified between SharePoint, QuickBooks, and Monday

---

## Top 10 Contractors by Record Volume

| Rank | Contractor | Records | Variants Merged |
|------|------------|---------|-----------------|
| 1 | Willmeng | 380 | 33 |
| 2 | AR Mays | 376 | 6 |
| 3 | Layton | 343 | 26 |
| 4 | Chasse Building | 324 | 18 |
| 5 | Core Construction | 254 | 49 |
| 6 | Haydon Building | 219 | 7 |
| 7 | Ryan Companies | 215 | 13 |
| 8 | Alexander Building | 200 | 16 |
| 9 | MT Builders | 194 | 1 |
| 10 | FCL Builders | 182 | 7 |

---

## Data Quality Findings

### Garbage Entries Identified: 349
- Job numbers embedded in names
- Phone numbers in contractor fields
- Billing instructions as names
- Internal references (Desert Services)
- Very short ambiguous names

### Contact Data Extracted: 22,538 records
- Phone numbers: 602-XXX, 480-XXX, 520-XXX patterns
- Email addresses extracted from embedded text
- Contact names parsed from raw entries

### WOS (Workers Comp) Status: 669 contractors
- WOS_ONLY: Approved for on-site work
- NON_WOS_ONLY: Not approved
- DUAL_STATUS: Contractors appearing in both

---

## Files Generated

### Canonical Data
- `accounts_final.csv` - 1,103 consolidated contractors
- `merge_rules.json` - Comprehensive merge rules
- `garbage_entries.csv` - 349 flagged entries
- `short_name_review.csv` - 226 short names reviewed
- `merge_candidates.csv` - 529 potential additional merges

### Cross-Reference Links
- `qb_matches.csv` - QuickBooks matches
- `sharepoint_matches.csv` - SharePoint matches
- `monday_matches.csv` - Monday CRM matches
- `known_entity_relationships.csv` - Existing relationships

### Contractor Details
- `contractor_contacts.csv` - 22K+ extracted contacts
- `contractor_wos_status.csv` - WOS certification status
- `top_contractor_projects.csv` - Project data for top contractors

### Variant Analysis
- `ar_mays_variants.csv` - AR Mays name variations
- `willmeng_variants.csv` - Willmeng name variations
- `layton_variants.csv` - Layton name variations
- `core_variants.csv` - Core Construction variations
- `chasse_variants.csv` - Chasse Building variations

---

## Merge Rules Applied

### Suffix Normalization
- Inc, Inc., LLC, Corp, Co, Company -> removed for matching
- Construction, Contractors, Builders -> normalized

### Known Aliases (20+ companies)
- AR Mays = ARMAYS = A.R. Mays = A.R. MAYS
- Willmeng = WILLMENG = Willmeng Construction Inc
- Chasse = Chasse Building Team = Chasse Building
- LGE = LGE Design = LGE Design Build
- etc.

### Punctuation Rules
- A.R. = AR (dots removed)
- Big-D = Big D (hyphens normalized)
- & = and (ampersand normalized)

---

## Recommendations

### Immediate Actions
1. Review unmatched high-volume contractors (AR Mays, Willmeng, Ryan)
2. Verify QuickBooks has correct company name formats
3. Clean up garbage entries from source systems

### Data Quality Improvements
1. Standardize contractor name entry in source systems
2. Use dropdown/lookup instead of free text where possible
3. Separate job numbers from contractor fields

### System Integration
1. Use canonical_accounts as master reference
2. Link existing systems to canonical IDs
3. Implement deduplication rules in data entry

---

## Technical Notes

- All processing done with Bun/TypeScript
- SQLite used for cross-reference queries
- CSV format for portability
- JSON for merge rules (machine-readable)
