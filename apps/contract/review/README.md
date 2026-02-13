# Contract Review Tooling

Use `uv` for all Python commands in this folder.

## Commands

```bash
cd apps/contract/review
uv run pytest -q
```

```bash
cd apps/contract/review
uv run python -m contract_review.cli scan \
  --file ../ground-truth/test-fixtures/modera-paradise-valley/reconciled.md
```

```bash
cd apps/contract/review
uv run python -m contract_review.cli fixtures \
  --fixtures-dir ../ground-truth/test-fixtures \
  --out /home/simon/github/desert-services-hub/data/reports/contract-validation-ground-truth.md
```

```bash
cd apps/contract/review
uv run python -m contract_review.cli map \
  --file ../ground-truth/test-fixtures/modera-paradise-valley/reconciled.md
```

```bash
cd apps/contract/review
uv run python -m contract_review.cli policies
```

```bash
cd apps/contract/review
uv run python -m contract_review.cli review \
  --file ../ground-truth/test-fixtures/modera-paradise-valley/reconciled.md \
  --top-k-per-query 8
```

## Workflow Shape

`review` is a retrieval-first Stage-1 flow:

1. deterministic document map (`sections` + `chunks`)
2. hybrid retrieval candidates per policy (BM25-style lexical + optional embeddings)
3. fail-closed coverage grading (`uncertain => flag`)

This is the base for later LLM judgement/evals.
