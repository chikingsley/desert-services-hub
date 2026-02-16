# Inbox Triage Patterns

Living document for email processing workflows. Updated as patterns emerge.

## Core Workflow

```text
User: "next"
→ Fetch next email from queue
→ Extract identifiers (project, company, sender)
→ Parallel context gathering:
   - Org-wide email search
   - Monday (ESTIMATING, PROJECTS, LEADS, CONTRACTORS)
   - Notion (projects, tasks)
   - Attachments (download + classify)
→ Present context bundle
→ Suggest actions
→ User: approve / modify / skip / drill
```css

---

## Email Types

### CONTRACT_RECEIVED

**Detection:**

- Subject contains: subcontract, contract, agreement
- Has PDF attachment
- From: GC domain (not DocuSign)

**Workflow:**

1. Download and classify PDF
2. Extract contract details (amount, project, parties)
3. Search Monday ESTIMATING for matching estimate
4. Run reconciliation if estimate found
5. Search/create Notion project
6. Suggest tasks: Contract Review, Submit COI, Schedule of Values

**Example subjects:**

- "Villas on McQueen - Subcontract"
- "Desert Services Subcontract Agreement"
- "Contract for Final Cleaning"

---

### CONTRACT_SIGNED

**Detection:**

- Subject contains: signed, executed, completed, fully executed
- OR from: @docusign.com with "completed" in subject
- Has PDF attachment or completion notification

**Workflow:**

1. Find existing Notion project
2. Mark "Contract Review" task as Done
3. Download signed document
4. File to SharePoint (if configured)
5. Forward to <contracts@desertservices.net>
6. Create compliance tasks if not exist

**Example subjects:**

- "Completed: Subcontract Agreement"
- "Fully Executed - Villas on McQueen"
- "Signed contract attached"

---

### DOCUSIGN_PENDING

**Detection:**

- From: @docusign.com
- Subject contains: review, sign, signature requested
- Body contains signing link (no PDF attached)

**Workflow:**

1. Extract project name from subject
2. Find Monday estimate / Notion project
3. Show context for review decision
4. Flag: "Document requires manual download or signing"

**Edge case:** Cannot auto-fetch DocuSign docs without browser auth

---

### QUOTE_REQUEST

**Detection:**

- Subject contains: quote, bid, RFP, scope, proposal request
- Often has attachments (plans, specs)

**Workflow:**

1. Extract project name, GC name
2. Check Monday ESTIMATING for existing estimate
3. If none: suggest "Create estimate in Monday"
4. Download attachments for estimating folder

**Example subjects:**

- "Request for Quote - Sunset Park"
- "Bid Invitation: City Hall Renovation"
- "Please provide pricing for..."

---

### INVOICE_PAYAPP

**Detection:**

- Subject contains: invoice, pay app, payment application, billing
- Often has PDF attachment

**Workflow:**

1. Extract project name, amount
2. Match to Monday PROJECT or Notion project
3. Create payment task or flag for accounting

---

### PERMIT_ISSUED

**Detection:**

- From: city/county domain (@phoenix.gov, @maricopa.gov, etc.)
- Subject contains: permit, issued, approved, application
- Contains permit number pattern

**Workflow:**

1. Extract permit number, project name
2. Find Notion project
3. Update permit status field
4. File document to project folder

---

### RFI

**Detection:**

- Subject contains: RFI, request for information
- Often numbered (RFI #001)

**Workflow:**

1. Extract RFI number, project name
2. Find Notion project
3. Create RFI response task
4. Set due date if specified

---

### GENERAL

**Detection:**

- None of above patterns match

**Workflow:**

1. Show full context (related emails, Monday, Notion)
2. Manual triage - user decides action

---

## Context Sources

### Email Search

- Search org-wide by: sender domain, project name keywords, subject keywords
- Group by thread/date
- Show most recent first

### Monday Boards

| Board | ID | Use |
|-------|-----|-----|
| ESTIMATING | 7943937851 | Match quotes, contracts to estimates |
| PROJECTS | 8692330900 | Active project lookup |
| LEADS | (check types.ts) | New inquiries |
| CONTRACTORS | (check types.ts) | GC lookup |
| CONTACTS | (check types.ts) | Person lookup |

### Notion

- Projects database: project status, tasks
- Tasks database: linked to projects

### Attachments

- PDFs: classify via contract service or pdf triage
- Links: SharePoint (can fetch), DocuSign (flag), Drive (flag)

---

## Edge Cases Encountered

### DocuSign Links

- **Problem:** Contract in DocuSign link, not attached
- **Solution:** Flag for manual download, or implement browser fetch
- **Status:** Manual for now

### $580 Under Estimate (Villas on McQueen)

- **Problem:** Contract lower than estimate, no line items to reconcile
- **Solution:** Flag as "amount variance" for acknowledgment
- **Pattern:** When contract < estimate with no breakdown, flag but proceed

---

## Commands (Future CLI)

```bash
bun run inbox:next            # Get next email with context
bun run inbox:status          # Show progress
bun run inbox:process <id>    # Process specific email
bun run inbox:skip <id>       # Mark as skipped
bun run inbox:search <query>  # Find specific email
```

---

## Learnings

### Deep Context is Critical

**Problem:** Shallow email searches miss the real project name and context.
**Example:** "SHSL - Litchfield Road - SWPPP NOA" → Real name is "Sun Health La Loma"
**Solution:** Always do:

1. Get full thread (not just single email)
2. Search ALL org mailboxes for related emails
3. Check internal-contracts group
4. Download and read attachments (contract PDFs have real names)
5. Search Monday with multiple name variations

### DocuSign "Completed" ≠ Documents Sent

**Problem:** "Completed: Please DocuSign: Mandatory Docs" looks like task is done.
**Reality:** DS signed the DocuSign form, but actual certificates may not have been sent.
**Pattern:** When you see DocuSign completion, verify the underlying deliverable was actually sent.

### Umbrella Projects Have Multiple Scopes

**Example:** Sun Health La Loma has:

- Litchfield Road SWPPP (Sundt) - $11,459
- Resident Gathering Space (PWI) - separate permit
- PWI 25-014 - separate estimate
- Fire Pump - separate scope
**Pattern:** One project name can have multiple GCs, contracts, permits.

### Contract Status States

| Status | Meaning |
|--------|---------|
| READY TO SIGN | DS needs to sign |
| DS SIGNED | DS signed, awaiting GC countersignature |
| FULLY EXECUTED | Both parties signed |
| AWAITING PRIME | GC waiting on their contract with owner |

### Internal-Contracts Email Format

Must include:

- Project name, address, contract type, value, date
- Service lines (SWPPP, Dust Control, Track Out, etc.)
- Key dates (NTP, Substantial Completion)
- Contacts (PM, Accounting, Superintendent, Contract Admin)
- Critical requirements (training, certifications)
- Safety requirements
- Contract details (retention, certified payroll, bonding)
- Billing & payment info
- Budget/scope reconciliation with line items
- Attachments: contract PDF, estimate PDF

### Permit Email Requirements

Need from permit notification:

- Application #
- Facility ID (permit #)
- Site address
- Acreage
- Issue date
- Expiration date
- Client contact name (lookup from project)

### Scope Breakdown Sources

1. Monday estimate subitems (if populated)
2. Estimate PDF (always has line items)
3. Contract PDF (if itemized)
4. Award email (may have summary)

---

## Session Log

### 2026-01-12

- Initial pattern design
- Email types defined: CONTRACT_RECEIVED, CONTRACT_SIGNED, DOCUSIGN_PENDING, QUOTE_REQUEST, INVOICE_PAYAPP, PERMIT_ISSUED, RFI, GENERAL
- Starting inbox triage workflow

### 2026-01-12 (continued)

- Processed: SHSL - Litchfield Road - SWPPP NOA (Sun Health La Loma)
- Learned: Need deep context gathering before suggesting actions
- Found: Multiple scopes under one umbrella project
- Fixed: Notion project name typo (La Roma → La Loma)
- Created: Tasks for permit revision, insurance verification, countersignature
- Drafted: Internal-contracts email (needs scope breakdown)
- Blocked: Dust permit template needs permit PDF attachment + acreage/expiration

### 2026-01-12 (session 2)

- Completed: Sun Health La Loma internal-contracts email with full scope breakdown
- Added: High Pressure Washing to pricing catalog ($130/hr)
- Built: `send-template` CLI command for custom HTML emails
- Drafted: Wesley response to Yulissa (estimate clarifications)

**New Learnings:**

#### SWPPP Reserve vs SWPPP Plan

- **SWPPP Reserve**: BMPs only (filter sock, inlet protection, rock entrance, etc.)
- **SWPPP Plan**: The actual plan document - separate line item, often $2,500
- **Key indicator**: Estimates labeled "SWPPP BUDGETING ESTIMATE (NO SWPPP PLAN)" mean the plan is NOT included
- When client asks about SWPPP Plan, check if estimate header says "NO SWPPP PLAN"

#### Info-Only Line Items

- Some line items appear on estimates but are NOT in the total
- Example: Dust Permit ($1,630) listed as "INFO ONLY" - not part of estimate total
- Always verify which items are actually summed vs displayed for reference
- Read the fine print on estimate PDFs carefully

#### Contract Value Matching

- When contract value exactly matches estimate, variance = $0
- No reconciliation needed when contract = estimate
- Only flag variances when contract differs from estimate

#### Estimate Response Patterns

When responding to client questions about estimates:

1. Check estimate header for scope limitations (e.g., "NO SWPPP PLAN")
2. Verify what's included vs what's info-only
3. Calculate revised totals when removing/adding items
4. Clearly separate "Included" from "Optional Add-Ons"
5. Use tables for clear before/after comparisons
