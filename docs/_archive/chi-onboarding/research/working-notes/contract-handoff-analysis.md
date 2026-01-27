# CONTRACT HANDOFF PROCESS ANALYSIS & PROPOSED TRIAL

* *Prepared for:** Project Coordinator Role Definition
* *Date:** October 30, 2025
* *Purpose:** Define trial process for estimate-to-execution handoff via Monday.com

- --

## CURRENT STATE: THE "BLACK HOLE" PROBLEM

### What Happens After Estimate is Sent

* *From Sales-Team-Summary.md:**

> "What Actually Happens: 1. Jared estimates SWPPP job 2. Bid goes out (sometimes entered in Monday, sometimes not) 3. ??? [Black hole - no one follows up consistently] 4. Sales discovers project by **driving past active construction site**"

* *From Rick-Haitaian-Summary.md:**

> "As of 5 months ago (when Rick started), there was NO follow-up on submitted bids/estimates. Rick has since implemented a systematic follow-up system... 3,000+ bids in Monday queue. No systematic follow-up on all of them. Rick focuses on high-dollar opportunities."

### When Projects Are Won - Missing Critical Info

* *From Sales-Team-Summary.md:**

> "Missing Information When Projects Are Won: No PM name or contact, No job site address, No start date, No confirmation which services were actually contracted, Sometimes just 'bid won' status with nothing else"

* *From Jayson-Roti-Summary.md:**

> "Missing Information: No NOI, No dust permit, No site contact, No schedule, No special site requirements. 'When contract is done, I should get a packet with everything'"

* *From Kendra-Ash-Summary.md:**

> "We're on site before we ever get a contract and know exactly how we're billing or what requirements they have. Reason: 'Everybody like I'm sure we already know everybody needs us on site first before they can do anything else'"

- --

## INFORMATION REQUIREMENTS BY STAKEHOLDER

### CRITICAL FOR ALL PROJECTS (Day 1 Needs)

* *From multiple summaries - synthesized:**

1. **Project Identity**

    * Project name (consistent across all systems)
    * GC company name
    * Site address with cross streets
    * Legal description

2. **Contacts**

    * PM name, phone, email
    * Site superintendent name, phone, email
    * GC estimator (for future bids)

3. **Timeline**

    * Expected start date
    * Project duration estimate
    * Install deadlines (if known)

4. **Financial**

    * PO number (always ask - Dawn-Wagner-Summary.md)
    * Contract amount
    * Services contracted (which service lines)
    * Billing method (Textura, GC Pay, invoice)
    * Retention percentage

5. **Authorization**

    * Email confirmation (required for billing protection)
    * Written authorization for billable items

### SERVICE-SPECIFIC REQUIREMENTS

* *SWPPP/Temp Fence (Jayson-Roti-Summary.md):**

* NOI with ADEQ number (CRITICAL BLOCKER)
* Dust permit OR confirmation GC will pull (CRITICAL BLOCKER)
* Project acreage
* Site contact for dust complaints
* Contractor name (must match NOI)
* Site-specific requirements (access hours, PPE, badging, etc.)

* *Dust Permit Specific (dust_control_sop.md + recent experience):**

* Accurate site contact (superintendent - gets dust complaints)
* Accurate site address with cross streets
* Exact acreage
* General shape of area / site drawing
* Property owner or developer info

* *Water Trucks/Cleaning (Daniel-Vargas-Summary.md):**

* PO number
* Time, dates, location
* Estimated duration
* Pictures (85% of customers provide)
* Water source confirmation (hydrant/meter/backflow or water tower)

* *Roll-Offs (Wendy-Byers-Summary.md):**

* Size of dumpster
* Location/address
* Type: Exchange, termination, or delivery
* Placement (for new deliveries)
* PM phone number

* *Signage (Kerin-Reissig-Summary.md):**

* Project name, address
* Permit types needed (dust, fire, SWPPP)
* Install date
* Responsible party contact info

- --

## THE 30-MINUTE DUST PERMIT SCENARIO

* *From dust_control_sop.md (most comprehensive SOP):**

If you had these upfront, dust permit could be done in <30 min:

1. ✅ Accurate site contact (superintendent)
2. ✅ Accurate site address with cross streets
3. ✅ Exact acreage
4. ✅ General shape/site drawing

* *Current reality (Jayson-Roti-Summary.md):**

> "Jayson must request this information via email. Often multiple follow-up requests. Information comes in piecemeal. No standardized handoff from estimating/sales."

* *The 20-email problem:**

> "'20 emails back and forth', Jared, Kendra, Jayson, customer all on thread, Everyone's time wasted on reconciliation"

- --

## PROPOSED TRIAL PROCESS (Monday.com)

### PHASE 1: POST-ESTIMATE FOLLOW-UP

* *When:** Estimate sent to customer

* *Who:** Chi (Project Coordinator)

* *Information to collect & track in Monday.com:**

* *Board Column Structure:**

```text
| Deal Name | GC | Est Amount | Date Sent | Expected Decision Date | Follow-Up Status | Decision |

```text

__Follow-up cadence:__

1. Day 0: Estimate sent
2. Day 3: First follow-up call/email

    - "Did you receive the estimate?"
    - "When do you expect to make a decision?"
    - "When is the GC bid due?" (mark this date!)
3. Day of GC bid: Follow-up call

    - "Did GC win the overall project?"
    - If yes: "Did we win the SWPPP portion?"
4. If WON: Immediately trigger Phase 2

### PHASE 2: PROJECT WIN - INFORMATION GATHERING

__When:__ Estimate marked WON in Monday.com

__Who:__ Chi (Project Coordinator)

__Automation:__ Monday.com status change "WON" → Triggers checklist

__Information Gathering Checklist (Monday.com subitems or form):__

__TIER 1 - IMMEDIATE (Get within 24 hours):__

- [ ] PM name
- [ ] PM phone
- [ ] PM email
- [ ] Site superintendent name
- [ ] Site superintendent phone
- [ ] Site superintendent email
- [ ] Site address with cross streets
- [ ] Expected start date
- [ ] PO number (if known)
- [ ] Email confirmation of win received

__TIER 2 - CRITICAL FOR SWPPP (Get within 48 hours):__

- [ ] NOI with ADEQ number OR timeline for GC to provide
- [ ] Dust permit status: GC has / GC pulling / DS pulling / Not required
- [ ] Project acreage (exact)
- [ ] Site drawing/plot plan
- [ ] Property owner or developer info
- [ ] Legal description
- [ ] Contractor name (must match NOI)

__TIER 3 - PRE-CONTRACT (Get before contract arrives):__

- [ ] Which services contracted (SWPPP, PJ, Fence, RO, WT, SW, Cleaning)
- [ ] Estimated contract amount per service
- [ ] Billing method (Textura / GC Pay / Invoice)
- [ ] Retention percentage
- [ ] Insurance requirements
- [ ] Site-specific requirements (access hours, PPE, badging, etc.)
- [ ] Water source (if WT contracted)
- [ ] Sign requirements (dust, fire, SWPPP, specialty)

### PHASE 3: CONTRACT HANDOFF PACKAGE

__When:__ All Tier 1 & 2 info collected

__Who:__ Chi creates standardized handoff package

__Monday.com Integration:__ Create "Project Initiation" board with automation

__Handoff Package Contents (one consolidated Monday.com update or file):__

```markdown
# PROJECT INITIATION PACKAGE

## Project Identity

- Project Name: [EXACT name for all systems]
- GC Company:
- Site Address: [with cross streets]
- Legal Description:
- Acreage:

## Contacts

- PM: [name] | [phone] | [email]
- Superintendent: [name] | [phone] | [email]
- GC Estimator: [name] | [email]

## Timeline

- Expected Start: [date]
- Project Duration: [estimate]
- Install Deadline: [if known]

## Services Contracted

- ☐ SWPPP ($XX,XXX) → Jayson
- ☐ Temp Fence ($XX,XXX) → Jayson
- ☐ PJs ($XX,XXX) → Stephen
- ☐ Roll-Offs ($XX,XXX) → Wendy
- ☐ Water Trucks ($XX,XXX) → Daniel
- ☐ Street Sweeping ($XX,XXX) → Kelley
- ☐ Cleaning ($XX,XXX) → Daniel

## Financial

- Total Contract Amount: $XXX,XXX
- PO Number:
- Billing Method: [Textura / GC Pay / Invoice]
- Retention: [%]

## SWPPP Requirements (if applicable)

- NOI Number: [ADEQ-XXXX] ✅ ATTACHED
- Dust Permit: [Attached / GC Pulling / DS Pulling (Jared billable)]
- Property Owner/Developer:
- Site Drawing: ✅ ATTACHED

## Site Requirements

- Access Hours:
- PPE Required:
- Badging Required: [Yes/No - Don handles]
- Water Source: [if WT]
- Special Instructions:

## Signage Requirements (Kerin)

- Dust Sign: [Yes/No]
- Fire Sign: [Yes/No]
- SWPPP Sign: [Yes/No]
- Specialty: [describe]
- Install Date Target:

## Attachments

☐ Email confirmation of win
☐ NOI (if SWPPP)
☐ Dust permit (if available)
☐ Site drawing/plot plan
☐ Pictures (if available)
☐ Special requirements document

```text

__Auto-notify when package complete:__

- Jared (Estimating)
- Jayson (if SWPPP/Fence)
- Kendra (Billing/Contracts)
- Relevant service directors
- Sales team (for upselling window)

### PHASE 4: DUST PERMIT FAST-TRACK

__If DS pulling dust permit:__

__From dust_control_sop.md - all info should already be collected in Phase 2:__

- ✅ Written authorization from GC (from email confirmation)
- ✅ Property owner/developer (from Tier 2)
- ✅ Site drawing (from Tier 2)
- ✅ Site address with cross streets (from Tier 1)
- ✅ Exact acreage (from Tier 2)
- ✅ Site contact/superintendent (from Tier 1)
- ✅ Project name (from Tier 1)
- ✅ Expected start date (from Tier 1)

__Action:__ Jared can complete dust permit same day, <30 minutes

__Result:__

- Download to SharePoint: Dust Permits > [Customer] > [Project]_DustPermit.pdf
- Print 2 copies for Eva
- Notify: Eva (can start narrative), Karen (can order dust sign), Jayson (blocker cleared)
- Add billable line item to contract

- --

## MONDAY.COM BOARD STRUCTURE (Proposed Trial)

### Board 1: "Estimates & Follow-Up"

__Columns:__

- Deal Name
- GC Company
- Services Quoted
- Estimate Amount
- Date Sent
- Expected Decision Date
- Follow-Up Status (Not Started / In Progress / Awaiting Decision / Won / Lost)
- Next Action Date
- Assigned To (Rick / Chi)
- Notes

__Automations:__

- Status → "Won" triggers notification to Chi
- Next Action Date = Today → Notify assigned person
- 3 days after Date Sent → Change Follow-Up Status to "In Progress"

### Board 2: "Project Initiation"

__Created when:__ Estimate status changes to "Won"

__Columns:__

- Project Name
- GC Company
- Services Contracted (multi-select: SWPPP, Fence, PJ, RO, WT, SW, Cleaning)
- Contract Amount
- Info Gathering Progress (0%, 25%, 50%, 75%, 100%)
- Tier 1 Complete (Yes/No)
- Tier 2 Complete (Yes/No)
- Tier 3 Complete (Yes/No)
- Handoff Package Sent (Yes/No)
- Contract Received (Yes/No)
- Assigned To: Chi
- Target Start Date
- Priority (High/Medium/Low)

__Subitems:__ Checklist of Tier 1, 2, 3 requirements

__Automations:__

- Tier 1 Complete = Yes → Notify sales team ("PM info ready, go upsell!")
- Tier 2 Complete = Yes & Services includes SWPPP → Notify Jared ("Ready for dust permit if needed")
- Tier 1 + Tier 2 + Tier 3 = All Yes → Create handoff package, notify all stakeholders
- Contract Received = Yes → Move to "Active Projects" board

### Board 3: "Active Projects"

__Created when:__ Contract received and handoff complete

__Links to existing operations boards:__

- SWPPP/Fence → Jayson's system
- PJ → Stephen/CRO
- RO → Wendy/CRO
- WT/SW/Cleaning → Dawn's Excel

__Purpose:__ Central visibility of all active projects with services, contacts, status

- --

## KEY FINDINGS FROM RESEARCH

### Most Frequently Cited Gaps (Across All Summaries)

1. __PM Contact Information Missing__ - Mentioned in Sales Team, Jayson, Rick summaries
2. __Site Address Missing__ - Mentioned in Sales Team, Jayson, Dawn summaries
3. __Start Dates Unknown__ - Mentioned in Sales Team, Rick, Jayson summaries
4. __Contract vs. Estimate Mismatch__ - Mentioned in Kendra, Jayson, Sales Team summaries
5. __Email Confirmation Not Obtained__ - Mentioned in Kendra, Dawn, Wendy, Daniel summaries
6. __No Project Win Notification__ - Mentioned in Sales Team, Rick, Jayson summaries

### Critical Patterns

__Pattern 1: The "Black Hole" After Bid Submission__

- Rick implemented follow-up 5 months ago (before that: ZERO follow-up)
- Sales discovers projects by driving past construction sites
- Operations starts work without sales knowledge
- PM names, addresses, start dates consistently missing

__Pattern 2: Contract != Estimate (Always)__

- Dollar amounts don't match
- Line items different
- Job names different
- "20 emails back and forth" to reconcile
- Work starts before reconciliation complete

__Pattern 3: Email Required But Not Always Obtained__

- Don (billing) fighting customers due to lack of email proof
- Kelly and Wendy take phone orders without email
- Audit requirements now mandate email
- "Blacklist" of non-paying customers exists

__Pattern 4: Information in Wrong Systems__

- Estimates in Monday.com (can't be seen by operations)
- SWPPP plans in Monday.com (should be SharePoint)
- QuickBooks has some, Monday has others
- "Everybody should be able to see it, not just the way one person wants to do it"

__Pattern 5: "Too Many Cooks" Without Coordination__

- Sales makes commitments operations doesn't know about
- Inspectors coordinate with customers directly
- Work appears on schedules without notice
- Multiple people contacting same customer

__Pattern 6: Service Division Silos__

- Sweeping doesn't know if water trucks present
- Kelly's paper notebook sent as photo weekly
- Sales visiting sites not knowing what company does there
- "Each business line runs separately. They don't talk to each other"

- --

## QUESTIONS FOR DECISION

1. __Follow-up ownership:__ Should Rick continue doing estimate follow-up, or should Chi take over once estimate is sent? Or split: Rick for sales-driven deals, Chi for estimating-driven deals?

2. __Monday.com access:__ Do all service directors need Monday.com access, or will Chi push info to their existing systems (CRO, Excel)?

3. __Timing:__ When to start the trial? Need to:

    - Set up Monday.com boards
    - Create automation rules
    - Define notification routing
    - Create templates (handoff package, email scripts)

4. __Pilot scope:__ Start with just SWPPP projects (since they're most complex with dust permits), or all service lines?

5. __Success metrics:__ How will we measure if this is working? Ideas:

    - % of projects with complete Tier 1 info within 24 hours of win
    - % of projects with Tier 2 info within 48 hours
    - Reduction in "20 email back-and-forth" incidents
    - Time from win to dust permit completion
    - Number of projects discovered "by accident" (should go to zero)

- --

## SOURCES CITED

__People Summaries:__

- Sales-Team-Summary.md
- Rick-Haitaian-Summary.md
- Jayson-Roti-Summary.md
- Kendra-Ash-Summary.md
- Dawn-Wagner-Summary.md
- Wendy-Byers-Summary.md
- Daniel-Vargas-Summary.md
- Kerin-Reissig-Summary.md
- James-Neal-Summary.md

__Process Documentation:__

- 2-deliverables/SOPs/dust_control_sop.md
- 2-deliverables/workflow-maps/SWPPP_Process_Map.mermaid
- 2-deliverables/workflow-maps/SWPPP_Docs_Process.mermaid
- 2-deliverables/workflow-maps/estimating_process.mermaid
- 2-deliverables/workflow-maps/WT_Process_Map.mermaid

__Working Notes:__

- 1-research/working-notes/rick-interview-notes.md
- 1-research/working-notes/sales.md
- 1-research/working-notes/Interview-notes-Kerin.md
- 1-research/working-notes/Interview-notes-Daniel.md
- 1-research/working-notes/overall notes from stickies.md

- --

__Document prepared:__ October 30, 2025
__Next steps:__ Review with Tim, decide on pilot approach, set up Monday.com boards
