# AQData Worker (`apps/aqdata-worker`)

HTTP session worker for Maricopa AQData dust-application export and detail scraping.

## Scope

- `src/aqdata/*`: session transport, AQData client, export/detail parsers, PDF extraction.
- `src/services/sync.ts`: export sync flow (download/export parse + Postgres upsert).
- `src/services/detail-scrape.ts`: incremental detail scraping + PDF enrichment + QA.
- `src/services/persistence.ts`: `aqdata_permits` persistence boundary.
- `src/api/*`: worker API handlers (`/api/sync`, `/api/sync/company`, `/api/scrape*`).

## Runtime Rules

- Canonical state is Postgres (`aqdata_permits`), not local files.
- Keep parsing deterministic by default (Cheerio/selector-based + structured PDF parse).
- Keep summary sync and detail scrape separate concerns:
  - sync updates permit rows from export.
  - detail scrape enriches unscripted permits into `detail_html`/`detail_fields`.
- Preserve raw detail HTML and structured JSON for audit/debug.

## Integration Rules

- Background orchestration lives in `apps/background-jobs`.
- `background-jobs` should call this worker over Docker network (`AQDATA_WORKER_URL`).
- Manual AQData trigger endpoints in `background-jobs` are async-trigger style (`202`) to avoid caller timeouts on long runs.

## Operational Notes

- `aqdata-worker` exposes:
  - `GET /health`
  - `POST /api/sync`
  - `POST /api/sync/company`
  - `POST /api/scrape`
  - `GET /api/scrape/:id` (single permit debug probe)
  - loop/status endpoints (`/api/scrape/start|stop|status`)
- Bun `idleTimeout` must stay `<=255` seconds.
- Expected behavior at startup: initial AQData jobs may retry while the worker warms.

## Testing Rules

- Tests belong only in top-level `tests/apps/aqdata-worker/...`.
- Prefer deterministic parser tests first, then live/probe scripts.
- Run `ultracite` on touched files; do not run `biome`.
