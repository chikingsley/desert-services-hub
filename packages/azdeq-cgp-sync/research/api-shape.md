# AZDEQ CGP API Shape Notes

Last validated: 2026-02-21 (UTC)

## Endpoint

- `GET https://my.azdeq.gov/deq-search/service/permit/cgp`

## Query Params (confirmed)

- `ltfid`
- `companyname`
- `facilityname`
- `facilitycounty` (county code like `04013`)

## Behavior Notes

- Empty query often returns `HTTP 500`.
- County-partitioned calls return stable JSON arrays.
- Direct CGP PDF/document route was not identified in this API path.

## Sync Run Snapshot

From `cgp_sync_runs` in `packages/azdeq-cgp-sync/.data/azdeq-cgp-sync.sqlite`:

- `run_id`: `cgp-sync-2026-02-21T05-01-24-664Z`
- counties: all 15 AZ counties
- fetched records: `14085`
- inserted: `14085`
- updated: `0`
- unchanged: `0`
- soft deleted: `0`

## Status Distribution

- `CLOSED - TERMINATED BY COMPANY`: 8134
- `ISSUED`: 2226
- `CLOSED - SUPERSEDED`: 2075
- `EXPIRED`: 1605
- `CLOSED - WITHDRAWN`: 35
- `CLOSED APPLICATION`: 10

## NOI Type / Category Distribution (`ltfCatName`)

- `AZPDES Stormwater Construction General Permit Greater than 5 Acres`: 6667
- `AZPDES Stormwater Construction General Permit 1 to 5 Acres`: 3661
- `AZPDES Stormwater CGP No Discharge Certificate`: 1354
- `AZPDES, Stormwater Construction General Permit Greater than 5 Acres`: 1245
- `AZPDEX, Stormwater Construction General Permit 1 to 5 Acres`: 405
- `AZPDES Stormwater General Construction Permit Less than 1 Acre Master Plan`: 250
- `AZPDES Stormwater General Construction Permit Greater than 5 Acres`: 233
- `AZPDES Stormwater General Construction Permit 1 to 5 Acres`: 102
- `AZPDES Stormwater CGP Waiver`: 82
- `AZPDES Stormwater CGP waiver`: 81
- `AZPDES, Stormwater Construction General Permit Less than 1 Acre Master Plan`: 5

## Field Path Inventory

Full discovered path list is in:

- `packages/azdeq-cgp-sync/research/field-paths.txt`

This file is generated from all synced raw payloads.
