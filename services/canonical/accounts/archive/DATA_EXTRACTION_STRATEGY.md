# Data Extraction Strategy: Canonical Database Build

## Goal
Build a canonical database of **Accounts** (contractors/GCs) and **Projects** (jobs/sites) by extracting and cross-referencing data from multiple sources.

---

## Data Sources Inventory

### Source 1: Existing Database (`contractors.db`)
| Table | Records | Key Fields |
|-------|---------|------------|
| `contractors` | 372 | name, source, folder, sharepoint_folder_url |
| `monday_contractors` | 1,167 | monday_id, name, domain |
| `quickbooks_companies` | 2,532 | customer_id, company_name, main_email, main_phone |
| `contractor_matches` | varies | sharepoint_id, quickbooks_id, match_score |

### Source 2: Excel Files (4 files, 17 sheets total)

#### Customer Rental Master (9 sheets, ~3,700 total rows)
| Sheet | Rows | Key Data |
|-------|------|----------|
| Rental items | 130 | Customer, Location, What's Rented, Dates |
| Rental B & V | 1,226 | Customer, Location, Billing history |
| SWPPP #s | 2,043 | **SWPPP Number**, Contractor, Job |
| CP Invoices 2024 | 116 | Contract payoffs |
| CP Invoices 2025 | 9 | Contract payoffs |
| Credit Memos | 152 | Credit adjustments |
| Liberty Utilities Info | 13 | Utility contacts |
| Water Meter Pricing | 52 | Pricing reference |

#### SWPPP Master (4 sheets, ~6,500 total rows)
| Sheet | Rows | Key Data |
|-------|------|----------|
| Need to Schedule | 28 | Date, Contractor, Job Name, Address, Contact, Phone, Work Description |
| Confirmed Schedule | 118 | Same structure as above |
| SWPPP B & V | 6,322 | Install Date, Contractor, Job Name, Contact, Phone, Work Description |

#### WT & SW Master (1 sheet, 1,415 rows)
| Sheet | Rows | Key Data |
|-------|------|----------|
| WT & SW 2018 | 1,415 | Active, **Job ID** (e.g., A-25-614), Customer, Location + ~400 date columns with service codes |

#### Rw.Location.Upload Master (6 sheets, ~1,500 total rows)
| Sheet | Rows | Key Data |
|-------|------|----------|
| Uploads | 212 | Inspector, Company, Job, Address, **AZCON #**, Contact, Email, Lat/Long |
| Completed | 1,107 | Same + completion data |
| Need to Start | 24 | Same structure |
| Sheet1 | 66 | Contractor-Job pairs |
| Contract billing | 74 | Billing reference |
| Billing- Invoices | 39 | Invoice reference |

### Source 3: AIA Jobs Folder
- **Location**: `~/Downloads/aia jobs/AIA JOBS/`
- **Structure**: `{Contractor}/{Project}/{Month Year}.xls`
- **Stats**: 174 folders, 680 Excel files
- **Data**: AIA billing forms with contractor, project, billing period, amounts

### Source 4: Insurance Certs Folder
- **Location**: `~/Downloads/insurance certs/Insurance Certs/`
- **Structure**:
  - `CPS - WC CERTS - 2025/WOS/{Letter}/{Contractor} - {Project}.pdf` (Waiver of Subrogation)
  - `CPS - WC CERTS - 2025/NON WOS/{Letter}/{Contractor} - {Project}.pdf`
  - `Expired WC Certs/CPS - WC Certs - {Year}/...`
- **Filename Pattern**: `{Contractor Name} - {Project Name}.pdf`
- **Data**: Certificate holder (contractor), project name, expiration dates (in PDF)

### Source 5: Customer Signs (PDF pattern)
- **Location**: Various (Downloads, SharePoint)
- **Pattern**: `{Contractor Name} - {Project Reference}.pdf`
- **Examples**:
  - `Calcon Constructors - 1-0949 8th & Farmer (2).pdf`
  - `Ganem Construction - 220023 Tyr Tactical.pdf`

### Source 6: Monday.com (via API)
- **Board**: CONTRACTORS (ID: from services/monday)
- **Fields**: name, domain, group_title
- Already partially synced to `monday_contractors` table

---

## Output Tables (Canonical Schema)

Following ServiceTitan/CRO patterns and your sync.md architecture:

### `canonical_account`
```sql
CREATE TABLE canonical_account (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,                    -- Canonical/preferred name
  normalized_name TEXT NOT NULL,         -- Lowercase, no punctuation, for matching

  -- Contact info (best known)
  primary_email TEXT,
  primary_phone TEXT,
  domain TEXT,                           -- Website domain

  -- Classification
  account_type TEXT,                     -- GC, Subcontractor, Owner, etc. (nullable until confirmed)

  -- Audit
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(normalized_name)
);
```

### `canonical_project`
```sql
CREATE TABLE canonical_project (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,                    -- Project name
  normalized_name TEXT NOT NULL,

  -- Location
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  latitude REAL,
  longitude REAL,

  -- References
  account_id INTEGER REFERENCES canonical_account(id),
  job_id TEXT,                           -- e.g., "A-25-614" from WT & SW Master
  azcon_number TEXT,                     -- e.g., "112305" from Rw.Location.Upload
  swppp_number TEXT,                     -- From Customer Rental Master SWPPP #s

  -- Status
  status TEXT,                           -- Active, Completed, etc.

  -- Audit
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### `external_account_link`
```sql
CREATE TABLE external_account_link (
  id INTEGER PRIMARY KEY,
  canonical_id INTEGER REFERENCES canonical_account(id),

  -- Source identification
  source TEXT NOT NULL,                  -- sharepoint, monday, quickbooks, excel_*, aia, certs
  source_id TEXT,                        -- Original ID if available
  source_table TEXT,                     -- e.g., "SWPPP B & V", "Rental items"

  -- Raw data
  raw_name TEXT NOT NULL,                -- Original name as found
  raw_data TEXT,                         -- JSON of other fields from source

  -- Matching
  confidence REAL,                       -- 0.0 to 1.0
  match_status TEXT DEFAULT 'proposed',  -- proposed, confirmed, rejected
  match_evidence TEXT,                   -- Why this match was made

  -- Audit
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### `external_project_link`
```sql
CREATE TABLE external_project_link (
  id INTEGER PRIMARY KEY,
  canonical_id INTEGER REFERENCES canonical_project(id),

  -- Source identification
  source TEXT NOT NULL,
  source_id TEXT,
  source_table TEXT,

  -- Raw data
  raw_name TEXT NOT NULL,
  raw_data TEXT,                         -- JSON

  -- Matching
  confidence REAL,
  match_status TEXT DEFAULT 'proposed',
  match_evidence TEXT,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### `insurance_cert`
```sql
CREATE TABLE insurance_cert (
  id INTEGER PRIMARY KEY,

  -- Parsed from filename
  contractor_name TEXT NOT NULL,
  project_name TEXT,

  -- From PDF content (if extracted)
  certificate_holder TEXT,
  policy_number TEXT,
  effective_date TEXT,
  expiration_date TEXT,
  cert_type TEXT,                        -- WC, GL, Auto
  has_waiver_of_subrogation INTEGER,     -- 0 or 1

  -- File info
  file_path TEXT NOT NULL,
  file_year TEXT,                        -- e.g., "2025"
  file_category TEXT,                    -- "WOS", "NON WOS", "Expired"

  -- Links
  account_link_id INTEGER REFERENCES external_account_link(id),
  project_link_id INTEGER REFERENCES external_project_link(id),

  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### `aia_billing`
```sql
CREATE TABLE aia_billing (
  id INTEGER PRIMARY KEY,

  -- Parsed from folder structure
  contractor_name TEXT NOT NULL,
  project_name TEXT NOT NULL,

  -- From Excel content
  billing_period TEXT,                   -- "March 2021", etc.
  billing_date TEXT,
  amount REAL,

  -- File info
  file_path TEXT NOT NULL,

  -- Links
  account_link_id INTEGER REFERENCES external_account_link(id),
  project_link_id INTEGER REFERENCES external_project_link(id),

  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## Agent Architecture

Based on the auto-permit agentic-finance-review patterns:

```
.claude/
├── commands/
│   ├── extract-data.md              # Orchestrator
│   ├── parse-excel-sheet.md         # Parse single Excel sheet
│   ├── parse-aia-folder.md          # Parse AIA contractor folder
│   ├── parse-cert-folder.md         # Parse insurance cert folder
│   └── normalize-accounts.md        # Cross-reference and dedupe
│
├── agents/
│   ├── excel-parser-agent.md        # Spawns per-sheet
│   ├── aia-parser-agent.md          # Spawns per-contractor folder
│   ├── cert-parser-agent.md         # Spawns per-letter folder
│   └── normalizer-agent.md          # Deduplication specialist
│
└── hooks/
    └── validators/
        ├── csv-output-validator.py  # Validates CSV structure
        └── account-validator.py     # Validates account records
```

### Agent Specifications

#### 1. Excel Parser Agent
**Input**: Single Excel sheet path + sheet name
**Output**: CSV with columns: `source, source_table, contractor_name, project_name, job_id, azcon_number, swppp_number, contact_name, contact_phone, contact_email, address, raw_json`
**Parallel**: Yes - one agent per sheet

#### 2. AIA Parser Agent
**Input**: Contractor folder path (e.g., `/AIA JOBS/Hunter/`)
**Output**: CSV with columns: `source, contractor_name, project_name, billing_period, file_path`
**Parallel**: Yes - one agent per contractor folder (174 total)

#### 3. Cert Parser Agent
**Input**: Letter folder path (e.g., `/CPS - WC CERTS - 2025/NON WOS/A/`)
**Output**: CSV with columns: `source, contractor_name, project_name, cert_type, wos_status, file_path, file_year`
**Parallel**: Yes - one agent per letter folder

#### 4. Normalizer Agent
**Input**: All CSVs from above
**Output**:
- `canonical_accounts.csv` with deduped accounts
- `canonical_projects.csv` with deduped projects
- `account_links.csv` mapping sources → canonical
- `project_links.csv` mapping sources → canonical
**Matching Priority** (per sync.md):
1. Exact IDs (Job ID, AZCON #, SWPPP #)
2. Email domains
3. Phone numbers
4. Addresses (normalized)
5. Name similarity (last resort)

---

## Execution Plan

### Phase 1: Raw Extraction (Parallel)

```
/extract-data --phase=raw
  │
  ├─ Excel Parser Agents (17 parallel)
  │   ├─ Customer Rental Master: 9 sheets
  │   ├─ SWPPP Master: 4 sheets
  │   ├─ WT & SW Master: 1 sheet
  │   └─ Rw.Location.Upload: 6 sheets (skip pricing/reference sheets)
  │
  ├─ AIA Parser Agents (40 parallel batches of ~4 contractors)
  │   └─ 174 contractor folders
  │
  └─ Cert Parser Agents (26 parallel - one per letter)
      └─ A-Z folders in WOS and NON WOS
```

**Output**: Raw CSV files in `data/raw/`
- `excel_customer_rental_*.csv`
- `excel_swppp_*.csv`
- `excel_wt_sw.csv`
- `excel_location_*.csv`
- `aia_{contractor}.csv`
- `certs_{letter}.csv`

### Phase 2: Normalization

```
/extract-data --phase=normalize
  │
  └─ Normalizer Agent
      ├─ Load all raw CSVs
      ├─ Extract unique contractor names → staging
      ├─ Extract unique project names → staging
      ├─ Apply matching algorithm
      └─ Output canonical tables
```

**Output**:
- `data/canonical/accounts.csv`
- `data/canonical/projects.csv`
- `data/links/account_links.csv`
- `data/links/project_links.csv`

### Phase 3: Database Load

```
/extract-data --phase=load
  │
  └─ Load CSVs into SQLite
      ├─ Create tables (if not exist)
      ├─ Insert canonical records
      └─ Insert link records
```

---

## Unique Identifiers by Source

| Source | Unique ID Fields | Example |
|--------|------------------|---------|
| WT & SW Master | Job ID | `A-25-614` |
| Rw.Location.Upload | AZCON # | `112305` |
| Customer Rental SWPPP | SWPPP Number | `SW-2024-001` |
| Monday.com | monday_id | `9470155548` |
| QuickBooks | customer_id | `180 Degrees Design + Build` |
| SharePoint | sharepoint_folder_id | `01J5LMOW2SD...` |
| AIA Jobs | folder path | `/Hunter/West Anthem Water/` |
| Insurance Certs | filename | `Ryan Companies US - AMZ Tucson.pdf` |

---

## Cross-Reference Strategy

### Step 1: Build contractor name variants
From each source, extract all contractor name spellings:
- `3411 BUILDERS` (WT & SW)
- `3411 Builders, Inc` (Certs)
- `3411 Builder` (SWPPP Master)
- `3411` (AIA folder)

### Step 2: Create normalized keys
```python
def normalize(name):
    name = name.lower()
    name = re.sub(r'[^\w\s]', '', name)  # Remove punctuation
    name = re.sub(r'\b(inc|llc|corp|co|company|construction|builders|contracting)\b', '', name)
    name = ' '.join(name.split())  # Normalize whitespace
    return name

# "3411 Builders, Inc" → "3411 builders"
# "3411 BUILDERS" → "3411 builders"
```

### Step 3: Match by priority
1. If same Job ID / AZCON # / SWPPP # → same project
2. If same normalized contractor name → same account
3. If normalized name similar (>85%) → propose match, flag for review

### Step 4: Human review queue
Records with `match_status = 'proposed'` and `confidence < 0.9` go into review queue.

---

## Next Steps

1. Create the agent files in `.claude/agents/`
2. Create the command files in `.claude/commands/`
3. Create validator hooks
4. Run Phase 1 extraction
5. Review raw outputs
6. Run Phase 2 normalization
7. Load into database
