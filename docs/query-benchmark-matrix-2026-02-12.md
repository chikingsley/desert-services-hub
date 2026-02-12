# Email Query Benchmark Matrix (2026-02-12)

Environment:
- DB: `supabase_db_desert-services-hub` (local Postgres)
- Data shape: `emails` ~639k rows, `email_list_dedup_mv` ~369k rows
- Plan command: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`

## Matrix

| Scenario | Query Path | Exec Time (ms) | Shared Read Blocks | Temp Read/Write Blocks | Key Scan Path |
|---|---|---:|---:|---:|---|
| Default list (no filters) | Legacy fallback dedup CTE on `emails` | 1776.761 | 128660 | 221420 / 169492 | `Seq Scan emails` + window + spill |
| Default list (no filters) | Mat view list (`email_list_dedup_mv`) | 0.282 | 49 | 0 / 0 | `Index Scan idx_email_list_dedup_mv_received` |
| Default count | Mat view count (`count(*)`) | 11.158 | 314 | 0 / 0 | `Index Only Scan idx_email_list_dedup_mv_classification` |
| Filtered list: search (`permit invoice`) | Fallback dedup + FTS | 16.695 | 844 | 0 / 0 | `Bitmap Index Scan idx_emails_search` |
| Filtered list: sender (`kendra@desertservices.net`) | Fallback dedup sender filter | 302.552 | 128476 | 16572 / 11395 | `Seq Scan emails` |
| Filtered list: classification + attachments | Fallback dedup | 55.210 | 7171 | 0 / 0 | `Bitmap Heap Scan emails` via `idx_emails_classification` + `idx_emails_excluded` |

## Notes
- The new `/api/emails` fast path uses `email_list_dedup_mv` only for the default no-filter view.
- Filtered queries still use live-table fallback to preserve pre-dedup filter semantics.
- Sender-filter path is still expensive because it uses `lower(from_email)`/`lower(real_sender_email)`/`lower(original_sender_email)` without matching functional indexes.

## Sender Filter Follow-up (Applied)
Functional sender indexes were added in:

- `supabase/migrations/20260212141500_sender_filter_indexes.sql`

```sql
CREATE INDEX IF NOT EXISTS idx_emails_from_email_lower_active
ON public.emails (lower(from_email))
WHERE is_excluded = 0;

CREATE INDEX IF NOT EXISTS idx_emails_real_sender_email_lower_active
ON public.emails (lower(real_sender_email))
WHERE is_excluded = 0;

CREATE INDEX IF NOT EXISTS idx_emails_original_sender_email_lower_active
ON public.emails (lower(original_sender_email))
WHERE is_excluded = 0;
```

Observed behavior:
- High-volume sender (`kendra@desertservices.net`): planner still prefers sequential scan; runtime remains in the same band (~300ms) because selectivity is low.
- Selective sender (`+16028314475@tmomail.net`, 2 rows): planner uses `idx_emails_from_email_lower_active` and executes in ~5.5ms.

## Next Candidate
For consistently fast high-volume sender filtering, consider a dedicated pre-normalized sender dimension (or a sender-filtered materialized view) rather than relying on per-request dedup over the base table.
