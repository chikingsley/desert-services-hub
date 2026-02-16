# Work Authorization Intake Model (Working Draft)

Updated: 2026-02-16
Owner: PM / Contract Intake
Status: Active draft (intended for ongoing edits)

## One-time Definition: "Contract Packet"

In this codebase, `contract_packet` is the backend record for the **authorization lifecycle** on a project.

It does **not** mean you always got a giant packet of documents.
It can represent:

- a signed estimate,
- an LOI/email authorization,
- a full subcontract packet,
- or the later final signed contract for the same project.

Practical naming rule:

- UI + operations language: **Work Auth**
- backend table/view language: `contract_packets`, `contract_packet_queue_v`

## The 3 Real Intake Situations

### 1) Work Auth (Direct)

Use when work is authorized and we can proceed/bill without waiting on a full contract packet.
Examples: signed estimate, direct invoice/card authorization.

Primary next op:

- Add job to QuickBooks and capture billing/payment setup.

### 2) Work Auth (Awaiting Contract)

Use when we have provisional authorization to start, but a final contract is still pending.
Examples: LOI, email "go ahead," early authorization from GC.

Primary next op:

- Capture provisional work auth and request final contract packet.

### 3) Contract Packet

Use when a full contract package (single PDF or multi-doc set) is received and needs review/reconciliation.

Primary next op:

- Review packet, classify required docs, and route reconciliation/handoff tasks.

## Minimum Data at Intake (Do Not Block on Missing Info)

Required now:

- project reference (name/email subject is acceptable)
- intake lane (Direct / Awaiting Contract / Contract Packet)
- source email/document link
- received timestamp

Collect later (not intake blockers):

- PO number
- job number
- normalized site address
- full billing metadata

## Operational Queue Behavior

Projects table should show one row per project and display:

- Work Auth lane (one of the 3 situations above)
- Next Ops (action-oriented, not raw status text)
- SLA priority (worst first)

No duplicate project rows are needed to represent multiple authorization events.
If another authorization artifact arrives later, update lane/history, keep a single project row.

## Naming Decision (Current)

- Keep backend schema names as-is for stability.
- Standardize user-facing language to **Work Auth**.
- Use lane labels:
  - Work Auth (Direct)
  - Work Auth (Awaiting Contract)
  - Contract Packet

## Open Items to Refine

- Define explicit persisted `auth_mode` field vs inference from status.
- Decide where auth-history is displayed (project detail vs timeline).
- Confirm SLA rules per lane (especially provisional/awaiting contract).
