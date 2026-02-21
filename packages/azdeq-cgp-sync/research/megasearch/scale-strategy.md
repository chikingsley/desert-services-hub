# MegaSearch Scale Strategy (2026-02-21)

This doc translates observed AZDEQ MegaSearch behavior into a production sync strategy.

## Current Observations

- Endpoint family: `https://megasearch.azdeq.gov/megasearch/*/list`
- Access requirement: browser context (Cloudflare challenge blocks raw terminal HTTP in this environment).
- Observed row cap pattern: many broad queries return exactly `100` rows.
- Observed totals from latest run (`megasearch-sync-2026-02-21T08-09-02-373Z`):
  - `3846` queries
  - `0` failed queries
  - `714` capped queries
  - `103,995` fetched rows across responses
  - `88,496` distinct stored rows
  - `22` endpoints; `21` hit cap at least once; `16` reached query budget `200`

## Constraints That Drive Architecture

- The payload envelope includes `iTotalRecords`, but observed responses often report `0`, so this is not usable for completeness guarantees.
- Many datasets appear wider than a single query result due to the `100` cap.
- Because this is Cloudflare-fronted, query throughput is constrained by browser/session stability as much as raw network.

## Recommended Sync Algorithm

1. Use one long-lived browser context per run (already implemented) to keep cookies/challenge state stable.
2. For each endpoint, begin with the empty query.
3. If `row_count < 100`, persist rows and do not split.
4. If `row_count >= 100`, enqueue child partitions (`city` -> `zip` -> `facilityName` -> `uniqueId` -> `address`) with token fanout and dedupe by normalized query key.
5. Dedupe records by endpoint-specific identity + payload hash; upsert idempotently.
6. Persist query-level telemetry for every request (`status`, `row_count`, `was_capped`, `error`).
7. Bound runtime with per-endpoint query budgets; track unresolved capped partitions as explicit debt.

## Rate Limiting and Retry Policy

- Treat HTTP `429` as a rate-limit response and honor `Retry-After` when present.
- Retry transient failures (`429`, `5xx`, network timeouts) with exponential backoff plus jitter.
- Keep a small steady inter-query delay even when successful (avoid bursty Cloudflare behavior).
- Keep endpoint-level failure counts and alert when failures or unresolved capped partitions spike.

## Incremental Sync Pattern (Cron)

1. Nightly or 6-hour full fanout crawl with bounded query budget.
2. Intra-day shallow refresh run using reduced split depth for faster deltas.
3. Post-run checks:
   - sudden drop in distinct record counts per endpoint
   - sudden rise in capped queries
   - failed queries > 0
4. Periodic deep run (for example weekly) with larger query budget to reduce unresolved partition debt.

## What Is Already Implemented

- Zod envelope parsing and row shape guards (`parseMegaSearchEnvelope`).
- Fanout query partitioning with dedupe.
- Query logging table for run observability.
- Idempotent upsert store with payload hashes.
- CLI controls for endpoint filter, split depth, query budget, and delay.
- Retry policy updated to:
  - retry transient failures (`429`, `5xx`, network)
  - parse and honor `Retry-After` when present
  - apply backoff + jitter fallback when `Retry-After` is missing

## Remaining Hardening Work

- Add resumable queue checkpoints so interrupted runs can continue without restarting endpoint fanout from scratch.
- Add alert thresholds in runtime (for cron visibility).

## Primary Sources

- ArcGIS query operation and transfer-limit semantics: <https://developers.arcgis.com/rest/services-reference/enterprise/query-map-service-layer/>
- ArcGIS feature layer query (pagination/order guidance): <https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/>
- HTTP `429 Too Many Requests` (RFC 6585): <https://www.rfc-editor.org/rfc/rfc6585#section-4>
- HTTP `Retry-After` semantics (RFC 9110): <https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3>
- Cloudflare challenge behavior overview: <https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/>
