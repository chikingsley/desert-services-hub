# Willmeng Contractor Consolidation Analysis - File Index

**Analysis Completed:** 2026-01-20
**Status:** Complete with 5 output files ready for review

---

## Quick Facts

- **Total Records Found:** 797
- **Unique Spelling Variants:** 141
- **Source Files Analyzed:** 16 CSV files
- **Consolidation Candidates:** 695 records (87%)
- **Metadata Extraction Required:** 102 records (13%)

---

## Output Files

### 1. willmeng_variants.csv (Primary Summary)
**Location:** `/projects/accounts/data/canonical/willmeng_variants.csv`

High-level consolidation summary focusing on the major variants:
- 6 rows of primary consolidation targets
- Quick overview of merge strategy
- Columns: raw_spelling, record_count, source_files, should_merge, canonical_form, notes

**Best for:** Executive summary, quick reference

---

### 2. willmeng_variants_detailed.csv (Comprehensive Analysis)
**Location:** `/projects/accounts/data/canonical/willmeng_variants_detailed.csv`

Complete detailed analysis of ALL 141 variants:
- Every unique spelling found in raw data
- Record counts and source files for each variant
- Merge category classification (YES/NO/PARTIAL)
- Canonical form assignment
- Implementation notes

**Best for:** Complete reference, edge case identification, validation

---

### 3. willmeng_canonical_mapping.csv (Quick Reference)
**Location:** `/projects/accounts/data/canonical/willmeng_canonical_mapping.csv`

Fast-lookup mapping table for the top 10 variants:
- Raw values and their canonical replacements
- Record counts
- Merge type (Direct/Normalize/Standardize/Extract)
- Priority levels (1-5)
- Notes for implementation

**Best for:** Script development, bulk replacement operations

---

### 4. WILLMENG_CONSOLIDATION_REPORT.md (Detailed Report)
**Location:** `/projects/accounts/data/canonical/WILLMENG_CONSOLIDATION_REPORT.md`

Comprehensive analysis document with:
- Executive summary
- Data quality issues identified
- All 16 source files analyzed
- Consolidation strategy with examples
- 5-phase implementation roadmap
- Canonical reference standards

**Best for:** Decision making, planning, team communication

---

### 5. willmeng_consolidation_summary.txt (Text Summary)
**Location:** `/projects/accounts/data/canonical/willmeng_consolidation_summary.txt`

Plain text detailed summary covering:
- Overview statistics
- Primary canonical forms with breakdown
- Contact information handling
- Metadata & notes extraction
- Data quality issues
- Source file listing
- Consolidation totals by category
- Implementation recommendations

**Best for:** Print-friendly reference, quick review

---

## Consolidation Strategy Summary

### Direct Merge (695 records - 87%)

These should be directly replaced:

```
Willmeng
  ├─ Willmeng (247 records) - PRIMARY
  ├─ WILLMENG (93 records) - all caps
  └─ 18 other pure name variants (18 records)

Willmeng Construction
  ├─ Willmeng Construction (224 records) - PRIMARY
  ├─ WILLMENG CONSTRUCTION INC (29 records) - all caps with INC
  └─ 13 other construction variants (33 records)
```

### Metadata Extraction (102 records - 13%)

These require data extraction BEFORE merging:

```
Contact Information (56 records)
  ├─ Website/domain references (25 records)
  └─ Email addresses (31 records)

Job Numbers & Notes (46 records)
  ├─ Job references (27 records)
  ├─ COR assignments (10 records)
  ├─ Phone numbers (6 records)
  └─ Status information (3 records)
```

---

## Data Quality Issues Identified

1. **Inconsistent Capitalization** (95 records)
   - Mix of WILLMENG, Willmeng, willmeng

2. **Embedded Contact Info** (50+ records)
   - Website and emails in contractor name field

3. **Job Numbers in Names** (27 records)
   - Job IDs mixed into contractor name

4. **Phone Numbers in Names** (6 records)
   - Phone stored in contractor field instead of contact field

5. **Status in Names** (2 records)
   - "Canceled" and "Doing own inspections" embedded

6. **PDF Names as Variants** (70+ records)
   - Document filenames treated as contractor variants

---

## Files Analyzed

### Raw Data Files (16 total, 797 Willmeng records)

**Location Tracking Files:**
- excel_location_sheet1.csv
- excel_location_completed.csv
- excel_location_contract_billing.csv
- excel_location_billing_invoices.csv
- excel_location_uploads.csv

**Work Tracking Files:**
- excel_wt_sw.csv
- excel_location_billing_invoices.csv

**SWPPP/Environmental Permit Files:**
- excel_swppp_confirmed.csv
- excel_swppp_bv.csv
- excel_swppp_need_schedule.csv

**Rental/Equipment Files:**
- excel_rental_swppp_numbers.csv
- excel_rental_items.csv
- excel_rental_bv.csv

**Financial Files:**
- excel_credit_memos.csv
- excel_cp_invoices_2024.csv
- excel_cp_invoices_2025.csv

**Certification Files:**
- certs_2025_all.csv

---

## Implementation Roadmap

**Phase 1: Data Preparation** (1-2 hours)
- Review detailed CSV for edge cases
- Validate consolidation logic
- Create data backup

**Phase 2: Script Development** (2-3 hours)
- Build transformation script
- Implement metadata extraction
- Test on sample subset

**Phase 3: Batch Processing** (1 hour)
- Apply to all 16 CSV files
- Validate record counts

**Phase 4: Quality Assurance** (1-2 hours)
- Spot-check results
- Verify data integrity

**Phase 5: Integration** (1 hour)
- Update canonical database
- Link variants to canonical ID

**Total Estimated Effort:** 6-9 hours

---

## Canonical Reference Standards

### Use These Forms Going Forward

- **Simple reference:** "Willmeng"
- **Legal entity:** "Willmeng Construction"
- **Website:** willmeng.com
- **Main phone:** 520-249-0734
- **Contact:** Avanash (864-650-6767)

### DO NOT Use

- WILLMENG (all caps - normalize to title case)
- Willmeng Inc / Willmeng Construction Inc (omit "Inc")
- Embedded metadata in contractor name
- Inconsistent spacing or capitalization

---

## How to Use These Files

1. **Start with:** willmeng_variants.csv (6-row summary)
2. **Review:** WILLMENG_CONSOLIDATION_REPORT.md (full context)
3. **Implement:** willmeng_canonical_mapping.csv (script reference)
4. **Validate:** willmeng_variants_detailed.csv (all 141 variants)
5. **Reference:** willmeng_consolidation_summary.txt (quick lookup)

---

## Questions for Stakeholders

- Should historical records be updated or preserved as-is?
- Should contact info migrate to separate contact management system?
- Are similar analyses needed for other top contractors?
- Timeline for implementation?

---

## Analysis Methodology

1. Searched all 16 CSV files for "willmeng", "will meng", "will-meng" (case-insensitive)
2. Extracted unique values from matches
3. Normalized trailing quotes and excessive whitespace
4. Filtered out contact-only entries (email lists, phone numbers)
5. Categorized remaining variants by type (simple name, full name, contact, metadata)
6. Assigned merge strategy to each variant
7. Generated mapping and consolidation guidance
8. Calculated record counts and impact analysis

---

**Analysis performed by:** Data Consolidation Analysis Script
**Last updated:** 2026-01-20
**Status:** Ready for implementation approval
