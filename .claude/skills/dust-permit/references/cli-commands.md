# CLI Commands Reference

All commands run from the `apps/auto-permit/` directory.

## Download / Scrape

```bash
# Download permit PDF (default: tests/output/pdfs/)
bun src/cli.ts scrape D0056297 --pdf

# Download to specific directory
bun src/cli.ts scrape D0056297 --pdf --output /path/to/dir

# Download to repo root
bun src/cli.ts scrape D0056297 --pdf --output .

# Scrape data only (no PDF)
bun src/cli.ts scrape D0056297
```

## Renew Permit

Extends expiration date for an active permit.

```bash
bun src/cli.ts renew D0058823 --company "Weis Builders Inc"
```

Requirements:
- Permit must be Active status
- Company name must match database

## Revise Permit

Edit an active permit in-place (does NOT extend expiration).

```bash
# Contact/address change
bun src/cli.ts revise D0064070 --type contact \
  --notes "Update applicant address to 8777 E Via De Ventura, Suite 201, Scottsdale, AZ 85258"

# Acreage change
bun src/cli.ts revise D0058823 --type acreage \
  --notes "Increased disturbed area from 5 to 7 acres"

# Boundary/map change
bun src/cli.ts revise D0058823 --type boundary \
  --form-data ./data/overrides/updated-boundary.json
```

**Revision types**: `boundary`, `acreage`, `contact`, `schedule`, `bmp`, `other`

## Close Permit

```bash
bun src/cli.ts close D0056240
```

## Create Permit

### Existing Company (in database)

```bash
bun src/cli.ts create \
  --flow existing-company \
  --company "Stevens Leinweber Construction Inc" \
  --form-data ./data/overrides/project-name.json
```

### New Company (not in database)

Requires full applicant data in FormData JSON.

```bash
bun src/cli.ts create \
  --flow new-company \
  --form-data ./data/overrides/project-name.json
```

## List Permits

```bash
bun src/cli.ts list
bun src/cli.ts list --json
```

## CLI Options

| Option | Description |
|--------|-------------|
| `--headed` | Show browser window (default: headless) |
| `--keep-open` | Keep browser open after completion |
| `--json` | Output result as JSON |

---

# SQLite Database

Database location: `src/db/company-permits.sqlite`

**CRITICAL**: Database is READ-ONLY. It's synced FROM the county portal. Never run UPDATE/INSERT.

## permits table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Application number (e.g., D0056297) |
| project_name | TEXT | Project name |
| company_id | TEXT | Company ID (e.g., CMP024581) |
| company_name | TEXT | Company name (denormalized) |
| status | TEXT | Draft, Active, Closed, Superseded |
| submitted_date | TEXT | Date submitted |
| effective_date | TEXT | Date permit became effective |
| expiration_date | TEXT | Date permit expires |
| closed_date | TEXT | Date permit was closed |
| previous_app_id | TEXT | Previous permit ID (for renewals) |
| address | TEXT | Job site address |
| city | TEXT | City |
| parcel | TEXT | APN/Parcel number |

## companies table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Company ID (e.g., CMP024581) |
| name | TEXT | Company name |
| address | TEXT | Company address |
| city | TEXT | City |
| state | TEXT | State |
| phone | TEXT | Phone number |
| email | TEXT | Email address |

## Common Queries

### Search by Permit ID

```bash
sqlite3 src/db/company-permits.sqlite "SELECT * FROM permits WHERE id = 'D0056297'"
```

### Search by Project Name

```bash
sqlite3 src/db/company-permits.sqlite "SELECT id, project_name, company_name, status, expiration_date FROM permits WHERE project_name LIKE '%SEARCH%' COLLATE NOCASE"
```

### Search by Company Name

```bash
sqlite3 src/db/company-permits.sqlite "SELECT id, project_name, company_name, status, expiration_date FROM permits WHERE company_name LIKE '%SEARCH%' COLLATE NOCASE"
```

### Search by Address

```bash
sqlite3 src/db/company-permits.sqlite "SELECT id, project_name, company_name, address, city FROM permits WHERE address LIKE '%SEARCH%' COLLATE NOCASE"
```

### Find Expiring Permits

```bash
sqlite3 src/db/company-permits.sqlite "SELECT id, project_name, company_name, expiration_date FROM permits WHERE status = 'Active' AND expiration_date <= date('now', '+30 days') ORDER BY expiration_date"
```

### List Active Permits

```bash
sqlite3 src/db/company-permits.sqlite "SELECT id, project_name, company_name, expiration_date FROM permits WHERE status = 'Active' ORDER BY expiration_date"
```

### Check if Company Exists

```bash
sqlite3 src/db/company-permits.sqlite "SELECT * FROM companies WHERE name LIKE '%ABC Construction%' LIMIT 5"
```

## TypeScript API

```typescript
import {
  getPermit,
  getExpiringPermits,
  getActivePermits,
  getPermitsByCompany,
  searchCompanies
} from "@/db/company-permits";

const permit = getPermit("D0056297");
const expiring = getExpiringPermits(30);
const active = getActivePermits();
const companyPermits = getPermitsByCompany("CMP024581");
const companies = searchCompanies("Wood Partners");
```
