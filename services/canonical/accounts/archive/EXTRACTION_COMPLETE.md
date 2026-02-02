# Data Extraction Complete

**Date**: 2026-01-20
**Total Records**: ~13,000 across 21 CSV files

---

## Summary by Source

### Excel Files - Customer Rental Master (6 sheets)
| File | Records | Description |
|------|---------|-------------|
| `excel_rental_items.csv` | 129 | Active rental items (temp fence, water donkeys, etc.) |
| `excel_rental_bv.csv` | 1,224 | Rental billing & verification history |
| `excel_rental_swppp_numbers.csv` | 2,016 | SWPPP numbers with contractor/job mapping |
| `excel_cp_invoices_2024.csv` | 109 | Contract payoff invoices 2024 |
| `excel_cp_invoices_2025.csv` | 7 | Contract payoff invoices 2025 |
| `excel_credit_memos.csv` | 133 | Credit memo records |

### Excel Files - SWPPP Master (3 sheets)
| File | Records | Description |
|------|---------|-------------|
| `excel_swppp_need_schedule.csv` | 27 | Jobs needing scheduling |
| `excel_swppp_confirmed.csv` | 117 | Confirmed scheduled jobs |
| `excel_swppp_bv.csv` | 2,629 | SWPPP billing & verification (largest dataset) |

### Excel Files - WT & SW Master (1 sheet)
| File | Records | Description |
|------|---------|-------------|
| `excel_wt_sw.csv` | 1,390 | Water truck & sweeper service tracking with Job IDs (A-XX-XXX) |

### Excel Files - Rw.Location.Upload Master (6 sheets)
| File | Records | Description |
|------|---------|-------------|
| `excel_location_uploads.csv` | 210 | Active inspection sites with AZCON #s |
| `excel_location_completed.csv` | 1,107 | Completed inspection sites |
| `excel_location_need_start.csv` | 23 | Sites needing to start |
| `excel_location_sheet1.csv` | 131 | Contractor/project pairs |
| `excel_location_contract_billing.csv` | 131 | Contract billing pairs |
| `excel_location_billing_invoices.csv` | 78 | Billing invoice pairs |

### AIA Jobs Folder
| File | Records | Description |
|------|---------|-------------|
| `aia_all.csv` | 901 | Billing records from 40 contractors (680 Excel files parsed) |

### Insurance Certificates
| File | Records | Description |
|------|---------|-------------|
| `certs_2025_all.csv` | 2,499 | All 2025 WC certs (WOS + NON WOS) |

### Customer Signs
| File | Records | Description |
|------|---------|-------------|
| `signs.csv` | 2 | PDFs in Downloads (pattern: Contractor - Project.pdf) |

---

## Key Identifiers Found

| ID Type | Source | Example | Count |
|---------|--------|---------|-------|
| **Job ID** | WT & SW Master | `A-25-614` | ~1,390 unique |
| **AZCON #** | Location Upload | `112305` | ~1,300 unique |
| **SWPPP Number** | Rental Master | Various | ~2,000 unique |

---

## Unique Fields by Source

### Customer Rental Master
- Job ID, Name (contractor), Location (project), What's Rented, Start/Pickup/Billing Dates
- SWPPP Number, Contractor, Job

### SWPPP Master
- Date, Owner/Contractor, Job Name, Address, Contact, Phone, Work Description

### WT & SW Master
- Active status, Job ID, Customer, Location, Daily service codes (wt/sw)

### Rw.Location.Upload
- Inspector, Company Name, Job Name, Address, AZCON #, Contact, Phone, Email, Lat/Long

### AIA Jobs
- Contractor Name (folder), Project Name (subfolder), Billing Period, Is Completed

### Insurance Certs
- Contractor Name, Project Name (parsed from filename), WOS status, Year

---

## Scripts Created

| Script | Purpose |
|--------|---------|
| `parse-excel.ts` | Parse Excel sheets with headers |
| `parse-excel-noheader.ts` | Parse Excel sheets without headers |
| `parse-cp-invoices.ts` | Parse CP Invoice sheets (header row 3) |
| `parse-credit-memos.ts` | Parse Credit Memos sheet |
| `parse-contractor-pairs.ts` | Parse contractor/project pair columns |
| `parse-certs.ts` | Parse cert PDF filenames |
| `parse-aia.ts` | Parse single AIA contractor folder |
| `parse-all-aia.ts` | Parse all AIA contractor folders |
| `parse-signs.ts` | Parse customer sign PDFs |

---

## Next Steps

1. **Normalize contractor names** - Dedupe across all sources
2. **Build canonical_account table** - Unique contractors with all name variants
3. **Build canonical_project table** - Unique projects with all references
4. **Cross-reference with existing DB** - Match to SharePoint (372), Monday (1,167), QuickBooks (2,532)
5. **Create link tables** - Map each source record to canonical records
6. **Review queue** - Flag low-confidence matches for human review

---

## File Locations

```
projects/accounts/
├── data/
│   ├── raw/                    ← 21 CSV files (this extraction)
│   ├── canonical/              ← (next: deduped accounts/projects)
│   └── links/                  ← (next: source → canonical mappings)
├── scripts/                    ← 9 parser scripts
├── contractors.db              ← Existing SQLite (SharePoint/Monday/QB)
├── DATA_EXTRACTION_STRATEGY.md ← Full strategy document
└── AGENTS.md                   ← Agent definitions
```
