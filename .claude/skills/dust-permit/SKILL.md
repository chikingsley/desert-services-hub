---
name: dust-permit
description: |
  Handle all Maricopa County dust permit operations: create, renew, revise, close, download PDF, find permit, and extract data from NOI/SWPPP documents. Use when user mentions dust permits, permit IDs (D0XXXXXX), county portal, Maricopa Air Quality, or asks to file/renew/revise/close/download a permit, find a permit, or extract permit data.
---

# Dust Permit Operations

All permit operations go through the CLI at `apps/auto-permit/`. The SQLite database is read-only (synced from county portal).

## CLI Quick Reference

| Operation | Command |
|-----------|---------|
| Download PDF | `bun src/cli.ts scrape D0061391 --pdf` |
| Download to specific dir | `bun src/cli.ts scrape D0061391 --pdf --output .` |
| Renew permit | `bun src/cli.ts renew D0058823 --company "Company Name"` |
| Revise permit | `bun src/cli.ts revise D0064070 --type contact --notes "..."` |
| Close permit | `bun src/cli.ts close D0056240` |
| Create (existing co) | `bun src/cli.ts create --flow existing-company --company "Name" --form-data ./file.json` |
| Create (new co) | `bun src/cli.ts create --flow new-company --form-data ./file.json` |
| List permits | `bun src/cli.ts list` |

**Revision types**: `boundary`, `acreage`, `contact`, `schedule`, `bmp`, `other`

## Find Permit (SQLite)

Database: `src/db/company-permits.sqlite`

```sql
-- By permit ID
SELECT * FROM permits WHERE id = 'D0056297';

-- By project name
SELECT id, project_name, company_name, status, expiration_date 
FROM permits WHERE project_name LIKE '%SEARCH%' COLLATE NOCASE;

-- By company
SELECT * FROM permits WHERE company_name LIKE '%SEARCH%' COLLATE NOCASE;

-- Expiring soon
SELECT id, project_name, company_name, expiration_date 
FROM permits WHERE status = 'Active' 
AND expiration_date <= date('now', '+30 days') ORDER BY expiration_date;
```

## Intent Detection

| User Says | Intent | Action |
|-----------|--------|--------|
| "download PDF D0061391" | download | `scrape --pdf` |
| "renew permit for ABC Corp" | renew | Find permit, then `renew` |
| "update contact on permit" | revise | `revise --type contact` |
| "close out the permit" | close | `close` |
| "file dust permit for project X" | create | Gather docs, build FormData, `create` |
| "find permit for ABC" | find | SQLite query |
| "has this been filed?" | status | SQLite query for status |

## Permit ID Format

Maricopa County: `D0XXXXXX` (e.g., D0061391, D0056297)

## Workflow: New Permit

1. **Gather documents** - NOI (required), SWPPP/Plans (optional)
2. **Extract data** - See [references/extraction.md](references/extraction.md)
3. **Check history** - SQLite query for company
4. **Build FormData** - Save to `data/overrides/<project>.json`
5. **Run CLI** - `create --flow existing-company` or `--flow new-company`
6. **Update tracking** - Notion task

## Workflow: Renewal

1. **Find permit** - SQLite query by project/company
2. **Verify status** - Must be Active, check expiration
3. **Run CLI** - `bun src/cli.ts renew D0XXXXXX --company "Company Name"`

## Workflow: Download PDF

1. **Get permit ID** - User provides D0XXXXXX or find via SQLite
2. **Run CLI** - `bun src/cli.ts scrape D0061391 --pdf --output .`
3. **Output** - PDF saved to specified directory

## Required Fields (New Permit)

| Field | Required | Source |
|-------|----------|--------|
| Company Name | Yes | NOI/Email |
| Project Name | Yes | NOI/Email |
| Site Address | Yes | NOI/Plans |
| Contact (name, phone, email) | Yes | NOI/Email |
| Acreage | Yes | NOI/Plans |

## FormData JSON Structure

```json
{
  "primaryContact": { 
    "firstName": "John", 
    "lastName": "Smith", 
    "phone": "6025551234", 
    "email": "john@company.com" 
  },
  "project": { 
    "name": "Project Name", 
    "startDate": "01/27/2026", 
    "endDate": "01/27/2027" 
  },
  "site": { 
    "name": "Project Name", 
    "latitude": 33.4484, 
    "longitude": -112.0740, 
    "acresDisturbed": 5.0 
  }
}
```

## References

For detailed information:

- **CLI commands & options**: [references/cli-commands.md](references/cli-commands.md)
- **Data extraction (NOI/SWPPP)**: [references/extraction.md](references/extraction.md)
- **Integrations (Email, Notion, Monday)**: [references/integrations.md](references/integrations.md)
- **Real request examples**: [references/examples/](references/examples/)
