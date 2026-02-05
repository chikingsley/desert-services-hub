# Procurement Workspace Archive

One-time extraction of the old Procurement workspace from Monday.com. This workspace is no longer actively used - data is preserved here for reference and enrichment.

## Workspace Info

There are **two workspaces both named "Desert Services"** in Monday.com:

| Workspace ID | Purpose | Status |
|--------------|---------|--------|
| **8970676** | Main CRM | Active - synced to hub.db |
| **8240372** | Procurement | **Archived** - extracted here |

This database contains data from workspace **8240372** (Procurement/archived).

## Database

**Location:** `scripts/procurement.db` (12MB)

**Extracted:** February 4, 2026

## Tables

| Table | Records | Description |
|-------|---------|-------------|
| `open_bids` | 1,100 | Outstanding bids - contractor, contact, email, phone, estimate #, bid amount |
| `bids_sent` | 9,529 | Sent bids - same as open_bids + date sent, date won, status |
| `checklist` | 191 | Project intake checklist - contract/signage/dust/SWPPP/inspection status |
| `dust_permits` | 127 | Old dust permit tracking - permit #, county, renewal dates |
| `signage` | 46 | Sign installation tracking - onsite contacts |
| `swppp_master` | 6 | SWPPP plan tracking |
| `inspections` | 260 | Inspection records - company, contact, phone |
| **TOTAL** | **11,259** | |

## Source Boards (Monday.com)

| Board Name | Board ID | Status |
|------------|----------|--------|
| OPEN_BIDS | 7505227263 | ✅ Extracted |
| BIDS_SENT | 7505653112 | ✅ Extracted |
| CHECKLIST | 7844326622 | ✅ Extracted |
| DUST_PERMITS_WM | 7816215167 | ✅ Extracted |
| SIGNAGE | 7887806194 | ✅ Extracted |
| SWPPP_MASTER | 8304407803 | ✅ Extracted |
| INSPECTIONS_WM | 8781744032 | ✅ Extracted |

## Schema

Each table has:
- `id` - local auto-increment ID
- `monday_id` - original Monday item ID
- `name` - item name
- `group_id` / `group_title` - Monday group info
- Extracted columns (email, phone, contractor, etc.)
- `raw_columns` - JSON blob with ALL original Monday column data
- `extracted_at` - timestamp

## Query Examples

```bash
# All contacts with email
sqlite3 scripts/procurement.db "
  SELECT contractor_name, contact_name, email, phone
  FROM bids_sent
  WHERE email IS NOT NULL AND email != ''
  LIMIT 20
"

# Dust permits by county
sqlite3 scripts/procurement.db "
  SELECT name, permit_number, county, due_date_renewal
  FROM dust_permits
  WHERE permit_number IS NOT NULL
"

# Search by contractor
sqlite3 scripts/procurement.db "
  SELECT name, status, bid_amount
  FROM open_bids
  WHERE contractor_name LIKE '%LAYTON%'
"

# Get raw column data (everything)
sqlite3 scripts/procurement.db "
  SELECT monday_id, name, raw_columns
  FROM bids_sent
  WHERE monday_id = '7591366963'
"
```

## Enrichment

Use `scripts/procurement-enrichment-report.ts` to find hub.db contacts that can be enriched with procurement data:

```bash
bun scripts/procurement-enrichment-report.ts
```

Outputs `scripts/enrichment-opportunities.csv` with CLI commands to update hub.db + Monday.

## Scripts

| Script | Purpose |
|--------|---------|
| `extract-procurement.ts` | One-time extraction (already run) |
| `procurement-enrichment-report.ts` | Generate enrichment opportunities CSV |

## NOT Extracted (Main Workspace)

These boards are in the main workspace and synced via `hub.ts` CLI:

- ESTIMATING → hub.db `estimates`
- CONTRACTORS → hub.db `accounts`
- CONTACTS → hub.db `contacts`
- LEADS, PROJECTS, DUST_PERMITS, INSPECTION_REPORTS, SWPPP_PLANS
