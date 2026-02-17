# Permit Worker Runtime (`apps/dust-permits`)

Maricopa County dust permit browser automation runtime.

## Scope

- Playwright portal automation and HTTP API server (`src/index.ts`).
- Permit lifecycle flows: create, renew, renew+pay, revise, close, scrape, sync.
- VNC-visible browser session used by live E2E and operator troubleshooting.

## Architecture

- `src/index.ts` — Bun API server on port `47822`.
- `src/api/` — route handlers and input validation.
- `src/portal/` — Playwright flow implementations.
- `src/portal/create/flow.ts` — create/renew/revise/renew-and-pay orchestration.
- `src/lib/` — map drawing, OCR, permit record helpers.
- `tests/e2e/` — live browser automation tests.

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/permits/create` | Create application |
| `POST` | `/api/permits/:id/renew` | Renew permit |
| `POST` | `/api/permits/:id/renew-and-pay` | Renew, submit, and pay |
| `POST` | `/api/permits/:id/close` | Close permit |
| `POST` | `/api/permits/:id/revise` | Revise permit |
| `DELETE` | `/api/permits/:id` | Delete draft |
| `DELETE` | `/api/permits/drafts` | Delete all drafts |
| `POST` | `/api/scrape/pdf` | Scrape + PDF |
| `GET` | `/api/scrape/:id` | Scrape only |
| `POST` | `/api/invoices/pdf` | Invoice PDF |
| `POST` | `/api/sync` | Full sync |
| `POST` | `/api/sync/company` | Company-only sync |
| `GET` | `/health` | Health |

## Run Context Rules

- Live E2E must run in the permit-worker container context for browser/VNC parity.
- Do not treat host-run E2E as equivalent to container runtime behavior.
- Use selectors from `src/portal/utils/selectors/`; do not hardcode selectors inline.

## Canonical Commands

```bash
# local dev from repo root
bun --hot apps/dust-permits/src/index.ts

# API/unit tests from repo root
bun test apps/dust-permits/tests/api/
bun test apps/dust-permits/tests/unit/

# live renew-and-pay E2E in runtime container (VNC-visible)
docker exec desert-permit-worker sh -lc 'cd /app/apps/dust-permits && bun test tests/e2e/renew-and-pay.test.ts'
```

## Key Gotchas

- Use `clickInFrames()` helpers for ADF popup interactions.
- Keep map draw logic on REST geometry sources; do not rely on browser FeatureLayer internals.
- Keep-alive can navigate the visible page (`page.goto()`); this is expected in VNC.
