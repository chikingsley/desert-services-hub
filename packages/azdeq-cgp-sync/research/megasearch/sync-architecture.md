# AZDEQ Sync Architecture (CGP + MegaSearch)

## 1) Source adapters

- `CGP adapter` (`my.azdeq.gov/deq-search/service/permit/cgp`)
  - Deterministic primitive: `ltfid` exact lookup.
  - Best full-sync strategy: numeric `ltfid` range crawl with retries.
- `MegaSearch adapter` (`megasearch.azdeq.gov/megasearch/*/list`)
  - Must run through a browser session (Cloudflare blocks raw terminal HTTP).
  - 22 endpoint datasets with heterogeneous row shapes.

## 2) Validation/guardrails

- Parse and validate payload envelope with Zod (`parseMegaSearchEnvelope`).
- Reject malformed response shape early (hard-fail query, keep run alive).
- Log every query attempt with status, row count, capped flag, and error message.

## 3) Persistence model

- `SQLite play DB` (current investigation mode)
  - `megasearch_records`
    - primary key: `(endpoint, record_id)`
    - `record_id` includes endpoint-specific identity parts + row hash suffix.
    - stores full `raw_json`, `payload_hash`, run linkage.
  - `megasearch_sync_runs`
    - run lifecycle + aggregate counters.
  - `megasearch_query_log`
    - per-query observability (for troubleshooting and tuning fanout).

## 4) Crawl strategy

- Start with broad query per endpoint.
- When response length hits `100`, treat as capped and split query space:
  1. `city` token fanout (`a-z0-9`)
  2. `zip` token fanout (`0-9`)
  3. `facilityName` token fanout (`a-z0-9`)
  4. `uniqueId` token fanout (`a-z0-9`)
  5. `address` token fanout (`a-z0-9`)
- Deduplicate rows across overlapping query partitions.
- Cap per-endpoint query budget (`maxQueriesPerEndpoint`) to bound runtime.

## 5) Runtime profile (latest run)

- Run ID: `megasearch-sync-2026-02-21T08-09-02-373Z`
- Duration: ~15m24s
- Total queries: `3846`
- Failed queries: `0`
- Capped queries observed: `714`
- Rows fetched across all responses: `103,995`
- Distinct stored rows: `88,496`

See:

- `packages/azdeq-cgp-sync/research/megasearch/_run-summary.json`
- `packages/azdeq-cgp-sync/research/megasearch/_summary.json`

## 6) Cron container recommendation

- Run `megasearch-sync` on a schedule (for example every 6h or nightly).
- Use bounded query budget + monitor unresolved capped partitions.
- Emit run summary JSON + alert if:
  - failures > 0
  - capped partitions rise sharply
  - total distinct row count drops unexpectedly

## 7) Open completeness gap

- MegaSearch responses do not expose reliable total-count/paging metadata.
- Full completeness is best-effort with fanout + dedupe unless AZDEQ exposes:
  - server paging params, or
  - an official bulk export endpoint/API.
