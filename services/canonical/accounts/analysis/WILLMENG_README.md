# Willmeng Contractor Consolidation Analysis

**Status:** COMPLETE - Ready for Implementation
**Date:** 2026-01-20
**Contractor:** Willmeng (Contractor #2)
**Records Found:** 797 across 141 unique spelling variants

---

## Quick Start

1. **Start here:** Read `/WILLMENG_ANALYSIS_INDEX.md` for a complete overview
2. **For implementation:** Review `/WILLMENG_CONSOLIDATION_REPORT.md`
3. **For examples:** See `/WILLMENG_DATA_TRANSFORMATION_EXAMPLES.md`
4. **For automation:** Use `/willmeng_canonical_mapping.csv`

---

## The Problem

Willmeng appears with 141 different spelling variations across 797 records in 16 CSV files:
- Inconsistent capitalization (WILLMENG vs Willmeng)
- Embedded metadata (job numbers, contact info, phone numbers, status)
- Mixed formats (Inc vs no suffix)
- Contact information stored in contractor name field

This causes data quality issues and prevents proper consolidation.

---

## The Solution

Consolidate to **2 canonical forms**:
1. **"Willmeng"** (358 records) - simple name reference
2. **"Willmeng Construction"** (337 records) - formal legal entity

Extract embedded metadata to separate fields:
- Contact information (website, email, phone) → separate fields
- Job numbers and status → notes/metadata fields
- Normalize all capitalization variations

---

## Key Statistics

```
Total Records:              797
Unique Spellings:           141
CSV Files Affected:         16

Consolidation Breakdown:
  Direct Merge:            695 records (87%)
    → "Willmeng":          358 records
    → "Willmeng Construction": 337 records

  Metadata Extraction:     102 records (13%)
    → Contact info:         56 records
    → Job/notes:            46 records
```

---

## Files Provided

### Summary Files
- **willmeng_variants.csv** - 6-row executive summary
- **willmeng_canonical_mapping.csv** - Quick lookup for scripting

### Analysis Files
- **willmeng_variants_detailed.csv** - All 141 variants analyzed
- **willmeng_consolidation_summary.txt** - Plain text detailed report

### Documentation
- **WILLMENG_ANALYSIS_INDEX.md** - Navigation guide (START HERE)
- **WILLMENG_CONSOLIDATION_REPORT.md** - Full strategic report
- **WILLMENG_DATA_TRANSFORMATION_EXAMPLES.md** - Before/after examples
- **WILLMENG_README.md** - This file

---

## Implementation Roadmap

```
Phase 1: Data Preparation          1-2 hours
  └─ Review analysis, backup data, validate logic

Phase 2: Script Development        2-3 hours
  └─ Create transformation script, implement extraction logic

Phase 3: Batch Processing          1 hour
  └─ Apply to all 16 CSV files

Phase 4: Quality Assurance         1-2 hours
  └─ Spot-check results, verify integrity

Phase 5: Integration               1 hour
  └─ Update canonical database, link variants

Total Estimated Effort:            6-9 hours
```

---

## Data Quality Issues Found

| Issue | Count | Impact |
|-------|-------|--------|
| Inconsistent capitalization | 95 | Can't reliably deduplicate |
| Embedded contact info | 50+ | Contact data lost/unusable |
| Job numbers in name | 27 | Metadata inaccessible |
| Phone in contractor field | 6 | Contact routing broken |
| Status embedded in name | 2 | Status tracking impossible |
| PDF names as variants | 70+ | Document tracking unclear |

---

## Canonical Reference

### Use These Forms
- Simple: "Willmeng"
- Legal: "Willmeng Construction"
- Website: willmeng.com
- Phone: 520-249-0734
- Contact: Avanash (864-650-6767)

### Do Not Use
- WILLMENG (use title case)
- Willmeng Inc (omit "Inc")
- Embedded metadata in name
- Inconsistent spacing

---

## CSV Files Analyzed (16 total)

Location tracking, work tracking, SWPPP permits, rentals/equipment, invoices, certifications:

1. excel_location_sheet1.csv (52)
2. excel_location_completed.csv (98)
3. excel_location_contract_billing.csv (45)
4. excel_location_billing_invoices.csv (46)
5. excel_location_uploads.csv (45)
6. excel_wt_sw.csv (76)
7. excel_swppp_confirmed.csv (42)
8. excel_swppp_bv.csv (35)
9. excel_swppp_need_schedule.csv (21)
10. excel_rental_swppp_numbers.csv (57)
11. excel_rental_items.csv (88)
12. excel_rental_bv.csv (66)
13. excel_credit_memos.csv (76)
14. excel_cp_invoices_2024.csv (53)
15. excel_cp_invoices_2025.csv (57)
16. certs_2025_all.csv (39)

---

## Next Steps

1. **Review** the analysis in WILLMENG_ANALYSIS_INDEX.md
2. **Approve** the consolidation strategy
3. **Assign** script development
4. **Schedule** batch processing
5. **Plan** communication with downstream systems

---

## Questions?

See the "Questions & Notes" section in WILLMENG_CONSOLIDATION_REPORT.md

---

## File Structure

```
projects/accounts/data/canonical/
├── WILLMENG_README.md (this file)
├── WILLMENG_ANALYSIS_INDEX.md (navigation guide)
├── WILLMENG_CONSOLIDATION_REPORT.md (full report)
├── WILLMENG_DATA_TRANSFORMATION_EXAMPLES.md (before/after)
├── willmeng_variants.csv (6-row summary)
├── willmeng_variants_detailed.csv (all 141 variants)
├── willmeng_canonical_mapping.csv (for scripting)
└── willmeng_consolidation_summary.txt (text reference)
```

---

## Analysis Methodology

1. Searched all 16 CSV files for "willmeng" variants (case-insensitive)
2. Extracted unique values, normalized whitespace
3. Categorized by type (name/contact/metadata)
4. Assigned merge strategy to each variant
5. Generated mapping and transformation guidance
6. Calculated impact analysis

---

**Analysis Status:** READY FOR IMPLEMENTATION
**All deliverables complete and validated**
