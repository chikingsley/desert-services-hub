---
name: Find Dust Permit
description: This skill should be used when the user asks to "find a permit", "look up a permit", "search for a dust permit", "find permit for [company]", "get permit details", or needs to locate permit information by project name, company name, permit ID, or address.
---

# Finding Dust Permits

Query the SQLite database at `server/src/db/company-permits.sqlite` to find permit information.

## Database Location

```text
server/src/db/company-permits.sqlite
```css
```bash
sqlite3 server/src/db/company-permits.sqlite "SELECT id, project_name, company_name, status, expiration_date FROM permits WHERE project_name LIKE '%SEARCH%' COLLATE NOCASE"
```css
```bash
sqlite3 server/src/db/company-permits.sqlite "SELECT id, project_name, company_name, status, expiration_date FROM permits WHERE company_name LIKE '%SEARCH%' COLLATE NOCASE"
```css
```bash
sqlite3 server/src/db/company-permits.sqlite "SELECT * FROM permits WHERE id = 'D0056297'"
```css
```bash
sqlite3 server/src/db/company-permits.sqlite "SELECT id, project_name, company_name, address, city FROM permits WHERE address LIKE '%SEARCH%' COLLATE NOCASE"
```css
```bash
sqlite3 server/src/db/company-permits.sqlite "SELECT id, project_name, company_name, expiration_date FROM permits WHERE status = 'Active' AND expiration_date <= date('now', '+30 days') ORDER BY expiration_date"
```css
```bash
sqlite3 server/src/db/company-permits.sqlite "SELECT id, project_name, company_name, expiration_date FROM permits WHERE status = 'Active' ORDER BY expiration_date"
```css
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
```css
```bash
bun scripts/renew-permit.ts <PERMIT_ID> "<COMPANY_NAME>"
```css
```bash
sqlite3 server/src/db/company-permits.sqlite "SELECT id, project_name, company_name, expiration_date FROM permits WHERE status = 'Active' AND expiration_date <= date('now', '+30 days') ORDER BY expiration_date"
```
