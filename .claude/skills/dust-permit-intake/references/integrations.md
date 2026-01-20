# Integration Reference

Quick reference for all integration points used in the dust permit intake process.

## Email (desert-email MCP)

### Search for Request Email

```typescript
// MCP Tool: search-email
{
  query: "dust permit [company name]",
  userId: "chi@desertservices.net",  // or other mailbox
  limit: 20
}

// Search multiple mailboxes
// Mailboxes to check in order:
// 1. chi@desertservices.net (primary)
// 2. jared@desertservices.net
// 3. jayson@desertservices.net
// 4. jeff@desertservices.net
// 5. internalcontracts@desertservices.net
```

### Get Attachments

```typescript
// MCP Tool: list-attachments
{ messageId: "...", userId: "chi@desertservices.net" }

// MCP Tool: download-attachment
{ messageId: "...", attachmentId: "...", userId: "chi@desertservices.net" }

// Look for:
// - NOI.pdf, Notice of Intent
// - NVC.pdf, Notice of Void and Cancel
// - Grading Plan, Site Plan
// - SWPPP Plan
```

### Send Confirmation

```typescript
// MCP Tool: send-email
{
  to: [{ email: "requester@company.com" }],
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

```typescript
const NOTION_DBS = {
  PROJECTS: "2e0c1835-5bb2-8197-b0f5-ff284f1d1f19",
  TASKS: "collection://2e0c1835-5bb2-81d0-a579-000be2bce0e9",
  DUST_PERMITS: "49cd5e58-2c32-4fcb-ba35-e7b978b71e5a"
};
```

### Search for Existing Project

```typescript
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

```typescript
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

```typescript
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

```typescript
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

```typescript
const MONDAY_BOARDS = {
  DUST_PERMITS: "9850624269",
  ESTIMATING: "7943937851",
  PROJECTS: "8692330900",
  CONTRACTORS: "7943937856",
  CONTACTS: "7943937855"
};
```

### Search for Related Estimate

```typescript
// MCP Tool: search-items
{
  boardId: "7943937851",  // ESTIMATING
  searchTerm: "[project name]"
}

// Returns items with fuzzy match
// Check if estimate exists for this project
```

### Link to Dust Permit Board

```typescript
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
auto-permit/server/src/db/company-permits.sqlite
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

```bash
"Find permit for ABC Construction"
"Search permits by address 123 Main St"
"Show expiring permits"
"List active permits for company ID 42"
```

---

## Auto-Permit API

### Base URL

```text
Local: http://localhost:47822
Deployed: [check docker-compose or cloudflare tunnel]
```

### Create New Company Permit

```typescript
// POST /api/applications/create
{
  flow: "new-company",

  // Company info
  companyName: "ABC Construction LLC",
  companyAddress: "123 Business St",
  companyCity: "Phoenix",
  companyState: "AZ",
  companyZip: "85001",
  companyPhone: "602-555-1234",
  companyEmail: "permits@abcconstruction.com",

  // Project info
  projectName: "Residential Development Phase 1",
  projectAddress: "456 Project Site Rd",
  projectCity: "Mesa",

  // Site contact
  siteContactName: "John Smith",
  siteContactPhone: "602-555-5678",
  siteContactEmail: "jsmith@abcconstruction.com",

  // Permit details
  acreage: "2.5",
  parcel: "123-45-678"  // optional
}
```

### Create Existing Company Permit

```typescript
// POST /api/applications/create
{
  flow: "existing-company",

  // Company ID from SQLite
  companyId: 42,

  // Project info (same as above)
  projectName: "...",
  projectAddress: "...",
  // ...
}
```

### Renew Permit

```typescript
// POST /api/applications/create
{
  flow: "renew",

  // Existing permit to renew
  permitId: "D0062940",

  // Updated contact info if changed
  siteContactName: "...",
  siteContactPhone: "...",
  siteContactEmail: "..."
}
```

### Extract Data from PDFs

```typescript
// POST /api/applications/extract
{
  noiUrl: "https://sharepoint.../NOI.pdf",
  planUrl: "https://sharepoint.../GradingPlan.pdf"  // optional
}

// Returns extracted FormData with all fields populated
```

### Check Permit Status

```typescript
// GET /api/permits
// Returns all permits in system with current status

// GET /api/permits/:id
// Returns specific permit details
```

---

## Deep Search (Skill)

Used to find all related emails and attachments.

### Trigger

```bash
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

```bash
1. User: "dust permit for X"
   └─► Parse what X refers to

2. Search Notion
   └─► notion-search for project/task

3. Search Email
   └─► desert-email: search-email
   └─► deep-search skill if needed

4. Gather Documents
   └─► desert-email: list-attachments, download-attachment
   └─► Extract: NOI, plans, contacts

5. Check History
   └─► find-permit skill (SQLite query)

6. Create/Update Notion
   └─► notion-create-pages (project and/or task)
   └─► notion-update-page (if exists)

7. Submit Permit
   └─► auto-permit API: /api/applications/create

8. Notify
   └─► desert-email: send-email with template
```
