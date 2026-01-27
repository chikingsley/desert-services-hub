# Desert Services Automation & Process Improvement Plan

* Last Updated: December 2025*
* Owner: Chi Ejimofor, Project Coordinator*

- --

## Executive Summary

This document outlines a phased approach to automating and improving processes across the Desert Services job lifecycle—from bid intake through project closeout and billing. The goal is to create visibility, reduce manual friction, and ensure nothing falls through the cracks.

* *Key Principles:**
* Start clean. Don't migrate junk data.
* Get buy-in before implementing
* Build alongside existing workflows, then transition
* Automate what's repeatable; keep humans on judgment calls

## Design Principles

* *Relationship-Based, Not Funnel-Based**
Construction is a relationship business. Our systems should reflect this reality, not force-fit a high-volume transactional sales funnel.
* **Account Managers over Sales Reps:** Our people manage long-term relationships and site visit calendars, not just "deals" in a pipeline.
* **Maps over Lists:** Geography matters. Site visits are driven by location and active projects, not just lead status.
* **Long-Term Context:** We need to know the history of a site and a contact across multiple projects, not just the current transaction.

- --

## System Architecture

| Function | Primary System | Notes |
|----------|----------------|-------|
| Sales/Estimating | Monday.com | Current state; long-term may move to Pipedrive or dedicated CRM |
| Project Delivery | Notion | Projects + Scope (Schedule of Values) databases |
| Dispatch | CRO Software | Currently only PJ and Roll-off; expand to all service lines |
| File Storage | SharePoint | Source of truth for project files |
| Automation | n8n / Power Automate | Workflow orchestration |
| AI Processing | Gemini Pro / Stagehand V3 | Document analysis, form filling |

- --

## Phase 1: Foundation (Weeks 1-2)

### 1.1 Notion Schema Design

* *Contacts Database** (for reuse across projects)
| Field | Type | Notes |
|-------|------|-------|
| Name | Title | Contact name |
| Company | Relation | Link to Customers database |
| Role | Select | Site Contact, Billing, PM, Super, etc. |
| Phone | Phone | |
| Email | Email | |
| Notes | Text | |

* *Projects Database**
| Field | Type | Notes |
|-------|------|-------|
| Project Name | Title | Use NOI name as canonical |
| Job Number | Text | For billing reference |
| PO Number | Text | If provided by customer |
| Customer | Relation | Link to Customers database |
| Site Contact | Relation | Link to Contacts database |
| Billing Contact | Relation | Link to Contacts database |
| Billing Method | Select | Invoice, PO, Net 30, etc. |
| Address | Place | Notion's Place field (maps integration) |
| Cross Streets | Text | For street sweeping (if no address) |
| Coordinates | Text | Multiple coords if needed |
| Project Status | Select | Estimating, Project Initiation, Active, On Hold, Closed |
| Bid Outcome | Select | Won, Lost, Partial |
| Linked Scopes | Relation | To Scope Items |
| Linked Tasks | Relation | To Tasks database |
| NOI Document | Files | Attach NOI directly |
| Contract | Files | Attach contract directly |
| Notes | Text | |

* *Project Status Options:**
* **Estimating** - Bid is out, waiting to hear (lives in Monday, may not be in Notion yet)
* **Project Initiation** - Won, setting up the project (getting NOI, site contact, etc.)
* **Active** - Work in progress
* **On Hold** - Paused for some reason
* **Closed** - Done or dead

* *Bid Outcome Options:**
* **Won** - Got the main bid (SWPPP)
* **Lost** - Didn't get main bid
* **Partial** - Got some services but not others

* *When does a project come to Notion?**
* When we have actual work to deliver (won something)
* Projects that are fully lost stay in Monday for Sales to manage
* If we lose SWPPP but win porta johns → create in Notion, Bid Outcome = Partial, SOV shows what we won

* Note: Dust permit, narrative, SWPPP plan acquisition, etc. are tracked as Scope Items if we're delivering them, or as Tasks if we need to obtain them from others.*

* *Scope Items (Schedule of Values) Database**
| Field | Type | Notes |
|-------|------|-------|
| Line Item | Title | Description of scope item |
| Project | Relation | Link to Projects |
| Service Line | Select | SWPPP, Temp Fence, Roll-off, PJ, Water Truck, Street Sweeping |
| Quantity | Number | |
| Unit | Select | EA, LF, Month, Haul, etc. |
| Unit Price | Number | |
| Total | Formula | Quantity × Unit Price |
| Status | Select | New, Scheduled, In Progress, Submitted, Complete, On Hold |
| Waiting On | Select | Us, Customer, Third Party, N/A |
| Completion Date | Date | When marked complete |
| Evidence | Files | Work complete attachment |
| Change Order | Checkbox | Flag if outside original SOV |
| Notes | Text | |

* Status definitions:*
* **New** - Just added, needs review/scheduling
* **Scheduled** - Has a date/plan to execute
* **In Progress** - Work is actively happening
* **Submitted** - We did our part, waiting on external (permit approval, sign-off, etc.)
* **Complete** - Done, ready to bill
* **On Hold** - Paused for some reason

* *Tasks Database** (for tracking blockers and follow-ups)
| Field | Type | Notes |
|-------|------|-------|
| Task | Title | Human-readable: "[Action] - [Project Name]" |
| Project | Relation | Link to Projects |
| Scope Item | Relation | Optional - link to specific line item |
| Type | Select | Get NOI, Get Site Contact, Get SWPPP Plan, File Permit, Pre-Qual, Contract Reconciliation, Follow Up, Sign Order, Change Order, QuickBooks Sync, Other |
| Due Date | Date | When it should be done |
| Status | Select | To Do, In Progress, Done, Blocked |
| Waiting On | Select | Us, Customer, Third Party |
| Assigned To | Person | Who owns this |
| Notes | Text | Audit trail for follow-ups |

* *Task Naming Convention:** `[Action] - [Project Name]`
* "Get NOI - Chandler Heights Phase 2"
* "File Dust Permit - Mesa Commerce Park"
* "Contract Reconciliation - Goodyear Industrial"
* "Change Order Approval - Signal Butte - Add'l Silt Fence"

* *When to Create Tasks:**
* Something is blocking progress and needs follow-up
* Something has a specific due date that matters
* You're waiting on someone and need to remember to chase it

* *When NOT to Create Tasks:**
* Normal workflow (scope item moves through statuses)
* Things that are just "in progress" with no blocker
* Routine work already visible in the SOV

* Chi lives in Tasks for daily standup. Everyone else lives in their lane. Tasks is the "what's blocked or due" lens across all projects.*

- --

### 1.2 How the System Works (User Stories)

* *User Story 1: Chi at Daily Standup**

Without Tasks database:

* Open each project one by one
* Scan SOV for anything stuck
* Try to remember what you were waiting on
* Hope you don't miss something

With Tasks database:

* Open "My Open Tasks" view (Status ≠ Done, sorted by Due Date)
* See at a glance:
  * "Get NOI - Chandler Heights Phase 2" - Due today - Waiting on: Customer
  * "File Dust Permit - Mesa Commerce Park" - Due tomorrow - Waiting on: Us
  * "Contract Reconciliation - Goodyear Industrial" - Due Friday - Waiting on: Us
* Work through the list, update statuses, mark complete
* Done in 5 minutes

* *Where Chi lives:** Tasks is the daily operating view. SOV is the record you update. Projects is the container.

- --

* *User Story 2: New Project Comes In**

1. Create Project in Notion (name, customer, address, etc.)
2. Attach NOI document (if we have it)
3. Attach Contract (if we have it)
4. Create SOV line items from the estimate/contract

Create Tasks only if something is missing:

* No NOI? → Task: "Get NOI - [Project]" / Due: 3 days
* No site contact? → Task: "Get Site Contact - [Project]" / Due: 3 days
* Need to file dust permit? → Task: "File Dust Permit - [Project]" / Due: [based on start]

- --

* *User Story 3: Field Supervisor Requests Change Order**

Old way (what we're fixing):

* Supervisor calls it in
* Someone writes it on a sticky note
* Maybe it gets billed, maybe not

New way:

1. Supervisor submits request (form, text, or call to Chi)
2. Chi creates Task: "Change Order Approval - [Project] - [Description]"
3. Chi checks approval checklist:
    * [ ] Billing info confirmed
    * [ ] **Evidence obtained** (signed quote, signed estimate, or email approval)
    * [ ] Site contact confirmed
4. Once approved AND evidence attached:
    * Create Scope Item with Change Order flag ✓
    * Attach evidence (signed doc) to Scope Item
    * Mark Task as Done
5. Work proceeds, gets billed

* *Key:** The Scope Item doesn't get created until you have the signed document. The Task tracks the approval process. The Scope Item is the auditable record.

- --

* *User Story 4: Something is Stuck for Two Weeks**

Chi asked customer for NOI two weeks ago. No response.

Without Tasks:

* Chi might forget
* Project sits there, dust permit can't be filed

With Tasks:

* Task: "Get NOI - Chandler Heights Phase 2"
* Status: In Progress
* Waiting On: Customer
* Due Date: [overdue]
* Notes: "Emailed John 11/15, no response. Called 11/22, left VM."

The Task is the audit trail. When Chi sees it overdue + waiting on customer, he knows to escalate.

- --

* *User Story 5: Weekly QuickBooks Sync**

Every Friday by 6 PM, all active projects must have their SOV reflected in QuickBooks.

Recurring Task (auto-generate or manual):

* Task: "QuickBooks Sync - Week of [Date]"
* Type: QuickBooks Sync
* Due: Friday 6 PM
* Notes: Checklist of active projects to verify

- --

* *Who Lives Where:**

| Person | Primary View | Uses Tasks For |
|--------|--------------|----------------|
| Chi (PM) | Tasks (Open) | Daily standup - "What's blocked or due?" |
| Estimator | Monday.com | Doesn't touch Notion Tasks |
| VP (SWPPP) | Projects (SWPPP only) | "What permits are pending?" |
| Billing (Kendra) | SOV (Ready to Bill) | Doesn't create tasks, consumes SOV |
| Field Supervisors | Don't use Notion | Submit change order requests via form/text |

* *Chi is the only one who really lives in Tasks.** Everyone else is in their lane.

* *Action Items:**
* [ ] Create Contacts database in Notion
* [ ] Create Projects database in Notion
* [ ] Create Scope Items database in Notion
* [ ] Create Tasks database in Notion
* [ ] Create linked views:
  * SOV filtered by project
  * Tasks filtered by project
  * "My Open Tasks" view (due this week)
  * "Blocked" view (waiting on customer/third party)
* [ ] Define status options with team
* [ ] Get agreement: "Nothing goes in without following the standard"

- --

### 1.2 Estimating Intake Automation

* *Current Pain:**
* Estimator manually identifies drawings (SWPPP, civil, erosion, dust control)
* Has to download files, open Bluebeam, open QuickBooks/Excel
* 3,000 deals stuck in "sent" status

* *Solution:**
* Poll SharePoint for new files in project folders
* Run Gemini Pro on drawings → identify, rename, categorize
* Update Monday item with attachments and AI summary

* *n8n Workflow:**

```text
Trigger: SharePoint folder change (new project folder created)
    ↓
Action: List files in folder
    ↓
Action: For each PDF → send to Gemini Pro with scope discovery prompt
    ↓
Action: Rename files based on AI classification
Action: Move to categorized subfolders (SWPPP, Civil, Dust Control, Other)
    ↓
Action: Update Monday item with:
  - Attached categorized files
  - AI summary: "Found: SWPPP Plan (3 pages), Civil Drawings (12 pages), Dust Control Plan (2 pages)"
  - Checklist: Has SWPPP? ✓ Has Dust Plan? ✓ Has Civil? ✓

```text

* *Gemini Prompt (Draft):**

```text
You are reviewing civil construction drawings for a site services company.

Before performing any measurements or takeoffs, perform a SCOPE DISCOVERY review:

1. IDENTIFY each document type present:
    - SWPPP Plan
    - Civil/Grading Plan
    - Erosion Control Plan
    - Dust Control Plan
    - Site Plan
    - Utility Plan
    - Other (specify)

2. For each document, note:
    - Page numbers
    - Project name shown
    - Site address if visible
    - Any special requirements visible (wash rack, retention basin, etc.)

3. Flag any items relevant to our services:
    - Silt fence requirements
    - Stabilized construction entrance
    - Temporary fencing needs
    - Erosion control BMPs

Return structured JSON with your findings.

```text

* *Action Items:**
- [ ] Define SharePoint folder structure trigger
- [ ] Finalize Gemini prompt (test on 5 recent projects)
- [ ] Build n8n workflow
- [ ] Test with estimator for one week
- [ ] Refine based on feedback

- --

### 1.3 Estimate Follow-Up Sequence

* *Current Pain:**
- No systematic follow-up after estimate sent
- Unclear cadence, unclear ownership
- Rick (VP Business Dev) was doing ad-hoc outreach

* *Solution:**
- 7-email sequence over 30 days
- Triggered when estimate attached to Monday item
- Owned by Estimating/PM (Chi)
- Knock off sequence when customer responds
- Hand off to Sales if deal progresses

* *Cadence:**
| Day | Action | Purpose |
|-----|--------|---------|
| 0 | Estimate sent | Initial delivery |
| 2 | Email 1 | Confirm receipt |
| 5 | Email 2 | Address questions |
| 10 | Email 3 | Timeline check |
| 15 | Email 4 | Value add |
| 21 | Email 5 | Decision timeline |
| 28 | Email 6 | Final check |
| 35 | Email 7 | Breakup email |

* *Trigger Logic (n8n):**

```text
Trigger: Monday item → Estimate column updated (file attached)
    ↓
Action: Start sequence timer
Action: Send Email 1 after 2 days
    ↓
Webhook: Listen for reply (via email parsing or Monday status change)
  - If reply received → stop sequence, notify team
  - If no reply → continue to next email
    ↓
Action: At Day 35, send breakup email
Action: Update Monday status to "Needs Follow-Up" or "Cold"

```text

* *Action Items:**
- [ ] Draft 7 follow-up emails (see separate document)
- [ ] Get approval from Rick on cadence and messaging
- [ ] Build n8n workflow
- [ ] Set up email parsing for response detection
- [ ] Define handoff process to Sales

- --

## Phase 2: Core Automation (Weeks 3-4)

### 2.1 Dust Permit Automation

* *Dependencies:** Drawings + NOI + Site Contact

* *Current Pain:**
- Estimator sometimes forgets to request SWPPP plan
- Plans get lost or miscommunicated
- Manual form filling (90% automatable)

* *Solution:**
- Notion checklist shows readiness: Has drawings? Has NOI? Has site contact?
- When all three present → trigger Stagehand V3 workflow
- Auto-fill permit application
- Manual step: Add site map
- Auto-notification when submitted

* *Workflow:**

```text
Trigger: Notion project → all three checkboxes marked
    ↓
Action: Pull NOI data (contact, project info)
Action: Pull project address and details
    ↓
Action: Stagehand V3 → Navigate to permit portal
Action: Fill form fields
Action: Pause for manual map upload
    ↓
Action: Submit
Action: Record application number in Notion
Action: Send notification: "Dust permit submitted for [Project]. Expect approval in ~5 days."
  - To: Customer site contact
  - To: Billing (Kendra)
  - CC: Estimator

```text

* *Action Items:**
- [ ] Map required fields for Maricopa County dust permit form
- [ ] Build Stagehand workflow
- [ ] Create notification templates
- [ ] Test on 3 permits manually before automating

- --

### 2.2 Permit Approval Email Parsing

* *Current Pain:**
- Approval emails come in, need manual processing
- Have to match to project, update records, notify team

* *Solution:**
- Parse incoming permit approval emails
- Match to open project (by site name + contractor)
- Auto-update Notion status
- Attach permit PDF to SharePoint
- Notify billing and customer

* *Workflow:**

```text
Trigger: Email received to permits@desertservices.net
    ↓
Action: Parse email for:
  - Permit number
  - Site name
  - Contractor name
  - Approval date
  - Attached PDF
    ↓
Action: Search Notion for matching project
  - Match on site name OR address
    ↓
Action: Update Notion:
  - Dust Permit Status → Approved
  - Permit Number field
  - Attach PDF
    ↓
Action: Upload PDF to SharePoint project folder
    ↓
Action: Send notifications:
  - To Customer: "Your dust permit for [Project] has been approved. Permit #[Number] attached."
  - To Billing: "Dust permit approved for [Project]. Ready to bill permit fee."

```text

* *Action Items:**
- [ ] Set up email forwarding/parsing
- [ ] Build matching logic (fuzzy match on project name)
- [ ] Create notification templates
- [ ] Test with 10 historical approval emails

- --

### 2.3 Contract Reconciliation (AI-Assisted)

* *Current Pain:**
- Contract often arrives before estimate
- Manual comparison to find discrepancies
- Miscommunication on what was quoted vs. contracted

* *Solution:**
- AI compares contract SOV to original estimate
- Flags discrepancies for human review
- Creates draft reconciliation summary

* *Workflow:**

```text
Trigger: Contract uploaded to Monday/SharePoint
    ↓
Action: Find linked estimate
Action: Send both to Gemini Pro
    ↓
Prompt: "Compare the Schedule of Values in this contract to the original estimate.
         Flag any:
          - Line items in contract not in estimate
          - Line items in estimate not in contract
          - Price differences > 5%
          - Quantity differences > 10%
          - Scope descriptions that don't match
         
         Return a structured comparison table."
    ↓
Action: Generate reconciliation report
Action: Send to estimator for review
Action: After approval, create Scope Items in Notion from final SOV

```text

* *Action Items:**
- [ ] Collect 5 sample contract/estimate pairs
- [ ] Build and test Gemini prompt
- [ ] Create reconciliation report template
- [ ] Build workflow

- --

## Phase 3: Delivery & Closeout (Weeks 5-8)

### 3.1 Change Order Approval Flow

* *Current Pain:**
- Work happening without approval
- No evidence trail
- Billing doesn't know what's authorized

* *Solution:**
- Nothing gets added to SOV without approval AND evidence
- Field crews submit change order requests
- Chi/Kendra approve after verifying billing info + signed documentation

* *Required Evidence (Auditable):**
- Signed quote or estimate, OR
- Signed change order form, OR
- Email from customer explicitly approving the work and price

* The Scope Item doesn't get created until you have the signed document. No exceptions.*

* *Change Order Request (from field):**
- Project name
- Description of additional work
- Service line
- Estimated quantity and price
- Reason for change (customer request, rework, site condition, etc.)
- Photos/evidence (optional but helpful)

* *Approval Checklist:**
- [ ] Do we have billing info for this customer?
- [ ] Do we have **signed evidence** (quote/estimate/email approval)?
- [ ] Do we have site contact?
- [ ] Is the price reasonable for the work?

* *Approval Flow:**

```text
Request submitted (form, text, call)
    ↓
Chi creates Task: "Change Order Approval - [Project] - [Description]"
    ↓
Get signed evidence from customer (quote, email, etc.)
    ↓
Review approval checklist
    ↓
If approved:
  - Create Scope Item with Change Order flag ✓
  - Attach signed evidence to Scope Item
  - Mark Task as Done
  - Notify field: approved to proceed
    ↓
If denied:
  - Notify requestor with reason
  - Mark Task as Done
  - No Scope Item created

```text

* *Action Items:**
- [ ] Create change order request form (or define text/email format)
- [ ] Define approval routing (Chi for SWPPP, Kendra for others?)
- [ ] Build notification workflow
- [ ] Train field supervisors: no work without signed approval

- --

### 3.2 Inspection Tracking

* *Current:** Bi-weekly PDFs uploaded to SharePoint

* *Solution:**
- Count PDFs in SharePoint folder
- Compare against expected total in SOV
- Flag if behind schedule

* *Workflow:**

```text
Schedule: Weekly check (Monday morning)
    ↓
For each active SWPPP project:
  - Count inspection PDFs in SharePoint folder
  - Calculate expected count (based on start date and bi-weekly cadence)
  - If actual < expected: Flag for review
    ↓
Generate weekly report:
  - Projects on track
  - Projects behind
  - Projects overdue
    ↓
Send to SWPPP team lead

```text

* *Action Items:**
- [ ] Define inspection counting logic
- [ ] Build SharePoint file counting automation
- [ ] Create weekly report template
- [ ] Set up notification routing

- --

### 3.3 Sign Ordering Automation

* *Current Pain:**
- Manual ordering via email
- ~$120K/year spend
- No tracking

* *Solution:**
- Button in Notion triggers order email
- Pre-fills all required info from project
- Tracks order status

* *Sign Types:**
- Dust Control Sign (required info: permit #, contractor, site address)
- SWPPP Sign (required info: project name, permit #, contact)
- Fire Sign Type A
- Fire Sign Type B

* *Workflow:**

```text
Notion button: "Order [Sign Type]"
    ↓
Action: Validate required fields present
  - If missing → Show error with missing fields
    ↓
Action: Generate email to sign vendor:
  Subject: Sign Order - [Project Name] - [Sign Type]
  Body:
    - Sign type requested
    - Project details
    - Permit number
    - Required text/info
    - Delivery address
    - Rush? Y/N
    ↓
Action: Create tracking item in Signs database
Action: Set reminder for follow-up if not received in 5 days

```text

* *Action Items:**
- [ ] Document required fields for each sign type
- [ ] Get vendor email templates/requirements
- [ ] Build Notion button automation
- [ ] Create Signs tracking database

- --

## Phase 4: Ongoing Optimization (Weeks 9+)

### 4.1 Narrative Automation

* *Dependencies:** Dust permit + SWPPP plan + NOI

* *Current Pain:**
- Highly manual, done by office coordinator and VP
- Bottleneck

* *Solution:**
- Document all variables that go into narrative template
- Collect variables up front as project progresses
- AI-assisted draft generation
- Human review and finalization

* *Action Items:**
- [ ] Document narrative template variables (HIGH EFFORT)
- [ ] Map variable sources
- [ ] Build collection workflow
- [ ] Build AI draft generator
- [ ] Test on 3 narratives

- --

### 4.2 Expand CRO Dispatch

* *Current State:**
- Only Portable Toilets and Roll-offs on CRO
- Street sweeping and water trucks are manual

* *Goal:**
- All service lines on dispatch software
- Activity-based billing for all recurring services
- Reduce unbilled work

* *Action Items:**
- [ ] Evaluate CRO capabilities for street sweeping
- [ ] Evaluate CRO capabilities for water trucks
- [ ] Create implementation plan
- [ ] Train dispatch team

- --

### 4.3 Bring Signs In-House (Future)

* *Current:** Outsourced at ~$120K/year

* *Potential:**
- Purchase sign-making equipment
- Offer signs as additional service
- Capture margin

* *Action Items:**
- [ ] Research equipment costs
- [ ] Calculate break-even volume
- [ ] Assess space/staffing needs
- [ ] Build business case

- --

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data quality from legacy systems | High | Medium | Don't migrate. Start clean. Backfill selectively. |
| VP/billing adoption of Notion | Medium | High | Run alongside them. Let them see it work. |
| File naming inconsistency | High | Low | Define convention + fuzzy matching in AI |
| Over-automation annoying customers | Low | Medium | Human review gates on outbound comms |
| Field crews bypassing approval flow | Medium | High | Make system easier than workaround |
| Scope creep on Chi's role | High | Medium | Be PM first, automation later |
| Integration failures | Medium | Medium | Monitor workflows, set up alerts |

- --

## Operational Cadences

### Daily Standup

- Chi reviews Tasks database (Status ≠ Done, sorted by Due Date)
- Work through blockers, update statuses
- Update SOV as work completes

### Weekly: QuickBooks Sync (Friday by 6 PM)

* *SLA:** Every Active project must have its current SOV reflected in QuickBooks by Friday 6 PM.

Recurring Task:
- Task: "QuickBooks Sync - Week of [Date]"
- Type: QuickBooks Sync
- Due: Friday 6 PM
- Checklist: Review all Active projects, ensure SOV matches QuickBooks

### Weekly: Pipeline Review

- Review Projects in "Estimating" and "Project Initiation" status
- Check for stalled estimates (no response > 14 days)
- Flag projects ready to move to Active

- --

## Success Metrics

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| Estimate follow-up rate | ~10%? | 100% | Phase 1 |
| Time from bid receipt to estimate sent | Unknown | Track baseline | Phase 1 |
| Deals in "Sent" status | 3,000 | < 500 active | 6 months |
| Dust permits processed manually | 100% | 10% | Phase 2 |
| Change orders without approval | Unknown | 0% | Phase 3 |
| Unbilled work incidents | Unknown | Track baseline | Ongoing |

- --

## Appendix A: Tool Costs (Estimated)

| Tool | Current | Proposed | Monthly Cost |
|------|---------|----------|--------------|
| Monday.com | ✓ | Keep for Sales/Estimating | Existing |
| Notion | ✓ | Expand for PM/Delivery | ~$15/user |
| n8n | Self-hosted | Continue | Free (server cost) |
| Gemini Pro API | Testing | Production | ~$50-100/mo est. |
| Power Automate | ✓ | Use for M365 integrations | Existing |
| Stagehand V3 | Testing | Production | TBD |

- --

## Appendix B: RACI Matrix

| Activity | Responsible | Accountable | Consulted | Informed |
|----------|-------------|-------------|-----------|----------|
| Estimate follow-up | Chi | Chi | Estimator | Sales (Rick) |
| Dust permit processing | Chi | VP (SWPPP) | Office Coord | Billing |
| Contract reconciliation | Chi | Chi | Estimator | Sales |
| SOV management | Chi | Chi | Billing, VP | All |
| Change order approval | Chi/Kendra | Chi | Field Supers | Billing |
| Inspection tracking | VP (SWPPP) | VP (SWPPP) | Chi | Billing |

- --

## Document History

| Date | Author | Changes |
|------|--------|---------|
| Dec 2025 | Chi | Initial draft |
