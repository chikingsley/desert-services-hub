# Permit Worker

Maricopa County dust permit browser automation. Playwright-based portal scraping, PDF generation, permit lifecycle management.

## Architecture

- `src/index.ts` — Bun.serve() HTTP API on port 47822
- `src/api/` — HTTP route handlers (permits.ts, permits-helpers.ts, scrape.ts)
- `src/portal/` — Playwright browser automation (create, close, scrape, pdf, login)
- `src/portal/utils/` — Helpers, selectors, browser session management
- `src/lib/` — Shared utilities (OCR, form validation, permit records, site drawing)
- `src/form-data.ts` — Permit form data types
- `tests/` — `bun:test` suites (E2E in `tests/e2e/`, API in `tests/api/`)
- `experiments/` — One-off scripts (Gemini OCR, map rehydration) — not part of runtime

## API Endpoints (port 47822)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/permits/create` | Create new application |
| `POST` | `/api/permits/:id/renew` | Renew existing permit |
| `POST` | `/api/permits/:id/close` | Close permit |
| `POST` | `/api/permits/:id/revise` | Create revision |
| `DELETE` | `/api/permits/:id` | Delete draft |
| `DELETE` | `/api/permits/drafts` | Delete all drafts |
| `POST` | `/api/scrape/pdf` | Scrape + generate PDF |
| `GET` | `/api/scrape/:id` | Scrape data only |
| `POST` | `/api/sync` | Sync from portal export |
| `GET` | `/health` | Health check |

## Commands

- `bun run dev` — Run server with HMR
- `bun run start` — Production server
- `bun test` — Run all tests
- `bun run test:e2e` — E2E tests (serial, bail on failure)
- `bun run test:api` — API tests
- Linting/typechecking runs from monorepo root

## Key Gotchas

- **ADF popups**: Use `clickInFrames()` from helpers.ts, never click directly on a frame
- **Confirmation popups**: Click action button, then click Cancel to dismiss (ADF quirk)
- **Map popup exception**: Don't close confirmation popup while map popup is open
- **ESRI map**: Use REST API for geometry, not browser FeatureLayer
- **Selectors**: Define in `src/portal/utils/selectors/portal.ts`, never hardcode
- **Keep-alive**: Re-login navigates the visible page via `page.goto()` — expected VNC behavior

## Testing

- Framework: `bun:test` with Playwright-based portal helpers in `tests/e2e/utils/`
- Test files use descriptive names (e.g., `create-existing-minimal.test.ts`)
- E2E tests connect to the live permit-worker container — they are not mocked
- Avoid retry loops after portal failures; fix the selector or flow instead

## Environment

- Secrets in `.env` (Bun auto-loads): `DUST_PERMIT_USERNAME`, `DUST_PERMIT_PASSWORD`
- Runs in Docker container `desert-permit-worker` — see `Dockerfile` and `start-stack.sh`
- VNC at port 6080 (noVNC web UI), API at port 47822
- Database: Postgres via `@lib/db/hub` (monorepo shared lib), not local SQLite
- Dependencies: All from root `package.json` — no local deps

## Reference Docs

- `docs/ESRI-MAP-DRAWING-GUIDE.md` — Map automation patterns
- `docs/api.md` — Full API documentation
