# Sync Engine Spec: AZDEQ CGP/NOI

## Goal

Build a reliable sync engine that ingests CGP/NOI records from AZDEQ into a local/operational datastore with idempotent upserts and change tracking.

This package also includes a second engine for AZDEQ MegaSearch datasets (`megasearch.azdeq.gov`) with the same run/idempotency principles.
It now also includes an ArcGIS permit/map sync engine for AZDEQ hosted layers.

## Source Interface

- Source: `https://my.azdeq.gov/deq-search/service/permit/cgp`
- Access model: HTTP GET with filters.
- Stable entity key: `ltfIdno` (exact lookup via `ltfid` query param).

## Why `ltfid` Range Crawling

- Full unfiltered calls may fail (`HTTP 500`).
- County calls are manageable but not complete coverage.
- Broad text searches often fail with `HTTP 500`.
- Exact `ltfid` lookups are deterministic and return at most one permit payload.

## Sync Algorithm

1. Resolve crawl range (`startId..endId`).
2. Start run metadata (`run_id`, `started_at`, range, status=`running`).
3. For each `ltfId` in range (concurrent workers):
- Fetch `service/permit/cgp?ltfid=<id>`.
- If request succeeds:
  - Normalize key fields.
  - Hash full payload (`sha256`).
  - Upsert by `ltfIdno`.
  - Mark `last_seen_run_id` + `last_seen_at`.
- If request fails:
  - enqueue ID for retry.
4. Retry failed IDs for N passes.
5. After crawl + retries:
- Soft-delete rows not seen in run (`deleted_at`).
- Mark run status=`success` with counters.
6. On unrecoverable process failure:
- Mark run status=`failed` with error message.

## Identity + Change Tracking

- Natural key: `ltfIdno`
- Change detector: `payload_hash`
- Run linkage:
- `first_seen_run_id`
- `last_seen_run_id`
- `deleted_at` for missing records

## Storage (SQLite for play/test)

- Table `cgp_permits`:
- normalized scalar fields
- `raw_json`
- `payload_hash`
- run timestamps / deletion marker
- Table `cgp_sync_runs`:
- run lifecycle + counters + status

## Scheduling / Deployment

Container cron pattern:

- Cron schedule (example): every 6h or nightly depending freshness needs.
- Job process:
- execute `sync-ltf-range`
- log summary JSON
- emit non-zero exit code on process failure
- include unresolved `failedLtfIds` in run output

## Scaling Notes

- Current tested exhaustive pull (2026-02-21 UTC): `21670` records from `ltfid 1..116955` in ~11 minutes.
- Backoff/retry included for transient 5xx and timeouts.
- One known hard-failing ID observed (`89926` returns persistent HTTP 500 with empty body).
- Concurrency and progress interval are tunable via CLI flags.

## Open Questions

1. Should downstream model preserve raw category variants (`AZPDES` vs `AZPDEX` typos) or normalize them?
2. Should `ISSUED` be treated as active and all `CLOSED*`/`EXPIRED` as inactive in a canonical status map?
3. Is there a separate authenticated endpoint for original filed NOI PDFs, since this CGP endpoint does not expose document URLs directly?
4. MegaSearch currently appears capped at `100` rows for many broad queries with no usable total-count metadata. Should we accept probabilistic fanout completeness or require a server-backed export source?

## ArcGIS Sync Notes

- Source family: `https://services.arcgis.com/SzoH1oFM2apCSkx3/ArcGIS/rest/services/*/FeatureServer/*`.
- Target layers include:
  - AZPDES (`0..5`)
  - AZPDES Individual Permits (`0`)
  - Dust Visibility Construction Notification Area (`0`)
- Full extraction approach:
  1. Read layer metadata (`objectIdField`, `maxRecordCount`, capabilities).
  2. Read layer count (`returnCountOnly=true`).
  3. Page with `resultOffset` + `resultRecordCount`, ordered by object id field.
  4. Upsert features idempotently with payload hash tracking.
- Sync run model mirrors CGP/MegaSearch:
  - `arcgis_sync_runs`
  - `arcgis_records`
  - `arcgis_layer_log`

## Immediate Next Step

Promote this package into a production adapter that writes to Postgres and exposes deltas for downstream workflows.
