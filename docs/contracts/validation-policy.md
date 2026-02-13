# Contract Validation Policy (Fail-Closed)

This policy encodes how contract review should behave for Desert Services.

## Core Policy

- Zero-miss bias: if uncertain, flag.
- False positives are acceptable.
- Silent misses are not acceptable.

## Severity Rules

- `critical` (blocker)
  - Scope creep terms (`maintain`, `repair`, `remove`, `amend`, `adjust`, `replace`, etc.)
  - Company identity issues (`IDG`, `Innovative Development Group`, misspellings like `Deseret`)
  - Missing inspection quantity
  - Contract references scope item that estimate marks not included / zero-cost

- `warning`
  - Liability/fines language (always surface)
  - Missing inspection frequency
  - Missing rain-event trigger for inspections
  - Payment terms not explicitly found

- `info`
  - Payment terms found
  - Inspection quantity/frequency/rain trigger found

## Inspection Rule Detail

- Minimum blocker gate: explicit inspection quantity.
- Preferred complete language:
  - quantity
  - cadence (for example bi-weekly / every 14 days)
  - rain-event trigger

## Scope vs Estimate Rule

When estimate data exists, any contract mention of non-included/zero-cost scope is a blocker.
Example: contract mentions fire access signs, but estimate shows fire signs as not included.

## Output Contract

Every scan output should be grouped as:

1. `blockers`
2. `warnings`
3. `info_extracted`
4. evidence snippets for each flagged item

## Ground-Truth Validation Target (v1)

At minimum, the scanner must catch:

- Modera Paradise Valley known blocker patterns.
- Elanto company-name misspelling (`Deseret`).
- Inspection quantity ambiguity cases.

## Commands

Run scanner tests:

```bash
cd apps/contract/review
uv run pytest -q
```

Run batch report on fixtures:

```bash
cd apps/contract/review
uv run python -m contract_review.cli fixtures \
  --fixtures-dir ../ground-truth/test-fixtures \
  --out /home/simon/github/desert-services-hub/data/reports/contract-validation-ground-truth.md
```

Scan a single reconciled contract:

```bash
cd apps/contract/review
uv run python -m contract_review.cli scan \
  --file ../ground-truth/test-fixtures/modera-paradise-valley/reconciled.md
```
