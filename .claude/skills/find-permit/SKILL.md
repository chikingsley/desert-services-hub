---
name: Find Dust Permit
description: This skill should be used when the user asks to "find a permit", "look up a permit", "search for a dust permit", "find permit for [company]", "get permit details", or needs to locate permit information by project name, company name, permit ID, or address.
---

# Finding Dust Permits

Query the SQLite database at `server/src/db/company-permits.sqlite` to find permit information.

## Database Location

```text
server/src/db/company-permits.sqlite
```

## Quick Queries

### Search by Project Name

```bash
sqlite3 server/src/db/company-permits.sqlite "SELECT id, project_name, company_name, status, expiration_date FROM permits WHERE project_name LIKE '%SEARCH%' COLLATE NOCASE"
```

### Search by Company Name

```bash
sqlite3 server/src/db/company-permits.sqlite "SELECT id, project_name, company_name, status, expiration_date FROM permits WHERE company_name LIKE '%SEARCH%' COLLATE NOCASE"
```

### Search by Permit ID

```bash
sqlite3 server/src/db/company-permits.sqlite "SELECT * FROM permits WHERE id = 'D0056297'"
```

### Search by Address

```bash
sqlite3 server/src/db/company-permits.sqlite "SELECT id, project_name, company_name, address, city FROM permits WHERE address LIKE '%SEARCH%' COLLATE NOCASE"
```

### Find Expiring Permits

```bash
sqlite3 server/src/db/company-permits.sqlite "SELECT id, project_name, company_name, expiration_date FROM permits WHERE status = 'Active' AND expiration_date <= date('now', '+30 days') ORDER BY expiration_date"
```

### List Active Permits

```bash
sqlite3 server/src/db/company-permits.sqlite "SELECT id, project_name, company_name, expiration_date FROM permits WHERE status = 'Active' ORDER BY expiration_date"
```

## TypeScript API

Import functions from `@/db/company-permits` for programmatic access:

```typescript
import {
  getPermit,
  getExpiringPermits,
  getActivePermits,
  getPermitsByCompany,
  searchCompanies
} from "@/db/company-permits";

// Get specific permit by ID
const permit = getPermit("D0056297");

// Find permits expiring within N days
const expiring = getExpiringPermits(30);

// Get all active permits
const active = getActivePermits();

// Get permits for a specific company
const companyPermits = getPermitsByCompany("CMP024581");

// Search companies by name
const companies = searchCompanies("Wood Partners");
```

## Database Schema

### permits table

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

### companies table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Company ID (e.g., CMP024581) |
| name | TEXT | Company name |
| address | TEXT | Company address |
| city | TEXT | City |
| state | TEXT | State |
| phone | TEXT | Phone number |
| email | TEXT | Email address |

## Common Workflows

### Find and Renew a Permit

1. Search for the permit using project name or company
2. Note the permit ID and company name
3. Run the renewal script:

```bash
bun scripts/renew-permit.ts <PERMIT_ID> "<COMPANY_NAME>"
```

### Check Permits Needing Renewal

Query permits expiring in the next 30 days:

```bash
sqlite3 server/src/db/company-permits.sqlite "SELECT id, project_name, company_name, expiration_date FROM permits WHERE status = 'Active' AND expiration_date <= date('now', '+30 days') ORDER BY expiration_date"
```
