# Domain Gate Reset

## Purpose

This is the reset point for email pre-triage.

The repo drifted into a per-email "relevance" workflow. That was the wrong product for this stage. The gate before triage should operate on **domains**, not individual emails.

## The Unit

The unit of review is the **domain**.

One operator decision should apply to the domain as a whole, based on:

- recent subjects
- a few sampled email bodies/snippets
- sender/account/project context when available

Per-email classification belongs to triage later.

## The Classes

Keep the high-level classes simple:

- `HR`
- `IT`
- `WORK`
- `BULLSHIT`

Meaning:

- `HR`: private HR/admin/recruiting/employee matters; do not send into normal ops pipelines
- `IT`: private IT/security/account/admin systems mail; do not send into normal ops pipelines
- `WORK`: legitimate business/work mail; allow through to later triage
- `BULLSHIT`: non-work junk; exclude from the main pipeline

If needed, add optional sublabels only under `BULLSHIT`, for example:

- `politics`
- `shopping`
- `newsletter`
- `social`
- `other_unrelated`

Do not add more top-level buckets unless they materially change routing behavior.

If it is real business mail, it is `WORK`. Do not invent separate top-level classes like `vendor`, `platform`, or `trusted_work` for this gate.

## Authority

The authoritative outcome is the domain rule.

- `/senders` is the operator workflow
- `domain_rules` is the authoritative state
- sampled content and LLM output are supporting evidence, not the source of truth

When an operator approves a domain verdict, the system should write one domain-level rule and let downstream systems respect that rule.

## Workflow

The intended workflow is:

1. Load a queue of unresolved domains in `/senders`.
2. Show domain evidence:
   - email count
   - recent subjects
   - sampled email content
   - linked account/project context if it exists
3. Optionally run an LLM on the sampled domain evidence.
4. Show a suggested domain class.
5. Operator approves or overrides once for the domain.
6. Persist the domain rule.
7. Only `WORK` domains continue into per-email triage.

This gate is for **coarse routing**, not deep email understanding.

## What This Gate Is Not

This gate is not:

- a per-email review queue
- a second triage workflow
- a place to decide project linkage
- a place to decide estimate/contract/invoice/document type

Those belong later.

## Keep / Fold / Stop

### Keep

- the `/senders` review surface as the main operator queue
- domain aggregation and sampled-domain evidence
- LLM assistance for domain suggestions
- audit/provenance for why the suggestion was made
- keyboard-driven fast review

### Fold Into `/senders`

- any useful OpenRouter-backed suggestion logic
- any useful progress/status behavior from the relevance experiment
- any useful review-state handling, as long as the reviewed unit is still the domain

### Stop

- treating `/email-relevance` as the active operator workflow
- introducing extra top-level taxonomies that do not change routing
- making one LLM call per email for this gate
- mixing pre-triage domain routing with later per-email triage responsibilities

## Routing Consequences

At a high level:

- `HR`: keep private; do not flow into standard ops/document routing
- `IT`: keep private; do not flow into standard ops/document routing
- `WORK`: allow to continue into triage
- `BULLSHIT`: exclude from the main pipeline

Sublabels under `BULLSHIT` are for visibility and cleanup, not for changing the main routing model.

## Implementation Bias

Prefer the simplest implementation that matches the product model:

- one queue
- one reviewed unit: domain
- one authoritative outcome: domain rule
- one later stage for per-email triage

If a proposed feature makes this stage feel like triage, it probably belongs somewhere else.
