# Permits Client Package

Typed HTTP client for permit-worker (`@permits/client`).

## Scope

- `src/client.ts`: `PermitClient` transport + error handling.
- `src/types.ts`: request/response contracts for permit-worker API.
- `src/index.ts`: package exports.
- `tests/client.test.ts`: client behavior tests.

## Non-Goals

- No Playwright portal automation here.
- No permit-worker runtime orchestration here.
- No direct UI/VNC debugging logic here.

Runtime automation lives in `apps/dust-permits/`.

## Integration Rules

- App/worker code should call permit-worker through `PermitClient`.
- Prefer default internal URL (`http://permit-worker:47822`) for container-to-container calls.
- Throw and handle `PermitWorkerError` for non-2xx responses/timeouts.
- Keep endpoint paths aligned with runtime server routes in `apps/dust-permits/src/index.ts`.

## Change Rules

- If you add or change an endpoint:
  1. Update `src/types.ts`.
  2. Update `src/client.ts`.
  3. Add/update tests in `tests/client.test.ts`.
- Keep request/response names explicit (`CreateRequest`, `CreateResponse`, etc.).
- Do not introduce runtime-only dependencies into this package.

## Validation

```bash
# From repo root
bun test packages/permits/tests/client.test.ts
```

For live permit renewal/payment flow validation with visible browser, run in permit-worker runtime context (not this package):

```bash
docker exec -it desert-permit-worker sh -lc 'cd /app/apps/dust-permits && bun test tests/e2e/renew-and-pay.test.ts'
```
