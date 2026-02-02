# Layton Construction Company Variant Analysis

**Date:** 2025-01-20  
**Analysis Scope:** All 21 raw CSV files in `projects/accounts/data/raw/`  
**Output File:** `layton_variants.csv`

## Executive Summary

Found **6 distinct spelling/format variants** of Layton Construction across the raw data, representing **314 total records** that should merge to a single canonical entity.

### Key Findings:

- **Primary spelling (LAYTON CONSTRUCTION COMPANY):** 222 records (70.7%)
  - Appears in 12 source files
  - Most consistent across billing, contracts, and certifications
  
- **Abbreviated (LAYTON):** 78 records (24.8%)
  - Appears in 6 source files
  - Primarily in rental, water/truck service, and project tracking
  
- **Typo variant (LAYTON CONSTRUCTON COMPANY):** 8 records (2.5%)
  - Missing 'u' in "CONSTRUCTION"
  - Appears in 4 source files related to location tracking
  
- **Other variants:** 6 records (1.9%)
  - Mixed spellings, merged locations, colon-separated job references

---

## Variant Details

| Raw Spelling | Count | Files | Pattern | Should Merge? |
|---|---|---|---|---|
| LAYTON CONSTRUCTION COMPANY | 222 | 12 files | Consistent formal company name | **YES** |
| LAYTON | 78 | 6 files | Abbreviated, used in rental/service tracking | **YES** |
| LAYTON CONSTRUCTON COMPANY | 8 | 4 files | Typo (missing 'u'), should be normalized | **YES** |
| Layton Construction | 3 | 2 files | Missing "Company" suffix | **YES** |
| LAYTON CONSTRUCTION COMPANY Merged with dc1 | 2 | 1 file | Historical marker (Data Center 1 consolidation) | **YES** |
| Layton Construction Company:Lakin Industrial Park Ph.4 | 1 | 1 file | Format: Company:Project notation | **YES** |

---

## Source File Distribution

### Variants by Source (Record Count):

1. **excel_swppp_bv.csv** - 117 records
   - Contractors tracked in SWPPP (Stormwater Pollution Prevention Plan)
   - Primarily "LAYTON CONSTRUCTION COMPANY"

2. **certs_2025_all.csv** - 57 records
   - Insurance certificates
   - All "LAYTON CONSTRUCTION COMPANY"

3. **excel_location_sheet1.csv** - 5 records
   - Location master data
   - Mix of "LAYTON CONSTRUCTION COMPANY" and typo variant

4. **excel_location_completed.csv** - 40+ records
   - Project completion tracking
   - Multiple variants including abbreviated form

5. **Other files** - ~78 records distributed across:
   - excel_rental_*.csv (rental equipment tracking)
   - excel_cp_invoices_*.csv (contractor payment invoices)
   - excel_location_*.csv (location/project management)

---

## Data Quality Notes

### Variant Pattern Analysis:

1. **Case Sensitivity Issues**
   - UPPERCASE: "LAYTON CONSTRUCTION COMPANY" (dominant)
   - Mixed Case: "Layton Construction Company" 
   - Lower: Some entries with "layton"

2. **Abbreviations**
   - Full: "Layton Construction Company" (formal)
   - Short: "Layton Construction"
   - Shortest: "Layton" (informal)

3. **Typos**
   - "LAYTON CONSTRUCTON COMPANY" (missing 'u') - 8 records
   - Should be corrected during data cleaning

4. **Job Number Variants** (from previous analysis)
   - Some entries include job references: "Layton Construction Company:Lakin Industrial Park Ph.4"
   - Job numbers should be stored in separate columns, not merged with company name

5. **Email Domain Confirmation**
   - All Layton employee emails use `@laytonconstruction.com` domain
   - Confirms single organization identity

---

## Canonicalization Rules

### Recommended Canonical Form:
**"Layton Construction Company"** (title case, no abbreviations, no suffixes)

### Normalization Rules:
1. Replace all case variants with canonical form
2. Remove typos ("CONSTRUCTON" → "CONSTRUCTION")
3. Extract and separate job/location references into dedicated fields
4. Merge "Merged with dc1" notations into historical/notes field
5. Consolidate abbreviated "LAYTON" entries

### Merge Confidence:
- **High Confidence (100%):** All 6 variants clearly refer to same organization
- **Reasoning:** Domain name confirmation, geographic clustering, business function alignment

---

## Implementation Notes

All 314 records have `should_merge = YES` in the output CSV.

### Next Steps:
1. Run data cleaning script to apply normalization rules
2. Create unified "Layton Construction Company" entity in master database
3. Update all 314 records with canonical reference
4. Maintain variant → canonical mapping for audit trail

---

## File Structure

```
projects/accounts/data/canonical/
├── layton_variants.csv          # Output mapping file
├── LAYTON_ANALYSIS.md           # This analysis document
└── [other canonicalization files]
```

### CSV Columns:
- `raw_spelling` - Exact spelling from source data
- `source_file` - Comma-separated list of files containing this variant
- `record_count` - Number of records with this spelling
- `is_job_entry` - Whether entry represents a job/project (YES/NO)
- `job_number_extracted` - Extracted job number if present
- `should_merge` - Recommendation (all YES for Layton variants)
- `canonical_name` - Target canonical name for merging

