# Web App (`apps/web`)

Frontend SPA + Bun API routes.

## Scope

- `frontend/`: React UI pages/components.
- `api/`: HTTP handlers grouped by domain.
- `server.ts`: route registration and app bootstrap.

## Estimate Write Guardrails

Validation source of truth:
- `packages/estimates/src/estimating/estimate-payload-validation.ts`

Enforcement points:
- `api/estimates/estimates.ts` (`POST /api/estimates`)
- `api/estimates/estimates-by-id.ts` (`PUT /api/estimates/:id`)

Required invariants:
- Line items must resolve to catalog code or exact catalog item name.
- Persist canonical `item_name` + catalog `description` only.
- If `line_items` exist, require `job_name`, `client_name` (stored as `contractor`), `job_address`, `client_address`.
- Addresses normalize to two-line format.
- Reject `sections` updates that omit `line_items`.
- Validation errors return HTTP `400` with issue details (no silent defaulting).

Regression coverage:
- `tests/apps/web/api/estimates/estimates.test.ts`
- `tests/components/estimates/estimate-workspace.test.ts`

## Permit Integration Rules

- Permit-worker API is available at `permit-worker:47822` (Docker internal).
- Do not add direct permit-worker `fetch()` calls in web API handlers.
- Automation proxy endpoints live in `api/automation.ts`.
- For manual testing/debugging: use MCP tools from Claude Code (`apps/dust-permits-mcp/`).

## Runtime Notes

- Runs in container `desert-web` on port `3000`.
- Uses shared Postgres through `@lib/db/client`.
