# Contract Review Tooling

Use `uv` for all Python commands in this folder.

## Commands

```bash
cd packages/contracts/review
uv run pytest -q
```

```bash
cd packages/contracts/review
uv run python -m contract_review.cli scan \
  --file ../ground-truth/test-fixtures/modera-paradise-valley/reconciled.md
```

```bash
cd packages/contracts/review
uv run python -m contract_review.cli fixtures \
  --fixtures-dir ../ground-truth/test-fixtures \
  --out /home/simon/github/desert-services-hub/data/reports/contract-validation-ground-truth.md
```

```bash
cd packages/contracts/review
uv run python -m contract_review.cli map \
  --file ../ground-truth/test-fixtures/modera-paradise-valley/reconciled.md
```

```bash
cd packages/contracts/review
uv run python -m contract_review.cli policies
```

```bash
cd packages/contracts/review
uv run python -m contract_review.cli review \
  --file ../ground-truth/test-fixtures/modera-paradise-valley/reconciled.md \
  --top-k-per-query 8
```

```bash
cd packages/contracts/review
uv run python -m contract_review.cli review \
  --file ../ground-truth/modera-paradise-valley/contract.pdf \
  --top-k-per-query 30 \
  --out /tmp/modera-review.json
```

## Workflow Shape

`review` is a retrieval-first Stage-1 flow:

1. deterministic document map (`sections` + `chunks`)
2. hybrid retrieval candidates per policy (BM25-style lexical + optional embeddings)
3. fail-closed coverage grading (`uncertain => flag`)

This is the base for later LLM judgement/evals.

By default, `review` output now also includes deterministic scanner payload:
- `deterministic_scan.counts`
- `deterministic_scan.blockers|warnings|info_extracted`

## Page-Aware Notes

- Prefer reviewing from source PDF (`--file <contract.pdf>`) so page markers are present.
- `fixtures` now runs page-aware by default by auto-resolving each fixture's contract PDF.
- Disable page-aware fixture mode only when needed:

```bash
cd packages/contracts/review
uv run python -m contract_review.cli fixtures \
  --fixtures-dir ../ground-truth/test-fixtures \
  --no-page-aware
```

## Eval Harness

Generate policy labels template:

```bash
cd packages/contracts/review
uv run python -m contract_review.cli labels-template \
  --fixtures-dir ../ground-truth/test-fixtures \
  --out data/reports/contract-policy-labels.template.json
```

Run eval (page-aware by default):

```bash
cd packages/contracts/review
uv run python -m contract_review.cli eval \
  --fixtures-dir ../ground-truth/test-fixtures \
  --labels data/reports/contract-policy-labels.template.json \
  --out data/reports/contract-policy-eval.json
```
