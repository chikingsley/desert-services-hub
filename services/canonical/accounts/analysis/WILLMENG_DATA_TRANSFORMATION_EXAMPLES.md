# Willmeng Data Transformation Examples

## Overview

This document shows concrete before/after examples for each type of consolidation needed for Willmeng records.

---

## Type 1: Simple Capitalization Normalization

### Example 1a: ALL CAPS to Title Case
```
BEFORE: "WILLMENG"
AFTER:  "Willmeng"
CSV:    excel_location_completed.csv
Count:  93 records
```

### Example 1b: Website/Domain Normalization
```
BEFORE: "WILLMENG.COM"
AFTER:  "Willmeng" (move "willmeng.com" to contact_info field)
CSV:    excel_location_completed.csv
Count:  6 records
```

---

## Type 2: Legal Name Standardization

### Example 2a: INC Suffix Removal
```
BEFORE: "WILLMENG CONSTRUCTION INC"
AFTER:  "Willmeng Construction"
CSV:    excel_location_sheet1.csv, excel_location_uploads.csv
Count:  29 records
```

### Example 2b: Mixed Case Standardization
```
BEFORE: "Willmeng Construction Inc"
AFTER:  "Willmeng Construction"
CSV:    certs_2025_all.csv
Count:  4 records
```

### Example 2c: All Caps Full Name
```
BEFORE: "WILLMENG CONSTRUCTION"
AFTER:  "Willmeng Construction"
CSV:    excel_location_completed.csv
Count:  2 records
```

---

## Type 3: Metadata Extraction - Job Numbers

### Example 3a: Simple Job Reference
```
BEFORE:
  Contractor Name: "Willmeng (Job # 24-02-3897)"
  
AFTER:
  Contractor Name: "Willmeng"
  Job Reference:   "24-02-3897"
  
CSV:    excel_wt_sw.csv
Count:  2 records
```

### Example 3b: Job Reference with Padded Spaces
```
BEFORE:
  Contractor: "Willmeng                      (Job # 24-02-3897)"
  
AFTER:
  Contractor Name: "Willmeng"
  Job Reference:   "24-02-3897"
  Internal Notes:  "Original had excessive padding"
  
CSV:    excel_wt_sw.csv
Count:  Multiple variants
```

### Example 3c: Multiple Job References
```
BEFORE:
  Contractor: "Willmeng (Job # 23-03-3747) (Mark said use this #)"
  
AFTER:
  Contractor Name: "Willmeng"
  Job Reference:   "23-03-3747"
  Internal Notes:  "Mark said use this #"
  
CSV:    excel_wt_sw.csv
Count:  2 records
```

---

## Type 4: Metadata Extraction - Contact Info

### Example 4a: Website Only
```
BEFORE:
  Contractor: "willmeng.com"
  
AFTER:
  Contractor Name: "Willmeng"
  Contact Website: "willmeng.com"
  Contact Type:    "website"
  
CSV:    excel_location_completed.csv
Count:  19 records
```

### Example 4b: Single Email
```
BEFORE:
  Contractor: "willmeng.com;jcrichton@willmeng.com"
  
AFTER:
  Contractor Name: "Willmeng"
  Contact Website: "willmeng.com"
  Contact Email:   "jcrichton@willmeng.com"
  Contact Name:    "J. Crichton"
  
CSV:    excel_location_completed.csv
Count:  2 records
```

### Example 4c: Multiple Contacts
```
BEFORE:
  Contractor: "willmeng.com; landerson@willmeng.com; rstuker@willmeng.com"
  
AFTER:
  Contractor Name: "Willmeng"
  Contact Website: "willmeng.com"
  Contact Email 1: "landerson@willmeng.com" (L. Anderson)
  Contact Email 2: "rstuker@willmeng.com"   (R. Stuker)
  
CSV:    excel_location_completed.csv
Count:  2 records
```

### Example 4d: COR (Certificate of Responsibility) Info
```
BEFORE:
  Contractor: "Willmeng (COR to mnasiri@willmeng.com)"
  
AFTER:
  Contractor Name: "Willmeng"
  COR Contact:     "mnasiri@willmeng.com" (M. Nasiri)
  Contact Type:    "Certificate of Responsibility"
  
CSV:    excel_wt_sw.csv
Count:  2 records
```

---

## Type 5: Metadata Extraction - Phone Numbers

### Example 5a: Simple Phone Reference
```
BEFORE:
  Contractor: "Willmeng 520-249-0734"
  
AFTER:
  Contractor Name: "Willmeng"
  Contact Phone:   "520-249-0734"
  Contact Type:    "main_office"
  
CSV:    excel_swppp_bv.csv
Count:  4 records
```

### Example 5b: Multiple Contact Points
```
BEFORE:
  Contractor: "Willmeng 520-249-0734 or Avanash 864-650-6767"
  
AFTER:
  Contractor Name:   "Willmeng"
  Contact Phone 1:   "520-249-0734"
  Contact Type 1:    "main_office"
  Contact Phone 2:   "864-650-6767"
  Contact Person 2:  "Avanash"
  Contact Type 2:    "alternate_contact"
  
CSV:    excel_swppp_bv.csv
Count:  2 records
```

---

## Type 6: Status/Status Extraction

### Example 6a: Canceled Status
```
BEFORE:
  Contractor: "WILLMENG Canceled"
  
AFTER:
  Contractor Name: "Willmeng"
  Contractor Status: "Canceled"
  
CSV:    excel_location_completed.csv
Count:  2 records
```

### Example 6b: Work Description Status
```
BEFORE:
  Contractor: "WILLMENG Doing own inspections"
  
AFTER:
  Contractor Name: "Willmeng"
  Internal Notes: "Doing own inspections"
  
CSV:    excel_location_completed.csv
Count:  2 records
```

### Example 6c: Invoice Status
```
BEFORE:
  Contractor: "Willmeng (Invoice for contract billing)"
  
AFTER:
  Contractor Name: "Willmeng"
  Invoice Type: "contract_billing"
  
CSV:    excel_wt_sw.csv
Count:  2 records
```

---

## Type 7: PDF Document Name Handling

### Example 7a: Simple PDF Reference
```
BEFORE:
  Contractor: "Willmeng Construction Inc.pdf"
  
AFTER:
  Contractor Name: "Willmeng Construction"
  Document Type: "certificate" or "insurance"
  Document Name: "Willmeng Construction Inc.pdf"
  
CSV:    certs_2025_all.csv
Count:  1 record
```

### Example 7b: Project-Specific PDF
```
BEFORE:
  Contractor: "Willmeng Construction - Kentwood 10.pdf"
  
AFTER:
  Contractor Name: "Willmeng Construction"
  Project: "Kentwood 10"
  Document Type: "certificate"
  
CSV:    certs_2025_all.csv
Count:  1 record
```

### Example 7c: Multi-Document Reference
```
BEFORE:
  Contractor: "Willmeng Construction - ASU Tempe District Utility Plant.pdf"
  
AFTER:
  Contractor Name: "Willmeng Construction"
  Project: "ASU Tempe District Utility Plant"
  Document Type: "certificate"
  
CSV:    certs_2025_all.csv
Count:  1 record
```

---

## Transformation Summary Table

| Type | Count | Action | Result |
|------|-------|--------|--------|
| Capitalization | 99 | Normalize case | → "Willmeng" or "Willmeng Construction" |
| INC/Inc suffix | 35 | Remove suffix | → "Willmeng Construction" |
| Job numbers | 27 | Extract to job_reference | → Separate field |
| Contact emails | 68 | Extract to contact_email | → Separate field |
| Phone numbers | 6 | Extract to contact_phone | → Separate field |
| Status | 2 | Extract to internal_status | → Separate field |
| PDF names | 70+ | Extract project | → Separate fields |
| Already correct | 471 | No change needed | → Already canonical |
| **TOTAL** | **797** | | |

---

## Implementation Notes

1. **Case Sensitivity:** Use case-insensitive matching for raw data
2. **Whitespace:** Strip leading/trailing spaces and normalize internal padding
3. **Special Chars:** Remove trailing quotes/semicolons from raw data
4. **Email Parsing:** Extract individual emails from semicolon-separated lists
5. **Job Numbers:** Use regex pattern like `(Job\s*#?\s*([\d-]+))`
6. **Phone Numbers:** Use regex pattern like `(\d{3}-\d{3}-\d{4})`
7. **PDF Names:** Extract project from pattern like `Willmeng Construction - (.*).pdf`

---

## Validation Checklist

After transformation, verify:
- [ ] All records have a contractor name (Willmeng or Willmeng Construction)
- [ ] No capitalization inconsistencies in canonical forms
- [ ] All extracted metadata in appropriate new fields
- [ ] No data loss from extraction (original values preserved)
- [ ] Record count unchanged before/after transformation
- [ ] Source file field properly documented
- [ ] Audit trail for transformations created

---

## Rollback Instructions

If issues discovered after transformation:
1. Restore from raw data backup
2. Review transformation script for errors
3. Fix logic and re-test on sample
4. Re-run batch process
5. Verify results before final commit

