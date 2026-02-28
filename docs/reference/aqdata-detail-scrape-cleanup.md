# AQData Detail Scrape Cleanup Plan

Date: 2026-02-28

## Goal

Stop spending runner cycles on permit IDs that are not in AQData, and remove temporary bridge/workaround code added during the AQData migration.

## What Was Removed Today (Workaround Cleanup)

These workaround paths are now removed:

- `AQDATA_IGNORE_PERMIT_IDS` env wiring in `docker-compose.yml`
- AQData ignore-list module: `apps/aqdata-worker/src/aqdata/ignore-list.ts`
- Ignore checks in AQData scrape APIs/services:
  - `apps/aqdata-worker/src/api/scrape.ts`
  - `apps/aqdata-worker/src/services/detail-scrape.ts`
  - `apps/aqdata-worker/src/services/persistence.ts`
- Ignore passthrough handling in permit-worker scrape proxy:
  - `apps/dust-permits/src/api/scrape.ts`
- Ignore-specific handling in Trigger task:
  - `apps/trigger-dev/src/trigger/permit-detail-scrape.ts`

## Runtime Guard Added (Real Fix)

`getPermitsNeedingScrape` now only returns permits that exist in `aqdata_permits`:

- `lib/db/repositories/dust-permit.ts`

This prevents IDs like `D0065255` (present in dust permits table, absent in AQData table) from being scheduled for detail scrape attempts at all.

## Remaining Temporary Bridge Code To Delete (When Going Fully Direct)

The following code exists only because Trigger currently scrapes via permit-worker:

1. Permit-worker AQData detail proxy endpoint
Path:
- `apps/dust-permits/src/api/scrape.ts`
Remove when Trigger (or replacement job) calls aqdata-worker directly.

2. MCP client scrape wrapper for permit-worker
Paths:
- `apps/dust-permits-mcp/client.ts` (`scrape`)
- `apps/dust-permits-mcp/types.ts` (`ScrapeResponse`)
Remove when no caller needs permit-worker scrape proxy.

3. Trigger scheduled task that enriches dust permits via permit-worker
Path:
- `apps/trigger-dev/src/trigger/permit-detail-scrape.ts`
Remove when direct AQData-driven enrichment replaces this task.

4. Dust permit candidate query helper used by that task
Path:
- `lib/db/repositories/dust-permit.ts` (`getPermitsNeedingScrape`)
Remove when the Trigger task above is removed.

## Non-Goal

Do not reintroduce permit-ID ignore lists. They hide failures and keep dead paths alive.
