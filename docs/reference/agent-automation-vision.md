# Agent Automation Vision

Last updated: 2026-03-06

This is the operational North Star for Desert Services Hub. It is not a build
plan and it is not a backlog. It exists to keep the repo aligned on what the
job actually is, where throughput breaks, and what "done" looks like.

## Why This Exists

The work does not behave like one coordinator doing a few admin tasks. In
practice it behaves like a shared operating system spread across:

- request intake
- contract intake and reconciliation
- work-start confirmation
- NOI collection
- dust permits
- sign ordering
- narrative generation
- internal handoff
- filing to Monday, QuickBooks, and SharePoint
- renewal and follow-up loops

At current volume, this is closer to a 2-5 person coordinated operation than a
single role. The goal of automation is not "fewer clicks." The goal is to make
the work executable at all without losing state between systems.

## North Star

Desert Services runs like a well-oiled machine:

- inbound signals are detected automatically
- the system knows which project and service line the signal belongs to
- missing prerequisites trigger draft requests automatically
- work products are generated as soon as prerequisites arrive
- humans review expensive, risky, or external-send actions
- every artifact lands in a canonical project record without manual chasing

The target state is not "Chi does everything faster." The target state is that
agents and workflows handle the front half of operations, while the human stays
focused on approvals, exceptions, money-sensitive actions, and final quality
control.

## The Real Constraint

The biggest problem is not lack of point solutions. The repo already contains a
lot of the right building blocks.

The real constraint is the gap between systems:

- a request arrives, but nothing reliably triggers the next workflow
- documents exist, but they are not filed in the same place every time
- a contract is reconciled, but downstream state is not visible
- permit, sign, and narrative work depend on the same prerequisites, but those
  dependencies are still carried manually
- QuickBooks, Monday, SharePoint, and email each hold part of the truth

That is why the job feels impossible even when individual sub-workflows are
"almost automated."

## Workstreams

### 1. Dust Permits

**Current state:** This is the closest thing in the repo to true end-to-end
automation.

**Repo anchors:**

- `apps/dust-permits/`
- `apps/dust-permits-mcp/`
- `docs/pima-county-permits.md`
- `docs/SYSTEM-MAP.md`

**What already exists:**

- Maricopa permit creation, scraping, syncing, renewal, and payment primitives
- county-specific lookup logic
- trigger/runtime infrastructure for permit sync and detail scrape
- review checkpoints around submit/pay flows

**What still breaks:**

- the very beginning of the flow is not fully triggered from real business
  events
- "we won the project" or "start work" signals do not yet reliably create the
  permit path
- if NOI is missing, the system should draft the request for it automatically
- renewal and expiration follow-up should run as a managed loop, not as memory
- some automation was intentionally dialed back after bad draft behavior, so
  approval gates need to stay explicit
- Pima County is still a separate manual lane

**Definition of done:**

An award email, start-work confirmation, or NOI arrival can push a Maricopa
permit from trigger to approval-ready state with minimal manual work. Pima
County has at least a supported fast path instead of being a completely separate
manual exception.

### 2. Signs

**Current state:** The reference material exists, but the operational workflow
is still opaque and person-dependent.

**Repo anchors:**

- `docs/reference/signage/sign-ordering-reference.md`
- `packages/contracts/docs/PROJECT.md`

**What already exists:**

- sign types, data requirements, and email templates are documented
- permit and NOI dependencies are known

**What still breaks:**

- sign ordering is not wired into permit/NOI events
- the actual tracking location and ownership are unclear
- visibility is poor if someone else is handling the work
- ad hoc information passing makes the process harder than it should be

**Definition of done:**

When a permit or NOI arrives, the system can draft the sign order, attach the
right data, track status, and store the request/confirmation in the project
record.

### 3. Narratives / SWPPP Documentation

**Current state:** The repo has real narrative-generation work, but it still
needs production eval and trigger wiring.

**Repo anchors:**

- `packages/narratives/`
- `packages/narratives/swppp/`
- `packages/contracts/docs/PROJECT.md`

**What already exists:**

- narrative generation service
- deterministic canonical payload work
- source-packet and validation primitives

**What still breaks:**

- the generation path is not yet treated as a normal triggered workflow
- human eval is still needed to harden output quality
- the repo knows the ingredients, but does not always act when those
  ingredients arrive

**Important observation:**

For many jobs, the NOI contains enough information to complete the narrative
workflow or at least get it very close. That means the narrative should behave
like a downstream automation target, not a separate manual craft process.

**Definition of done:**

NOI arrival triggers narrative validation and document generation automatically,
with human QA focused on output review rather than data collection.

### 4. Contracts

**Current state:** Contracts are documented in detail and partially tooled, but
the full intake-to-handoff pipeline still depends heavily on manual execution.

**Repo anchors:**

- `packages/contracts/docs/PROJECT.md`
- `docs/contract-review-workspace.md`
- `docs/unified-operations-platform.md`

**What already exists:**

- a documented contract cascade
- reconciliation logic and review concepts
- linkages into project, estimate, and email context
- a clear model for parallel tracks: contract resolution and work kickoff

**What still breaks:**

- contract arrival is not yet a fully trusted trigger for all downstream tasks
- internal visibility drops after handoff
- contract-required document follow-up is still labor-intensive
- contract actions require updates across several systems, which causes drift

**Definition of done:**

When a contract arrives, the system can identify the project, spawn the right
tasks, draft the right emails, update the right systems, and keep the state
visible until the downstream obligations are actually complete.

### 5. Filing and Canonical Documentation

**Current state:** This is the biggest cross-cutting failure point.

**Repo anchors:**

- `packages/sharepoint/`
- `packages/monday/`
- `docs/unified-operations-platform.md`
- `docs/SYSTEM-MAP.md`

**What already exists:**

- Monday sync and project linkage infrastructure
- SharePoint helpers and folder sync logic
- document intake and attachment processing pipelines

**What still breaks:**

- filing is not automatic enough at the moment an event happens
- QuickBooks is still carrying too much operational memory burden
- people cannot reliably tell whether all artifacts made it into the right
  project record
- if filing slips, everything downstream turns into hunting

**Important position:**

QuickBooks matters for finance, but it should not be the canonical memory system
for operational state. The canonical project record should live in a durable,
queryable document system, with other systems linked back to it.

**Definition of done:**

Every major event emits artifacts automatically into the canonical project
record:

- request for work / start-work approval
- initial contract and revised versions
- ready-to-sign and signed copies
- NOI
- dust permit
- sign requests and confirmations
- narrative outputs
- other customer-facing deliverables

If the artifact exists, it should be findable without asking a person where it
went.

## Main Slowdowns

### Trigger Gap at the Beginning

The highest-leverage missing piece is still the start of the flow:

- request arrives
- contract arrives
- award is confirmed
- start-work email comes in
- NOI arrives

These events should trigger workflows directly. Too much still depends on
someone noticing the message and manually deciding what to start.

### Documentation Burden After the Work

Even when the actual operational work gets done, the job falls apart on the
filing side:

- save to Monday
- save to QuickBooks
- save to SharePoint
- print or preserve email confirmations
- track revisions and signed versions

This is where throughput dies and where project memory gets lost.

### Shared Dependencies Across Multiple Deliverables

NOI, dust permit, narrative, and signage are not independent jobs. They share
prerequisites and should be treated as one dependency graph. Today they still
behave too much like separate manual chores.

### Weak End-to-End Visibility

There is still not enough confidence about where a project stands after it
leaves the first handler. The system needs better visibility into what has been
requested, received, generated, approved, filed, renewed, or blocked.

### Eval and Hardening Loops

Some of the core generation logic exists already, especially around narratives
and document handling. The remaining work is often not "invent the feature" but
"run the human eval loop until it is trustworthy."

## Design Rules

These rules should guide new work more than individual implementation details.

### 1. Draft First, Then Approve

External sends, payments, and other risky actions should usually be generated
automatically but held for human approval.

### 2. Event-Driven Beats Inbox-Driven

The system should react to business events, not depend on a person repeatedly
re-reading email to remember what to do next.

### 3. Artifact-First Storage

If something happened, the system should save the artifact immediately and link
it to the project. Do not treat filing as a separate optional cleanup step.

### 4. One Shared Context

The same project context should drive permits, contract handling, sign ordering,
narratives, email drafts, and filing. The job gets expensive when each workstep
rebuilds context from scratch.

### 5. Reuse Existing Building Blocks

The repo already has major primitives for:

- email intake and sync
- background triggers
- project matching
- permit automation
- narrative generation
- contract review
- SharePoint and Monday integration

The priority is to connect these into trustworthy flows, not to invent a new
framework.

## Success Looks Like This

- A contract or award email arrives and the project is identified automatically.
- If NOI is missing, the system drafts the request for it immediately.
- When NOI arrives, dependent workflows wake up automatically.
- Dust permit work moves to an approval-ready state without manual hunting.
- Sign orders draft themselves from permit/NOI data.
- Narrative generation starts from the same source packet instead of a separate
  manual intake.
- Every artifact lands in the project record as part of the flow.
- Humans spend time on review, exceptions, and decisions, not on remembering
  which system to update next.

## What This Is Not

- It is not a promise that everything should auto-send with no review.
- It is not a claim that every county or service line is identical.
- It is not a reason to build a new orchestration framework before the current
  primitives are connected.

This doc is the North Star: build toward a system where the work becomes
coherent, visible, and executable without heroic memory.
