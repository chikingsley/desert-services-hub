# Contract Review Workspace

A UI for reviewing incoming contracts from the `contracts@` mailbox — queue, extract, flag, respond.

## What it is

Contracts arrive as email attachments (PDFs) to `contracts@`. The review workspace is a focused UI for:

1. **Queue** — all `contracts@` emails, deduplicated by project (not by individual email thread)
2. **Inspect** — document text with entity highlights from langextract (color-coded spans: contractor name, dollar amounts, scope items, schedule, penalty clauses, etc.)
3. **Flag review** — business rule violations surfaced automatically (at-risk language, math discrepancies, missing exhibits, etc.)
4. **Act** — generate two draft emails: GC response + internal handoff to `internalcontracts@`

## Backend state (already running)

The data pipeline is live:

```text
contracts@ email arrives
  → intake worker → files_intake job → document extraction (Kreuzberg + OCR)
  → contract_doc_extract job (Pass 1.5) → LLM field extraction + langextract NER
  → documents.raw_extraction.contract_structured_extraction (entities stored)
  → contract_won_bridge (every 2 min) → links to estimates, marks Won/Not Awarded
```

Key files:
- `apps/background-jobs/lib/contracts/contract-email-handler.ts` — ingest
- `apps/background-jobs/lib/contracts/contract-doc-extract-queue.ts` — Pass 1.5: LLM extraction + langextract
- `apps/background-jobs/lib/contracts/langextract.ts` — runs `packages/documents/langextract` Python CLI
- `apps/background-jobs/lib/contracts/contract-won-bridge.ts` — 6-pass linking pipeline
- `packages/email/src/email-templates/gc-response.hbs` — GC response template
- `packages/email/src/email-templates/internal-handoff.hbs` — internal handoff template
- `packages/contracts/ground-truth/PATTERNS.md` — validation rules from ~20 real contracts

## What the entity viewer looks like

`packages/documents/langextract` is Google's langextract library. Its `visualization.py` produces:

- Full document text with colored `<span>` highlights per entity class
- Step-through animation: Play/Prev/Next + progress slider walks you through each entity
- Attributes panel: shows `class` (e.g. `ContractValue`) + attributes (e.g. `amount: $1.2M`) for the active entity
- Hoverable tooltips on each highlight

For the review workspace we'd port this to a React component, rendering the entity-highlighted text inline next to the PDF viewer. The entity data is already in `documents.raw_extraction.contract_structured_extraction` as a JSON array.

## What's missing (the UI)

The backend produces the data. What doesn't exist yet:

- **Queue API** — `/api/contracts/review-queue` returning contracts@ emails grouped by project, with unreviewed count
- **Document viewer** — side-by-side: PDF iframe + entity-highlighted text + attributes panel
- **Flag panel** — business rule check results (from `packages/contracts/ground-truth/validation-policy.md`)
- **Action buttons** — "Generate GC response" → creates Outlook draft via Graph API; "Generate internal handoff" → same
- **Review state** — mark a contract reviewed/actioned (needs a `contract_review_status` column or similar)

## Deduplication logic

A single GC may send multiple emails for the same project (initial send, revised exhibit, follow-up). The queue should group by project_id (from `emails.project_id`), not by email. Show the latest document per project, with a count of how many emails are in the thread.

## Validation rules (from ground-truth)

Key flags that should auto-surface in the review panel:

- **At-risk bid** — contract value significantly below estimate (threshold TBD from real data)
- **Scope delta** — items in the contract not in the estimate (added scope), or estimate items missing
- **Penalty / fine language** — keywords: "liquidated damages", "back charge", "penalty", "deduct"
- **Missing exhibits** — insurance cert, safety plan, preliminary notice required but not attached
- **Math check** — `estimate - removed + added ≠ contract value` → flag if doesn't balance
