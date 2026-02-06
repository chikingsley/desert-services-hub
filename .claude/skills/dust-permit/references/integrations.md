# Integration Reference

Quick reference for all integration points used in the dust permit intake process.

## ⚠️ CRITICAL: Database is READ-ONLY

```sql
The SQLite database (src/db/company-permits.sqlite) is a LOCAL CACHE.
It is synced FROM the county portal - it is NOT the source of truth.

NEVER run UPDATE/INSERT on the database to change permit data.
ALL permit operations MUST go through the CLI → browser automation.
```

## Email (desert-email MCP)

### Search for Request Email

```css
// MCP Tool: search-email
{
  query: "dust permit [company name]",
  userId: "[chi@desertservices.net](mailto:chi@desertservices.net)",  // or other mailbox
  limit: 20
}

// Search multiple mailboxes
// Mailboxes to check in order:
// 1. [chi@desertservices.net](mailto:chi@desertservices.net) (primary)
// 2. [jared@desertservices.net](mailto:jared@desertservices.net)
// 3. [jayson@desertservices.net](mailto:jayson@desertservices.net)
// 4. [jeff@desertservices.net](mailto:jeff@desertservices.net)
// 5. [internalcontracts@desertservices.net](mailto:internalcontracts@desertservices.net)
```

### Get Attachments

```css
// MCP Tool: list-attachments
{ messageId: "...", userId: "[chi@desertservices.net](mailto:chi@desertservices.net)" }

// MCP Tool: download-attachment
{ messageId: "...", attachmentId: "...", userId: "[chi@desertservices.net](mailto:chi@desertservices.net)" }

// Look for:
// - NOI.pdf, Notice of Intent
// - NVC.pdf, Notice of Void and Cancel
// - Grading Plan, Site Plan
// - SWPPP Plan
```

### Send Confirmation

```css
// MCP Tool: send-email
{
  to: [{ email: "[requester@company.com](mailto:requester@company.com)" }],
  subject: "Dust Permit Submitted - [Project Name]",
  body: "<HTML from dust-permit-submitted template>",
  bodyType: "html"
}
```

### Email Templates

| Template | When to Use |
|----------|-------------|
| `dust-permit-submitted` | After permit is submitted to county |
| `dust-permit-issued` | When permit is approved |
| `dust-permit-billing` | Internal notification for invoicing |

Location: `services/email/templates/`

---

## Notion

### Database IDs

```javascript
const NOTION_DBS = {
  PROJECTS: "2e0c1835-5bb2-8197-b0f5-ff284f1d1f19",
  TASKS: "collection://2e0c1835-5bb2-81d0-a579-000be2bce0e9",
  DUST_PERMITS: "49cd5e58-2c32-4fcb-ba35-e7b978b71e5a"
};
```

### Search for Existing Project

```css
// Using Notion MCP: notion-search
{
  query: "[company name] OR [project name]",
  query_type: "internal"
}

// Or search within Projects database specifically
{
  query: "[search term]",
  data_source_url: "collection://2e0c1835-5bb2-8197-b0f5-ff284f1d1f19"
}
```

### Create Project

```css
// Using Notion MCP: notion-create-pages
{
  parent: { data_source_id: "2e0c1835-5bb2-8197-b0f5-ff284f1d1f19" },
  pages: [{
    properties: {
      "Name": "[GC Name] - [Project Name]",
      "Status": "Active",
      "Service Type": "Dust Permit"
    },
    content: "## Project Context\n\n[Paste email thread summary]\n\n## Documents\n\n- NOI: [link]\n- Plans: [link]"
  }]
}
```

### Create Dust Permit Task

```css
// Using Notion MCP: notion-create-pages
{
  parent: { data_source_id: "2e0c1835-5bb2-81d0-a579-000be2bce0e9" },
  pages: [{
    properties: {
      "Task": "Dust Permit - [Project Name]",
      "Status": "Not Started",  // API limitation - can't use custom status
      "Project": "[relation to project ID]"
    },
    content: "## Permit Details\n\n- Company: [name]\n- Site Address: [address]\n- Site Contact: [name, phone, email]\n- Acreage: [X acres]\n\n## Missing Info\n\n- [ ] [list any gaps]"
  }]
}
```

### Update Task Status

```css
// Using Notion MCP: notion-update-page
{
  data: {
    page_id: "[task ID]",
    command: "update_properties",
    properties: {
      "Status": "Done",  // Limited to default statuses via API
      "Next Steps": "Permit submitted - awaiting approval"
    }
  }
}
```

---

## Monday (desert-mondaycrm MCP)

### Board IDs

```javascript
const MONDAY_BOARDS = {
  DUST_PERMITS: "9850624269",
  ESTIMATING: "7943937851",
  PROJECTS: "8692330900",
  CONTRACTORS: "7943937856",
  CONTACTS: "7943937855"
};
```

### Search for Related Estimate

```css
// MCP Tool: search-items
{
  boardId: "7943937851",  // ESTIMATING
  searchTerm: "[project name]"
}

// Returns items with fuzzy match
// Check if estimate exists for this project
```

### Link to Dust Permit Board

```css
// MCP Tool: create-item
{
  boardId: "9850624269",  // DUST_PERMITS
  itemName: "[Project Name] - Dust Permit",
  columnValues: {
    // Column IDs vary - check board schema
  }
}
```

---

## SQLite (Permit History)

### Database Location

```text
apps/auto-permit/src/db/company-permits.sqlite
```

### Company Lookup

```sql
-- Check if company exists
SELECT * FROM companies
WHERE name LIKE '%[company_name]%'
LIMIT 5;

-- Returns: id, name, address, city, state, phone, email
```

### Permit History

```sql
-- Find permits for company
SELECT * FROM permits
WHERE company_name LIKE '%[company_name]%'
ORDER BY effective_date DESC;

-- Returns: id, project_name, company_id, company_name, status,
--          submitted_date, effective_date, expiration_date,
--          closed_date, address, city, parcel
```

### Check Active Permits

```sql
-- Find active permits (not expired, not closed)
SELECT * FROM permits
WHERE company_id = [company_id]
  AND status = 'active'
  AND (expiration_date IS NULL OR expiration_date > date('now'));
```

### Via find-permit Skill

The `find-permit` skill in ds-workbench wraps these queries:

```text
"Find permit for ABC Construction"
"Search permits by address 123 Main St"
"Show expiring permits"
"List active permits for company ID 42"
```

---

## Auto-Permit CLI

The CLI is the primary interface for permit operations. Run from the `apps/auto-permit/` directory.

### Create Permit - Existing Company

When the company exists in the SQLite database:

```sql

# 1. Save FormData overrides to JSON file

# Path: apps/auto-permit/data/overrides/<project-slug>.json

# 2. Run CLI

bun src/cli.ts create \
  --flow existing-company \
  --company "Stevens Leinweber Construction Inc" \
  --form-data ./data/overrides/lexington-420-bldg-d.json
```

### Create Permit - New Company

When the company is NOT in the database (requires full applicant data):

```sql
bun src/cli.ts create \
  --flow new-company \
  --form-data ./data/overrides/desert-sky.json
```

### FormData Overrides JSON Structure

```typescript
// DeepPartial<FormData> - only include fields to override
{
  "applicant": {
    "isGeneralContractor": true,
    "companyName": "ABC Construction LLC",
    "address1": "123 Business St",
    "city": "Phoenix",
    "state": "Arizona",
    "zip": "85001",
    "phone": "6025551234",
    "email": "[permits@abcconstruction.com](mailto:permits@abcconstruction.com)"
  },
  "primaryContact": {
    "firstName": "John",
    "lastName": "Smith",
    "title": "Project Manager",
    "email": "[jsmith@abcconstruction.com](mailto:jsmith@abcconstruction.com)",
    "phone": "6025555678",
    "companyName": "ABC Construction LLC"
  },
  "project": {
    "name": "Residential Development Phase 1",
    "description": "new construction",
    "startDate": "01/27/2026",
    "endDate": "01/27/2027"
  },
  "site": {
    "name": "Residential Development Phase 1",
    "latitude": 33.4484,
    "longitude": -112.0740,
    "acresDisturbed": 2.5
  }
}
```

### Revise Permit (Edit In-Place)

Use for changes to an active permit (does NOT extend expiration):

```typescript

# Contact/address change

bun src/cli.ts revise D0064070 --type contact \
  --notes "Update applicant address to 8777 E Via De Ventura, Suite 201, Scottsdale, AZ 85258"

# Acreage change

bun src/cli.ts revise D0058823 --type acreage \
  --notes "Increased disturbed area from 5 to 7 acres"

# Boundary/map change

bun src/cli.ts revise D0058823 --type boundary \
  --form-data ./data/overrides/updated-boundary.json

# Revision types: boundary, acreage, contact, schedule, bmp, other

```

### Renew Permit (Extend Expiration)

Use to renew an expiring permit (extends dates):

```text
bun src/cli.ts renew D0058823 --company "Weis Builders Inc"
```

### Close Permit

```text
bun src/cli.ts close D0056240
```

### List Permits

```text
bun src/cli.ts list
bun src/cli.ts list --json
```

### CLI Options

| Option | Description |
|--------|-------------|
| `--headed` | Show browser window (default: headless) |
| `--keep-open` | Keep browser open after completion |
| `--json` | Output result as JSON |

### Extract Data from PDFs

Use Claude Code skills for extraction (not API):

```markdown

# In Claude Code, use the extraction skills:

/extract-noi <path-to-noi.pdf>
/extract-plan <path-to-swppp.pdf>

# Skills output structured data to build FormData overrides

```

---

## Deep Search (Skill)

Used to find all related emails and attachments.

### Trigger

```text
"deep search [project name]"
"research [company name] emails"
"find all related emails for [X]"
```

### What It Does

1. Searches across all configured mailboxes
2. Downloads and parses attachments
3. Extracts structured data (dates, values, contacts)
4. Builds timeline of communications
5. Returns comprehensive findings

### Output Format

```markdown

## Summary

Brief overview of what was found

## Timeline

- [date] - [event/email]
- [date] - [event/email]

## Documents Found

- NOI.pdf (from email dated X)
- Site Plan.pdf (from email dated Y)

## Key Contacts

- Name (role) - email, phone

## Gaps

- Missing site contact email
- Acreage not specified in docs

## Recommended Actions

1. Request site contact info from GC
2. Verify acreage with engineer
```

---

## Process Flow Summary

```sql
1. User: "dust permit for X"
   └─► Parse what X refers to

2. Search Notion
   └─► notion-search for project/task

3. Search Email
   └─► desert-email: search-email
   └─► deep-search skill if needed

4. Gather Documents
   └─► desert-email: list-attachments, download-attachment
   └─► Extract with skills: /extract-noi, /extract-plan

5. Check History
   └─► find-permit skill (SQLite query)

6. Create/Update Notion
   └─► notion-create-pages (project and/or task)
   └─► notion-update-page (if exists)

7. Submit Permit
   └─► Save FormData overrides to: data/overrides/<project>.json
   └─► Run: bun src/cli.ts create --flow [type] --form-data ./data/overrides/<project>.json

8. Notify
   └─► desert-email: send-email with template
```
