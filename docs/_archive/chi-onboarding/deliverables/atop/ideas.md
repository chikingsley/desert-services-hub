# DESERT SERVICES - OPERATIONAL TRANSFORMATION ROADMAP

* *Last Updated:** November 11, 2024
* *Purpose:** Chart the full vision for fixing operational inefficiencies, eliminating manual processes, and creating scalable systems

- --

## THE VISION: WHAT WE'RE BUILDING TOWARD

* *Central Operations Hub (CRO Software)**
Move all service delivery into CRO to create single source of truth for:

- **What's on site** - Real-time visibility of deployed assets (fence, PJs, roll-offs, BMPs)
- **Who ordered what, when, and from who** - Complete customer/project/service history
- **Scheduling** - Eliminate Excel schedules (Dawn's master, Kelly's paper notebook, SWPPP master)
- **Work completes** - Digital capture replaces manual entry and illegible handwriting
- **Billing** - Direct connection from work performed to invoice generation

* *Services moving to CRO:**

1. **Roll-offs** - Already in CRO, optimize usage
2. **Portable Toilets** - Already in CRO, optimize usage
3. **Water Trucks** - Q1 2025
4. **Street Sweeping** - Q2 2025
5. **SWPPP Field Operations** - Trial in Q1/Q2 2025

    - Deploy assets (fence, sock, signs, inlet protection, rock entrances)
    - Track what's installed where
    - Inspector visit scheduling and tracking
    - Repair/maintenance work orders
    - Asset inventory visibility

* *What stays outside CRO:**

- SWPPP Preconstruction (dust permits, NOI, narrative creation) - handled by PM role + QuickBooks
- Sales/CRM (Monday.com)
- Contract management (QuickBooks + SharePoint repository)

- --

* *Central File Repository (SharePoint)**
Single searchable location where anyone can find project documents without checking 15 places.

* *Structure:**

```text
/Projects/
  /[Customer Name]/
    /[Project Name]/
      /Contracts/
      /Estimates/
      /SWPPP Plans/
      /Correspondence/
      /Billing/
      /Work Completes/
      /Photos/
      /Change Orders/

```text

__Search:__ Type customer name or project name, find everything related instantly.

__Current problem it solves:__

- Contracts buried in QuickBooks
- SWPPP plans "sometimes in Monday, sometimes SharePoint, sometimes nowhere"
- Multiple people requesting same documents
- "I can't find the NOI" (asked 5 times by 5 people)

- --

__Project Management Role (Chi)__
Own the handoff from sales → operations and manage project lifecycle.

__Core Responsibilities:__

__1. Sales Follow-Up & Win Notification__

- Clinical, systematic follow-up on all estimates sent
- Partnership with Rick (sales ops) on high-dollar deals
- Day 3: "Did you receive? When will you decide?"
- Day of GC bid: "Did GC win? Did we win?"
- __When won:__ Immediately trigger handoff process

__2. Contract Reconciliation__

- Review contract vs. estimate BEFORE operations is notified
- Verify: Dollar amounts, line items, services, job name consistency
- Work with Jared/Kendra to resolve mismatches
- __Current problem:__ 20 emails back and forth, work starts before reconciliation done
- __Future state:__ Reconciliation complete in 24-48 hours, operations gets clean handoff

__Tool needed:__ Drag two documents (estimate PDF + contract PDF), system highlights differences, quick edits to reconcile

- Not reinventing the wheel, just making comparison faster
- QuickBooks still master system, this is review tool only

__3. Project Information Gathering (data-needed.md checklist)__

- TIER 1 (24 hours): PM contact, site address, start date, PO number, email confirmation
- TIER 2 (48 hours - SWPPP): NOI, dust permit status, acreage, site drawing, property owner info
- TIER 3 (before operations): Services contracted, billing method, retention %, site access, water source

__4. Document Upload & Organization__

- Upload all project docs to SharePoint /Projects/ folder
- Ensure SWPPP plans, contracts, correspondence all in one place
- Create handoff package with complete information

__5. Operations Handoff__

- Send clean package to delivery managers (Jayson, Stephen, Dawn, Kelly)
- __No more:__ "I had no idea that job existed" (Lacie discovering jobs driving past sites)
- __No more:__ Missing PM names, addresses, start dates
- __No more:__ Work starts before we have NOI, dust permit, or site contacts

__6. Upsell Tracking & Quoting__

- Track which services quoted vs. which services won
- Identify upsell opportunities (30K SWPPP estimate � 200K with all services)
- Coordinate with sales on timing (before ground broken, fence up, PJs on site)
- Organize quotes for add-on services

__7. Change Order Management__

- Proactive identification (not discovering during billing)
- Track scope changes before work performed
- Get email approvals before crews dispatched
- __Current problem:__ "It's always a surprise because I have no idea what we're doing until I go to bill for it" - Kendra

- --

## THE DAILY WORKFLOW: HOW WORK FLOWS THROUGH THE SYSTEM

__Morning: Work Intake & Triage__
Work comes in from multiple sources daily. Need process to capture, prioritize, and distribute.

__Intake Channels:__

1. Sales estimates sent � Monday.com (Rick, Michael, Lacie logging)
2. Contract received � Email to Kendra/Jared
3. Service requests � Phone calls to directors, answering service, CRO portal
4. Customer emails � Dawn, Kendra, Jayson, directors
5. Change orders � Discovered by field or billing

__Triage Process (Chi's daily workflow):__

__Step 1: Capture Everything (9:00 AM daily check-in)__

- Check Monday.com for new estimates sent in last 24 hours
- Check email for contracts received
- Check with Kendra/Jared for contracts needing reconciliation
- Check CRO for new service requests entered
- Check with directors for phone-in requests

__Step 2: Categorize & Prioritize__

- __URGENT:__ Work needed today/tomorrow (service requests)
- __HIGH:__ Contracts received needing reconciliation (blocks operations start)
- __MEDIUM:__ Estimates needing follow-up (Day 3 or Day of GC bid)
- __LOW:__ Research tasks, document requests, change order discovery

__Step 3: Distribute & Execute__

- URGENT � Verify email confirmation exists, route to CRO/delivery manager directly
- HIGH � Start reconciliation process, schedule resolution meeting if needed
- MEDIUM � Make follow-up calls, log results, schedule next touch
- LOW � Batch process during afternoon admin time

__Step 4: Track Progress (Monday.com boards)__

- Update status on all items touched
- Set next action dates
- Document outcomes (won/lost, reconciled/pending, approved/denied)

- --

__Reconciliation Workflow (Contract vs. Estimate)__

__Current state:__ Manual, time-consuming, error-prone

- Open QuickBooks estimate (slow, crashes)
- Open contract PDF
- Manually compare line-by-line
- 20 emails back and forth with customer
- Work often starts before reconciliation complete

__Desired state:__ Fast comparison, quick resolution

1. Drag estimate PDF + contract PDF into comparison tool
2. Tool highlights differences (dollar amounts, line items, quantities)
3. Make quick edits to reconcile
4. Export summary of changes
5. Email customer: "Contract shows $X for Y, estimate was $Z for A - please confirm which is correct"
6. Update QuickBooks with final reconciled version
7. Mark complete, handoff to operations

__Tool exploration needed:__

- PDF comparison software (Adobe Acrobat Compare, Draftable, Beyond Compare)
- OR: Build simple web tool (upload 2 PDFs, extract text, side-by-side diff view)
- Must be faster than current manual process

- --

__Sales Follow-Up Process (Clinical & Systematic)__

__Why this matters:__

- Until 5 months ago: ZERO follow-up on bids
- 3,000+ bids in Monday.com queue
- Rick focuses only on high-dollar deals
- Result: Won projects go into black hole, no one notified

__New process:__

__Day 0: Estimate Sent__

- Sales logs in Monday.com (Rick, Michael, Lacie)
- Required fields: Customer, project, services quoted, amount, date sent, GC bid date
- Status: "Estimate Sent"

__Day 3: First Follow-Up (Chi)__

- Call/email customer: "Did you receive the estimate? Any questions? When do you expect to make a decision?"
- Log response in Monday.com
- Update "Expected Decision Date"
- Status: "Follow-Up #1 Complete"

__Day of GC Bid: Second Follow-Up (Chi + Sales)__

- Morning of GC bid: "Good luck today, let us know if we can help with anything last-minute"
- Day after GC bid: "Did the GC win the project? Did we win the Desert Services portion?"
- Log response

__Outcome Tracking:__

- __WON:__ Immediately trigger Tier 1 information gathering (24-hour clock starts)
- __LOST:__ Log reason (price, relationship, didn't bid, other) � Win/Loss analysis data
- __PENDING:__ Schedule next follow-up, update expected decision date
- __GC LOST:__ Mark closed, archive

__Upsell Tracking:__

- If won with partial services (e.g., SWPPP only, no fence/PJs), create "Upsell Opportunity" task
- Coordinate with sales on timing (before ground broken)
- Track outcome (added services, declined, timing missed)

- --

__Project Handoff Package (Complete Information Before Operations)__

__Goal:__ Operations receives everything needed, zero hunting for information

__Package Contents:__

1. __Reconciled Contract__ (uploaded to SharePoint)
2. __Tier 1 Data__ (in handoff email):

    - Customer/GC name
    - Project name and address
    - PM name, phone, email
    - Site superintendent contact
    - Start date
    - PO number
    - Services contracted

3. __Tier 2 Data (SWPPP projects)__:

    - NOI with ADEQ number
    - Dust permit (filed or customer filing)
    - SWPPP plan location (SharePoint link)
    - Acreage, property owner info

4. __Tier 3 Data__:

    - Billing method (invoice vs. contract platform)
    - Retention percentage
    - Site access requirements (gate codes, badging, PPE, safety videos)
    - Water source (for water trucks)
    - Special restrictions

5. __Email Confirmation__ (attached to package):

    - Customer approval to proceed
    - Scope confirmation
    - Billing protection

__Handoff Email Template:__

```text
To: [Delivery Manager - Jayson/Stephen/Dawn/Kelly]
CC: Jared, Kendra, Sales Rep
Subject: NEW PROJECT HANDOFF - [Customer] - [Project Name]

[Delivery Manager],

New project ready for scheduling:

CUSTOMER: [Name]
PROJECT: [Project Name]
ADDRESS: [Full site address]
START DATE: [Date]

CONTACTS:

- PM: [Name, Phone, Email]
- Super: [Name, Phone, Email]

SERVICES CONTRACTED:

- [List all services and quantities]

BILLING: [Invoice / Textura / Procore / etc.]
PO NUMBER: [Number]

DOCUMENTS:

- Contract: [SharePoint link]
- SWPPP Plan: [SharePoint link - if applicable]
- Email Confirmation: [Attached]

SWPPP-SPECIFIC (if applicable):

- NOI: [ADEQ number]
- Dust Permit: [Filed on DATE / Customer filing]
- Site Status: [Graded? Inlets installed? Access ready?]

SPECIAL REQUIREMENTS:

- [Gate codes, badging, PPE requirements, water source, etc.]

All documents uploaded to SharePoint: [Folder link]

Ready to schedule. Let me know if you need anything else.

Chi

```text

- --

## TECHNOLOGY STACK: WHAT TOOLS DO WHAT

__CRO Software (Operations Hub)__
__Owns:__ Service delivery, scheduling, work completes, asset tracking, billing

__Services:__

- Roll-offs (optimize current usage)
- Portable Toilets (optimize current usage)
- Water Trucks (Q1 2025)
- Street Sweeping (Q1 2025)
- SWPPP Field Ops (trial Q1/Q2 2025)

__What needs to happen:__

1. __Go through CRO vendor trainings__ - Understand full capabilities, fix current errors
2. __Mandate email confirmations__ - Culture change, not tech change (Stephen must get approval before entering work)
3. __Trial SWPPP__ - Define success criteria (see below)
4. __Roll out mobile app__ - Drivers/crews enter work completes in real-time (replace paper timesheets)
5. __Asset tagging__ - PJs, fence, equipment labeled and tracked in CRO

- --

__Monday.com (Sales CRM & PM Task Tracking)__
__Owns:__ Sales pipeline, estimate tracking, follow-up process, PM task management

__Current problems:__

- "Ugly, not CRM-like"
- Can't rearrange views
- Implemented by someone untrained
- Automations fail
- No account hierarchy

__What needs to happen:__

1. __Proper setup by someone who knows Monday__ - Clean boards, logical workflows, reliable automations
2. __Three core boards:__

    - __Estimates & Follow-Up__ (sales pipeline)
    - __Project Initiation__ (information gathering, reconciliation, handoff tracking)
    - __Active Projects__ (central visibility, links to CRO/SharePoint)
3. __Training__ - Everyone using Monday needs to understand board structure, statuses, automations

__Acceptance criteria:__

- Can track estimates from send � follow-up � win/loss
- Can track project handoff from win � info gathering � reconciliation � operations ready
- Can see all active projects with service status
- Automations work reliably (win triggers handoff, Day 3 triggers follow-up reminder)

__If Monday can't do this after proper setup:__ Reevaluate CRM options (HubSpot, Salesforce)

- --

__SharePoint (Central File Repository)__
__Owns:__ Document storage, project files, contracts, SWPPP plans, correspondence

__Structure:__ /Projects/[Customer]/[Project Name]/[Document Types]

__What needs to happen:__

1. __Create folder structure__ (immediate - this week)
2. __Start with new projects__ (all new projects from today forward)
3. __Migrate active projects__ (critical docs for jobs in progress)
4. __Training__ - Everyone knows where to upload/find documents
5. __Enforcement__ - SWPPP plans ONLY in SharePoint (not Monday, not email, not "somewhere")

- --

__QuickBooks (Financial System of Record)__
__Owns:__ Estimates, invoices, contracts (master copy), accounting

__What it does NOT own:__

- Scheduling (moving to CRO)
- Work completes (moving to CRO)
- Document storage (moving to SharePoint)
- Daily operational visibility (moving to CRO)

__What needs to happen:__

1. __Give Chi access__ (immediate)
2. __Define what lives in QuickBooks__ (estimates, invoices, financial records only)
3. __Stop using as shared drive__ (move docs to SharePoint)
4. __Evaluate replacement__ (6-12 months) - Construction-specific software (Foundation, Sage 300) that handles retention properly

- --

## SWPPP IN CRO: TRIAL DEFINITION

__What we're testing:__
Can CRO handle SWPPP field operations as multi-asset deployment + recurring service?

__In scope for trial:__

- Initial installation work orders (fence, sock, signs, inlet protection, rock entrance)
- Asset tracking (what's deployed at which site)
- Inspector visit scheduling (weekly/bi-weekly/monthly)
- Deficiency/repair work orders
- Maintenance tracking (replacement signs, sandbag refills, fence repairs)
- Work complete capture (quantities, photos, inspector notes)
- Billing from work completes

__Out of scope (stays in current process):__

- Dust permit filing (Jared/Eva)
- NOI submission (Eva)
- SWPPP narrative creation (Eva with Jayson support)
- Customer precommunication (Chi)
- Contract reconciliation (Chi + Kendra)

__Success criteria (what makes this trial worth expanding):__

1. __Visibility:__ Jayson can see at a glance what BMPs are deployed at which sites
2. __Scheduling:__ Inspector visits scheduled in CRO, inspectors get mobile notifications
3. __Work completes:__ Inspectors enter deficiencies with photos/measurements in CRO (replace paper/email)
4. __Billing:__ Kendra can bill from CRO work completes without chasing down illegible handwritten notes
5. __Time savings:__ Jayson spends less time building Excel schedules and printing work orders
6. __Asset tracking:__ Can answer "How much fence is deployed right now? How much available?" instantly

__Failure criteria (what means we abandon or rethink):__

1. CRO can't handle multi-line work orders (fence + sock + signs as one deployment)
2. Mobile app too clunky for inspectors to use in field
3. Can't attach photos or measurements to deficiency reports
4. System creates MORE data entry work (double entry between CRO and QuickBooks/Excel)
5. Billing integration doesn't work (still manually creating invoices)

__Timeline:__

- __December 2024:__ CRO vendor training, understand full capabilities
- __January 2025:__ Design SWPPP workflow in CRO (work order templates, asset types, service frequencies)
- __February 2025:__ Pilot with 3-5 projects (small to medium scope)
- __March 2025:__ Evaluate against success/failure criteria
- __April 2025:__ Decision: Expand to all SWPPP or abandon trial

- --

## OPEN QUESTIONS & DECISIONS NEEDED

__Reconciliation Tool__

- Build custom (web app to compare PDFs)?
- Buy existing (Draftable, Adobe Acrobat Pro, Beyond Compare)?
- Stay manual but create faster process (checklist, dual monitors)?
- __Decision needed by:__ End of November (Chi starts reconciliation role in December)

__Monday.com Investment__

- Hire Monday consultant to set up properly?
- Chi self-teach through Monday Academy?
- Accept "ugly but functional" and focus on workflow over aesthetics?
- Set 90-day deadline: If Monday can't work after proper setup, switch to HubSpot?

__SWPPP Trial Commitment__

- Who owns trial design? (Chi + Jayson + CRO vendor?)
- What projects qualify for pilot? (New projects only? Or migrate existing?)
- What happens to Jayson's Excel master during trial? (Keep as backup? Sunset immediately?)

__Eva Training Timeline__

- Dust permits: When does Jared hand off completely?
- SWPPP narratives: When does Jayson hand off completely?
- Does Eva training block CRO trial, or run in parallel?

__Asset Tagging__

- Physical labels/barcodes on PJs, fence bundles, equipment?
- QR codes for quick scanning?
- Who implements? (Operations? Vendor? Chi project manages?)

__Change Order Discovery Process__

- Who's responsible for proactive identification? (Chi? Delivery managers? Inspectors?)
- How do inspectors flag "this is extra work, need change order"?
- How does billing (Kendra) communicate "I can't bill this, need approval"?

- --

## QUICK WINS (Do These Now, Don't Wait)

1. __SharePoint folder structure__ - Set up this week, start using immediately
2. __Chi QuickBooks access__ - Get login, start reviewing contracts
3. __Email confirmation mandate__ - Stephen, Kelly, Wendy must get approval before entering work (culture change)
4. __Contract reconciliation checklist__ - One-page document: What to verify, what to flag, who to notify
5. __Project handoff email template__ - Standardize what info goes to delivery managers
6. __CRO vendor training__ - Schedule sessions, understand capabilities before trial design
7. __Monday board cleanup__ - Archive old estimates, create clean structure for new workflow

- --

## LONG-TERM VISION (6-12 months)

- __All service delivery in CRO__ - Water trucks, sweeping, SWPPP, PJs, roll-offs
- __Zero Excel schedules__ - Everything scheduled in CRO, visible in real-time
- __Zero paper work orders__ - Mobile app replaces printed sheets
- __Central file repository__ - Search customer/project, find everything instantly
- __Proactive change orders__ - Discovered before work performed, not during billing
- __Win/Loss tracking__ - Data-driven pricing decisions, not anecdotal "it's price or relationships"
- __Upsell conversion__ - 30K estimates become 200K projects because sales knows about wins immediately
- __Capacity planning__ - Know available fence, PJ inventory, crew availability at all times
- __Billing efficiency__ - Kendra bills from system work completes, not chasing handwritten notes

- --

## IMPLEMENTATION PHASES

__Phase 1: Foundation (November - December 2024)__

- Define Chi's PM role responsibilities
- Set up SharePoint folder structure
- Get Chi QuickBooks access
- Create reconciliation workflow
- Create handoff email template
- Schedule CRO vendor trainings

__Phase 2: Process Rollout (January - March 2025)__

- Launch sales follow-up process (Monday.com)
- Launch contract reconciliation process (Chi)
- Launch project handoff process (Chi � delivery managers)
- Start using SharePoint for all new projects
- Complete CRO training, design SWPPP trial

__Phase 3: CRO Expansion (February - June 2025)__

- Trial SWPPP in CRO (Feb-March, evaluate April)
- Roll out water trucks to CRO (Q1)
- Roll out street sweeping to CRO (Q1)
- Optimize PJ/roll-off usage in CRO
- Implement asset tagging

__Phase 4: Optimization (July - December 2025)__

- Evaluate QuickBooks replacement options
- Build out customer portal (if needed)
- Implement advanced reporting/analytics
- Win/loss analysis dashboard
- Capacity planning tools

- --

__Next Steps:__

1. Review this document with leadership (Jared, Tim)
2. Get buy-in on PM role definition and priorities
3. Make decisions on open questions
4. Start Phase 1 quick wins this week
5. Schedule CRO vendor training for December
