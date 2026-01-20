# Dust Permit Intake Skill

Process a dust permit request from initial ask through permit creation.

## Trigger Phrases

- "do a dust permit for [company/project]"
- "process dust permit request"
- "new dust permit intake"
- "dust permit for [name]"
- "handle this dust permit"

## Overview

This skill orchestrates the full dust permit intake workflow, connecting:
- **Email** (request source, attachments)
- **Notion** (project/task tracking)
- **Monday** (estimate lookup)
- **SQLite** (permit history)
- **Auto-Permit API** (permit creation)

## The Process

```bash
┌─────────────────────────────────────────────────────────────────┐
│                    DUST PERMIT INTAKE                           │
└─────────────────────────────────────────────────────────────────┘

STEP 1: FIND THE REQUEST
────────────────────────
│
├─► Check Notion first
│   └─► Search for task or project mentioning the permit/company/project name
│       ├─► FOUND with context → Use that context, skip to Step 3
│       ├─► FOUND without context → Note it exists, continue to find emails
│       └─► NOT FOUND → Continue to email search
│
└─► Check Email
    └─► Use deep-search skill to find request email
        Search patterns:
        - "dust permit" + company/project name
        - "permit request" + company name
        - From: known requesters (GCs, project managers)
        └─► Extract: requester, project name, address, any attachments

STEP 2: GATHER DOCUMENTS (via deep-search)
──────────────────────────────────────────
│
Required for permit:
├─► NOI (Notice of Intent) or NVC (Notice of Void and Cancel)
│   └─► Contains: site contact, address, acreage, project info
│
├─► Drawings/Plans OR SWPPP Plan
│   └─► Contains: site layout, BMPs, acreage calculation
│
└─► Site Contact (if not in NOI)
    └─► Name, phone, email for site responsible party

Search across mailboxes:
- chi@desertservices.net
- jared@desertservices.net
- jayson@desertservices.net
- jeff@desertservices.net
- internalcontracts@desertservices.net

STEP 3: CHECK PERMIT HISTORY
────────────────────────────
│
└─► Query SQLite database (via find-permit skill)
    └─► Search by company name, project name, address
        ├─► FOUND existing permits → Use existing-company workflow
        │   └─► Note: company_id, previous permit patterns
        └─► NOT FOUND → Use new-company workflow

STEP 4: CREATE/UPDATE NOTION
────────────────────────────
│
├─► If NO project exists:
│   └─► Create new project in Projects database
│       - Title: [GC Name] - [Project Name]
│       - Status: Active
│       - Service: Dust Permit
│       - Link email threads as context
│
├─► If project EXISTS but no dust permit task:
│   └─► Create dust permit task under project
│       - Title: "Dust Permit - [Project Name]"
│       - Status: In Progress
│       - Attach: NOI, plans, contact info
│
└─► If project AND task exist:
    └─► Update with any new context found

STEP 5: ASSESS READINESS
────────────────────────
│
Minimum required for permit submission:
├─► ✓ Company name
├─► ✓ Project name
├─► ✓ Site address
├─► ✓ Site contact (name, phone, email)
├─► ✓ Acreage OR drawings showing disturbed area
│
Optional but helpful:
├─► NOI document
├─► SWPPP plan
├─► Parcel number
└─► Project timeline

Assess status:
├─► ALL REQUIRED → Ready to create permit
├─► MISSING ITEMS → Create permit draft, flag gaps
└─► Report what's missing and where to find it

STEP 6: CREATE PERMIT
─────────────────────
│
├─► Existing Company (found in SQLite):
│   └─► POST to auto-permit API: /api/applications/create
│       └─► flow: "existing-company"
│       └─► Include: company_id from database
│
└─► New Company:
    └─► POST to auto-permit API: /api/applications/create
        └─► flow: "new-company"
        └─► Include: full company details

STEP 7: UPDATE TRACKING
───────────────────────
│
├─► Update Notion task with:
│   - Permit status (Submitted/Draft)
│   - Missing items list
│   - Next actions
│
├─► Send confirmation email (if permit submitted):
│   - Use template: dust-permit-submitted
│   - To: requester
│   - CC: internal team
│
└─► If gaps exist, note follow-up needed:
    - What's missing
    - Who to contact
    - Estimated timeline

```

## Decision Points

### New Company vs Existing Company

```bash
Query: SELECT * FROM companies WHERE name LIKE '%[company_name]%'

IF results.length > 0:
    → existing-company workflow
    → Use company_id for faster form fill
    → Check for any active permits to reference
ELSE:
    → new-company workflow
    → Will need full company details (address, phone, email)
```

### Permit Ready vs Needs More Info

| Field | Required | Source |
|-------|----------|--------|
| Company Name | Yes | Email/NOI |
| Project Name | Yes | Email/NOI |
| Site Address | Yes | NOI/Plans |
| Site Contact Name | Yes | NOI/Email |
| Site Contact Phone | Yes | NOI/Email |
| Site Contact Email | Yes | NOI/Email |
| Acreage | Yes | NOI/Plans |
| Parcel Number | No | Plans/County lookup |

If any required field is missing:
1. Check all downloaded attachments
2. Search related emails for the info
3. If still missing, flag in Notion task

## Integration Points

### Email (desert-email MCP)
```text
Tools:
- search-email: Find request and related emails
- get-email: Read full email content
- list-attachments: Find NOI, plans, SWPPP
- download-attachment: Get document files
- send-email: Confirmation notifications
```

### Notion (Notion MCP)
```bash
Databases:
- Projects: 2e0c1835-5bb2-8197-b0f5-ff284f1d1f19
- Tasks: collection://2e0c1835-5bb2-81d0-a579-000be2bce0e9
- Dust Permits: 49cd5e58-2c32-4fcb-ba35-e7b978b71e5a

Actions:
- Search for existing project/task
- Create new project if needed
- Create dust permit task
- Update with context and status
```

### Monday (desert-mondaycrm MCP)
```bash
Boards:
- DUST_PERMITS: 9850624269
- ESTIMATING: 7943937851

Actions:
- Check if estimate exists for project
- Link permit to estimate if found
```

### SQLite (find-permit skill)
```bash
Database: server/src/db/company-permits.sqlite

Queries:
- Search by company name
- Search by project name
- Search by address
- Get active permits for company
```

### Auto-Permit API
```bash
Base URL: http://localhost:47822 (or deployed URL)

Endpoints:
- POST /api/applications/create
  - flow: "new-company" | "existing-company" | "renew"
  - FormData with all permit fields

- POST /api/applications/extract
  - Extract data from NOI/SWPPP PDFs

- GET /api/permits
  - List current permits in system
```

## Example Interaction

**User:** "Do a dust permit for ABC Construction"

**Agent:**
1. Search Notion for "ABC Construction" → Not found
2. Search email for "ABC Construction dust permit" → Found request from john@abcconstruction.com
3. Deep search related emails → Found NOI attachment, grading plan
4. Download and extract NOI → Got site contact, address, 2.5 acres
5. Query SQLite for "ABC Construction" → No existing permits (new company)
6. Create Notion project "ABC Construction - [Project Name]"
7. Create dust permit task with extracted info
8. Assess: All required fields present → Ready
9. POST to auto-permit API with new-company flow
10. Update Notion task: "Submitted - Pending approval"
11. Send confirmation email to john@abcconstruction.com

## Gaps and Follow-ups

When information is missing, document in Notion task:

```markdown
## Missing Information

- [ ] Site contact email - not in NOI, need to request from GC
- [ ] Acreage confirmation - plans unclear, verify with engineer

## Next Actions

1. Email GC for site contact email
2. Call engineer re: acreage calculation
3. Once received, complete permit submission
```

## Related Skills

- **deep-search**: Used for finding all related emails and attachments
- **find-permit**: Used for checking permit history in SQLite
- **contract-intake**: Similar pattern for contract processing

## Templates Used

- `dust-permit-submitted`: Confirmation that permit was submitted
- `dust-permit-billing`: Internal notification for billing
