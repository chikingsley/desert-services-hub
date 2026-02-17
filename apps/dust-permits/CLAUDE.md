# Permit Worker

Maricopa County dust permit browser automation. Playwright-based portal scraping, PDF generation, permit lifecycle management.

## Architecture

- `src/index.ts` — Bun.serve() HTTP API on port 47822
- `src/api/` — HTTP route handlers (permits.ts, permits-helpers.ts, scrape.ts)
- `src/handlers/` — Business logic (create, renew, close, scrape, sync)
- `src/portal/` — Playwright browser automation (create, close, scrape, pdf, login)
- `src/portal/utils/` — Helpers, selectors, browser session management

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

## Key Gotchas

- **ADF popups**: Use `clickInFrames()` from helpers.ts, never click directly on a frame
- **Confirmation popups**: Click action button, then click Cancel to dismiss (ADF quirk)
- **Map popup exception**: Don't close confirmation popup while map popup is open
- **ESRI map**: Use REST API for geometry, not browser FeatureLayer
- **Selectors**: Define in `src/portal/utils/selectors/portal.ts`, never hardcode
- **Keep-alive**: Re-login navigates the visible page via `page.goto()` — expected VNC behavior

## Reference Docs

- `docs/ESRI-MAP-DRAWING-GUIDE.md` — Map automation patterns
- `docs/api.md` — Full API documentation
