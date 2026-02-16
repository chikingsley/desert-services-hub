# PM Daily Workflow

What you actually do when work hits your inbox.

- --

## System Split

| System | What Lives There |
|--------|------------------|
| **Monday** | Estimates, Leads, Sales follow-up, Inspections |
| **Notion** | Projects (your domain), Accounts, Contracts, Permits |
| **SharePoint** | Documents (PDFs, plans, contracts) |
| **QuickBooks** | Financial records |

* *Rule**: Once something becomes a Project, it lives in Notion. Everything before that (estimates, leads) stays in Monday.

- --

## Entry Point: Identify What Landed

Email arrives. First question: **What is this?**

```text
┌─────────────────────────────────────────────────────────────┐
│                     EMAIL ARRIVES                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │   What type of email?   │
              └─────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┬─────────────────────┐
        ▼                   ▼                   ▼                     ▼
   CONTRACT/LOI      DUST PERMIT REQ      SWPPP PLAN REQ        BMP INSTALL REQ
   (DocuSign, PDF)   ("need permit")      ("need SWPPP")        ("ready to go")
        │                   │                   │                     │
        ▼                   ▼                   ▼                     ▼
   [FLOW A]            [FLOW B]            [FLOW C]              [FLOW D]

```text

- --

## Common First Steps (All Flows)

Before anything else, every entry point starts the same:

### Step 1: Find the Estimate

Search Monday (Estimating board) by:

- Project name
- Account name
- Address
- Fuzzy match if needed

__If found__: Note the estimate ID and values.
__If NOT found__: Flag it—why are we getting work without an estimate?

### Step 2: Does Project Exist in Notion?

Search Notion Projects by:

- Project name
- Account
- Address

__If exists__: Open it, continue to the specific flow.
__If NOT exists__: Create new Project in Notion (see below).

### Step 3: Create Project (if new)

In Notion, create Project with:

- [ ] Name (from contract/email)
- [ ] Address
- [ ] Account (link or create)
- [ ] Link to Monday estimate
- [ ] Status = appropriate entry status

### Step 4: File the Email

- PDF print of email → SharePoint: `/Projects/[Account]/[Project]/`
- This is your audit trail

- --

## FLOW A: Contract/LOI Received

__Trigger__: DocuSign notification or contract PDF attached to email.

```text
CONTRACT EMAIL
      │
      ▼
[Common Steps 1-4]
      │
      ▼
┌─────────────────────────────────────┐
│  A1. Download contract PDF          │
│      → Save to SharePoint           │
│      → Link in Notion project       │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│  A2. Reconcile vs Estimate          │
│      - Compare total amounts        │
│      - Compare line items           │
│      - Check retention %            │
│      - Note any scope changes       │
│      → Mark "Reconciled" in Notion  │
└─────────────────────────────────────┘
      │
      ├── MATCH? ──────────────────────┐
      │                                │
      ▼ NO                             ▼ YES
┌──────────────────────┐    ┌──────────────────────┐
│ Flag discrepancy     │    │ A3. Kickoff          │
│ → Note variance      │    │ → Request docs (GC)  │
│ → Contact estimator  │    │ → Send docs (us)     │
│ → Resolve before     │    │ → Collect contacts   │
│   proceeding         │    │ → Setup billing      │
└──────────────────────┘    └──────────────────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │ A4. Handoff          │
                            │ → Verify checklist   │
                            │ → Signoffs           │
                            │ → Notify Delivery    │
                            │ → Status = Handed Off│
                            └──────────────────────┘

```text

### A1. Download & File Contract

- [ ] Download contract PDF from email/DocuSign
- [ ] Save to SharePoint: `/Projects/[Account]/[Project]/Contracts/`
- [ ] Link URL in Notion project (Contract PDF Link field)
- [ ] Update Status → "Contract Received"

### A2. Reconcile

Open contract and estimate side by side:

- [ ] Total contract value matches estimate? (Note variance if not)
- [ ] Line items match? (quantities, pricing)
- [ ] Retention % noted?
- [ ] Scope inclusions/exclusions match?
- [ ] Any red flags? (missing items, added items, changed terms)

__If discrepancy__:

- Note variance in Notion (Recon Notes field)
- Contact estimator if scope questions
- Do NOT proceed until resolved

__If match__:

- [ ] Mark "Reconciled" checkbox in Notion
- [ ] Update Status → "Validated"

### A3. Kickoff (Full Data Collection)

__Request from GC__:

- [ ] Schedule of Values
- [ ] Site plans
- [ ] SWPPP plan (if applicable)
- [ ] NOI with ADEQ number (if SWPPP)
- [ ] Dust permit info (who pulled it)
- [ ] Gate codes, site hours
- [ ] Badge/credential requirements
- [ ] Safety orientation requirements
- [ ] Billing contact info
- [ ] PO number

__Send to GC__:

- [ ] COI (Certificate of Insurance)
- [ ] W-9
- [ ] Contractor license
- [ ] EMR letter
- [ ] Signed subcontract

__Collect in Notion__:

- [ ] PM contact (name, email, phone)
- [ ] Superintendent contact
- [ ] Billing contact
- [ ] Site access instructions
- [ ] Water source (if water truck work)

__Billing Setup__:

- [ ] PO number obtained
- [ ] Billing platform confirmed (Textura/Procore/GC Pay/Premier/email)
- [ ] Billing window noted
- [ ] Certified payroll required? (Y/N, which platform)
- [ ] Lien waiver type

### A4. Handoff to Delivery

__Pre-conditions__ (all must be true):

- [ ] Contract reconciled
- [ ] Billing setup complete
- [ ] Site access confirmed
- [ ] Start date confirmed in writing
- [ ] All docs in SharePoint

__If SWPPP__:

- [ ] NOI verified
- [ ] SWPPP plan received
- [ ] Dust permit status known

__Signoffs__:

- [ ] Operations sign-off
- [ ] PM sign-off

__Then__:

- [ ] Update Status → "Handed Off"
- [ ] Notify Delivery team
- [ ] Log handoff date

- --

## FLOW B: Dust Permit Request

__Trigger__: Email "we need a dust permit for [project]"

```text
DUST PERMIT REQUEST
      │
      ▼
[Common Steps 1-4]
      │
      ▼
┌─────────────────────────────────────┐
│  B1. Check prerequisites            │
│      → Grading/civil plan?          │
│      → Site address confirmed?      │
│      → Acreage known?               │
└─────────────────────────────────────┘
      │
      ├── HAVE EVERYTHING? ────────────┐
      │                                │
      ▼ NO                             ▼ YES
┌──────────────────────┐    ┌──────────────────────┐
│ Request missing info │    │ B2. Submit permit    │
│ from customer        │    │     application      │
└──────────────────────┘    └──────────────────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │ B3. Track permit     │
                            │ → Awaiting approval  │
                            │ → Approved/Issued    │
                            │ → Email customer     │
                            └──────────────────────┘

```text

### B1. Check Prerequisites

- [ ] Do we have grading/civil plan? (need for acreage calculation)
- [ ] Site address confirmed?
- [ ] Acreage/disturbance area known?
- [ ] Customer contact for permit questions?

__If missing__: Request from customer before proceeding.

### B2. Submit Permit Application

- [ ] Complete permit application (Maricopa County portal or relevant jurisdiction)
- [ ] Upload required documents
- [ ] Pay fees (if applicable)
- [ ] Note application number in Notion
- [ ] Update Status → "Permit Submitted"

### B3. Track & Issue

- [ ] Monitor for approval
- [ ] When approved: Download permit PDF
- [ ] Save to SharePoint: `/Projects/[Account]/[Project]/Permits/`
- [ ] Link in Notion
- [ ] Email permit to customer with confirmation
- [ ] Update Status → "Permit Issued"

__Note__: May or may not have contract yet. If no contract, project stays minimal until contract arrives (then merge into Flow A).

- --

## FLOW C: SWPPP Plan Request

__Trigger__: Email "we need a SWPPP plan for [project]"

```text
SWPPP PLAN REQUEST
      │
      ▼
[Common Steps 1-4]
      │
      ▼
┌─────────────────────────────────────┐
│  C1. Check prerequisites            │
│      → Civil/grading drawings?      │
│      → Site survey?                 │
│      → NOI status?                  │
└─────────────────────────────────────┘
      │
      ├── HAVE DRAWINGS? ──────────────┐
      │                                │
      ▼ NO                             ▼ YES
┌──────────────────────┐    ┌──────────────────────┐
│ Request drawings     │    │ C2. Send to engineer │
│ from customer        │    └──────────────────────┘
└──────────────────────┘               │
                                       ▼
                            ┌──────────────────────┐
                            │ C3. Track engineering│
                            │ → In progress        │
                            │ → Review draft       │
                            │ → Final received     │
                            └──────────────────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │ C4. Deliver to       │
                            │     customer         │
                            │ → Ready for install  │
                            └──────────────────────┘

```text

### C1. Check Prerequisites

- [ ] Civil/grading drawings received?
- [ ] Site survey available?
- [ ] NOI status (do they have one, do we need to file)?

### C2. Send to Engineering Firm

- [ ] Package drawings and project info
- [ ] Send to engineering firm
- [ ] Note submission date
- [ ] Update Status → "Engineering In Progress"

### C3. Track Engineering

- [ ] Monitor progress with engineer
- [ ] Review draft when received
- [ ] Request revisions if needed
- [ ] When final received: Download SWPPP PDF
- [ ] Save to SharePoint: `/Projects/[Account]/[Project]/SWPPP/`
- [ ] Link in Notion

### C4. Deliver & Ready

- [ ] Email SWPPP to customer
- [ ] Update Status → "Ready for Installation"
- [ ] If installation scope: Merge into handoff flow

- --

## FLOW D: BMP Installation Request

__Trigger__: Email "ready to install" or "need to mobilize"

```text
BMP INSTALL REQUEST
      │
      ▼
[Common Steps 1-4]
      │
      ▼
┌─────────────────────────────────────┐
│  D1. Verify project exists          │
│      → Should already have project  │
│      → If not, create minimal       │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│  D2. Pre-mobilization checklist     │
│      → Site ready?                  │
│      → Access confirmed?            │
│      → Materials ready?             │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│  D3. Handoff to Delivery            │
│      → Same as Flow A handoff       │
└─────────────────────────────────────┘

```text

### D1. Verify Project

Project should already exist from earlier flow. If not:

- [ ] Create minimal project record
- [ ] Flag for contract/estimate follow-up
- [ ] Get email approval to proceed (billing protection)

### D2. Pre-Mobilization Checklist

__Ask only if NOT our scope__:

- [ ] Grading done?
- [ ] Temp fence installed?
- [ ] Inlets installed?
- [ ] Rock entrance prepped?

__Always confirm__:

- [ ] Site access (gate code, hours)
- [ ] Start date confirmed in writing
- [ ] Materials ready/ordered

### D3. Handoff

Same as Flow A, Step A4.

- --

## Daily Routine

### Morning

1. __Check email__ - Identify new work (which flow?)
2. __Check Notion dashboard__ - What's waiting on me?

    - Projects needing docs
    - Permits pending
    - Handoffs ready
3. __Check Monday__ - Any estimates won? (triggers Flow A)

### During Day

- Process emails through appropriate flow
- Update Notion as you complete steps
- File documents to SharePoint immediately (don't batch)

### End of Day

- All emails processed or noted for tomorrow
- All docs filed
- Notion statuses current

- --

## Quick Reference: Where Things Go

| Thing | Where | Field/Folder |
|-------|-------|--------------|
| Contract PDF | SharePoint | `/Projects/[Account]/[Project]/Contracts/` |
| Contract link | Notion | Contract PDF Link |
| Permit PDF | SharePoint | `/Projects/[Account]/[Project]/Permits/` |
| Permit link | Notion | Dust Permit Link |
| SWPPP PDF | SharePoint | `/Projects/[Account]/[Project]/SWPPP/` |
| SWPPP link | Notion | SWPPP Link |
| Email audit | SharePoint | `/Projects/[Account]/[Project]/Correspondence/` |
| Estimate | Monday | Estimating board (stays there) |
| Project record | Notion | Projects database |
| Account record | Notion | Accounts database |

- --

## Status Flow

```text
[No Project Yet]
      │
      ▼ (Common Steps)
CREATED ──────────────────────────────────────────────────────────┐
      │                                                           │
      ├── Flow A: CONTRACT_RECEIVED → RECONCILED → KICKOFF →     │
      │                                                           │
      ├── Flow B: PERMIT_SUBMITTED → PERMIT_ISSUED →             │
      │                                                           │
      ├── Flow C: ENGINEERING_IN_PROGRESS → READY_FOR_INSTALL → ─┤
      │                                                           │
      └── Flow D: ────────────────────────────────────────────────┤
                                                                  │
                                                                  ▼
                                              BILLING_SETUP → READY_FOR_HANDOFF
                                                                  │
                                                                  ▼
                                              HANDED_OFF → IN_PRODUCTION → COMPLETE

```text

- --

## What's Not Covered Here

- __Inspection workflow__ - See inspection stories (that's Delivery's flow)
- __Billing workflow__ - See billing stories (that's Billing's flow)
- __Sales workflow__ - See sales stories (that's Monday-based)

This doc is PM's day-to-day for project intake and setup.
