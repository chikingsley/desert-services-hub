# Contracts Process Playbook

Updated: 2026-02-24
Owner: Contracts + PM Operations
Status: Canonical operating process

This document consolidates overlapping process/workflow guidance into one operating playbook.

## 1) Intake Lane Decision

Choose one lane at intake. Do not block intake on missing downstream details.

Lane: `Work Auth (Direct)`
- Use when: work is authorized and billable without waiting for a full contract packet.
- Immediate next ops: create/confirm QB job, capture billing setup, proceed to kickoff prerequisites.

Lane: `Work Auth (Awaiting Contract)`
- Use when: provisional authorization exists and final contract is still pending.
- Immediate next ops: record authorization evidence, request final packet, proceed with approved-start tasks only.

Lane: `Contract Packet`
- Use when: a full contract package is received and needs reconciliation.
- Immediate next ops: triage packet docs, reconcile to estimate, resolve issues, then handoff.

Minimum intake data:

- Project reference (name or subject is acceptable)
- Lane selection
- Source email/document link
- Received timestamp

## 2) Stage Flow (Track A: Contract Processing)

Stage 0: `Intake + Triage Start`
- SLA: 4 hours from receipt.
- Required outcome: active packet owner, packet type, next action, docs linked.

Stage 1: `Reconciliation`
- SLA: 1 business day from triage start.
- Required outcome: contract vs estimate comparison completed with explicit disposition.

Stage 2: `Resolution`
- SLA: 4 hours after reconciliation.
- Required outcome: GC response sent (approval or issue list).

Stage 2.5: `Waiting Loop`
- SLA: daily follow-up.
- Required outcome: no packet sits without a dated next action.

Stage 3: `Project Formalization`
- SLA: same business day as disposition.
- Required outcome: project record completed for handoff-critical fields.

Stage 4: `Kickoff Readiness + Handoff`
- SLA: 4 hours after Stage 3.
- Required outcome: delivery handoff acknowledged with timestamped owner.

### Stage 0: Intake + Triage Start

Required actions:

- Set packet owner.
- Set packet type (`single_pdf`, `multi_doc_packet`, `mixed`, `unknown`).
- Confirm primary contract evidence exists.
- Set explicit `next_action`.
- Move packet status from `received` to `triage_in_progress`.

### Stage 1: Reconciliation

Required checks:

- Identity sanity check (company names, core project identity fields).
- Contract data extraction (value, dates, retention, billing terms, contacts).
- Scope/line-item comparison to winning estimate.
- Math check:

```text
Estimate - Removed + Added = Contract
```

- Validation scan per `validation-policy.md`.

Disposition (must choose one):

- `executed`
- `ready_to_send_back`
- `awaiting_counterparty`

Guardrails:

- Do not continue with unresolved value/scope mismatch.
- Do not treat missing contacts, billing terms, or required permits as complete.

### Stage 2: Resolution

If clean:

- Send GC confirmation and proceed toward execution/handoff.

If issues:

- Send issue list with explicit asks.
- Set status to `awaiting_counterparty`.
- Set dated follow-up `next_action`.

### Stage 2.5: Waiting Loop

Daily actions:

- Check for response.
- Send follow-up if none.
- Verify revisions quickly on receipt.
- Re-classify as `executed` or cycle back to issue response.

### Stage 3: Project Formalization

Populate `../templates/project-record-template.md`.

Required minimum sections before handoff:

- Identity + links (project, estimate, packet, document locations)
- Contract summary (type, value, retention, status)
- Contacts (PM, superintendent, billing)
- Billing setup (PO, platform, billing window, cert payroll requirement)
- Permit/prereq status (NOI, dust permit, SWPPP artifacts as applicable)
- Open questions with owner + due date

### Stage 4: Kickoff Readiness + Handoff

Pre-handoff checks:

- Contract status is actionable (`executed` or approved-start path documented).
- Scope and billing are reconciled/documented.
- Site access and contacts are confirmed.
- Compliance docs handled (COI, W-9, license, etc.).
- Delivery handoff sent with packet evidence links.

Done for Stage 4:

- Receiving owner acknowledged handoff.
- Timestamp recorded in tracker.

## 3) Parallel Work Kickoff (Track B)

Track B can run in parallel when GC authorizes start before final contract execution.

Immediate actions after "start work" authorization:

- Verify on-site contact.
- Verify service address.
- Create QB job if missing.
- Record authorization email as evidence.

Prerequisite logic:

- NOI: always request from GC (we do not self-file).
- SWPPP plan: use provided plan or request if required by deliverables.
- Dust permit: submit/request based on scope and existing permit status.

Deliverable dependency model:

- `Dust Sign` requires `Dust permit`.
- `SWPPP Sign` requires `NOI`.
- `Narrative` requires `SWPPP plan + NOI + dust permit`.

## 4) Minimum Data by Milestone

### Intake

- Lane
- Project reference
- Source link
- Received timestamp

### Reconciliation

- Contract value and type
- Estimate link + value baseline
- Scope delta summary (added/removed/changed)
- Retention and billing terms
- Key contacts

### Kickoff

- Site access constraints
- PM/super/billing contacts
- PO number (or explicitly missing)
- Start timeline
- Compliance prerequisites

### Billing Readiness

- Email approval evidence
- Work-complete documentation
- Retention + platform + billing window
- Required waiver/cert docs

## 5) System Of Record

Use packet-level data as operational truth:

- `contract_packets`
- `contract_packet_documents`
- `contract_packet_queue_v`

Use `projects.contract_status` as a coarse projection only.

## 6) Daily Operating Rhythm

For active packets:

1. Pull `contract_packet_queue_v` ordered by SLA risk.
2. Work breached packets first.
3. Enforce daily follow-up on `awaiting_counterparty`.
4. Ensure every active packet has owner + explicit next action.

## 7) Non-Negotiable Guardrails

- Fail-closed review bias: uncertain = flag.
- Citation-first extraction for contract facts.
- No silent acceptance of scope/value mismatches.
- No ownerless packets.
- No handoff without billing + contact completeness.

## 8) Related References

- `ARCHITECTURE.md`
- `contract-packet-lifecycle-2026-02-12.md`
- `validation-policy.md`
- `file-naming.md`
- `STATE.md`
