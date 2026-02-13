# Post-Contract Process

Operational process for what happens after a contract packet is received.

## Purpose

Standardize the post-receipt path so work does not stall at "we got a contract."
This process formalizes:

1. Packet triage and reconciliation
2. Project record completion
3. Kickoff readiness and delivery handoff

## System Of Record

- Use `contract_packets` and `contract_packet_queue_v` for packet-level workflow.
- Use `contract_packet_documents` + `documents` for packet evidence.
- Treat `projects.contract_status` as coarse projection only, not operational truth.

## Entry Criteria

Start this process when all are true:

- Contract-like email/item has been reviewed in intake.
- A packet exists in `contract_packets` with `is_active = true`.
- Project link exists, or a blocked reason is explicitly recorded.

## Stage Flow

### Stage 1: Packet Triage

Target SLA: start within 4 hours of packet receipt.

Required actions:

- Set `contract_packets.owner`.
- Set `contract_packets.packet_type` (`single_pdf` / `multi_doc_packet` / `mixed` / `unknown`).
- Confirm at least one primary contract document is linked.
- Set clear `next_action`.
- Move status from `received` to `triage_in_progress`.

Exit criteria:

- Required packet docs are classified.
- Missing docs are explicit in notes/next action.
- Packet is ready for reconciliation.

### Stage 2: Reconciliation And Resolution

Target SLA: complete within 1 business day from triage start.

Required actions:

- Compare contract packet to winning estimate.
- Record scope/value deltas and risk flags.
- Decide one outcome:
  - `ready_to_send_back` (issues identified, draft response required)
  - `awaiting_counterparty` (sent back, waiting response)
  - `executed` (fully acceptable/executed)
- Update `next_action` and due timing for follow-up.

Guardrails:

- Do not silently continue on unresolved value/scope mismatch.
- Do not treat missing contacts, billing terms, or required permits as "done."

### Stage 3: Project Record Formalization

Target SLA: same business day as reconciliation outcome.

Use `apps/contract/templates/project-record-template.md` and fill all required fields.

Minimum required sections before handoff:

- Identity and links (project, estimate, packet, SharePoint/docs)
- Contract summary (type, value, retention, status)
- Contacts (PM, superintendent, billing)
- Billing setup (PO, platform, window, certified payroll requirement)
- Permit/prerequisite status (NOI, dust permit, SWPPP docs as applicable)
- Open questions, owner, and next action

Exit criteria:

- Project record is complete enough that ops does not need to re-hunt core facts.
- Every blocker has owner + due date.

### Stage 4: Kickoff Readiness And Handoff

Target SLA: within 4 hours after Stage 3 completion.

Required pre-handoff checks:

- Contract state is actionable (`executed` or explicit approved-start path).
- Scope and billing are reconciled and documented.
- Site access and required contacts are confirmed.
- Required compliance docs are sent/received (COI, W-9, license, etc.).
- Delivery notification/handoff is sent with links to packet evidence.

Exit criteria:

- Project is marked handed off in operational tracker.
- Handoff timestamp and receiving owner are recorded.

## Done Definition

Post-contract workflow is complete when:

1. Packet lifecycle state is current in `contract_packets`.
2. Packet evidence is linked in `contract_packet_documents`.
3. Project record template is fully populated for required fields.
4. Handoff to delivery is acknowledged and timestamped.

## Daily Operating Rhythm

For active packets:

1. Pull `contract_packet_queue_v` ordered by SLA breach risk.
2. Resolve red/yellow packets first (`is_sla_breached = true` first).
3. For `awaiting_counterparty`, enforce daily follow-up.
4. Keep `next_action` explicit; no packet should be ownerless.
