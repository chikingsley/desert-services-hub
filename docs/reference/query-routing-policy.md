# Query Routing Policy (Agent-Enforced)

Purpose: prevent new agents from bypassing optimized query paths and re-introducing slow ad-hoc scans.

Historical benchmark snapshots live in `docs/_archive/reference/query-performance/`.

## Required Routing Rules

1. Email list UI/API (`/api/emails`):
- Default no-filter listing must use `public.email_list_dedup_mv`.
- Filtered listing (search/sender/classification/attachments/exclusions) must use the fallback query in `apps/web/api/emails.ts`.
- Do not add new email list handlers that query `emails` directly for the default list case.

2. Email full-text search:
- Must use `search_vector @@ websearch_to_tsquery(...)`.
- Do not add `%...%` search across many email columns when `search_vector` exists.

3. Estimate fuzzy candidate search:
- Must use the normalized expression query in `lib/db/repositories/estimate-email.ts`.
- This query is paired with `idx_estimates_fuzzy_text_trgm`; do not revert to multi-column OR-ILIKE builders for this path.

## Change Checklist (Required in PR/agent output)

For any DB query change:
- Identify query path and endpoint/worker.
- Attach `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` before/after.
- Confirm index usage or justify sequential scan.
- Classify impact/risk/effort.

## Preferred Reuse Points

- `apps/web/api/emails.ts` for email listing/search behavior.
- `lib/db/repositories/estimate-email.ts` for estimate candidate matching.

## Escalation Rule

If an agent needs a new query shape that bypasses these routes, they must:
- add profile evidence,
- add/update supporting index/migration if needed,
- update this policy with the new canonical path.
