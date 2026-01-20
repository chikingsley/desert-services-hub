# Contract Service TODO

Analysis from 2025-12-27. Some of this is interim tooling, revisit when ready.

- --

## Architecture Issues

### Problem 1: "Process folder" doesn't match workflow

- Current: dump all PDFs in folder, process together as one package
- Actual workflow: compare CONTRACT (from GC) vs ESTIMATE (from Monday/QuickBooks)
- Reconciliation is comparing TWO sources, not consolidating one folder

### Problem 2: Redundant extraction

- `extractContractDetails()` extracts scope, amounts, etc
- `extractScope()` ALSO extracts scope and amounts
- `reconcile()` calls `extractScope()` twice
- If you also ran `extractContractDetails()`, hitting Gemini 3-4x for overlapping data

### Problem 3: Duplicate ReconciliationResult types

- `types.ts` lines 270-328: Rich type with lineItems, scope comparison, newRequirements, redFlags with severity, actions, assessment
- `reconcile.ts` lines 17-49: Simpler type with removed/added/mathWorks, different verdict statuses
- The `types.ts` version is never used

### Problem 4: No integration with actual workflow

User stories say: find estimate in Monday, compare, update QuickBooks, create project in Notion, file in SharePoint. Service just takes file paths.

- --

## Potential Refactor (When Ready)

```text
services/contract/
├── types.ts           # Shared types (unify ReconciliationResult)
├── extract.ts         # PDF extraction
│   ├── extractScope()
│   ├── extractRequirements()
│   └── classifyDocument()
├── reconcile.ts       # Compare estimate vs contract (pure, no file I/O)
├── kickoff.ts         # Post-reconciliation checklist generation
└── index.ts           # Main entry points

```text

### Changes to consider

1. Delete `processContractFolder()` and `consolidateContractInfo()` if not needed
2. Consolidate to one `ReconciliationResult` type
3. Separate extraction from comparison - extract once, compare in memory
4. Add checklist generation - output should be filled onboarding checklist
5. Integrate with Monday, SharePoint, Notion when workflow is clearer

- --

## What Works Fine (Keep)

- `extractScope()` - useful for extracting line items from estimates/contracts
- `reconcile()` - basic comparison logic is sound
- Test fixtures (`greenway-embrey`, `kiwanis-caliente`) - good ground truth data
- `test-utils.ts` - local PDF extraction with pdftotext

- --

## Complexity Warnings (From Lint)

These functions have high cognitive complexity but may be acceptable for interim tooling:

| Function | Complexity | File | Notes |
|----------|------------|------|-------|
| `processContractFolder` | 43 | client.ts | Consider removing entirely |
| `consolidateContractInfo` | 45 | client.ts | Consider removing entirely |
| `reconcile` | 21 | reconcile.ts | Could split verdict logic out |
