# Contract Cascade

## What This Is

A contract intake and task management system for Desert Services. When a contract arrives at <contracts@desertservices.net>, the system auto-detects it, parses the context (project name, contractor, what's needed), and spawns the right tasks in Notion with the artifacts attached. People can pick up tasks and execute without hunting for information.

**Core Value:** When a contract arrives, the right tasks spawn with the right context, and people can just execute.

---

## The Workflow

Two parallel tracks run simultaneously after intake:

- **Track A: Contract Processing** — reconciliation, approval, finalization
- **Track B: Work Kickoffs** — triggered by GC response, runs parallel to contract processing

---

### Track A: Contract Processing

#### Stage 0: Intake

**Trigger:** Contract comes in (via email, DocuSign, etc.)

**Atomic Steps:**

1. **[ ] Get contract PDF** — download from DocuSign or email attachment
2. **[ ] Save to SharePoint** — place in `/Projects/Active/[GC]/[Project]/02-Contracts/`
3. **[ ] Find estimate in Monday** — search by project name, GC, or address
4. **[ ] Mark "Won" in Monday** — set `BID_STATUS` = "Won"
5. **[ ] Mark competing as "Lost"** — set `BID_STATUS` = "GC Not Awarded" for other bids on same project
6. **[ ] Initial touchpoint to GC** — email: "Contract received. Do you need anything started?" (triggers Track B)

**SLA:** 4 hours from contract receipt

---

#### Stage 1: Reconciliation

**Trigger:** Intake complete, contract in SharePoint

**Atomic Steps:**

1. **[ ] Quick sanity checks** — company name spelled right? address/phone/email correct? (see Validation Rules)
2. **[ ] Extract core data** — parties, dates, contract value, retention %, billing platform
3. **[ ] Extract SOV + verify totals** — schedule of values, confirm line items sum to total
4. **[ ] Extract contacts** — PM, Super, Billing, site contact
5. **[ ] Flag red lines** — check for red flags (fines liability, inspection qty, BMP+mobilization)
6. **[ ] Insurance check** — compare requirements to our limits (2 min task, see Reference)
7. **[ ] Compare to estimate** — line by line diff: what's added, removed, changed?
8. **[ ] Check for blank fields** — completion dates, critical terms must be filled
9. **[ ] Determination** — mark as GOOD or HAS ISSUES

**SLA:** 1 business day

---

#### Stage 2: Contract Resolution

**Trigger:** Reconciliation complete (determination made)

**If GOOD:**

1. **[ ] Email GC** — "Contract looks good, ready to sign"
2. **[ ] Proceed to Stage 3**

**If HAS ISSUES:**

1. **[ ] Email GC** — detailed issues list with specific asks
2. **[ ] Set status to WAITING**
3. **[ ] Enter Waiting Loop**

**SLA:** 4 hours after reconciliation

---

#### Stage 2.5: Waiting Loop

**Trigger:** Issues sent, awaiting GC response

**Daily Atomic Actions:**

1. **[ ] Check for GC response** — email, Monday comments, etc.
2. **[ ] If no response** — send follow-up email
3. **[ ] If response received** — do Verification Pass

**Verification Pass (faster than initial reconciliation):**

1. **[ ] Review changes** — confirm GC made requested changes
2. **[ ] Re-determine** — GOOD or STILL HAS ISSUES
3. **[ ] If good** — proceed to Stage 3
4. **[ ] If still issues** — repeat Stage 2 (issues email)

**Visibility:** Flag if >1 day since last contact, surface at top of daily action list

---

#### Stage 3: System Updates (BEFORE notifications)

**Trigger:** Contract approved (GOOD determination after any waiting)

**Atomic Steps:**

1. **[ ] Create QB job number** — if doesn't exist from Track B
2. **[ ] Update QB estimate** — final contract value, mark as FINAL (not partial)
3. **[ ] Move docs to QB** — attach contract PDF, final estimate
4. **[ ] Update Monday awarded value** — set `AWARDED_VALUE` to final contract amount
5. **[ ] SharePoint folder structure** — ensure `01-Estimates`, `02-Contracts`, `03-Permits`, etc.

**SLA:** Same business day

---

#### Stage 4: Targeted Notifications

**Trigger:** System updates complete (QB is ready)

**Atomic Steps:**

1. **[ ] Notify Billing/Kendra** — QB job #, billing platform, retention %, billing window
2. **[ ] Notify Inspections/Jason** — site address, schedule, safety requirements, site contact
3. **[ ] Notify Installations** — scope items, mobilization date, site access info
4. **[ ] Internal email (legacy)** — summary to internalcontracts@ group

**SLA:** 4 hours after system updates

---

### Track B: Work Kickoffs (Parallel to Track A)

**Trigger:** GC responds to initial touchpoint with "yes, start [work]"

This track runs in parallel with contract reconciliation. Work can start before contract is fully approved.

---

#### Step B1: Immediate Verification

**Do these immediately when GC says "start work":**

1. **[ ] Verify on-site contact** — "Is [name] the correct person for SWPPP sign and dust permit?"
2. **[ ] Verify address** — "Is [address] correct for the signs?"

---

#### Step B2: QB Setup (Partial)

**Before any work kicks off:**

1. **[ ] Create QB job number** — if doesn't exist yet
2. **[ ] Add estimate to QB** — mark as PARTIAL/PENDING (not final contract)
3. **[ ] Print email confirmation to PDF** — save GC's "yes, start work" email to SharePoint/QB

---

#### Step B3: Prerequisites

Each prerequisite has a decision tree. Check these in order.

**NOI (Notice of Intent):**

- Always REQUEST from GC (we never do it ourselves)
- Attach instructions for how to complete it
- Wait for GC to provide

**SWPPP Plan:**

```text
Is SWPPP Plan on the estimate (did they order from us)?
├── YES → Ask "do you need it started?" → If yes, ORDER it
└── NO → Is a SWPPP Plan already ATTACHED in Monday?
    ├── YES → Use it (we have it)
    └── NO → Do other deliverables need it? (narrative)
        ├── YES → ASK GC for it
        └── NO → Skip
```

**Dust Permit:**

```text
Is Dust Permit on the estimate (did they order from us)?
├── YES → Ask "do you need it started?" → If yes, SUBMIT it
└── NO → Is permit already ATTACHED/exists?
    ├── YES → Use it
    └── NO → Do other deliverables need it? (dust sign, narrative)
        ├── YES → ASK GC for it or clarify
        └── NO → Skip
```

---

#### Step B4: Deliverables (Dependency Chain)

Deliverables can only be done when their prerequisites are met.

| Deliverable | Requires | Action |
|-------------|----------|--------|
| **Dust Sign** | Dust Permit | Order from Sandstorm when permit arrives |
| **SWPPP Sign** | NOI | Order from Sandstorm when NOI arrives |
| **Narrative** | SWPPP Plan + NOI + Dust Permit | Complete when all three are in |

**As things come in:**

1. **[ ] Dust Permit arrives** → Order Dust Sign (needs verified address)
2. **[ ] NOI arrives** → Order SWPPP Sign (needs verified on-site contact)
3. **[ ] All three in** → Complete Narrative

---

### SLA Summary

| Stage | SLA | Yellow | Red |
|-------|-----|--------|-----|
| Stage 0 (Intake) | 4 hours | 4h | 8h |
| Stage 1 (Reconciliation) | 1 business day | 1d | 2d |
| Stage 2 (Contract Resolution) | 4 hours | 4h | 8h |
| Stage 2.5 (Waiting Loop) | Daily follow-up | 1d no contact | 2d no contact |
| Stage 3 (System Updates) | Same business day | EOD | Overnight |
| Stage 4 (Notifications) | 4 hours | 4h | 8h |
| Track B (Work Kickoffs) | Parallel — no blocking SLA | — | — |

---

## Current Manual Process

Use this checklist until automation exists. As features ship, items get replaced.

### Track A: Contract Processing Checklist

#### Stage 0: Intake

1. **[ ] Get contract PDF** — download from DocuSign or email
2. **[ ] Save to SharePoint** — `/Projects/Active/[GC]/[Project]/02-Contracts/`
3. **[ ] Find estimate in Monday** — search by project name, GC, or address
4. **[ ] Mark "Won" in Monday** — `BID_STATUS` = "Won"
5. **[ ] Mark competing as "Lost"** — `BID_STATUS` = "GC Not Awarded"
6. **[ ] Initial touchpoint to GC** — "Contract received. Do you need anything started?"

#### Stage 1: Reconciliation

1. **[ ] Quick sanity checks** — company name spelled right? address/phone correct?
2. **[ ] Extract core data** — parties, dates, value, retention %, billing platform
3. **[ ] Extract SOV** — schedule of values, verify totals match
4. **[ ] Extract contacts** — PM, Super, Billing, site contact
5. **[ ] Flag red lines** — fines liability, inspection qty, BMP+mobilization (see Validation Rules)
6. **[ ] Insurance check** — compare to our limits (see Reference)
7. **[ ] Compare to estimate** — line by line: added, removed, changed
8. **[ ] Check for blank fields** — completion dates, critical terms filled?
9. **[ ] Determination** — mark GOOD or HAS ISSUES

#### Stage 2: Contract Resolution

1. **[ ] If GOOD** — email GC "ready to sign", proceed to Stage 3
2. **[ ] If ISSUES** — email GC with issues list, enter waiting loop

#### Stage 2.5: Waiting Loop (if issues)

1. **[ ] Daily check** — did GC respond?
2. **[ ] If no response** — send follow-up
3. **[ ] If response** — verification pass: review changes, re-determine
4. **[ ] Repeat** — until GOOD or resolved

#### Stage 3: System Updates

1. **[ ] Create/update QB job** — job number, final contract value
2. **[ ] Move docs to QB** — contract PDF, final estimate
3. **[ ] Update Monday awarded value** — `AWARDED_VALUE` = final amount
4. **[ ] SharePoint folder structure** — ensure `01-Estimates`, `02-Contracts`, `03-Permits`, etc.

#### Stage 4: Targeted Notifications

1. **[ ] Notify Billing/Kendra** — QB job #, billing platform, retention %, billing window
2. **[ ] Notify Inspections/Jason** — site address, schedule, safety, site contact
3. **[ ] Notify Installations** — scope items, mobilization, site access
4. **[ ] Internal email (legacy)** — summary to internalcontracts@

---

### Track B: Work Kickoffs Checklist

*Run in parallel with Track A when GC says "yes, start work"*

#### Step B1: Immediate Verification

1. **[ ] Verify on-site contact** — confirm correct person for signs/permits
2. **[ ] Verify address** — confirm correct address for signs

#### Step B2: QB Setup (Partial)

1. **[ ] Create QB job number** — if doesn't exist
2. **[ ] Add estimate to QB** — mark as PARTIAL/PENDING
3. **[ ] Print email confirmation** — save GC's "start work" email to PDF

#### Step B3: Prerequisites

**NOI:**

1. **[ ] Request NOI from GC** — attach instructions, wait for them to provide

**SWPPP Plan:**

1. **[ ] Check: On estimate?** — did they order from us?
2. **[ ] If yes on estimate** — ask if they need it started → order if yes
3. **[ ] If no on estimate** — check: already attached in Monday?
4. **[ ] If attached** — use it
5. **[ ] If not attached + needed** — ask GC for it

**Dust Permit:**

1. **[ ] Check: On estimate?** — did they order from us?
2. **[ ] If yes on estimate** — ask if they need it started → submit if yes
3. **[ ] If no on estimate** — check: already attached?
4. **[ ] If attached** — use it
5. **[ ] If not attached + needed** — ask GC or clarify

#### Step B4: Deliverables (when prerequisites arrive)

1. **[ ] Dust Permit arrives** → Order Dust Sign from Sandstorm
2. **[ ] NOI arrives** → Order SWPPP Sign from Sandstorm
3. **[ ] All three in (SWPPP Plan + NOI + Dust Permit)** → Complete Narrative

---

### Intake Triage (Other Work Types)

- **Dust Permit Request (no contract)**: Create minimal Notion, check grading plan & acreage, run Track B prerequisite logic
- **SWPPP Plan Request (no contract)**: Create minimal Notion, send drawings to engineer
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

- Full activity history UI
- Agent automation of task execution — v1 is human scaffolding
- Mobile app — web/Notion only
- QuickBooks API integration — manual update, just track that it was done
- Real-time email webhooks — v1 can poll or be triggered manually
- Automated document retrieval from DocuSign
- Response detection (auto-flag when customer replies)

**Now in scope (Track B):** Downstream dependent tasks (signs, narrative) are now documented with decision trees and dependency chains.

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

### Validation Rules (from Ground Truth)

**Quick Sanity Checks (run first):**

- [ ] Company name spelled correctly? ("Desert Services" not "Deseret", etc.)
- [ ] Company address, phone, email correct?
- [ ] Contract parties correctly identified?
- [ ] Signatory name correct?

**Red Flags:**

| Pattern | Action |
|---------|--------|
| "Assume responsibility for fines" (unscoped) | NEVER AGREE — strike |
| "Assume responsibility for fines **due to Subcontractor's operations**" | OK — scoped to our work |
| Inspection quantity not specified | Redline to add count |
| BMP install without mobilization | FLAG — needs mobilization |
| Blank completion dates | BLOCKER — fill before signing |

**Scoped vs Unscoped Liability:**

- **OK (scoped):** "responsible for fines due to Subcontractor's operations" — standard self-responsibility
- **NOT OK (unscoped):** "assumes responsibility for all fines" — we're on the hook for others' mistakes

**At-Risk Bids:**

Large contracts ($100K+, 100+ pages) may have terrible language everywhere but be intentionally accepted. The risk was priced into the bid. Still flag issues but note "may be acceptable if at-risk bid."

**Location Rules:**

| Location | Rule |
|----------|------|
| Tucson | No rock entrances, different rates — flag if quoted Maricopa rates |
| (add more as discovered) | |

### Document Standards

**Every extracted value MUST have a source citation:**

```text
Source: contract.pdf, page 1
Quote: "Contract Sum: $4,940.00"
```

**Folder Requirements:**

| File | Required | Purpose |
|------|----------|---------|
| Contract/PO PDF | Yes | Source document |
| Estimate PDF | Yes | For reconciliation |
| notes.md | Yes | Extraction + follow-ups |
| extraction-raw.json | Yes | Structured extraction output |
| issues.md | If any | Document problems found |

**Document Classification:**

- **Contract** — full subcontract with terms
- **PO (Purchase Order)** — simpler authorization
- **LOI (Letter of Intent)** — preliminary agreement
- **Work Authorization** — scope-specific approval

Don't call a PO a "contract" — carry the correct type through all outputs.

### Common Pitfalls (from Issues Logs)

**Extraction Failures:**

- Summarizing from memory instead of documents → fabricated info
- No verification step → errors slip through
- Missing citations → can't trace where data came from
- SOV section fabricated → presented estimate as if it were contract SOV

**Admin Failures:**

- Monday not updated → estimates stuck at "Bid Sent" instead of "Won"
- PO/contract not uploaded to folder → can't complete extraction
- Separate tasks.md file → should be merged into notes.md
- Multiple estimates unclear → which one maps to this contract?

**Reconciliation Failures:**

- Math doesn't balance → need actual SOV from GC
- Rate discrepancies not resolved → pricing issues after work starts
- Items in scope not in estimate → need to price or strike

**Timing Failures:**

- Blank contract fields → completion dates unfilled, blocks signing
- Pricing issues discovered after work starts → grates example at OneAZ
- Missing documents for deadlines → cost escalation docs due Feb 13 (DM Fighter Squadron)

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

*Last updated: 2026-01-28*
