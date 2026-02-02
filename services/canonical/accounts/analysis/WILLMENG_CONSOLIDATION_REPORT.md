# WILLMENG CONTRACTOR CONSOLIDATION ANALYSIS

**Analysis Date:** 2026-01-20  
**Contractor:** Willmeng (Contractor #2)  
**Total Records Found:** 797  
**Unique Spellings Identified:** 141

---

## Executive Summary

Willmeng appears in 797 records across 16 CSV files with 141 different spelling variations. The majority of records can be consolidated into **2 canonical forms**:
- **"Willmeng"** (358 records - simple name reference)
- **"Willmeng Construction"** (337 records - formal legal name)

An additional 102 records contain embedded metadata (job numbers, contact info, phone numbers, status notes) that should be extracted to separate fields rather than merged.

---

## Key Findings

### 1. Primary Canonical Forms

#### Willmeng (Simple Name)
- **Primary records:** 247
- **Variants to normalize:** 111
  - WILLMENG (93 records) - all caps
  - WILLMENG Canceled (2 records)
  - WILLMENG Doing own inspections (2 records)
  - WILLMENG.COM (6 records)
  - Other misc variants (8 records)
- **Consolidation action:** Merge all to "Willmeng"

#### Willmeng Construction (Full Legal Name)
- **Primary records:** 224
- **Variants to normalize:** 113
  - WILLMENG CONSTRUCTION INC (29 records)
  - Willmeng Construction Inc (4 records)
  - WILLMENG CONSTRUCTION (2 records)
  - PDF document names (70+ records)
  - Other construction variants (8 records)
- **Consolidation action:** Merge all to "Willmeng Construction"

### 2. Metadata Extraction Required (Don't Merge)

**Contact Information (56 records):**
- willmeng.com (19 records)
- Email lists embedded in contractor field (37 records)
- Phone numbers: 520-249-0734 (main), 864-650-6767 (Avanash contact)
- Action: Extract to separate `contact_info` field

**Job Numbers & Notes (46 records):**
- Job numbers: (Job #22-02-3554), (Job # 24-02-3897), etc.
- COR assignments: (COR to mnasiri@willmeng.com)
- Status: (Need Job #), (Invoice for contract billing)
- Action: Extract to separate `internal_notes` field

### 3. Data Quality Issues

| Issue | Examples | Count |
|-------|----------|-------|
| **Inconsistent capitalization** | WILLMENG vs Willmeng | 95 |
| **Embedded contact info** | willmeng.com; email lists | 50+ |
| **Job numbers in name** | Willmeng (Job # 24-02-3897) | 27 |
| **Phone numbers in name** | Willmeng 520-249-0734 | 6 |
| **Status in name** | WILLMENG Canceled | 2 |
| **PDF names as variants** | Willmeng Construction Inc.pdf | 70+ |

---

## Files Analyzed

### Raw CSV Files (16 total)

1. **excel_location_sheet1.csv** - 52 records
2. **excel_location_completed.csv** - 98 records
3. **excel_location_contract_billing.csv** - 45 records
4. **excel_location_billing_invoices.csv** - 46 records
5. **excel_location_uploads.csv** - 45 records
6. **excel_wt_sw.csv** - 76 records
7. **excel_swppp_confirmed.csv** - 42 records
8. **excel_swppp_bv.csv** - 35 records
9. **excel_swppp_need_schedule.csv** - 21 records
10. **excel_rental_swppp_numbers.csv** - 57 records
11. **excel_rental_items.csv** - 88 records
12. **excel_rental_bv.csv** - 66 records
13. **excel_credit_memos.csv** - 76 records
14. **excel_cp_invoices_2024.csv** - 53 records
15. **excel_cp_invoices_2025.csv** - 57 records
16. **certs_2025_all.csv** - 39 records

---

## Consolidation Strategy

### Direct Merge (695 records)

These records should be directly replaced with canonical forms:

| From | To | Count |
|------|-----|-------|
| Willmeng | Willmeng | 247 |
| Willmeng Construction | Willmeng Construction | 224 |
| WILLMENG | Willmeng | 93 |
| WILLMENG CONSTRUCTION INC | Willmeng Construction | 29 |
| Other pure name variants | Willmeng or Willmeng Construction | 102 |

### Metadata Extraction (102 records)

For records with embedded data:
1. Extract base name to `contractor_name`
2. Extract job numbers to `job_reference`
3. Extract COR info to `point_of_contact`
4. Extract phone to `contact_phone`
5. Extract status to `internal_status`

**Example transformations:**
```
FROM: "Willmeng (Job # 24-02-3897)"
TO:   contractor_name: "Willmeng"
      job_reference: "24-02-3897"

FROM: "Willmeng 520-249-0734"
TO:   contractor_name: "Willmeng"
      contact_phone: "520-249-0734"

FROM: "willmeng.com; jcrichton@willmeng.com"
TO:   contractor_name: "Willmeng"
      contact_website: "willmeng.com"
      contact_email: "jcrichton@willmeng.com"
```

---

## Consolidation Totals

```
Total Records:              797
  ├─ Direct merge:         695 records
  │   ├─ To "Willmeng":           358
  │   └─ To "Willmeng Construction": 337
  └─ Metadata extraction:  102 records
      ├─ Contact info:            56
      └─ Job/status notes:        46
```

---

## Output Files Generated

| File | Purpose | Records |
|------|---------|---------|
| **willmeng_variants.csv** | High-level consolidation summary | 6 variants |
| **willmeng_variants_detailed.csv** | All 141 variants with merge strategy | 141 variants |
| **willmeng_canonical_mapping.csv** | Quick-reference merge mapping | 10 key variants |
| **willmeng_consolidation_summary.txt** | Detailed text report | Full analysis |
| **WILLMENG_CONSOLIDATION_REPORT.md** | This document | Final report |

---

## Implementation Roadmap

### Phase 1: Data Preparation (1-2 hours)
- [ ] Review all 141 variants in detailed CSV
- [ ] Validate consolidation logic
- [ ] Identify any edge cases or exceptions
- [ ] Create backup of raw data

### Phase 2: Script Development (2-3 hours)
- [ ] Create data transformation script
- [ ] Implement variant-to-canonical mapping
- [ ] Add metadata extraction logic
- [ ] Test on sample subset (e.g., one CSV file)

### Phase 3: Batch Processing (1 hour)
- [ ] Apply transformation to all 16 CSV files
- [ ] Generate consolidated data
- [ ] Compare before/after record counts
- [ ] Validate no data loss

### Phase 4: Quality Assurance (1-2 hours)
- [ ] Spot-check consolidated records
- [ ] Verify contact info extraction
- [ ] Test deduplication on merged data
- [ ] Document any discrepancies

### Phase 5: Integration (1 hour)
- [ ] Update canonical accounts database
- [ ] Create unified Willmeng record
- [ ] Link all variants to canonical ID
- [ ] Update downstream systems

**Total Estimated Effort:** 6-9 hours

---

## Canonical Reference

### Correct Forms to Use Going Forward

- **Simple name:** "Willmeng"
- **Full legal name:** "Willmeng Construction"
- **Website:** willmeng.com
- **Main phone:** 520-249-0734
- **Contact person:** Avanash (864-650-6767)

### DO NOT USE

- WILLMENG (use title case)
- Willmeng Inc (omit "Inc")
- Willmeng Construction Inc (use without "Inc")
- Willmeng Construction, Inc. (no punctuation)
- Any embedded metadata in name field

---

## Next Actions

1. **Approve** the consolidation strategy outlined above
2. **Assign** script development to appropriate team member
3. **Schedule** batch processing during low-traffic period
4. **Plan** communication to dependent systems about canonical form changes
5. **Document** any special handling for historical references

---

## Questions & Notes

- What should happen with historical records referencing old variants? (Keep audit trail vs. update all)
- Should contact info be migrated to separate contractor contact table?
- Are there other contractors with similar consolidation needs?
- Should this analysis be repeated for all 340+ records to identify other #2 contractors?

