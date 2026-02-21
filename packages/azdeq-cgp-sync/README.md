# azdeq-cgp-sync

Investigation package for syncing Arizona DEQ CGP/NOI records from the public `deq-search` backend into SQLite for analysis and downstream ingestion design.

## Name

Working name: `azdeq-cgp-sync` (now includes CGP sync, MegaSearch sync, and ArcGIS permit/map sync tooling).

## What This Covers

- Discovers and uses the CGP JSON endpoint used by the public search UI.
- Discovers and syncs MegaSearch `/list` datasets via Playwright-backed browser fetches (Cloudflare-protected; raw terminal `fetch/curl` gets blocked).
- Syncs ArcGIS permit/map layers from the ADEQ ArcGIS REST services with paginated extraction and idempotent upserts.
- Supports two sync modes:
  - county partition sync (`facilitycounty`)
  - exhaustive `ltfid` range sync (recommended for completeness)
- Supports MegaSearch adaptive query fanout when endpoint responses hit the `100` row cap.
- Stores both normalized columns and full raw JSON payload per permit.
- Exports:
  - latest permits
  - one full record by `ltfIdno`
- sample files with **20 full records per NOI category/type** (`ltfCatName`).
- sample files with full row payloads per MegaSearch endpoint.

## Confirmed API Shape

Endpoint:

- `GET https://my.azdeq.gov/deq-search/service/permit/cgp`

Supported query params (confirmed from app bundle + live calls):

- `ltfid`
- `companyname`
- `facilityname`
- `facilitycounty` (FIPS-like AZ county code, e.g. `04013`)

Important behavior:

- Empty query frequently returns `HTTP 500`.
- Broad `companyname`/`facilityname` queries can return `HTTP 500`.
- `ltfid` exact lookup is the most reliable primitive for exhaustive extraction.
- Some `ltfid` values can hard-fail with `HTTP 500` (for example `89926` as observed on 2026-02-21), so retries + failure tracking are required.

### Record Shape (Observed)

Top-level fields include:

- `ltfIdno`, `permitAuthCode`, `permitType`, `projType`
- `facilityName`, `companyName`, `rcoName`
- `dateSubmitted`, `dateApplied`, `conStartDate`, `conEndDate`
- `permitProjectArea`, `totalProjectArea`
- `ltfFacilityDetails` (`ltfCatName`, `ltfStatus`, `issuedDate`, `latLongDetails`, county)
- `companyAddress`
- `swpppDetails` (`fname`, `lname`, `email`, `phone`)
- `outfalls` (array with lat/long and elevation)

## Sync Strategy

Recommended production strategy:

1. Run `ltfid` range crawl (`start..end`) as primary sync.
2. Retry failed IDs for additional passes.
3. Upsert by `ltfIdno` + `payload_hash` change tracking.
4. Mark `last_seen_run_id` / `last_seen_at`.
5. Soft-delete permits not seen in the current run (`deleted_at`).

County sync is still useful for lightweight spot checks, but it is not complete by itself.

## Current Coverage Snapshot (2026-02-21 UTC)

- Range crawl: `1..116955`
- Stored rows: `21670` unique permits
- Permit type: `CGP` only in this endpoint
- Submitted date range: `2017-05-31` to `2026-02-20`
- Remaining hard-fail ID(s): `89926`

See `packages/azdeq-cgp-sync/research/exhaustive-summary.json` for full counts.

## Current Limits / Findings

- CGP endpoint gives rich NOI metadata, including contact fields in many records.
- No direct CGP PDF/NOI document download endpoint was found in this CGP API path.
- Facility-specific AZPDES Individual Permits are separate and do expose permit/factsheet URLs in ArcGIS layer attributes.
- MegaSearch does not expose obvious paging metadata (`iTotalRecords` returns `0` in observed payloads), and many broad queries cap at exactly `100` rows.
- MegaSearch completeness therefore requires query-partition fanout plus dedupe; hard completeness guarantees need either undocumented paging parameters or a backend export endpoint.

### MegaSearch Research Outputs

- Run summary and endpoint-level counts:
  - `packages/azdeq-cgp-sync/research/megasearch/_run-summary.json`
- Stored-record counts and sample manifest:
  - `packages/azdeq-cgp-sync/research/megasearch/_summary.json`
- 20 full sample rows per endpoint:
  - `packages/azdeq-cgp-sync/research/megasearch/*.json`
- Unioned row key inventory per endpoint (from samples):
  - `packages/azdeq-cgp-sync/research/megasearch/field-shapes.json`
- Sync strategy notes for cron/container deployment:
  - `packages/azdeq-cgp-sync/research/megasearch/sync-architecture.md`
  - `packages/azdeq-cgp-sync/research/megasearch/scale-strategy.md`

### ArcGIS Permit/Map Outputs

- Service directory snapshot:
  - `packages/azdeq-cgp-sync/research/arcgis/service-directory.json`
- Permit-related service/layer counts and capabilities:
  - `packages/azdeq-cgp-sync/research/arcgis/permit-related-services-summary.json`
  - `packages/azdeq-cgp-sync/research/arcgis/service-layer-summary.json`
- Map sync readiness notes and extraction pattern:
  - `packages/azdeq-cgp-sync/research/arcgis/sync-readiness.md`
- ArcGIS sync run summary:
  - `packages/azdeq-cgp-sync/research/arcgis/_run-summary.json`
- ArcGIS per-layer sample exports:
  - `packages/azdeq-cgp-sync/research/arcgis/samples/*.json`

## CLI

From repo root:

```bash
# 1) Run county-partition sync (partial coverage)
bun packages/azdeq-cgp-sync/cli.ts sync

# 2) Run exhaustive ltfid-range sync (recommended)
bun packages/azdeq-cgp-sync/cli.ts sync-ltf-range --concurrency 12 --progress-every 10000

# 3) Crawl MegaSearch datasets (all endpoints by default)
bun packages/azdeq-cgp-sync/cli.ts megasearch-sync --max-queries 600 --max-split-levels 5

# 4) Export MegaSearch endpoint samples + counts
bun packages/azdeq-cgp-sync/cli.ts megasearch-export --per-endpoint 20

# 5) Run ArcGIS permit/map sync
bun packages/azdeq-cgp-sync/cli.ts arcgis-sync --page-size 1000

# 6) Export ArcGIS layer samples + counts
bun packages/azdeq-cgp-sync/cli.ts arcgis-export --per-layer 20

# 7) Show latest CGP records
bun packages/azdeq-cgp-sync/cli.ts latest --limit 15

# 8) Output one full CGP record by ltfId
bun packages/azdeq-cgp-sync/cli.ts full --ltf-id 114921

# 9) Generate 20 full CGP records per NOI type/category into files
bun packages/azdeq-cgp-sync/cli.ts sample-types --per-type 20

# Optional: fetch one LTF directly from API without DB
bun packages/azdeq-cgp-sync/cli.ts fetch-ltf --ltf-id 114921
```

Default DB path:

- `packages/azdeq-cgp-sync/.data/azdeq-cgp-sync.sqlite`

Default sample output path:

- `packages/azdeq-cgp-sync/research/noi-type-samples/`

Default ArcGIS sample output path:

- `packages/azdeq-cgp-sync/research/arcgis/samples/`

## Next Design Step

Move this from SQLite play mode into a production cron container that writes to Postgres and emits deltas for downstream jobs.

## Artifact Guide

- `packages/azdeq-cgp-sync/research/README.md`

## Canonical Method Docs

- Package overview and CLI: `packages/azdeq-cgp-sync/README.md`
- Sync contract and storage model: `packages/azdeq-cgp-sync/SPEC.md`
- MegaSearch runtime architecture: `packages/azdeq-cgp-sync/research/megasearch/sync-architecture.md`
- MegaSearch scale + retry policy: `packages/azdeq-cgp-sync/research/megasearch/scale-strategy.md`
- ArcGIS map/permit sync readiness: `packages/azdeq-cgp-sync/research/arcgis/sync-readiness.md`
