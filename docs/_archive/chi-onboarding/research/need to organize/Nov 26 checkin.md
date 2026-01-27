# November 26, 2025

## Meeting Flow

1. What I found (9 problem areas)
2. What I've built (deliverables)
3. Proposals (decisions for alignment)
4. The pilot + automation plan
5. The framework
6. What I need
7. Discussion

- --

## PART 1: WHAT I FOUND (9 Problem Areas)

From 10+ interviews across all service lines, I identified 9 distinct problem areas:

| # | Problem Area | One-Line Summary |
|---|--------------|------------------|
| 1 | No Systematic Follow-Up | 3,000+ bids sitting with no follow-up. Find out we won by accident. |
| 2 | No Project Initiation Process | Win happens, nobody gathers info. PM contact missing, no start date. |
| 3 | Manual Service Line Processes | WT/Sweeping: handwritten schedules, 1-2 week billing lag. SWPPP: Excel-based, no project tracking. |
| 4 | CRO Underutilization | Have CRO, not using it well. Wendy retires Dec - need to capture knowledge. |
| 5 | Estimating Bottleneck | Hard to get RFP into CRM, shortcuts taken, estimator distracted. |
| 6 | QuickBooks/Billing Process | Security lockdown, no AIA billing, no pay app integration. Already have Siteline - underutilizing. |
| 7 | Files Everywhere | 15+ places to check. "Where's this file?" all day. |
| 8 | No Oversight/Feedback Loops | Certified payroll not filed for a year. No metrics. Problems surface by accident. |
| 9 | Email as Project Management | Flag emails and pray. No visibility, no assignment. If someone leaves, system leaves with them. |

* *The pattern:** No clear ownership at transitions. Tools exist but aren't configured or trained. No way to know if things are working until they break.

* *Full detail:** See `opportunities-backlog.md` and `opportunities-summary.md`

- --

## PART 2: WHAT I'VE BUILT (Deliverables)

### Research & Documentation

| Deliverable | Description |
|-------------|-------------|
| 10 Interview Transcripts | 730KB+ of stakeholder discovery |
| 11 People Summaries | Deep role analysis for each team member |
| 9 Workflow Maps | Mermaid diagrams covering estimating, SWPPP, contracts, execution |
| Data Requirements Doc | What info is needed at each stage |
| Intake Checklist | Operational tool for first customer contact |
| Contract Reconciliation Template | Step-by-step process |
| Opportunities Backlog | Prioritized list of problems to solve |
| 180-Day Progress Tracker | Line-by-line status against plan |

### SOPs Created

* Dust Control Permit SOP (comprehensive, ready to use)
* Sign Ordering SOP
* Printing Inspections SOP

### Roadmap Documents

* ideas.md - Full transformation roadmap
* CEO-MEETING-PREP.md - This summary

- --

## PART 3: DECISIONS I WANT TO MAKE (Proposals)

These are decisions I'm proposing - need alignment before proceeding.

### Proposal 1: Take Dust Permits + Sign Ordering (Not Hand to Eva)

> "I want to take dust permits and sign ordering into my workflow rather than handing off to Eva."

* *Rationale:**

* Both processes are automatable - triggered from project initiation data
* Falls into "everything up until delivery" ownership model
* Training handoff is overhead that doesn't pay off if automating anyway
* I'll learn edge cases firsthand, which informs automation design
* Eva's capacity better used elsewhere

### Proposal 2: SWPPP Narrative Binder = Automation Project

The 180-day plan had this as a handoff to Eva. I'm proposing to treat it as an automation project instead.

* *Rationale:**

* Variables needed for the binder come directly from project initiation data
* Should auto-generate, not require manual assembly
* Same pattern: anything up until delivery, I can own and automate

### Proposal 3: Own Everything Up Until Delivery

> "Everything up until delivery is mine. I track, follow up, keep context. Once it goes to delivery, clear handoff."

* *What this means:**

* Win notification → I own it
* Information gathering → I own it
* Contract reconciliation → I own it (already doing this)
* Dust permits, sign ordering → I own it
* Handoff package → I own it
* Delivery manager receives complete package → Clear boundary

- --

## PART 4: THE PILOT + AUTOMATION PLAN

### The Pilot (Already In Progress)

1. **Win notification** - Partner with Sales/Rick know same day
2. **Information gathering** - Using intake checklist
3. **Contract reconciliation** - Already doing this (30-min review, follow-up until resolved)
4. **Handoff package** - Complete info to delivery managers
5. **Clear boundary** - Once delivered, clear handoff

### Automation I Can Build (Pending IT Review)

| Automation | Timeline | What It Does |
|------------|----------|--------------|
| Monday → SharePoint | Mid-January | Auto-create project folder + subfolders when project created |
| Siteline → QuickBooks | Exploring | Push billing data via API (Siteline has open API) |
| Email → CRM intake | January | Reduce manual triage of RFPs |
| Conductor.is integrations | Exploring | Bridge between systems |

* *Note:** Need IT to review/approve Conductor.is before proceeding.

### Metrics I'll Track

* Time from win notification to delivery handoff
* What info was missing and had to be chased
* What broke / what issues surfaced
* Reduction in contract reconciliation back-and-forth

- --

## THE FRAMEWORK

### Pillar 1: Project Lifecycle Management *(My Primary Focus)*

* Win notification → Information gathering → Contract reconciliation → Handoff to operations
* Clear data requirements at each stage
* No more projects falling through cracks

### Pillar 2: Sales Pipeline & Follow-up

* Automated follow-up sequences on estimates (Day 3, Day 7, Day of GC bid)
* Integration of lead sources (dust permits, building permits, emails, website)
* Partner with Rick on implementation

### Pillar 3: Document & Information Management

* Central file repository (SharePoint)
* Clear folder structure: /Projects/[Customer]/[Project Name]/
* One place to find everything
* **Automation:** Monday → SharePoint auto-folder creation (mid-Jan, pending IT)
* **Integration:** Conductor.is → QuickBooks file push (exploring)
* **Need:** SLA agreement on what data goes where

### Pillar 4: Operational Visibility & Continuous Improvement

* Cross-service visibility (who's doing what on each site)
* Weekly check-ins / issue tracking
* KPIs and feedback loops
* Longer-term, but sets up accountability

- --

## WHAT I NEED

1. **Alignment on ownership boundary** - Confirm I should own everything up until delivery (including dust permits, sign ordering)

2. **Weekly process improvement cadence** - Not just one meeting, but a structure:

    * 30 min with you weekly to surface issues and decide what needs attention
    * Cross-functional sessions as needed (I pull in the right people depending on what's being worked on - billing people for billing stuff, sales for sales stuff)
    * Not everyone in every meeting - just the people who need to be there

3. **Partner with Sales on Monday reorganization** - Align on:

    * Follow-up sequence design
    * How to structure the board so it works for everyone
    * Whether to migrate existing projects or start fresh

4. **IT review of Conductor.is** - Before I can build automations, need IT to approve the software

- --

## KEY QUOTES FROM INTERVIEWS

* *"I found out we won by driving past the site"* - Sales Team
* *"20 emails back and forth"* - On contract reconciliation
* *"I have no idea what we're doing until I go to bill for it"* - Kendra on change orders
* *"Each business line runs separately. They don't talk to each other."* - Sales Team
* *"When contract is done, I should get a packet with everything"* - Jayson on handoffs

- --

## 180-DAY PLAN STATUS (Day 37)

### Days 0-30 (Target: Nov 19) - MOSTLY COMPLETE

* Workflow Maps V0: 10+ complete (estimating, SWPPP, WT, PJ, roll-off, street sweeping, contract review, execution systems)
* Dust Permit SOP: DONE (taking ownership, not handoff)
* Sign Ordering SOP: DONE (taking ownership, not handoff)
* Opportunities Backlog: DONE (8 problem areas with solutions)
* Interviews/Discovery: DONE (exceeded expectations)

### Days 30-60 (Target: Dec 19) - STARTING

* Pilot workflow: IN PROGRESS (contract reconciliation active)
* Issue Log: Need to create
* SLA/KPI Proposal: Need to draft
* BusyBusy stakeholder alignment: Need to schedule
* Capture Wendy's CRO knowledge: URGENT (Dec retirement)
