# Contract Operations

Contract packet intake, reconciliation, and post-contract handoff.

## Start Here

- `docs/contracts/README.md` - Contracts docs index.
- `docs/contracts/post-contract-process.md` - Canonical process after packet receipt.
- `docs/contracts/validation-policy.md` - Fail-closed validation policy and command flow.
- `docs/contract-packet-lifecycle-2026-02-12.md` - Canonical packet status model and queue view.

## Core Workflow Docs

- `apps/contract/WORKFLOW.md` - End-to-end extraction/reconciliation workflow.
- `apps/contract/contracts-master.md` - Full checklist from intake through handoff.
- `apps/contract/PROJECT.md` - Track model, stage SLAs, and execution notes.

## Operational Templates

- `apps/contract/templates/01-extract-contract.md`
- `apps/contract/templates/02-reconcile.md`
- `apps/contract/templates/03-check-insurance.md`
- `apps/contract/templates/04-respond-to-gc.md`
- `apps/contract/templates/05-internal-handoff.md`
- `apps/contract/templates/project-record-template.md` - Fillable per-project record.
- `apps/contract/templates/project-record-schema.md` - Full field inventory.

## Ground Truth and Validation

- `apps/contract/ground-truth/README.md` - Labeled project examples.
- `apps/contract/review/tests/test_ground_truth.py` - Scanner regression tests.
