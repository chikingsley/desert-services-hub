# Research Artifacts Guide

This folder contains generated investigation outputs. Use this guide to decide what to keep.

## Keep (Recommended Baseline)

- `exhaustive-summary.json`
  - CGP full-range crawl summary (coverage/count/date-range snapshot).
- `noi-type-samples/`
  - 20 full records per observed CGP NOI category/type.
- `megasearch/_run-summary.json`
  - full run metadata and endpoint query/cap counters.
- `megasearch/_summary.json`
  - stored record counts + sample manifest by endpoint.
- `megasearch/field-shapes.json`
  - union of observed key shapes by endpoint.
- `megasearch/*.json` (endpoint-named files)
  - 20 full sample rows per MegaSearch endpoint.
- `arcgis/service-directory.json`
  - service discovery snapshot.
- `arcgis/permit-related-services-summary.json`
  - permit-focused service/layer counts and capabilities.
- `arcgis/service-layer-summary.json`
  - deep metadata + sample attributes for core AZPDES/dust layers.

## Optional (Can Be Deleted Anytime)

- `full-record-114921.json`
- `full-record-114955.json`
- `latest-15.json`
- `latest-15.tsv`

These are point-in-time inspection snapshots and are not required for sync architecture.

## Docs (Keep)

- `api-shape.md`
- `arcgis/sync-readiness.md`
- `megasearch/sync-architecture.md`
- `megasearch/scale-strategy.md`

## Notes

- Local SQLite crawl DBs live under `packages/azdeq-cgp-sync/.data/` and are intentionally gitignored.
- If you want to keep the repo lean, remove only the `Optional` files first.

