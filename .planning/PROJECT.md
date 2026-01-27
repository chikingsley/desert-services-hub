# Contract Cascade

## What This Is

A contract intake and task management system for Desert Services. When a contract arrives at <contracts@desertservices.net>, the system auto-detects it, parses the context (project name, contractor, what's needed), and spawns the right tasks in Notion with the artifacts attached. People can pick up tasks and execute without hunting for information.

**Core Value:** When a contract arrives, the right tasks spawn with the right context, and people can just execute.

---

## The Workflow

### Stage 0: Intake / Documentation

**Trigger:** Contract comes in (via email, DocuSign, etc.)

**Tasks:**

1. Retrieve contract documents (PDF from DocuSign or other source)
2. Place documents in workable location (SharePoint folder)
3. Locate the associated estimate in Monday.com
4. Mark estimate as "Won" in Monday
5. Mark any competing estimates as "GC Not Awarded"
6. Send initial touchpoint email to contractor: "Do you need anything installed?"

**Outputs:**

- All documents gathered in one place
- Monday.com updated
- Initial customer contact made

**SLA:** 4 hours from contract receipt

---

### Stage 1: Reconciliation

**Trigger:** Documentation complete, ready to work

**Tasks:**

1. Extract contract data (use extraction template)
2. Verify insurance requirements against our limits (see Reference section)
3. Walk through contract line items against original estimate
4. Identify: What's been removed? What's still in? What's been added?
5. Determine if contract is good to sign or has issues

**Outputs:**

- Extraction complete with all key data captured
- Insurance verified (or flagged for exception)
- Reconciliation complete (issues documented if any)
- Clear determination: GOOD or HAS ISSUES

**SLA:** 1 business day

---

### Stage 2: Customer Response

**Trigger:** Reconciliation complete

**Path A — Contract is good:**

1. Send "ready to sign" confirmation to customer
2. Proceed to Stage 3

**Path B — Contract has issues:**

1. Send email to customer detailing issues
2. Move contract to WAITING status
3. Follow up daily until resolved

**Outputs:**

- Customer notified of status
- If issues: clear documentation of what needs to change

**SLA:** 4 hours after reconciliation complete

---

### Stage 2.5: Waiting / Back-and-Forth (Loop)

**Trigger:** Issues sent to customer, awaiting response

**Status:** BLOCKED — requires external action

**Daily Actions:**

- Check for customer response
- If no response: send follow-up
- If response received: return to Stage 1 for verification pass

**Verification Pass:**

- Faster than initial reconciliation
- Focused scope: confirm requested changes were made
- If good: proceed to Stage 2 Path A
- If still has issues: repeat Stage 2 Path B

**Visibility Requirements:**

- Show days since last follow-up
- Surface at top of daily action list
- Flag if >1 day since last contact

---

### Stage 3: Internal Notification

**Trigger:** Contract approved and ready to sign (or signed)

**Tasks:**

1. Compose project details email
2. Send to internalcontracts@ group

**Outputs:**

- Internal team notified
- Project details distributed

**SLA:** 4 hours after contract approval

---

### Stage 4: System Updates

**Trigger:** Internal notification sent

**Tasks:**

1. Update estimate in QuickBooks
2. Create new QuickBooks job number
3. Move contract and estimate documents into QuickBooks
4. Set up SharePoint folder structure

**Outputs:**

- QuickBooks job created
- All documentation linked
- Contract fully processed

**SLA:** Same business day

---

### SLA Summary

- Stage 0 (Intake): 4 hours — Yellow at 4h, Red at 8h
- Stage 1 (Reconciliation): 1 business day — Yellow at 1d, Red at 2d
- Stage 2 (Customer Response): 4 hours — Yellow at 4h, Red at 8h
- Stage 2.5 (Waiting): Daily follow-up — Flag daily, Red if >2 days no contact
- Stage 3 (Internal Notification): 4 hours — Yellow at 4h, Red at 8h
- Stage 4 (System Updates): Same day — Yellow at EOD, Red if overnight

---

## Current Manual Process

Use this checklist until automation exists. As features ship, items get replaced.

### Contract Processing Checklist

1. **[ ] Research Project**: Search email/Monday for history
2. **[ ] Find Estimate in Monday**: Locate item by project name/GC/address
3. **[ ] Create/Update Notion**: Ensure project record exists
4. **[ ] Mark "Won" in Monday**: Set `BID_STATUS` = "Won"
5. **[ ] Mark Competing Lost**: Set `BID_STATUS` = "GC Not Awarded" for other bids
6. **[ ] Get Estimate PDF**: Download from Monday or QB
7. **[ ] Get Contract PDF**: Save to SharePoint, link in Notion/Monday
8. **[ ] Extract Data**: Use extraction template. Capture:
   - Contract type, date, value
   - Retention %, billing platform, billing window
   - Certified payroll requirements
   - Schedule of values (attach separately)
   - All contacts (PM, Super, Billing)
   - Scope summary (line items)
   - Insurance requirements (GL, umbrella, auto, WC limits)
   - Site info (address, hours, access, safety)
   - Red flags or unusual terms
9. **[ ] Verify Insurance**: Compare contract requirements against Desert Services limits. If limits exceed coverage, STOP - contact WTW before signing
10. **[ ] Reconcile**: Compare totals and scope. Identify Added/Removed items
11. **[ ] Award Value in Monday**: Set `AWARDED_VALUE` to actual contract amount
12. **[ ] QuickBooks Update (Manual)**: Update job, address, and estimate version
13. **[ ] SharePoint Setup**: Create folder structure (`01-Estimates`, `02-Contracts`, etc.)
14. **[ ] Finalize Notion**: Populate all fields and set status to "Validated"
15. **[ ] Internal Email**: Notify team using the standard template
16. **[ ] Track Open Items**: Create Notion tasks for any missing docs/info
17. **[ ] Start Dust Permit** (if applicable): Kick off dust permit process based on contract scope
18. **[ ] Order SWPPP Plan** (if applicable): Send drawings to engineer, initiate SWPPP plan

### Intake Triage (Other Work Types)

- **Dust Permit Request**: Create minimal Notion, check grading plan & acreage
- **SWPPP Plan Request**: Create minimal Notion, send drawings to engineer
- **BMP Install Request**: Verify project exists, confirm site access & mobilization

---

## Requirements

### Validated (Existing)

- ✓ Email integration via Microsoft Graph — existing (`services/email/`)
- ✓ Monday.com integration — existing (`services/monday/`)
- ✓ Notion integration — existing (`services/notion/`)
- ✓ Contract reconciliation templates — existing (`services/contract/templates/`)
- ✓ PDF parsing capability — existing (`lib/pdf/`, `pdfjs-dist`)
- ✓ Estimate data model — existing (`lib/db/`, quote versioning)

### Active

**Detection:**

- [ ] **DETECT-01**: System monitors <contracts@desertservices.net> for incoming contracts/POs/LOIs
- [ ] **DETECT-02**: System identifies contract emails vs other emails (classification)

**Parsing:**

- [ ] **PARSE-01**: System extracts project name from contract document
- [ ] **PARSE-02**: System extracts contractor name from contract document
- [ ] **PARSE-03**: System finds original estimate in Monday.com by matching project/contractor
- [ ] **PARSE-04**: System extracts contact information (who to email for follow-ups)

**Task Spawning:**

- [ ] **TASK-01**: System creates tasks in Notion when contract detected
- [ ] **TASK-02**: Each task has context attached: contract PDF, original estimate, contact info
- [ ] **TASK-03**: Reconcile contract task created with comparison checklist
- [ ] **TASK-04**: Email contractor task created (ask if they want us to start anything)
- [ ] **TASK-05**: Update QuickBooks task created
- [ ] **TASK-06**: Update Monday.com task created
- [ ] **TASK-07**: Notify internal team task created (installations, inspectors, billing)
- [ ] **TASK-08**: Start dust permit task created (if applicable based on contract)
- [ ] **TASK-09**: Order SWPPP plan task created (if applicable based on contract)
- [ ] **TASK-10**: Tasks are assignable to specific people
- [ ] **TASK-11**: System captures project stakeholders — external people who receive deliverables (permits, plans, COIs). Populated from contract contacts and anyone involved in initial conversations

**Tracking:**

- [ ] **TRACK-01**: Task completion status is visible (open, in progress, done)
- [ ] **TRACK-02**: Time from contract arrival to completion is measurable
- [ ] **TRACK-03**: System surfaces contracts waiting on customer response with days-since-last-contact
- [ ] **TRACK-04**: SLA status indicators (green/yellow/red) visible per contract
- [ ] **TRACK-05**: Daily action view shows: waiting items not touched today, items past SLA

### Out of Scope (v2)

- Downstream dependent tasks (signs, narrative, installation tracking)
- Full activity history UI
- Agent automation of task execution — v1 is human scaffolding
- Mobile app — web/Notion only
- QuickBooks integration — manual update, just track that it was done
- Real-time email webhooks — v1 can poll or be triggered manually
- Automated document retrieval from DocuSign
- Response detection (auto-flag when customer replies)

---

## Reference

### System Map

- **Monday**: Estimates & Sales — Estimate ID, Bid Status, Awarded Value
- **Notion**: Projects & Tasks — Full Contract Data, Site Info, Handoff Docs
- **SharePoint**: Document Storage — `/Projects/Active/[GC]/[Project]/`
- **QuickBooks**: Financials — Job Name, Invoices, Final Estimate

### Templates

- Extraction: `services/contract/templates/01-extract-contract.md`
- Reconciliation: `services/contract/templates/02-reconcile.md`
- Insurance Check: `services/contract/templates/03-check-insurance.md`
- Response Actions: `services/contract/templates/04-respond-to-gc.md`
- Internal Handoff: `services/contract/templates/05-internal-handoff.md`

### Insurance Limits (Current)

**Policy Period:** Verify with WTW annually at renewal
**Last updated:** 2026-01-27 (umbrella raised from $3M to $5M)

- General Liability (per occurrence): $1,000,000
- General Liability (aggregate): $2,000,000
- Umbrella / Excess: $5,000,000
- Auto Liability: $1,000,000
- Workers Comp: Statutory
- Employer's Liability: $1,000,000

**What to Do:**

- GL $1M / $2M aggregate: OK, standard
- Excess/Umbrella $5M: OK (current limit)
- Excess/Umbrella $6M+: STOP - exceeds current coverage, contact WTW before signing
- Performance/Payment Bond: Contact Dawn/Eva for bonding capacity check

**WTW Contact:**

- Katie Beck, Senior Client Advocate
- (952) 842-6329 / <katie.beck@wtwco.com>
- COI requests: <certificates@wtwco.com>

---

## Context

**Current state:**

- Contracts funnel to <contracts@desertservices.net>
- Owner is the bottleneck for processing everything
- No task tracking — things live in inbox, get forgotten, become fires
- Active contracts in pipeline: 20-41 at any given time
- Monthly estimate volume: 200-300 (not all convert)
- Key risk: Contracts falling through during Waiting stage

**Users:**

- Owner (currently drowning)
- One admin being trained
- Possibly one more hire
- Eventually agents (backfill over time)

---

## Constraints

- **Timeline**: Critical — need something working in days, not weeks
- **Interface**: Tasks display in Notion — people work there, not a new UI
- **Tech stack**: Bun + TypeScript, build on existing services
- **Accuracy**: Contract parsing must be reliable — can't miss key terms

---

## Key Decisions

- Tasks in Notion: People already work there, no new UI to learn
- Cherry-pick existing code: Faster than rewriting, email/Monday/Notion already work
- 7 immediate tasks: Core cascade that prevents fires, defer dependent tasks
- No real-time webhooks v1: Adds complexity, polling or manual trigger is sufficient

---

*Last updated: 2026-01-27*
