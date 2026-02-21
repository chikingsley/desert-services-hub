# Permit Search Eval Results

## What This Tests

Given a natural language query, can we find the correct dust permit?

We generate synthetic queries from real permit data (company names, project names, address fragments, permit IDs, and mixed combinations) and test whether different retrieval strategies find the right permit. This measures how well permit search works for agents and users.

## Eval Set

- **200 permits** sampled across 112 companies (max 5 per company for diversity)
- **873 queries** generated across 5 types
- **2,060 total permits** in the corpus
- Ground truth: each query is derived from a specific permit's fields

Query type distribution:

| Type | Count | What it tests |
|------|-------|---------------|
| `permit_id` | 200 | Exact D0XXXXXX lookup |
| `project_name` | 200 | Full project name match |
| `partial_project` | 162 | First 2 words of project name |
| `company_project` | 199 | First word of company + first word of project |
| `address_city` | 112 | Full address + city |

Dataset files in `tests/eval/permits/`:
- `corpus.jsonl` — all permits (BEIR format)
- `queries.jsonl` — generated queries
- `qrels.tsv` — ground truth mapping

Reseed: `bun run tests/eval/permits/seed-dataset.ts --count 200`

## Metrics

| Metric | What it means |
|--------|--------------|
| Recall@1 | Did we get the #1 result right? (= accuracy) |
| Recall@5 | Is the correct permit in the top 5? (what agents see) |
| MRR | Mean Reciprocal Rank — average of 1/rank for correct answer |

## Results

### Run 1: ILIKE vs FTS vs FTS+Rerank (2026-02-20)

| Metric | ILIKE | FTS (tsvector) | FTS + Jina Rerank |
|--------|:-----:|:--------------:|:-----------------:|
| Recall@1 | 47.4% | 67.9% | **70.9%** |
| Recall@5 | 62.5% | 95.8% | **96.7%** |
| Recall@10 | 63.3% | 98.1% | **98.5%** |
| Recall@20 | 64.3% | **99.7%** | **99.7%** |
| MRR | 53.8% | 79.6% | **81.4%** |
| Failures | 327 | 37 | **29** |
| Latency | 4ms | <1ms | 88ms |
| Cost/query | $0 | $0 | ~$0.001 |

#### By Query Type

| Type | ILIKE R@1 | ILIKE R@5 | FTS R@1 | FTS R@5 | Rerank R@1 | Rerank R@5 |
|------|:---------:|:---------:|:-------:|:-------:|:----------:|:----------:|
| permit_id | 100% | 100% | 100% | 100% | 100% | 100% |
| project_name | 63.5% | 98% | 62.5% | 98% | 68% | 98.5% |
| partial_project | 53.7% | 92.6% | 55.6% | 92% | 56.8% | 93.8% |
| company_project | 0% | 0% | 50.3% | 91% | 54.8% | 92% |
| address_city | 0% | 0% | 69.6% | 98.2% | 73.2% | 100% |

**Key findings:**

1. **FTS is a massive upgrade over ILIKE.** Recall@5 jumps from 62.5% → 95.8% at zero cost and sub-millisecond latency. ILIKE literally cannot handle multi-field queries (company+project, address+city) at all.

2. **Reranker helps on permits** (unlike emails). R@1 +3%, R@5 +0.9%, failures 37→29. Permit documents are short and structured — ideal for cross-encoders. Whether the 88ms latency is worth +3% R@1 depends on use case.

3. **Remaining failures are genuinely ambiguous.** "The PHX", "Queen Creek", "The One", "A Tempe" — common words matching many permits. Need additional context (company filter, status filter) to disambiguate.

4. **FTS is the right default for the MCP tool.** Sub-ms, free, 95.8% R@5. Reranker can be added as an optional enhancement later if needed.

## How to Run

```bash
# Seed dataset (only needed once, or to refresh)
bun run tests/eval/permits/seed-dataset.ts --count 200

# Run strategies
bun run tests/eval/permits/eval.ts --strategy ilike
bun run tests/eval/permits/eval.ts --strategy fts
bun run tests/eval/permits/eval.ts --strategy fts-rerank

# Results append to tests/eval/permits/results.jsonl
```

## Strategies Available

| Strategy | What it does |
|----------|-------------|
| `ilike` | Current baseline — `%query%` across project_name, company_name, address, id |
| `fts` | Weighted tsvector (A: id+company, B: project, C: address+city) + ts_rank_cd + smart tiebreaker |
| `fts-rerank` | FTS top-20 candidates → Jina reranker v3 reorders by semantic relevance |

## Changelog

- **2026-02-20**: Initial eval set created (873 queries / 200 permits / 5 query types). Ran ilike, fts, fts-rerank. FTS is the clear default. Reranker provides marginal improvement at cost of latency.
