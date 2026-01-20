# Project Management

Working document for PM process design. User stories extracted to user-stories.md.

- --

## HIGH-LEVEL FLOW

Work starts when we receive a request via email. Four entry points, same first two steps, then diverge.

- --

ENTRY POINTS

1. Contract/LOI Received
2. Dust Permit Request
3. SWPPP Plan Request
4. BMP Installation Request

- --

COMMON FIRST STEPS (all entry points)

Step 1: Find the estimate

- Search by project name
- Search by account name
- Search by address
- Fuzzy match if needed

Step 2: Create the project

- Create project record in Notion
- Link to estimate
- PDF print of email → SharePoint
- Save to QuickBooks

Then diverge based on entry point.

- --

ENTRY POINT 1: CONTRACT/LOI RECEIVED

Trigger: DocuSign or contract email arrives

After common steps:

- Reconcile contract vs estimate
- Full kickoff (contacts, compliance, billing setup)
- Handoff to delivery

This is the "full" flow - most data collection happens here.

- --

ENTRY POINT 2: DUST PERMIT REQUEST

Trigger: Email "we need a dust permit for X"

After common steps:

- Verify we have grading/civil plan
- Contact customer for any missing info
- Do the permit application
- Map step
- Issue permit

May or may not have contract yet. If no contract, project is minimal until contract arrives.

- --

ENTRY POINT 3: SWPPP PLAN REQUEST

Trigger: Email "we need a SWPPP plan for X"

After common steps:

- Verify we have civil/grading drawings
- Send to engineering firm
- Track engineering progress
- Receive completed plan
- Ready for installation

- --

ENTRY POINT 4: BMP INSTALLATION REQUEST

Trigger: Email "ready to install" or "mobilize"

After common steps:

- Should already have project (if not, create minimal one)
- Pre-mobilization checklist
- Handoff to delivery
- In production

- --

CONVERGENCE

All entry points eventually converge into:

- Project in production
- Billing cycle
- Work complete
- Collections

- --

PROJECT NUMBERS

Decision: No project numbers.

Use estimate ID from Monday as the unique identifier.

Naming convention:

- Use whatever the customer calls it (from contract, email, etc.)
- Each field has a purpose - use the fields (account, address, etc.)
- In every email confirmation, verify: "this is for [project name], correct?"

If confusion arises later, revisit.

- --

AFTER ENTRY POINT: STAGES

Once project exists, it moves through stages. Each entry point may skip some stages or do them in different order.

- --

## CONTRACT RECONCILIATION

Trigger: New contract received (email, DocuSign, or portal)

States:

- Received (contract in inbox)
- Matched (estimate found in CRM)
- Validated (amounts and line items match)
- Discrepancy (needs resolution before proceeding)

Actions:

- Agent extracts contract PDF from email/portal
- Agent finds matching estimate by project name or account
- Agent compares: total amount, line items, retention terms, scope
- If match: auto-advance to validated
- If discrepancy: flag for PM review with diff summary

What to compare:

- Total contract value vs estimate total
- Line item quantities and pricing
- Retention percentage
- Scope inclusions/exclusions
- Payment terms
- Change order process documented

Actors:

- Agent: extraction, matching, comparison
- PM: resolves discrepancies, negotiates if needed
- Estimator: consulted if scope questions

Notify:

- PM: when discrepancy found (needs action)
- Operations: when validated (can proceed to kickoff)
- Estimator: if scope changed significantly

- --

## PROJECT KICKOFF

Trigger: Contract validated (reconciliation complete)

States:

- Waiting for docs (need documents from GC)
- Docs received (have what we need)
- Docs sent (our paperwork to GC)
- Ready for billing setup

DOCUMENTS TO RECEIVE FROM GC

Contract and scope:

- Executed subcontract (signed both parties)
- Schedule of values (payment breakdown)
- Change order process documented
- Retention terms confirmed

Plans:

- SWPPP (Stormwater Pollution Prevention Plan) - engineering plan
- Site plans with access routes
- Grading plans (if applicable)
- Relevant specifications

Permits:

- NOI with ADEQ number (if SWPPP)
- Dust permit number and who pulled it
- Building permit (if required)

Site info:

- Gate codes and entry points
- Site hours (start, end, days)
- Badge/credential requirements
- Safety orientation requirements
- Parking instructions
- Water source (if water truck work)

DOCUMENTS TO SEND TO GC

Insurance:

- Certificate of Insurance (COI) with GC as additional insured
- W-9
- Contractor license copy
- EMR letter
- Signed subcontract returned

Safety (if required):

- Safety program
- Drug testing policy
- OSHA training certs
- Site-specific safety plan

Bonding (if required):

- Bonding letter
- Performance bond
- Payment bond

Actions:

- Agent creates checklist from contract type
- PM requests missing docs from GC
- Admin sends our insurance/compliance docs
- Agent tracks what's received vs outstanding

Actors:

- PM: requests docs, tracks checklist
- Admin: sends COI, W-9, license, bonding
- Agent: generates checklist, tracks status, sends reminders

Notify:

- Admin: when COI/compliance docs needed
- PM: when docs received, when outstanding items overdue
- Operations: when kickoff checklist complete

- --

## BILLING SETUP

Trigger: Kickoff checklist complete

States:

- Not started
- PO obtained
- Platform confirmed
- Setup complete

What to collect:

- PO number (always ask, even if not volunteered)
- Billing platform (Textura, Procore, GC Pay, Premier, email)
- Billing window (submit by X of each month)
- Billing contact (name, email, phone)
- Lien waiver requirements (conditional, unconditional, both)
- Certified payroll required (Y/N, which platform)

Actions:

- PM requests PO from GC contact
- Billing person confirms platform access
- Billing person verifies billing contact info
- Agent records all info in project record

Actors:

- PM: requests PO, collects billing contact
- Billing: confirms platform, verifies access, sets up project
- Agent: records data, sends reminders if missing

Notify:

- Billing: when project ready for setup
- PM: when billing setup complete
- PM: if PO still missing after X days

- --

## HANDOFF TO DELIVERY

Trigger: Contract validated, billing ready, pre-mobilization verified

States:

- Ready for handoff (all data collected, signoffs complete)
- Handed off (sent to delivery)
- Acknowledged (delivery confirmed receipt)
- In production (work started)

PRE-CONDITIONS (what makes it "ready")

All projects:

- Contract matches estimate (reconciled)
- Billing setup complete (PO, platform, contact, certified payroll Y/N)
- Site access confirmed (badges, safety, credentials)
- Start date confirmed in writing
- Site contact collected (PM + Super + Billing)
- All project documents in SharePoint (estimates, contracts, plans, NOI, specs)
- Email approval to proceed

SWPPP-specific pre-conditions:

Always ask:

- NOI status verified
- Dust permit status (us or them)
- SWPPP plan received

Conditional (only ask if NOT on our scope):

- Grading done Y/N
- Temp fence installed Y/N
- Inlets installed Y/N
- Rock entrance prepped Y/N

Logic: If we are doing grading/fence/inlets/rock entrance, we do not ask about them. If someone else is doing them, we need to know status before we can start.

Required signoffs:

1. Estimating sign-off
2. Operations sign-off
3. PM/Coordinator sign-off

Actions:

- PM clicks "hand off" after all pre-conditions met
- Delivery person clicks "acknowledge"
- Delivery person clicks "in production" when work starts

Actors:

- PM: validates, signs off, hands off
- Delivery: acknowledges, starts work

Notify:

- Delivery: when project ready for them
- PM: when delivery acknowledges
- Billing: when in production (can start tracking)

Current: Email to shared Outlook group, hope they figure it out
Future: Dashboard shows validated projects, delivery clicks to acknowledge

Two complexity levels:

- SWPPP: PM owns more, detailed pre-conditions
- Other services: Simpler - billing + PO + start date + site contact, then pass off

- --

## DOCUMENT AUTOMATION

Trigger: Project handed off to delivery

States:

- Pending (project in production)
- Generated (docs created)
- Map added (PM completed map)
- Finalized (book ready)

What gets auto-generated:

- SWPPP book cover page
- Inspection log templates
- BMP installation checklists
- Site contact sheets
- Emergency response info
- Dust control plan summary

What PM still does manually:

- Site map (requires GIS/drawing)
- Physical book assembly
- Project-specific notes

Actions:

- Agent generates docs when project moves to production
- Agent notifies PM that docs are ready
- PM adds map (target: same day as handoff)
- PM assembles physical book (if required)
- PM marks docs complete

Actors:

- Agent: generates templates, compiles docs
- PM: adds map, reviews, finalizes

Notify:

- PM: when docs generated (needs map)
- Delivery: when book ready
- Inspector: when inspection templates available

- --

## NOTIFICATIONS / DASHBOARD

NOTIFICATIONS BY ROLE

Estimating:

- Contract received for their estimate (reconciliation starting)
- Discrepancy found (needs input)
- Project won (for tracking/follow-up purposes)

PM/Coordinator:

- Contract validated (kickoff can start)
- Docs received from GC
- Docs overdue from GC (reminder to follow up)
- Billing setup complete
- Delivery acknowledged handoff
- Docs generated (needs map)

Billing:

- Billing setup needed (new project)
- Project in production (can start tracking)
- PO obtained (ready to invoice)
- Missing PO reminder

Delivery/Operations:

- Project ready for them (handoff complete)
- Acknowledge reminder (if not clicked)

Admin:

- COI/insurance docs needed for new project
- Compliance docs expiring soon

NOTIFICATION DELIVERY

Where notifications go:

- Email: primary channel for everything
- Dashboard: shows pending items and history
- Slack/Teams: optional real-time alerts

Frequency:

- Immediate: handoffs, discrepancies, urgent items
- Daily digest: reminders, overdue items, summary
- Weekly: aging report, projects in limbo

DASHBOARD VIEWS

My tasks (per role):

- What's waiting for me to act on
- Grouped by urgency (overdue, due today, upcoming)

Project status (per project):

- Current stage in pipeline
- Who's blocking (which role has the ball)
- Days in current stage
- Red flags (overdue items, missing data)

Pipeline overview (management):

- Projects by stage (funnel view)
- Bottlenecks (where projects pile up)
- Aging (projects stuck too long)
- Team workload

CURRENT STATE vs FUTURE STATE

Current:

- Email to shared Outlook group
- Hope someone sees it
- No visibility into what's pending
- No way to know if things are stuck

Future:

- Automated notifications by role
- Dashboard shows pending items per person
- Automatic escalation for overdue items
- Clear handoff with acknowledgment

- --

## OPEN QUESTIONS

- What's the SLA for each stage? (days in state before escalation)
- Who owns escalation? (PM? Operations manager?)
- Which items are truly blocking vs nice-to-have?
- How do we handle projects that skip stages? (e.g., T&M work, emergency calls)
