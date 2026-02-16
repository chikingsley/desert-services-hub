# Query Performance Analysis (2026-02-12)

## Scope

- Runtime DB: local Postgres container `supabase_db_desert-services-hub`
- Query surfaces scanned: `lib/db/repositories/*`, `apps/web/api/*`, `apps/web/worker.ts`, `apps/workers/estimate-email-linker/lib/poll.ts`
- Catalog command used:
  - `rg -n "db\.(prepare|query|run)\(" lib/db/repositories apps/web/api apps/web/worker.ts apps/workers/estimate-email-linker/lib`

## High-Impact Queries (Observed)

From `pg_stat_statements` and targeted `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`:

1. Emails dedup list query (`apps/web/api/emails.ts`)
- Baseline execution: ~1366.9 ms
- Plan characteristics:
  - Full `Seq Scan` on `emails` (`~416k` active rows)
  - Window aggregation over dedup key
  - External merge sort spill (`temp_read ~117k`, `temp_written ~117k` blocks)

2. Emails dedup count companion (`apps/web/api/emails.ts`)
- Baseline execution: ~977.3 ms
- Same scan/sort pattern as list query, with additional disk spill

3. Webhook dequeue selector (`apps/web/worker.ts`)
- Execution: ~0.15 ms
- Uses `idx_webhook_jobs_status`; currently not a bottleneck

4. Estimate-email linker batch scan (`apps/workers/estimate-email-linker/lib/poll.ts`)
- Execution: ~1.25 ms
- Uses `emails_pkey` + `idx_estimate_emails_email`; healthy

5. Estimate fuzzy candidate search (`lib/db/repositories/estimate-email.ts`)
- Before index/query-shape update: ~8.85 ms via `Seq Scan` on `estimates`
- After trigram index + expression query: ~0.44 ms using `idx_estimates_fuzzy_text_trgm`

## Changes Implemented

### 1) Reduced duplicate work in email listing

File: `apps/web/api/emails.ts`
- Removed separate `dedupCountQuery` execution.
- Merged total count into main dedup query (`COUNT(*) OVER ()` after dedup filter).
- Computed dedup key once in a base CTE instead of repeating the CASE expression.

Result:
- Old request path (list + count): ~1366.9 + ~977.3 = ~2344.2 ms total DB time
- New single-query path: ~1785.7 ms DB time
- Net improvement: ~23.8% less DB time for `/api/emails` list requests under tested conditions.

### 2) Fuzzy estimate search made index-backed

File: `lib/db/repositories/estimate-email.ts`
- Replaced multi-column OR-ILIKE search with one normalized concatenated text expression.
- Matches new trigram index expression.

Result:
- ~8.85 ms -> ~0.44 ms in profiled case.

### 3) Added migration for query-performance indexes

File: `supabase/migrations/20260212120000_query_performance_indexes.sql`
- `idx_emails_active_dedup_partition` (expression + partial index)
- `idx_emails_active_received_desc` (partial sort-support index)
- `pg_trgm` extension (if missing)
- `idx_estimates_fuzzy_text_trgm` (GIN trigram index)

Note:
- The emails dedup query still plans a sequential scan in current data distribution; this index is a guardrail for growth and selective predicates, but immediate wins were primarily from query consolidation.

### 4) Added default-list materialized view route for `/api/emails`

Files:
- `supabase/migrations/20260212133000_email_list_dedup_mv.sql`
- `apps/web/api/emails.ts`
- `Justfile` (`email-list-dedup-refresh`)

Behavior:
- Default no-filter `/api/emails` requests now route to `public.email_list_dedup_mv`.
- Filtered list requests continue to use the live fallback query to preserve pre-dedup filter semantics.

Result (see benchmark matrix doc):
- Legacy default list query path: ~1776.8 ms
- Mat-view list query: ~0.282 ms
- Mat-view count query: ~11.2 ms (cached in API layer)

Reference:
- `docs/query-benchmark-matrix-2026-02-12.md`

## Priority Matrix

1. **Implemented**: remove duplicate dedup count pass
- Impact: High
- Risk: Low
- Effort: Quick fix

2. **Implemented**: trigram-backed estimate fuzzy search
- Impact: Medium
- Risk: Low
- Effort: Moderate

3. **Implemented (migration)**: additional partial/expression indexes for emails dedup path
- Impact: Medium (future-proofing, selective filters)
- Risk: Medium (index build/write overhead)
- Effort: Quick fix

## Validation Commands Used

- `just status`
- `SELECT ... FROM pg_stat_statements ORDER BY total_exec_time DESC`
- `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ...`
- `jq` extraction from explain JSON outputs

## Risks / Follow-ups

- `COUNT(*) OVER()` still requires full dedup work per request; if `/api/emails` needs sub-second response at larger scale, consider async pre-aggregation or a dedicated dedup materialized view keyed by active filters.
- Additional email filters (FTS/sender/classification/date range) should be profiled independently because plan shape can change significantly.
