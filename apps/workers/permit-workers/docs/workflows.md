# Permit Workflows

This document describes how each workflow flows through the system - from trigger to completion.

---

## Overview

```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Email/Request  │────▶│  Data Gathering │────▶│   API Server    │────▶│ Browser/Portal  │
│  (Intake)       │     │  (Manual/AI)    │     │  (Bun.serve)    │     │  (Playwright)   │
└─────────────────┘     └─────────────────┘     └────────┬────────┘     └────────┬────────┘
                                                        │                       │
                                                        ▼                       ▼
                                               ┌─────────────────┐     ┌─────────────────┐
                                               │    Database     │     │  Maricopa       │
                                               │   (SQLite)      │     │  County Portal  │
                                               └─────────────────┘     └─────────────────┘
```

---

## 0. Intake & Data Gathering

Before the API can create a permit, someone (or something) must gather the required data. This section documents the manual intake process.

### Trigger

Dust permit requests typically arrive via:
- **Email** - Client or internal team forwards request
- **Contract** - New project contract includes dust permit line item
- **Notion/Monday** - Project status changes to "Ready for Permit"

### Process Flow

```text
1. IDENTIFY THE REQUEST
   ├── Search inbox for permit-related emails
   ├── Look for keywords: "dust permit", "dust control", "SWPPP"
   └── Note: requester, project name, address, client contact

2. LOCATE PROJECT DOCUMENTS
   ├── Check email attachments
   ├── Check SharePoint/Google Drive project folder
   ├── Look for:
   │   ├── SWPPP Plans (C-4XX sheets) → acreage, engineering info
   │   ├── Construction Contract → company info, contacts, scope
   │   ├── NOI (Notice of Intent) → if available
   │   └── Grading Plans → site details
   └── Create local folder: ~/Documents/Github/{project-name} plans/

3. EXTRACT DATA FROM SWPPP PLANS
   ├── Project name and address
   ├── Acreage (look for "DISTURBED" area, not gross)
   ├── Engineer name and PE number
   └── Site coordinates (if shown)

4. EXTRACT DATA FROM CONTRACT
   ├── Property Owner (legal entity)
   ├── General Contractor (GC) company info
   │   ├── Company name, address
   │   ├── Entity type (LLC, Corp, etc.)
   │   └── Phone, email
   ├── Primary Contact
   │   ├── Name, title
   │   ├── Email, phone
   │   └── Often the Project Manager
   ├── Project scope/description
   └── Contract date (use as reference for start date)

5. COMPILE PERMIT DATA
   └── Build the FormData object (see example below)
```

### Example: Desert Sky Apartments

**Email received:** "Fw: Desert Sky: Dust Control Permit"
**From:** <rick@desertservices.net>
**Request:** Submit dust permit for 6903 W Thomas Rd, Phoenix, AZ 85033

**Documents located:**
- `/Users/.../desert sky plans/C-402-STORMWATER-MANAGEMENT-PLAN.pdf`
- `/Users/.../desert sky plans/Construction Contract.pdf`

**Data extracted from SWPPP Plans (C-402):**
```yaml
Project: Desert Sky Apartments
Address: 6903 West Thomas Road, Phoenix, AZ 85033
Acreage: 9.668 acres (DISTURBED area)
Engineer: Jeffrey P. Hunt, PE #53640, Rick Engineering
```

**Data extracted from Construction Contract:**
```yaml
Property Owner: Desert Sky Apartments LLC
GC Company: NRP Contractors II LLC
GC Address: 1228 Euclid Ave, 4th Floor, Cleveland, OH 44115
Entity Type: LLC (value "6")
Primary Contact:
  Name: Chase Hubbert
  Title: Project Manager
  Email: chubbert@nrpgroup.com
  Phone: 210-507-0736
Superintendent: Jefrey Yearian
Scope: 288-unit apartment complex, 9 buildings, clubhouse, 3 garages, 34 carports, pool
Contract Date: 12/11/2025
```

**Compiled FormData:**
```typescript
{
  flow: "new-company",  // or "existing-company" if NRP is already in portal
  companyName: "NRP Contractors II LLC",
  formData: {
    applicant: {
      entityType: "6",  // LLC
      companyName: "NRP Contractors II LLC",
      address1: "1228 Euclid Ave, 4th Floor",
      city: "Cleveland",
      state: "Ohio",
      zip: "44115",
      phone: "(210) 507-0736",
      email: "chubbert@nrpgroup.com"
    },
    primaryContact: {
      firstName: "Chase",
      lastName: "Hubbert",
      title: "Project Manager",
      email: "chubbert@nrpgroup.com",
      phone: "(210) 507-0736"
    },
    project: {
      name: "Desert Sky Apartments",
      description: "288-unit apartment complex with 9 buildings, clubhouse, 3 detached garages, 34 carports, and pool",
      address: "6903 West Thomas Road",
      city: "Phoenix",
      startDate: "01/19/2026",  // Today or contract date
      endDate: "01/19/2027"     // One year from start
    }
  }
}
```

### Data Sources Summary

| Field | Primary Source | Fallback Source |
|-------|---------------|-----------------|
| Project Name | Contract | SWPPP Plans |
| Address | Contract | SWPPP Plans / Email |
| APN/Parcel | queryParcelsByAddress() | NOI / Manual lookup |
| Lat/Lng | queryParcelsByAddress() | SWPPP Plans / Google Maps |
| Acreage | SWPPP Plans (DISTURBED) | NOI |
| Company Name | Contract | Email signature |
| Company Address | Contract | Web search |
| Primary Contact | Contract | Email sender |
| Start Date | User-specified | Contract date |
| End Date | User-specified | Start + 1 year |

**Note:** `queryParcelsByAddress()` in `src/lib/assessor.ts` queries the Maricopa County ArcGIS API to get APN and coordinates from a street address. If the address isn't found, continue without APN.

### Next Step

Once data is compiled, call the API:

```bash
curl -X POST http://localhost:47822/api/permits/create \
  -H "Content-Type: application/json" \
  -d '{ "flow": "new-company", "formData": { ... } }'
```

Or if PDFs are hosted at URLs, use the extraction endpoint:

```bash
curl -X POST http://localhost:47822/api/permits/extract \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "Desert Sky Apartments",
    "noi": [{ "name": "NOI.pdf", "url": "https://..." }],
    "swpppPlan": [{ "name": "SWPPP.pdf", "url": "https://..." }]
  }'
```

---

## 1. Create Permit

Three flows: `new-company`, `existing-company`, `renew`

### Trigger

```text
POST /api/permits/create
```

### Input Contract

```typescript
{
  flow: "new-company" | "existing-company" | "renew";
  companyName?: string;      // Required for existing-company, renew
  copyFromApp?: string;      // Source permit to copy from
  formData?: {
    permitContact?: { email, name, phone };
    applicant?: { entityType, companyName, address1, city, state, zip, phone, email };
    primaryContact?: { firstName, lastName, title, email, phone };
    project?: { name, description, startDate, endDate, latitude, longitude, address, city, parcel };
    categories?: { ... };  // Dust control measures
  }
}
```

### Required Fields by Flow

| Flow | Required |
|------|----------|
| `new-company` | `formData.applicant`, `formData.primaryContact`, `formData.project` |
| `existing-company` | `companyName`, `formData.primaryContact`, `formData.project` |
| `renew` | `companyName`, `copyFromApp`, `formData.project.endDate` |

### Process Flow

```sql
1. API receives request
   └── handleCreatePermit() validates input

2. Browser session started (if not active)
   └── Login to portal if needed

3. Navigate to "My Dust Apps"
   └── Portal home page

4. Click "New Application"
   └── Opens popup for app type selection

5. Select company (flow-dependent)
   ├── new-company: Enter all applicant details
   ├── existing-company: Select from dropdown
   └── renew: Select company + copy-from permit

6. Fill Page 1: Applicant Info
   └── Email, phone, property relationship, company details

7. Fill Page 2: Project Location
   └── Address, lat/long, parcel, dates, acreage

8. Fill Page 3: Project Details
   └── Primary contact, coordinator, demolition questions

9. Fill Page 4: Dust Control Measures
   └── Categories A-K with Primary/Contingency/None

10. Reach Page 5: Review & Submit
    └── STOPS HERE - does not auto-submit
```

### Data Storage

**Database:** `src/db/company-permits.sqlite`

```sql
INSERT INTO permits (
  id,              -- "D0063827" (from portal)
  project_name,
  company_id,
  company_name,
  status,          -- "Draft"
  previous_app_id, -- Set for renewals
  ...
)
```

### Output

```json
{
  "success": true,
  "applicationId": "D0063827",
  "flow": "existing-company",
  "reachedPage5": true
}
```

### What's Missing

- **No automatic email notification** after reaching Page 5
- **No way to specify who requested** (for follow-up emails)
- **Manual submission required** - someone must click Submit

### Suggested Enhancement

Add to input:
```typescript
{
  requesterEmail?: string;     // Who requested this permit
  notifyOnComplete?: string[]; // CC list for notifications
  autoSubmit?: boolean;        // Submit automatically (dangerous)
}
```

---

## 2. PDF Extraction

Extract FormData from NOI and SWPPP Plan PDFs.

### Trigger

```text
POST /api/permits/extract
```

### Input Contract

```typescript
{
  projectName: string;
  accountName?: string;
  noi: [{ name: string, url: string }];       // Required
  swpppPlan?: [{ name: string, url: string }];
}
```

### Process Flow

```text
1. Download PDFs to /tmp/

2. Extract NOI data
   ├── Jina API: PDF → markdown text
   └── Gemini 2.5-flash-lite: text → JSON
       Extracts: permitId, applicant info, site name, lat/long, acres

3. Extract SWPPP Plan data (if provided)
   ├── Same Jina → Gemini flow
   └── Extracts: dust control measures, site prep details

4. Company lookup
   ├── Search companies table by applicantName
   ├── Found: Link to existing company
   └── Not found: Flag companyInDatabase: false

5. Build FormData
   └── Map extracted fields to form structure
```

### Output

```json
{
  "success": true,
  "formData": {
    "permitContact": { "email": "...", "name": "...", "phone": "..." },
    "applicant": { "companyName": "...", "address1": "...", ... },
    "project": { "latitude": 33.45, "longitude": -112.07, ... },
    "companyInDatabase": true,
    "categories": { ... }
  }
}
```

### Typical Usage

```sql
1. POST /api/permits/extract  →  Get FormData from PDFs
2. Review/modify FormData (optional)
3. POST /api/permits/create   →  Create permit with FormData
```

### What's Missing

- **No combined endpoint** that does extract + create in one call
- **No validation** of extracted data quality
- **No notification** when extraction complete

---

## 3. Renew Permit

Create new application copying from existing permit.

### Trigger

```text
POST /api/permits/:id/renew
```

### Input Contract

```typescript
{
  companyName: string;  // Must match existing company exactly
}
```

### Process Flow

```sql
1. Lookup permit :id in database
   └── Get company info, previous form data

2. Browser navigates to "My Dust Apps"

3. Create new application with copy-from = :id
   └── Portal pre-fills all data from source permit

4. Fill pages 1-4 (minimal changes needed)
   └── Usually just update project end date

5. Reach Page 5: Review
   └── STOPS - does not auto-submit
```

### Data Storage

```sql
INSERT INTO permits (
  id = "D0063828",           -- New ID
  previous_app_id = "D0063827", -- Links to source
  status = "Draft",
  ...
)
-- Original permit status unchanged
```

### Output

```json
{
  "success": true,
  "applicationId": "D0063828",
  "timestamp": "2026-01-18T..."
}
```

### What's Missing

- **No automatic notification** to requester
- **No option to specify new end date** in request body
- **Original permit not updated** (might want to mark as "superseded")

---

## 4. Close Permit

Permanently close an active permit.

### Trigger

```text
POST /api/permits/:id/close
```

### Input Contract

```typescript
{
  reason?: string;  // Default: "Permit no longer needed"
}
```

### Process Flow

```text
1. Browser navigates to permit search

2. Search for permit :id

3. Open permit detail page

4. Scroll to bottom (page is 31k+ lines)

5. Click "Close Permit" button
   └── Opens popup window

6. Fill close dialog
   ├── Enter reason text
   └── Check 3 required checkboxes:
       - Gravel/paving stabilized
       - Buildings/improvements complete
       - Less than 0.1 acre unstabilized

7. Click "Close Permit" confirm button
   └── WARNING: Permanent action!
```

### Data Storage

```sql
UPDATE permits
SET status = "Closed",
    closed_date = NOW()
WHERE id = :id
```

### Output

```json
{
  "success": true,
  "message": "Permit D0063827 closed successfully",
  "timestamp": "2026-01-18T..."
}
```

### What's Missing

- **No confirmation step** - closes immediately
- **No email notification** that permit was closed
- **No audit log** of who requested closure

---

## 5. Delete Draft

Delete a draft application (not submitted permits).

### Trigger

```sql
DELETE /api/permits/:id        -- Single draft
DELETE /api/permits/drafts     -- All drafts
```

### Process Flow

```text
1. Navigate to "My Dust Apps"

2. Find draft in applications table

3. Click to open detail page

4. Click "Delete" button

5. Confirm deletion in popup
```

### Limitations

- **Only works on Draft status** - cannot delete submitted/active permits
- **Portal-only deletion** - database record not affected
- **No undo** - permanent action

---

## 6. Email Notifications

### Available Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/email/send` | Generic email with optional template |
| `POST /swppp-plan-notifications` | SWPPP-specific with permit variables |

### Current State

**Emails are NOT automatically triggered.** You must manually call the email endpoints after permit operations complete.

### Suggested Automation

After permit actions, trigger emails:

| Action | Email Template | Recipients |
|--------|---------------|------------|
| Permit reaches Page 5 | `permit-ready-for-review` | Requester + internal team |
| Permit submitted | `permit-submitted` | Requester + client contact |
| Permit issued | `dust-permit-issued` | Client + SWPPP contact |
| Permit renewed | `permit-renewed` | Client + SWPPP contact |
| Permit closed | `permit-closed` | Client + internal team |
| Permit expiring (30 days) | `permit-expiring-reminder` | Client + account manager |

### Who Gets Emails?

**Currently undefined.** Need to add to input:

```typescript
{
  // In create/renew/close requests:
  notifications?: {
    requesterEmail: string;      // Who initiated this action
    clientEmail?: string;        // End client
    ccList?: string[];           // Additional recipients
    skipNotification?: boolean;  // Opt out
  }
}
```

---

## 7. Input Sources

### Where Can Requests Come From?

| Source | Description | Status |
|--------|-------------|--------|
| **Direct API** | curl/fetch to localhost:47822 | Working |
| **n8n Webhook** | Workflow automation triggers | Needs integration |
| **Notion Webhook** | Project status changes | Needs integration |
| **CLI Tool** | Command-line interface | Not built |
| **Dashboard UI** | Web interface buttons | Partial (view only) |

### n8n Integration Pattern

```sql
Notion "Ready for Permit" status change
    ↓
n8n receives webhook
    ↓
n8n fetches PDF URLs from Notion
    ↓
POST /api/permits/extract (get FormData)
    ↓
POST /api/permits/create (create permit)
    ↓
POST /api/email/send (notify requester)
    ↓
Update Notion with permit ID
```

---

## 8. Database Schema

### companies

```sql
id TEXT PRIMARY KEY,        -- "CMP000001"
name TEXT UNIQUE,           -- "Sundt Construction"
entity_type TEXT,           -- "6" (LLC)
address1, address2, city, state, zip,
phone, email,
created_at, updated_at
```

### permits

```sql
id TEXT PRIMARY KEY,        -- "D0063827"
project_name TEXT,
company_id TEXT,            -- FK to companies
company_name TEXT,          -- Denormalized for display
status TEXT,                -- Draft|Submitted|Active|Closed|...
submitted_date, effective_date, expiration_date, closed_date,
previous_app_id TEXT,       -- For renewal chains
project_start_date, project_end_date,
address, city, parcel,
is_block_permit, is_accelerated,
created_at, updated_at
```

### jobs (automation queue)

```sql
id INTEGER PRIMARY KEY,
type TEXT,                  -- create|renew|close
permit_id, company_id,
payload TEXT,               -- JSON input
status TEXT,                -- pending|running|done|failed
result TEXT,                -- JSON output
created_at, started_at, completed_at
```

---

## 9. Timing

| Operation | Typical Duration |
|-----------|------------------|
| PDF Extraction | 30-60 seconds |
| Create Permit (pages 1-5) | 2-5 minutes |
| Renew Permit | 2-5 minutes |
| Close Permit | 1-2 minutes |
| Delete Draft | 30-60 seconds |
| Send Email | 1-5 seconds |

Browser automation is slow due to:
- Portal page load times
- Dynamic content lazy loading
- Required waits between actions

---

## 10. Gap Analysis

### Missing Features

| Feature | Priority | Notes |
|---------|----------|-------|
| Auto-email on permit actions | High | Wire up handlers to send notifications |
| Requester tracking | High | Add `requesterEmail` to all inputs |
| Combined extract+create | Medium | Single endpoint for PDF→Permit |
| Expiration reminders | Medium | Cron job to check expiring permits |
| Revise permit | Medium | Not implemented |
| CLI tool | Low | For manual operations |
| Auto-submit option | Low | Dangerous - needs safeguards |

### Integration Gaps

| Gap | Description |
|-----|-------------|
| n8n not connected | Webhooks exist but not wired to n8n |
| No Notion sync | Can't update Notion with permit status |
| No error recovery | Failed jobs require manual retry |
| No progress tracking | Can't see automation progress in real-time |

---

## 11. Security Notes

- **Browser session persists** - logged into portal continuously
- **Credentials in .env** - portal login, Azure AD for email
- **No rate limiting** - could overload portal
- **No input sanitization** - trust input from callers
- **No authentication** on API endpoints - localhost only

For production:
- Add API key authentication
- Rate limit requests
- Validate all inputs
- Log all actions for audit
