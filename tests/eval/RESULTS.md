# Project Matching Eval Results

## What This Tests

Given an email, can we find the correct project it belongs to?

We take 500 emails that are already linked to projects (ground truth) and test whether different retrieval strategies can find that project. This measures how well the candidate generation step works — before any LLM touches it.

## Eval Set

- **500 queries** sampled from 35,392 emails that have known project links
- **291 distinct projects** covered (max 3 emails per project for diversity)
- **3,289 total projects** in the corpus
- Queries are email subject + body preview (what the triage pipeline sees)
- Ground truth: the existing `email.project_id` links

Dataset files in `tests/eval/`:
- `corpus.jsonl` — all projects (BEIR format)
- `queries.jsonl` — sampled emails (BEIR format)
- `qrels.tsv` — ground truth mapping

Reseed: `bun run tests/eval/seed-dataset.ts --count 500`

## Metrics

| Metric | What it means |
|--------|--------------|
| Recall@1 | Did we get the #1 result right? (= accuracy) |
| Recall@5 | Is the correct project in the top 5 candidates? |
| Recall@10 | Is it in the top 10? |
| MRR | Mean Reciprocal Rank — average of 1/rank for the correct answer |

## Results

### Run 1: Token Overlap vs FTS (2026-02-20)

| Metric | Token Overlap | FTS (tsvector) | Delta |
|--------|:------------:|:--------------:|:-----:|
| Recall@1 | 35.0% | **86.4%** | +51.4 |
| Recall@5 | 52.0% | **97.2%** | +45.2 |
| Recall@10 | 59.0% | **99.0%** | +40.0 |
| Recall@20 | 63.8% | **99.0%** | +35.2 |
| MRR | 42.7% | **91.7%** | +49.0 |
| Failures (not in top 5) | 240 | 14 | -94% |

**Token overlap** (current baseline): tokenizes email text and project names, scores word overlap. Misses any case where the email uses a different name than the project.

**FTS** (tsvector + GIN): searches the email corpus using PostgreSQL full-text search. Finds projects because OTHER emails on that project mention the query terms. Uses the entire email history as context, not just comparing two strings.

FTS remaining failures (14) are almost all generic subjects: "Good morning...", "quote", "Just Call?", "New Estimator" — emails where the subject+preview contain no project-identifying text.

### Run 2: FTS + Jina Reranker v3 (2026-02-20)

| Metric | FTS only | FTS + Rerank | Delta |
|--------|:--------:|:------------:|:-----:|
| Recall@1 | 86.4% | 82.8% | **-3.6** |
| Recall@5 | 97.2% | **98.4%** | +1.2 |
| Recall@10 | 99.0% | 99.0% | 0 |
| Recall@20 | 99.0% | 99.0% | 0 |
| MRR | 91.7% | 90.1% | **-1.6** |
| Failures (not in top 5) | 14 | **8** | -43% |

**Surprise: reranker hurts Recall@1 and MRR.** The Jina reranker is comparing the email text against a compact project summary (name + address + contractor). FTS has an advantage the reranker doesn't: FTS searches the full email corpus, so it leverages other emails on the same project as context. The reranker only sees one project summary string.

However, the reranker does reduce total failures from 14 to 8 — it's better at pulling the correct project into the top 5 even when FTS ranks it 6-10. But it shuffles the top-1 pick in a way that's slightly worse on average.

The 8 remaining failures are all content-free: "quote", "Your availability", "Waiver", "Just wondering Desert Services" — zero project signal in the text.

### Run 3: Multi-Table FTS (2026-02-20)

Searches across three sources simultaneously:
1. **Emails** (tsvector) — full 655K email corpus
2. **Project search index** (tsvector) — project name + address + contractor + email subjects, pre-built per project
3. **Estimates** (trigram) — fuzzy matching on estimate name, job name, address, contractor

Results are merged with weighted scoring.

| Metric | FTS (emails only) | FTS Multi-Table | Delta |
|--------|:-----------------:|:---------------:|:-----:|
| Recall@1 | **86.4%** | 85.6% | -0.8 |
| Recall@5 | 97.2% | **98.4%** | +1.2 |
| Recall@10 | 99.0% | 99.0% | 0 |
| Recall@20 | 99.0% | **99.2%** | +0.2 |
| MRR | **91.7%** | 91.6% | -0.1 |
| Failures | 14 | **8** | -43% |

Multi-table reduces failures from 14 to 8 (same 8 as the reranker found — these are genuinely unsearchable). Recall@5 improves slightly. Top-1 accuracy drops marginally due to score weighting — the email corpus is the dominant signal and adding more sources occasionally shuffles the #1 pick. Could likely be fixed with better weight tuning.

### Run 4: websearch_to_tsquery (2026-02-20)

| Metric | plainto_tsquery | websearch_to_tsquery | Delta |
|--------|:--------------:|:--------------------:|:-----:|
| Recall@1 | **86.4%** | 42.4% | **-44.0** |
| Recall@5 | **97.2%** | 50.2% | **-47.0** |

**Terrible.** `websearch_to_tsquery` is stricter — it treats words as AND'd by default but drops common words and special characters more aggressively. Email subjects like "[Textura System] McCain Center - Payment Disbursed" get parsed into fewer terms, returning zero results. `plainto_tsquery` is more forgiving and produces better recall. Stick with `plainto_tsquery`.

### Run 5: FTS Multi-Table + Rich Reranker (2026-02-20)

Combines all four data sources (emails, project search index, estimates, document summaries) for candidate generation, then feeds the reranker the project_search_index `raw_text` (up to 4000 chars per project — includes project name, address, contractor, AND email subjects) instead of a tiny 15-token summary.

Also uses `maxDocLength: 4096` and `truncation: true` to let the reranker actually read the full context.

| Metric | FTS Multi (no rerank) | FTS Multi + Rich Rerank | Delta |
|--------|:---------------------:|:----------------------:|:-----:|
| Recall@1 | 85.6% | 85.2% | -0.4 |
| Recall@5 | 98.4% | **99.0%** | +0.6 |
| Recall@10 | 99.0% | 99.0% | 0 |
| MRR | 91.6% | 91.6% | 0 |
| Failures | 8 | **5** | -37% |

Rich documents helped the reranker pull 3 more correct answers into the top 5. Recall@5 hits 99.0%. Only 5 failures remain — all content-free: "quote", "Your availability", "Waiver" (x2), one empty.

### Full Comparison Table (2026-02-20)

| Metric | Token Overlap | FTS | FTS+Rerank | FTS Multi | FTS Multi+Rich Rerank | websearch |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|
| Recall@1 | 35.0% | **86.4%** | 82.8% | 85.6% | 85.2% | 42.4% |
| Recall@5 | 52.0% | 97.2% | 98.4% | 98.4% | **99.0%** | 50.2% |
| Recall@10 | 59.0% | **99.0%** | **99.0%** | **99.0%** | **99.0%** | 51.4% |
| MRR | 42.7% | **91.7%** | 90.1% | 91.6% | 91.6% | 46.2% |
| Failures | 240 | 14 | 8 | 8 | **5** | 249 |
| Cost/query | $0 | $0 | ~$0.001 | $0 | ~$0.001 | $0 |
| Latency | 6ms | 9ms | ~230ms | 53ms | ~2.1s | 4ms |

## How to Run

```bash
# Seed dataset (only needed once, or to refresh)
bun run tests/eval/seed-dataset.ts --count 500

# Run a strategy
bun run tests/eval/eval.ts --strategy token-overlap
bun run tests/eval/eval.ts --strategy fts
bun run tests/eval/eval.ts --strategy fts-rerank

# Results append to tests/eval/results.jsonl
```

## Strategies Available

| Strategy | What it does |
|----------|-------------|
| `token-overlap` | Current baseline — tokenize + word overlap scoring |
| `fts` | PostgreSQL full-text search across email corpus |
| `fts-rerank` | FTS candidates → Jina reranker v3 reorders top 20 |

## Recommendations

1. **Replace token overlap with FTS Multi-Table for candidate generation.** Recall@5 jumps from 52% → 98.4% at zero API cost. Searches emails, project search index, estimates, and document summaries. Use `plainto_tsquery` (not `websearch_to_tsquery` — that's worse).

2. **Add Jina reranker with rich documents for the shortlist step.** When sending the reranker the full `project_search_index.raw_text` (up to 4000 chars — includes email subjects, not just name+address), Recall@5 reaches 99.0% and failures drop to 5. Use `maxDocLength: 4096` and `truncation: true`. Previous reranker eval was handicapped by sending 15-token summaries.

3. **Best pipeline for production: FTS Multi → Jina Rerank (rich) → LLM picks from top 5.** This gets 99% of emails to the right project candidate list. The LLM only needs to pick from 5 good options.

4. **The 5 remaining failures are unsolvable by text search.** "quote", "Your availability", "Waiver" — zero project signal. These need sender/thread context: who sent it, what conversation thread, what project has recent emails from this person. Next eval: `fts-llm` strategy.

5. **Trade-off: FTS Multi (no rerank) is the sweet spot for cost.** 98.4% Recall@5, 53ms latency, $0 cost. The reranker adds +0.6% Recall@5 but costs ~$0.001/query and 2.1s latency. For batch/background: use the reranker. For real-time webhook: FTS Multi alone is good enough.

6. **Jina types updated** — `RerankerModel` union now includes `jina-reranker-v3`, removed `as unknown as` casts from `rerank-shadow.ts` and `client.ts`. Added `maxDocLength`, `truncation`, `returnEmbeddings` options.

## Changelog

- **2026-02-20**: Initial eval set created (500 queries / 291 projects). Ran token-overlap, fts, fts-rerank. FTS is the clear winner. Jina reranker types updated to match current API.
