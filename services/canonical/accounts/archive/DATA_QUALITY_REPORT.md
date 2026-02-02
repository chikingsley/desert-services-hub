# Data Quality Report - CSV Analysis
**Generated:** 2026-01-20 01:15:28
**Total CSV Files Analyzed:** 21

## Executive Summary
- **Total Unique Contractors Across All Sources:** 2817
- **Contractors Appearing in Multiple Sources:** 705
- **Potential Misspellings Found:** 437

## File-by-File Analysis

### excel_swppp_bv.csv
- **Total Records:** 2626
- **Column Count:** 15
- **Columns:** source, source_table, contractor_name, project_name, job_id...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 312
- **Contractor Name Patterns:**
  - has_special_chars: 0.5%
  - has_job_number: 1.0%
- **Data Completeness:**
  - address: 99.7%

### certs_2025_all.csv
- **Total Records:** 2493
- **Column Count:** 7
- **Columns:** source, folder_type, contractor_name, project_name, has_wos...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 671
- **Contractor Name Patterns:**
  - has_job_number: 0.7%
  - has_zip: 0.0%
  - has_special_chars: 0.2%
- **Data Completeness:**
  - source: 100.0%
  - folder_type: 100.0%
  - contractor_name: 100.0%
  - project_name: 85.0%
  - has_wos: 100.0%

### excel_rental_swppp_numbers.csv
- **Total Records:** 2016
- **Column Count:** 15
- **Columns:** source, source_table, contractor_name, project_name, job_id...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 648
- **Contractor Name Patterns:**
  - has_special_chars: 0.6%
  - has_job_number: 0.6%
- **Data Completeness:**
  - address: 0.0%

### excel_wt_sw.csv
- **Total Records:** 1390
- **Column Count:** 15
- **Columns:** source, source_table, contractor_name, project_name, job_id...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 700
- **Contractor Name Patterns:**
  - has_job_number: 21.3%
  - has_special_chars: 29.9%
  - has_email: 3.0%
  - has_phone: 5.0%
  - has_zip: 5.5%
- **Data Completeness:**
  - address: 0.0%

### excel_rental_bv.csv
- **Total Records:** 1224
- **Column Count:** 15
- **Columns:** source, source_table, contractor_name, project_name, job_id...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 511
- **Contractor Name Patterns:**
  - has_job_number: 0.7%
  - has_special_chars: 0.2%
- **Data Completeness:**
  - address: 0.0%

### excel_location_completed.csv
- **Total Records:** 1107
- **Column Count:** 16
- **Columns:** source, source_table, contractor_name, project_name, job_id...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 396
- **Contractor Name Patterns:**
  - has_job_number: 0.6%
  - has_special_chars: 0.3%
- **Data Completeness:**
  - address: 100.0%

### aia_all.csv
- **Total Records:** 901
- **Column Count:** 7
- **Columns:** source, contractor_name, project_name, billing_period, is_completed...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 40
- **Contractor Name Patterns:**
  - has_job_number: 0.4%
- **Data Completeness:**
  - source: 100.0%
  - contractor_name: 100.0%
  - project_name: 86.7%
  - billing_period: 64.4%
  - is_completed: 100.0%

### excel_location_uploads.csv
- **Total Records:** 210
- **Column Count:** 15
- **Columns:** source, source_table, contractor_name, project_name, job_id...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 125
- **Contractor Name Patterns:**
  - has_job_number: 1.4%
- **Data Completeness:**
  - address: 99.0%

### certs_A.csv
- **Total Records:** 155
- **Column Count:** 7
- **Columns:** source, folder_type, contractor_name, project_name, has_wos...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 40
- **Data Completeness:**
  - source: 100.0%
  - folder_type: 100.0%
  - contractor_name: 100.0%
  - project_name: 85.8%
  - has_wos: 100.0%

### excel_credit_memos.csv
- **Total Records:** 133
- **Column Count:** 6
- **Columns:** source, source_table, contractor_name, credit_memo_number, amount...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 100
- **Contractor Name Patterns:**
  - has_special_chars: 12.0%
  - has_address: 0.8%
  - has_job_number: 3.0%
  - has_zip: 0.8%
- **Data Completeness:**
  - source: 100.0%
  - source_table: 100.0%
  - contractor_name: 100.0%
  - credit_memo_number: 100.0%
  - amount: 100.0%

### excel_location_contract_billing.csv
- **Total Records:** 131
- **Column Count:** 4
- **Columns:** source, source_table, contractor_name, project_name
- **Contractor Column:** contractor_name
- **Unique Contractors:** 72
- **Contractor Name Patterns:**
  - has_job_number: 3.1%
- **Data Completeness:**
  - source: 100.0%
  - source_table: 100.0%
  - contractor_name: 100.0%
  - project_name: 100.0%

### excel_location_sheet1.csv
- **Total Records:** 131
- **Column Count:** 4
- **Columns:** source, source_table, contractor_name, project_name
- **Contractor Column:** contractor_name
- **Unique Contractors:** 72
- **Contractor Name Patterns:**
  - has_job_number: 2.3%
- **Data Completeness:**
  - source: 100.0%
  - source_table: 100.0%
  - contractor_name: 100.0%
  - project_name: 100.0%

### excel_rental_items.csv
- **Total Records:** 129
- **Column Count:** 15
- **Columns:** source, source_table, contractor_name, project_name, job_id...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 98
- **Contractor Name Patterns:**
  - has_job_number: 3.9%
- **Data Completeness:**
  - address: 0.0%

### excel_swppp_confirmed.csv
- **Total Records:** 117
- **Column Count:** 15
- **Columns:** source, source_table, contractor_name, project_name, job_id...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 68
- **Contractor Name Patterns:**
  - has_special_chars: 1.7%
- **Data Completeness:**
  - address: 99.1%

### excel_cp_invoices_2024.csv
- **Total Records:** 109
- **Column Count:** 9
- **Columns:** source, source_table, contractor_name, invoice_number, amount...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 84
- **Contractor Name Patterns:**
  - has_special_chars: 46.8%
  - has_job_number: 7.3%
  - has_zip: 1.8%
- **Data Completeness:**
  - source: 100.0%
  - source_table: 100.0%
  - contractor_name: 100.0%
  - invoice_number: 100.0%
  - amount: 100.0%

### excel_location_billing_invoices.csv
- **Total Records:** 78
- **Column Count:** 4
- **Columns:** source, source_table, contractor_name, project_name
- **Contractor Column:** contractor_name
- **Unique Contractors:** 64
- **Data Completeness:**
  - source: 100.0%
  - source_table: 100.0%
  - contractor_name: 100.0%
  - project_name: 100.0%

### excel_swppp_need_schedule.csv
- **Total Records:** 27
- **Column Count:** 15
- **Columns:** source, source_table, contractor_name, project_name, job_id...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 23
- **Data Completeness:**
  - address: 100.0%

### excel_location_need_start.csv
- **Total Records:** 23
- **Column Count:** 15
- **Columns:** source, source_table, contractor_name, project_name, job_id...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 22
- **Data Completeness:**
  - address: 100.0%

### aia_hunter.csv
- **Total Records:** 15
- **Column Count:** 7
- **Columns:** source, contractor_name, project_name, billing_period, is_completed...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 1
- **Data Completeness:**
  - source: 100.0%
  - contractor_name: 100.0%
  - project_name: 86.7%
  - billing_period: 66.7%
  - is_completed: 100.0%

### excel_cp_invoices_2025.csv
- **Total Records:** 7
- **Column Count:** 9
- **Columns:** source, source_table, contractor_name, invoice_number, amount...
- **Contractor Column:** contractor_name
- **Unique Contractors:** 7
- **Contractor Name Patterns:**
  - has_special_chars: 100.0%
  - has_job_number: 14.3%
- **Data Completeness:**
  - source: 100.0%
  - source_table: 100.0%
  - contractor_name: 100.0%
  - invoice_number: 100.0%
  - amount: 100.0%

### signs.csv
- **Total Records:** 2
- **Column Count:** 5
- **Columns:** source, contractor_name, project_reference, file_name, file_path
- **Contractor Column:** contractor_name
- **Unique Contractors:** 2
- **Data Completeness:**
  - source: 100.0%
  - contractor_name: 100.0%
  - project_reference: 100.0%
  - file_name: 100.0%
  - file_path: 100.0%

## Data Quality Rankings

### Cleanest Sources (Most Data Complete)
1. **excel_cp_invoices_2025.csv** - 100.0% avg completeness (7 records)
2. **excel_credit_memos.csv** - 100.0% avg completeness (133 records)
3. **excel_location_billing_invoices.csv** - 100.0% avg completeness (78 records)
4. **excel_location_contract_billing.csv** - 100.0% avg completeness (131 records)
5. **excel_location_sheet1.csv** - 100.0% avg completeness (131 records)

### Messiest Sources (Most Incomplete Data)
1. **excel_swppp_confirmed.csv** - 52.8% avg completeness (117 records)
2. **excel_wt_sw.csv** - 40.0% avg completeness (1390 records)
3. **excel_rental_swppp_numbers.csv** - 40.0% avg completeness (2016 records)
4. **excel_rental_bv.csv** - 33.4% avg completeness (1224 records)
5. **excel_rental_items.csv** - 33.3% avg completeness (129 records)

## Contractors Appearing in Multiple Sources

- **Clayco** (8 sources):
  - excel_cp_invoices_2024.csv
  - excel_credit_memos.csv
  - excel_rental_bv.csv
  - excel_rental_items.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
  - excel_swppp_need_schedule.csv
  - excel_wt_sw.csv
- **Bleuwave** (7 sources):
  - aia_all.csv
  - excel_rental_bv.csv
  - excel_rental_items.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
  - excel_swppp_confirmed.csv
  - excel_wt_sw.csv
- **MT Builders** (7 sources):
  - certs_2025_all.csv
  - excel_credit_memos.csv
  - excel_rental_bv.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
  - excel_swppp_need_schedule.csv
  - excel_wt_sw.csv
- **Nitti Builders** (7 sources):
  - certs_2025_all.csv
  - excel_cp_invoices_2024.csv
  - excel_credit_memos.csv
  - excel_rental_bv.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
  - excel_wt_sw.csv
- **41 North Contractors** (6 sources):
  - aia_all.csv
  - certs_2025_all.csv
  - excel_rental_bv.csv
  - excel_swppp_bv.csv
  - excel_swppp_confirmed.csv
  - excel_wt_sw.csv
- **Renaissance Companies** (6 sources):
  - certs_2025_all.csv
  - excel_cp_invoices_2024.csv
  - excel_rental_bv.csv
  - excel_swppp_bv.csv
  - excel_swppp_confirmed.csv
  - excel_wt_sw.csv
- **AR Mays Construction** (6 sources):
  - certs_2025_all.csv
  - certs_A.csv
  - excel_rental_bv.csv
  - excel_swppp_bv.csv
  - excel_swppp_confirmed.csv
  - excel_swppp_need_schedule.csv
- **Layton Construction Company** (6 sources):
  - certs_2025_all.csv
  - excel_cp_invoices_2024.csv
  - excel_credit_memos.csv
  - excel_swppp_bv.csv
  - excel_swppp_confirmed.csv
  - excel_swppp_need_schedule.csv
- **LGE Design Build** (6 sources):
  - certs_2025_all.csv
  - excel_cp_invoices_2024.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
  - excel_swppp_confirmed.csv
  - excel_wt_sw.csv
- **GCON** (6 sources):
  - certs_2025_all.csv
  - excel_location_completed.csv
  - excel_rental_bv.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
  - excel_swppp_confirmed.csv
- **Sunland Asphalt** (6 sources):
  - certs_2025_all.csv
  - excel_cp_invoices_2024.csv
  - excel_credit_memos.csv
  - excel_rental_bv.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
- **Agate Construction** (6 sources):
  - certs_2025_all.csv
  - certs_A.csv
  - excel_rental_bv.csv
  - excel_rental_items.csv
  - excel_rental_swppp_numbers.csv
  - excel_wt_sw.csv
- **Catamount Constructors** (6 sources):
  - certs_2025_all.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
  - excel_swppp_confirmed.csv
  - excel_swppp_need_schedule.csv
  - excel_wt_sw.csv
- **Keystone Homes** (6 sources):
  - certs_2025_all.csv
  - excel_rental_bv.csv
  - excel_rental_items.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
  - excel_wt_sw.csv
- **Wood Partners** (6 sources):
  - certs_2025_all.csv
  - excel_rental_bv.csv
  - excel_rental_items.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
  - excel_swppp_confirmed.csv
- **Willmeng** (6 sources):
  - excel_credit_memos.csv
  - excel_rental_bv.csv
  - excel_rental_items.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
  - excel_wt_sw.csv
- **LAYTON CONSTRUCTION COMPANY** (6 sources):
  - excel_location_billing_invoices.csv
  - excel_location_completed.csv
  - excel_location_contract_billing.csv
  - excel_location_need_start.csv
  - excel_location_sheet1.csv
  - excel_location_uploads.csv
- **CORE CONSTRUCTION** (6 sources):
  - excel_location_billing_invoices.csv
  - excel_location_completed.csv
  - excel_location_contract_billing.csv
  - excel_location_need_start.csv
  - excel_location_sheet1.csv
  - excel_location_uploads.csv
- **HOLDER CONSTRUCTION** (6 sources):
  - excel_location_billing_invoices.csv
  - excel_location_completed.csv
  - excel_location_contract_billing.csv
  - excel_location_need_start.csv
  - excel_location_sheet1.csv
  - excel_location_uploads.csv
- **FCL Builders** (6 sources):
  - excel_rental_bv.csv
  - excel_rental_items.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
  - excel_swppp_confirmed.csv
  - excel_wt_sw.csv
- **Path Construction** (6 sources):
  - excel_rental_bv.csv
  - excel_rental_items.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
  - excel_swppp_confirmed.csv
  - excel_swppp_need_schedule.csv
- **Haskell** (5 sources):
  - aia_all.csv
  - certs_2025_all.csv
  - excel_rental_bv.csv
  - excel_rental_swppp_numbers.csv
  - excel_wt_sw.csv
- **AR Mays** (5 sources):
  - aia_all.csv
  - excel_rental_bv.csv
  - excel_rental_items.csv
  - excel_rental_swppp_numbers.csv
  - excel_wt_sw.csv
- **American Retail Contractors** (5 sources):
  - aia_all.csv
  - certs_2025_all.csv
  - certs_A.csv
  - excel_credit_memos.csv
  - excel_rental_swppp_numbers.csv
- **Boldt** (5 sources):
  - aia_all.csv
  - certs_2025_all.csv
  - excel_rental_bv.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
- **AP Global** (5 sources):
  - aia_all.csv
  - certs_2025_all.csv
  - excel_rental_bv.csv
  - excel_rental_swppp_numbers.csv
  - excel_wt_sw.csv
- **BPR** (5 sources):
  - aia_all.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
  - excel_swppp_need_schedule.csv
  - excel_wt_sw.csv
- **Greystar** (5 sources):
  - certs_2025_all.csv
  - excel_rental_bv.csv
  - excel_rental_items.csv
  - excel_rental_swppp_numbers.csv
  - excel_wt_sw.csv
- **TLW Construction** (5 sources):
  - certs_2025_all.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
  - excel_swppp_confirmed.csv
  - excel_wt_sw.csv
- **Haydon Building Corp** (5 sources):
  - certs_2025_all.csv
  - excel_rental_bv.csv
  - excel_rental_swppp_numbers.csv
  - excel_swppp_bv.csv
  - excel_wt_sw.csv

## Potential Misspellings/Variations

These contractor names are very similar and might be the same entity with different spellings:

- **Abernathey Development** vs **ABERNATHEY DEVELOPMENT**
  - Abernathey Development: aia_all.csv, excel_swppp_bv.csv, excel_wt_sw.csv
  - ABERNATHEY DEVELOPMENT: excel_location_completed.csv
- **Bleuwave** vs **BLEUWAVE**
  - Bleuwave: aia_all.csv, excel_rental_bv.csv, excel_rental_items.csv, excel_rental_swppp_numbers.csv, excel_swppp_bv.csv, excel_swppp_confirmed.csv, excel_wt_sw.csv
  - BLEUWAVE: excel_location_completed.csv, excel_location_contract_billing.csv, excel_location_sheet1.csv, excel_location_uploads.csv
- **ARCO Murray** vs **Arco Murray**
  - ARCO Murray: aia_all.csv
  - Arco Murray: excel_rental_bv.csv, excel_rental_items.csv, excel_rental_swppp_numbers.csv, excel_swppp_bv.csv
- **GYS General Contracting** vs **GYS GENERAL CONTRACTING**
  - GYS General Contracting: aia_all.csv, excel_rental_swppp_numbers.csv
  - GYS GENERAL CONTRACTING: excel_location_billing_invoices.csv, excel_location_uploads.csv
- **AR Mays** vs **AR MAYS**
  - AR Mays: aia_all.csv, excel_rental_bv.csv, excel_rental_items.csv, excel_rental_swppp_numbers.csv, excel_wt_sw.csv
  - AR MAYS: excel_location_completed.csv
- **AR Mays** vs **AR MAys**
  - AR Mays: aia_all.csv, excel_rental_bv.csv, excel_rental_items.csv, excel_rental_swppp_numbers.csv, excel_wt_sw.csv
  - AR MAys: excel_rental_swppp_numbers.csv
- **Hawk Builders** vs **HAWK BUILDERS**
  - Hawk Builders: aia_all.csv, certs_2025_all.csv, excel_rental_swppp_numbers.csv
  - HAWK BUILDERS: excel_location_contract_billing.csv, excel_location_sheet1.csv, excel_location_uploads.csv
- **ARCO** vs **Arco**
  - ARCO: aia_all.csv
  - Arco: excel_rental_bv.csv, excel_rental_swppp_numbers.csv
- **HILBERS** vs **Hilbers**
  - HILBERS: aia_all.csv
  - Hilbers: excel_rental_swppp_numbers.csv
- **Achen Gardner** vs **ACHEN GARDNER**
  - Achen Gardner: aia_all.csv, excel_rental_swppp_numbers.csv
  - ACHEN GARDNER: excel_location_completed.csv
- **Haydon** vs **HAYDON**
  - Haydon: aia_all.csv, excel_rental_bv.csv, excel_rental_items.csv, excel_rental_swppp_numbers.csv
  - HAYDON: excel_location_completed.csv
- **41 North Contractors** vs **41 NORTH CONTRACTORS**
  - 41 North Contractors: aia_all.csv, certs_2025_all.csv, excel_rental_bv.csv, excel_swppp_bv.csv, excel_swppp_confirmed.csv, excel_wt_sw.csv
  - 41 NORTH CONTRACTORS: excel_location_billing_invoices.csv, excel_location_completed.csv, excel_location_uploads.csv
- **AP Global** vs **AP GLOBAL**
  - AP Global: aia_all.csv, certs_2025_all.csv, excel_rental_bv.csv, excel_rental_swppp_numbers.csv, excel_wt_sw.csv
  - AP GLOBAL: excel_location_billing_invoices.csv, excel_location_uploads.csv
- **Brycon** vs **BRYCON**
  - Brycon: aia_all.csv, excel_rental_bv.csv, excel_rental_swppp_numbers.csv, excel_swppp_bv.csv
  - BRYCON: excel_location_completed.csv
- **Reliance Commercial Construction** vs **RELIANCE COMMERCIAL CONSTRUCTION**
  - Reliance Commercial Construction: certs_2025_all.csv, excel_rental_bv.csv, excel_rental_swppp_numbers.csv
  - RELIANCE COMMERCIAL CONSTRUCTION: excel_location_completed.csv, excel_location_contract_billing.csv, excel_location_sheet1.csv, excel_location_uploads.csv
- **Ryan Companies US** vs **RYAN COMPANIES**
  - Ryan Companies US: certs_2025_all.csv
  - RYAN COMPANIES: excel_location_completed.csv, excel_location_contract_billing.csv, excel_location_need_start.csv, excel_location_sheet1.csv, excel_location_uploads.csv
- **Ryan Companies US** vs **Ryan Companies**
  - Ryan Companies US: certs_2025_all.csv
  - Ryan Companies: excel_rental_bv.csv, excel_rental_swppp_numbers.csv, excel_swppp_bv.csv, excel_swppp_confirmed.csv, excel_wt_sw.csv
- **Renaissance Companies** vs **RENAISSANCE COMPANIES**
  - Renaissance Companies: certs_2025_all.csv, excel_cp_invoices_2024.csv, excel_rental_bv.csv, excel_swppp_bv.csv, excel_swppp_confirmed.csv, excel_wt_sw.csv
  - RENAISSANCE COMPANIES: excel_location_completed.csv, excel_location_contract_billing.csv, excel_location_sheet1.csv, excel_location_uploads.csv
- **Richard & Richard Construction** vs **RICHARD & RICHARD CONSTRUCTION**
  - Richard & Richard Construction: certs_2025_all.csv
  - RICHARD & RICHARD CONSTRUCTION: excel_location_contract_billing.csv, excel_location_sheet1.csv, excel_location_uploads.csv
- **Robert E Porter Construction Co** vs **ROBERT E PORTER CONSTRUCTION**
  - Robert E Porter Construction Co: certs_2025_all.csv
  - ROBERT E PORTER CONSTRUCTION: excel_location_contract_billing.csv, excel_location_sheet1.csv, excel_location_uploads.csv

## Data Pattern Analysis

### Contractor Name Format Patterns
- has_special_chars: 529 occurrences
- has_job_number: 397 occurrences
- has_zip: 81 occurrences
- has_phone: 69 occurrences
- has_email: 42 occurrences
- has_address: 1 occurrences

## Recommendations

1. **Data Standardization:** Standardize contractor names to reduce duplicates
2. **Validation Rules:** Implement contractor name validation with fuzzy matching
3. **Priority Sources:** Focus on the cleanest sources first for data trust
4. **De-duplication:** Use the contractors appearing in multiple sources to validate data consistency
5. **Format Enforcement:** Establish consistent formatting rules for phone numbers, addresses, and project identifiers
