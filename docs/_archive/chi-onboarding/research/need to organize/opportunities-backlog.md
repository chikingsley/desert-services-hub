# Opportunities Backlog

* *Purpose:** Problems grouped by root cause, with solutions and evidence.

* *Last Updated:** November 26, 2025

- --

## ROOT CAUSE 1: No Systematic Follow-Up / Inconsistent Bid Handling

* *The Pattern:** Estimates go out, nobody follows up systematically, contracts arrive to random people, and we find out we won by accident.

### Problems Caused

| Problem | Impact | Evidence |
|---------|--------|----------|
| No win notification | Sales discovers projects by driving past job sites | "I had no idea that job existed" |
| 5+ people receiving contracts | Kendra, Jared, Jayson, Sales, Rick - anyone can get it | Contract review process shows fragmented intake |
| Contract ≠ estimate (reconciliation needed) | 20 emails back and forth, work starts before resolved | "We're on site before we ever get a contract" |
| 3,000+ bids with no systematic follow-up | Lost wins, missed revenue, no data on why we lose | Rick: "3,000+ bids in Monday queue" |
| No win/loss tracking | Can't make data-driven pricing decisions | Anecdotal "it's price or relationships" |

### The Idea: Automated Follow-Up + Salesperson Involvement

* *The System:**

```text
STAGE 1: AUTOMATED FOLLOW-UP
────────────────────────────
Day 0:  Estimate sent → logged in Monday with GC bid date
Day 3:  Auto-email "Did you receive? Questions?"
Day 7:  Auto-email "Following up on estimate"
Day of GC bid: Auto-email "Good luck, let us know"
Day after: "Did GC win? Did we win SWPPP?"

STAGE 2: SALESPERSON INVOLVEMENT (Decision Required)
────────────────────────────────────────────────────
When customer responds → Salesperson OR Estimator follows up
   • "What else do you need?"
   • Upsell opportunity BEFORE the win
   • Simple add-ons can be handled by salesperson
   • Complex estimates go back to estimating

STAGE 3: WIN/LOSS ROUTING
─────────────────────────
IF WON:
   → Contract comes to Chi (one place, not 5 people)
   → Project initiation process starts
   → Also goes to Sales for account management

IF LOST:
   → Goes to Sales only
   → Find out who won the GC bid
   → Follow up with winner: "Do you need any of our services?"
   → Log reason for loss → pricing data

STAGE 4: ONGOING ACCOUNT MANAGEMENT (Sales)
───────────────────────────────────────────
Sales schedules site visits based on project:
   • Weekly / Monthly / Quarterly / One-time

If upsell opportunity during site visit:
   → Submit new bid request OR change order
   → Goes through estimating
   → Approved → Chi → Operations

```text

__Decision Required:__ Who handles follow-up when customer responds?

- Option A: Estimating department owns all follow-up
- Option B: Salesperson handles simple follow-up, estimating handles complex
- Option B preferred because: upselling is a sales function, natural relationship building

__Data Tracking Opportunity:__
Over time, start noting: project type, when we found out, how long from bid to decision, acreage/dollar amount. After ~1,000 projects, patterns emerge for pricing decisions.

__Stakeholders:__ Chi, Rick, Sales team, CEO, Estimating
__Status:__ THE IDEA (system design phase)

__Implementation Phases:__

* Phase 1: Chi Can Start Tomorrow*

- Start tracking which contracts come in and from where
- Document the current chaos (evidence gathering)
- Design the system on paper

* Phase 2: Needs Conversation + Agreement*

- Present follow-up system to Rick, Sales, CEO
- Decision: Who handles customer responses (sales vs estimating)?
- Agreement: All contracts route to Chi

* Phase 3: Technical Implementation*

- Configure Monday.com automations for follow-up sequence
- Set up win/loss logging
- Test with small batch before full rollout

- --

## ROOT CAUSE 2: No Project Initiation / Project Management Process

__The Pattern:__ Once we win, nobody owns gathering info, tracking progress, or ensuring handoffs happen. People use email flags and memory.

### Problems Caused

| Problem | Impact | Evidence |
|---------|--------|----------|
| Missing PM contact on handoff | Can't reach site, cold calling our own customers | "I could cold call them, which is absolutely bananas" |
| No project start date | Operations can't plan, surprises when GC demands service | "When contract is done, I should get a packet" |
| Email as project management | Flag emails and pray, no visibility into what needs follow-up | Everyone does this |
| Documents scattered everywhere | Constant "where's this file?" emails | "15 places to check" |
| No auditable trail for orders | WT, sweeping, roll-offs, PJs have no signed confirmation | Work done without written approval |
| Change orders discovered during billing | Revenue leakage, "It's always a surprise" | Kendra: "I have no idea what we're doing until I go to bill" |

### The Solution

__Project initiation process (Chi owns win → delivery handoff):__

1. Win notification → Chi
2. Information gathering using intake checklist
3. Contract reconciliation (should be minimal if follow-up done right)
4. __SIGNED ESTIMATE before any work starts__
5. Handoff package to delivery manager
6. Track until delivery confirms receipt

__The Signed Estimate Rule:__
> Every piece of work requires a signed estimate before anyone steps on site. No exceptions.

- New project: Signed estimate
- Change order: New estimate marked "Revision 1", must be signed
- Additional work: New estimate, must be signed

__Stakeholders:__ Chi, Delivery Managers, CEO
__Status:__ THE IDEA

__Implementation Phases:__

* Phase 1: Chi Can Start Tomorrow (needs awareness, not behavior change from others)*

- Win notification comes to Chi
- Information gathering using intake checklist
- Contract reconciliation
- Track until delivery confirms receipt

* Phase 2: Needs Conversation + Agreement*

- Signed estimate before any work starts
- Everyone needs to understand: "This is what I'm doing and why"
- Requires: Chi, Rick, CEO sign-off

* Phase 3: Requires Others to Change Behavior*

- Handoff package format confirmed with each delivery manager
- "This is what I'll send you, this is what I expect from you"
- Follow-up cadence established

- --

## ROOT CAUSE 3: Manual Service Line Processes

__The Pattern:__ Three service lines run on manual processes:

- __Water Trucks:__ Daniel uses Notes app on phone, WT Master Excel
- __Street Sweeping:__ Kelly's handwritten notebook, paper tickets
- __SWPPP:__ Managed through Excel spreadsheet, no project tracking or visibility

For WT/Sweeping, it's a "crossword puzzle" to figure out what was done. 1-2 week billing lag. For SWPPP, no visibility into project status until someone asks.

### Problems Caused

| Problem | Service | Impact | Evidence |
|---------|---------|--------|----------|
| Handwritten schedules | WT/Sweeping | Hours of manual work, room for error | WT SW Master Excel, Kelly's paper |
| Work completes in Notes app / text photos | WT | 2-5 day lag before Dawn gets data | Daniel uses phone Notes app |
| Weekly schedule printed and handed out | WT/Sweeping | No real-time visibility | Drivers text for addresses |
| Driver can't find job site | WT/Sweeping | Texts Daniel for cross streets | No maps integration |
| Dawn deciphers handwritten tickets | Sweeping | 1-2 week billing delay | "Crossword puzzle" |
| SWPPP tracked in Excel only | SWPPP | No project visibility, status unknown until asked | SWPPP Master Excel |
| No project management for SWPPP | SWPPP | Can't see what's pending, in progress, or complete | Manual tracking |
| Inspector schedules not visible | SWPPP | Operations can't plan inspector coverage | Excel-based scheduling |

### What the Manual Process Does

1. __Timekeeping:__ When clocked in, when arrived
2. __Work completes:__ What projects they hit

Any replacement needs to do BOTH of these.

### Current State: BusyBusy App

__Status:__ Rolled out ~1 week ago, top-down

__Project Lead:__ Natalie Richardson (Assistant to CEO / Chief of Staff) - off-site

__Issues:__

- Nobody trained
- No champion on site who can answer questions
- Unknown if it can replace the manual process
- Unknown: How do you input jobs? Maps integration? Routing?
- __No comparison with CRO__ - CRO already does dispatch, tracking, has an app. Why BusyBusy instead?

__Systemic Issue:__ This is a pattern - new systems rolled out without:

- Stakeholder buy-in
- Proper training (not PowerPoints - actual hands-on)
- Understanding of what the manual process actually does
- On-site champion who can answer questions

__Stakeholders:__ Daniel, Kelly, Dawn, Natalie Richardson (lead), Chi (advocacy)
__Status:__ IN PROGRESS (but poorly rolled out)

### Implementation Phases (How It Should Work)

__Phase 1: Stakeholder Alignment__

- [ ] Get stakeholder group together: Natalie, Daniel, Kelly, Dawn, Chi
- [ ] Establish regular cadence (weekly check-ins)
- [ ] Document what manual process actually does (timekeeping + work completes)
- [ ] Compare BusyBusy vs. CRO - why not use CRO for this?

__Phase 2: Pilot Testing__

- [ ] Test with ONE driver first
- [ ] Get feedback: What works? What doesn't?
- [ ] Test with 2-3 more drivers
- [ ] Pay them extra for feedback time
- [ ] Document issues and gaps

__Phase 3: Validation__

- [ ] Confirm BusyBusy does BOTH: timekeeping AND work completes
- [ ] Verify maps integration works
- [ ] Verify Dawn can get data she needs for billing
- [ ] Compare data quality: BusyBusy vs. manual process (side by side)

__Phase 4: Training & Rollout__

- [ ] Hands-on training with BusyBusy reps (not PowerPoints)
- [ ] On-site champion identified who can answer questions
- [ ] Group training for all drivers
- [ ] Phased rollout (not all at once)

__Phase 5: Monitoring__

- [ ] Track data quality during transition
- [ ] Weekly check-ins with stakeholder group
- [ ] Adjust process based on real feedback

__What's Needed NOW:__

- Stakeholder group meeting to align
- Decision: Continue with BusyBusy or evaluate CRO for this?
- On-site champion identified

### SWPPP Solution: Project Management Tool

__Current state:__ SWPPP projects tracked in Excel spreadsheet. No visibility into status.

__The Solution:__ Move SWPPP into a project management tool (CRO or similar):

- Project status visible (pending, in progress, complete)
- Inspector scheduling visible
- Deliverables tracked (binder, inspections, BMPs)
- Integration with project initiation workflow

__Why CRO:__ Already have CRO for PJ/Roll-off. Could expand to SWPPP. Same vendor, same training relationship.

__Stakeholders:__ SWPPP team, Chi (process design)
__Status:__ THE IDEA

- --

## ROOT CAUSE 4: CRO Underutilization (PJ + Roll-off)

__The Pattern:__ PJs and Roll-offs HAVE a system (CRO), but it's not used well. Issues happen and nobody knows why. Firefighting instead of solving root causes.

### Problems Caused

| Problem | Impact | Evidence |
|---------|--------|----------|
| Route optimization backwards | Can only optimize AFTER assigning, not during | "Hardest part of the job is routing" |
| Wrong can numbers allowed | No validation, duplicate cans on sites | Roll-off tracking chaos |
| Schedules don't populate | Unknown why | Firefighting mode |
| CRO time tracking not used | Feature exists, just not set up | Wasn't trained |
| PJs not asset tagged | Can't locate moved units | "Most of the time PJs are moved" |
| CRO billing integration unused | Could export to QuickBooks | Kerin doing manual entry |

### Key Difference from WT/Sweeping

They HAVE a system. The problem is training/process improvement, not the tool itself.

### Vendor Relationship

- We have a rep
- They do training, willing to do as much as we want
- Super open to helping
- __Missing: Ongoing issues list to work through with them__

### The Solution

- Regular sit-downs with CRO vendor (ongoing, not one-time)
- Create and maintain issues list
- Go through issues weekly with Stephen/Wendy/Kerin
- Continuous process improvement

__Note:__ Wendy retiring end of year - capture her issues/workarounds before she leaves.

__Stakeholders:__ Stephen, Wendy, Kerin, Chi (can drive training)
__Status:__ THE IDEA

__Chi Can Drive:__

- Schedule regular CRO vendor training sessions
- Start issues list
- Capture Wendy's knowledge before retirement

- --

## ROOT CAUSE 5: Estimating Bottleneck

__The Pattern:__ Triage step is hard, data is missing, shortcuts taken, estimator distracted by firefighting. 3,000+ bids sitting in SENT status.

### Problems Caused

| Problem | Impact | Evidence |
|---------|--------|----------|
| Hard to get RFP into CRM | Highly manual, need to find PDFs | Triage step in process map |
| Shortcuts taken | Missing address, partial contacts, estimates not attached | Data quality issues |
| Estimator distracted | Called all day asking "where's this file?" | Firefighting for operations |
| 3,000+ bids in SENT status | No systematic follow-up | Rick focuses on high-dollar only |
| Duplicating old estimates | Instead of using memoized lists | Chi working on this |

### The Solution

__Short-term (Chi already working on):__

- Memoized lists instead of duplicating old estimates
- Project initiation will reduce estimator distraction

__Short-term: SLAs for Data Quality__

- Define minimum requirements for estimates in Monday (address, contacts, files attached)
- If it doesn't have the required fields, it's not done
- SLA agreement between estimating and everyone else: what data do you need? where do you want it?

__Short-term: Automation (Chi can build)__

- Automate email → CRM data intake (reduce manual triage)
- Monday change → auto-create SharePoint folder structure
- Files auto-attach to correct locations
- Timeline: beginning of January (pending IT review)

__Medium-term:__

- Hire 2-3 more estimators (on the docket)
- Better triage process

__Long-term:__

- CRM configuration to reduce clicks

__Stakeholders:__ Jared, Rick, CEO (hiring), IT (automation approval)
__Status:__ PARTIALLY IN PROGRESS

- --

## ROOT CAUSE 6: QuickBooks/Billing Process Limitations

__The Pattern:__ QuickBooks isn't the problem - it's process/policy. Security lockdown from ransomware attack creates friction. No integration with pay apps.

### Problems Caused

| Problem | Impact | Evidence |
|---------|--------|----------|
| Remote desktop requirement | Locks up, friction for remote workers | Ransomware attack response |
| No AIA billing | Most contracts require AIA format | Manual workaround |
| No retainage tracking | Can't see what's 10% held vs actually outstanding | 2+ year retainage invisible |
| No pay app integration | Must manually enter into GC Pay, Textura, Procore | Double data entry |
| Can't lock past months | Audit/investor concerns | Unknown if feature exists |
| Email as AR tracking | Flag invoices, folder systems | Not replicable if someone leaves |
| __QuickBooks used as running tally__ | Data integrity issues | Invoices opened, saved, items added over time instead of all at once |

### Why Siteline Was Brought In

Before Siteline, billing team was using QuickBooks incorrectly:

- Open an invoice → save it → add line items throughout the month
- Change orders added to the same open invoice
- At month end, send out the invoice

__The problem:__ This messes up the data. QuickBooks expects invoices created and sent, not used as a running tally. Siteline was brought in to handle the progressive billing workflow properly.

__Current state:__ Siteline is in use but underutilized. Pay for it, use it for change orders, but not fully leveraging its capabilities.

### Pay Apps Used

- GC Pay
- Textura
- Procore
- Direct invoice (some)

### The Solution: Full Siteline Utilization

__Current state:__ Already paying for Siteline, using for change orders, but not fully utilizing.

__The Workflow:__

```text
SOV/Contract → SITELINE (billing work) → API/Conductor → QUICKBOOKS (final AR)
                    │
                    ├── Pay apps (progressive billing)
                    ├── GC portal submission (GC Pay, Textura one-click)
                    ├── Change orders → flow to SOV
                    ├── Lien waivers (6x faster)
                    └── Retainage tracking

```text

__Why this works:__

- Siteline handles progressive billing properly (billed-to-date, balance to finish, carry-over)
- QuickBooks stays "God" - final AR, GL, system of record
- __Siteline has open API__ - Conductor.is integration possible (Chi exploring SOONER)

__What changes:__

| Function | Now | Full Utilization |
|----------|-----|------------------|
| Pay apps | Mixed | All in Siteline |
| GC portals | Manual entry | One-click submit |
| Change orders | In Siteline | Same (already working) |
| Lien waivers | Manual | Automated |
| Retainage | Not visible | Tracked in Siteline |
| QuickBooks | Everything | Final AR/GL only |

__Stakeholders:__ Kendra, Don, Chi (research), CEO (tool decision)
__Status:__ RESEARCH PHASE - see 1-research/siteline-research/SITELINE-RESEARCH-SUMMARY.md

- --

## ROOT CAUSE 7: Files Everywhere

__The Pattern:__ 15+ places to check. Estimator spends time answering "where's this file?"

### Problems Caused

| Problem | Impact | Evidence |
|---------|--------|----------|
| SharePoint, email, QuickBooks, local drives | Nobody knows where to look | "15 places to check" |
| Estimator distracted | Answering file location questions | Takes away from estimating |
| Contract reconciliation harder | Can't find original estimate | Manual searching |

### The Solution

__Depends on other root causes being solved:__

- Project initiation (RC2) creates consistent filing
- Estimating SLAs (RC5) ensure files are attached

__Automation (Chi can build):__

- Monday change → auto-create SharePoint folder + subfolders
- Files auto-populate to correct locations
- Conductor.is → push files to QuickBooks via API
- Timeline: mid-January (pending IT review/approval)

__What's needed first:__

- Conversations with stakeholders: what do you want? where do you want files?
- IT deep dive on Conductor.is / automation software
- Agreement on folder structure

__Short-term compromise:__

- Use SharePoint as central location
- Clear naming conventions
- Manual process until automation approved

__Stakeholders:__ Everyone, IT (automation approval)
__Status:__ THE IDEA

- --

## ROOT CAUSE 8: No Oversight / Feedback Loops

__The Pattern:__ No way to know if work is being done correctly until something explodes.

### Problems Caused

| Problem | Impact | Evidence |
|---------|--------|----------|
| Certified payroll not filed for a year | Compliance risk, nobody caught it | Someone didn't do their job for 12 months |
| No metrics on quote turnaround | Can't determine estimator capacity | Not measured |
| Inspector details inconsistent | Missing measurements, photos | "Fence down on east side" without lineal footage |
| Call answering system - no oversight | No quality checks, can't transfer calls | All messages, no live transfers |

### The Solution

__Issue tracking:__

- Simple form to log issues
- Weekly review of issues
- Pattern identification

__Inspector standardization:__

- Standard fields required: measurements, photos, email confirmation before leaving site
- SOP for deficiency reporting

__KPIs to track:__

- Quote turnaround time
- Win rate by service line
- Time from win to delivery handoff
- Change order discovery timing

__Stakeholders:__ Chi (issue tracking), Delivery managers (inspector standards), CEO (oversight)
__Status:__ THE IDEA

__Chi Can Start Tomorrow:__

- Set up simple issue tracking
- Start logging issues as they happen
- Weekly personal review of patterns

- --

## AUTOMATABLE PROCESSES (Chi Owns Now)

| Process | Current | Automated | Chi Owns Now? |
|---------|---------|-----------|---------------|
| Dust permit filing | Manual portal entry | Trigger from project data | ✓ Yes |
| Sign ordering | Manual request | Trigger from services contracted | ✓ Yes |
| SWPPP narrative binder | Manual assembly | Auto-generate from project data | Future |
| Follow-up sequences | Rick manually on high-dollar | Auto-email Day 3, 7, GC bid day | Needs system design |
| File organization | Manual upload/labeling | API moves files to correct locations | Future |

- --

## THE VISION: Simplified System Flow

```text
ESTIMATING                    PROJECT COORDINATOR              DELIVERY                BILLING
───────────                   ───────────────────              ────────                ───────
Email + Monday                Email + Monday + SharePoint      Email + CRO             Email + QuickBooks
     │                                  │                           │                        │
     │  Estimate sent                   │                           │                        │
     │  ─────────────►                  │                           │                        │
     │                    Follow-up sequence (auto)                 │                        │
     │                    Win notification                          │                        │
     │                    Info gathering                            │                        │
     │                    SIGNED ESTIMATE ──────────────────────────┼────────────────────────┤
     │                    Contract reconciliation                   │                        │
     │                    Handoff package ─────────────────────────►│                        │
     │                                  │                           │                        │
     │                                  │                    Work performed                  │
     │                                  │                           │                        │
     │                                  │                    Work complete ─────────────────►│
     │                                  │                           │                   Invoice

```text

__Key principle:__ Each role stays in their tools. Files move via automation, not manual forwarding.

- --

## WHAT CHI CAN START TOMORROW

| Action | Root Cause | Who Needs to Know |
|--------|------------|-------------------|
| Track where contracts come from | RC1: Follow-up | Just Chi |
| Win notification comes to Chi | RC2: Project init | Rick, CEO (awareness) |
| Information gathering checklist | RC2: Project init | Just Chi |
| Signed estimate before work starts | RC2: Project init | Rick, CEO (approval) |
| Track until delivery confirms receipt | RC2: Project init | Just Chi |
| Advocate for BusyBusy proper rollout | RC3: WT/Sweeping | Leadership |
| Schedule CRO vendor training | RC4: CRO | Stephen, Wendy, Kerin |
| Conductor.is API research | RC6: Billing | Just Chi |
| Set up personal issue tracking | RC8: Oversight | Just Chi |
| Dust permit filing | Automation | Just Chi (already doing) |
| Sign ordering | Automation | Just Chi (already doing) |

- --

## RACI SUMMARY

| Initiative | Responsible | Accountable | Consulted | Informed |
|------------|-------------|-------------|-----------|----------|
| Project initiation process | Chi | Chi | Delivery mgrs | All |
| Signed estimate rule | Chi | CEO | Rick | All |
| Follow-up system | Chi + Rick | Rick | Sales, Estimating | CEO |
| BusyBusy proper rollout | Leadership | Leadership | Daniel, Kelly, Dawn | All |
| CRO training/issues | Chi | Chi | Stephen, Wendy, Kerin | Leadership |
| Siteline/billing research | Chi | Chi | Kendra | CEO |
| Issue tracking | Chi | Chi | Delivery mgrs | CEO |
| Automation (permits, signs) | Chi | Chi | — | Leadership |

- --

__Source Documents:__

- 10 interview transcripts
- 11 people summaries
- ideas.md, data-needed.md, contract-handoff-analysis.md
- CONVERSATION-tools-workflow-problems.md (in 1-research)
