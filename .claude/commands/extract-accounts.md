---
model: sonnet
description: "Orchestrates data extraction from all sources to build canonical accounts database"
allowed-tools: Bash, Glob, Read, Write, Task
---

# Extract Accounts Orchestrator

Extracts contractor and project data from multiple sources into a canonical database.

## Variables (from CLAUDE.md)

- ROOT_DATA_DIR: `/Users/chiejimofor/Documents/Github/desert-services-hub/projects/accounts/data`
- DOWNLOADS: `~/Downloads`

## Arguments

- `$1`: Phase to run (raw, certs, aia, excel, normalize, load, all)
- `$2`: Optional - specific source or batch number

## Phases

### Phase: certs

Extract from insurance certificates folder.

1. Find all letter folders in `$DOWNLOADS/insurance certs/Insurance Certs/CPS - WC CERTS - 2025/`
2. For each letter (A-Z), spawn a cert-parser-agent
3. Output to `$ROOT_DATA_DIR/raw/certs_{letter}.csv`

### Phase: aia

Extract from AIA jobs folder.

1. Find all contractor folders in `$DOWNLOADS/aia jobs/AIA JOBS/`
2. For each contractor, spawn an aia-parser-agent
3. Output to `$ROOT_DATA_DIR/raw/aia_{contractor_slug}.csv`

### Phase: excel

Extract from Excel files.

1. Parse sheets from:
   - Customer Rental Master: Rental items, Rental B & V, SWPPP #s
   - SWPPP Master: Need to Schedule, Confirmed Schedule, SWPPP B & V
   - WT & SW Master: WT & SW 2018
   - Rw.Location.Upload: Uploads, Completed, Need to Start
2. For each sheet, spawn an excel-parser-agent
3. Output to `$ROOT_DATA_DIR/raw/excel_{file}_{sheet}.csv`

### Phase: normalize

Combine all raw CSVs and deduplicate.

1. Load all CSVs from `$ROOT_DATA_DIR/raw/`
2. Extract unique contractor names
3. Apply normalization and matching
4. Output:
   - `$ROOT_DATA_DIR/canonical/accounts.csv`
   - `$ROOT_DATA_DIR/canonical/projects.csv`
   - `$ROOT_DATA_DIR/links/account_links.csv`
   - `$ROOT_DATA_DIR/links/project_links.csv`

### Phase: load

Load canonical CSVs into SQLite database.

### Phase: all

Run all phases in order: certs → aia → excel → normalize → load

## Execution Pattern

For parallel agent spawning:

```
Use Task tool with subagent_type matching agent name
Run multiple agents in parallel where possible
Wait for all agents to complete before proceeding
Report progress after each batch
```

## Progress Reporting

After each phase/batch, report:

- Files processed
- Records extracted
- Errors encountered

## Output Structure

```
projects/accounts/data/
├── raw/
│   ├── certs_A.csv
│   ├── certs_B.csv
│   ├── ...
│   ├── aia_hunter.csv
│   ├── aia_arco.csv
│   ├── ...
│   ├── excel_rental_items.csv
│   └── ...
├── canonical/
│   ├── accounts.csv
│   └── projects.csv
└── links/
    ├── account_links.csv
    └── project_links.csv
```
