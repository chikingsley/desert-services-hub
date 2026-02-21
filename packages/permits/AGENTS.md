# Permits Client Package (`packages/permits`)

Typed HTTP client package for permit-worker (`@permits/client`).

## Scope

- `src/client.ts`: `PermitClient` transport + `PermitWorkerError`.
- `src/types.ts`: request/response contracts.
- `src/intent.ts`: Gemini-based permit email intent extraction.

## Non-Goals

- No Playwright/browser automation runtime.
- No portal selector logic.
- No VNC/debug orchestration.
- No CLI or MCP server (MCP moved to `apps/dust-permits-mcp/`).

Runtime automation belongs to `apps/dust-permits/`.

## Endpoint Method Matrix

- `createPermit()` → `POST /api/permits/create`
- `renewPermit()` → `POST /api/permits/:id/renew`
- `renewAndPay()` → `POST /api/permits/:id/renew-and-pay`
- `closePermit()` → `POST /api/permits/:id/close`
- `revisePermit()` → `POST /api/permits/:id/revise`
- `searchPermits()` → `GET /api/permits/search?q=...`
- `expiringPermits()` → `GET /api/permits/expiring?days=30`
- `scrapePdf()` / `scrape()` / `sync()` / `syncCompany()` / `invoicePdf()`
- browser endpoints (`browserStatus/start/ready/keepalive/stop`, clipboard)

## Integration Rules

- App/worker code should use `PermitClient` over direct permit-worker `fetch()`.
- Default internal base URL is `http://permit-worker:47822`.
- Non-2xx responses must propagate as `PermitWorkerError`.
- Keep method paths aligned with runtime routes in `apps/dust-permits/src/index.ts`.

## Change Rules

If you add or change a permit-worker endpoint:
1. Update `src/types.ts`.
2. Update `src/client.ts`.
3. Add/adjust tests in `tests/client.test.ts`.
4. Update the corresponding MCP tool in `apps/dust-permits-mcp/src/tools.ts`.
5. Update this file's method matrix if the public contract changed.

## Validation

```bash
# from repo root
bun run permits:guard:no-mock
bun run permits:test:client

# live runtime flow validation (not in this package)
bun run permits:test:renew-and-pay
```
