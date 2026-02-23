# Dust Permit Data Services Architecture (v1)

## Purpose

Run one platform with two execution planes:

1. `permit-worker`: performs permit operations (create, renew, revise, close).
2. `data-sync-worker`: continuously ingests external permit/intelligence sources.

Shared Postgres is the source of truth.

## External Data Sources (Current)

1. `aqdata` (Maricopa export + detail scrape)
2. `azdeq_cgp` (`my.azdeq.gov` CGP/NOI endpoint)
3. `azdeq_arcgis` (ArcGIS permit/map layers)
4. `azdeq_megasearch` (MegaSearch endpoint family)

## Service Boundaries

1. `apps/worker` only handles browser automation permit actions.
2. `apps/data-sync-worker` only handles ingestion/sync/reconciliation.
3. `apps/portal` only reads canonical/search/run-status data.
4. Sync logic does not run in portal request paths.

## Core Orchestration Tables

### `sync_sources`

- `key` (pk)
- `enabled`
- `schedule_cron`
- `max_concurrency`
- `rate_limit_per_minute`
- `timeout_seconds`
- `config_json`
- timestamps

### `sync_jobs`

- `id` (uuid pk)
- `source_key`
- `job_type`
- `payload_json`
- `status` (`queued|running|succeeded|failed|dead`)
- `priority`
- `scheduled_at`
- `locked_at`
- `locked_by`
- `attempt_count`
- `max_attempts`
- `dedupe_key`
- timestamps

### `sync_job_attempts`

- `id`
- `job_id`
- `attempt_no`
- `started_at`
- `finished_at`
- `status`
- `error_code`
- `error_message`
- `http_status`
- `retry_after_ms`
- `metrics_json`

### `sync_runs`

- `id` (uuid pk)
- `source_key`
- `run_kind`
- `started_at`
- `finished_at`
- `status`
- `discovered_count`
- `fetched_count`
- `inserted_count`
- `updated_count`
- `unchanged_count`
- `deleted_count`
- `failed_count`
- `hard_fail_count`
- `watermark_before`
- `watermark_after`
- `summary_json`

### `sync_failures`

- `id`
- `source_key`
- `entity_key`
- `error_hash`
- `first_seen_at`
- `last_seen_at`
- `occurrences`
- `last_error_json`
- `suppressed`

### `hard_fail_ids`

- `source_key`
- `entity_key`
- `reason`
- `active`
- timestamps

## Raw Source Tables

### `source_aqdata_permits`

- PK: `permit_id`

### `source_azdeq_cgp_records`

- PK: `ltf_idno`

### `source_azdeq_arcgis_features`

- PK: `service_name + layer_id + object_id`

### `source_azdeq_megasearch_rows`

- PK: `endpoint + record_id`

Common fields in all raw tables:

- `payload_hash`
- `raw_json`
- `first_seen_at`
- `last_seen_at`
- `deleted_at`
- `last_run_id`

## Canonical Read Table

### `permits_canonical`

- Unique key: `source_key + source_entity_key`
- Normalized fields for UI/search/map:
  - permit id/number/type/status
  - company + facility
  - address/city/county/state/zip
  - lat/lon
  - submitted/issued/effective/expiration/closed dates
  - acreage/project area
  - `payload_hash`
  - seen/deleted timestamps

## Job Contracts (Payload Shapes)

### `sync.aqdata.export`

```json
{ "companyName": "optional string" }
```

### `sync.aqdata.detail`

```json
{ "batchSize": 10, "permitIds": ["optional", "subset"] }
```

### `sync.azdeq_cgp.range`

```json
{
  "startId": 1,
  "endId": 120000,
  "concurrency": 12,
  "retryFailedPasses": 2
}
```

### `sync.azdeq_arcgis.layers`

```json
{ "layerKeys": ["optional"], "pageSize": 1000, "delayMs": 25 }
```

### `sync.azdeq_megasearch.endpoints`

```json
{
  "endpointNames": ["optional"],
  "maxQueries": 600,
  "maxSplitLevels": 5,
  "delayMs": 100
}
```

### `reconcile.canonical`

```json
{ "sourceKey": "optional", "runId": "optional" }
```

## Worker Loop Contract

1. Claim jobs with `FOR UPDATE SKIP LOCKED`.
2. Mark `running`; write attempt row.
3. Execute source adapter.
4. Upsert raw rows idempotently (natural key + `payload_hash`).
5. Reconcile into `permits_canonical`.
6. Mark success/failure and schedule retry if retryable.
7. Move to `dead` after `max_attempts`.

## Source-Specific Ingestion Notes

### AZDEQ CGP/NOI

1. Primary key: `ltfIdno`.
2. Best extraction: `ltfid` range crawl + targeted retries.
3. Keep persistent `hard_fail_ids` for IDs that always 500.

### AZDEQ ArcGIS

1. Primary key: `service/layer/objectId`.
2. Pull layer metadata (`objectIdField`, `maxRecordCount`).
3. Page via `resultOffset` + `resultRecordCount`.

### AZDEQ MegaSearch

1. Endpoint fanout required because broad queries often cap at 100 rows.
2. Split-plan query partitioning + dedupe by stable record ID + hash.
3. Track unresolved capped partitions for deferred deep runs.

### AQData

1. Keep two-stage model:
   - export sync for broad coverage
   - detail scrape for enrichment/files/structured fields

## Scheduling Baseline (v1)

1. `aqdata export`: every 30 minutes
2. `aqdata detail`: every 15 minutes
3. `azdeq_cgp range incremental`: every 60 minutes
4. `azdeq_arcgis`: every 2 hours
5. `azdeq_megasearch`: every 4 hours
6. Nightly deep/backfill runs

## Concurrency + Retry Policy

1. Separate pools per source (`cgp`, `arcgis`, `megasearch`, `aqdata`).
2. Global cap per worker instance.
3. Respect `Retry-After` when present.
4. Retry with exponential backoff + jitter for `429` and `5xx`.
5. Persist all retry state in DB; no in-memory-only retry state.

## Container Topology (v1)

1. `portal` (UI + API read layer)
2. `permit-worker` (automation operations)
3. `data-sync-worker` (all external ingest jobs)
4. `postgres`
5. optional `typesense` (search acceleration later)

## Out of Scope (v1)

1. Enterprise public API surface
2. Multi-state expansion
3. Full event-stream platform replacement
