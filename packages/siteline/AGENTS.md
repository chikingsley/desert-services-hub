# Siteline Package (`packages/siteline`)

Typed Siteline GraphQL integration for Desert Services: client transport, MCP tools, CLI helpers, and schema references.

## Scope

- `src/client.ts`: `SitelineClient` transport, safety guards, retry/rate-limit behavior.
- `src/types.ts`: Siteline request/response contract types.
- `src/mcp/server.ts`: MCP server creation and wiring.
- `src/mcp/tools.ts`: Siteline MCP tool registration and schemas.
- `src/mcp/reference/`: schema dump + reference notes used for drift guards.
- `cli.ts`: local operator/testing CLI for Siteline read operations.
- `mcp.ts`: stdio entrypoint for Siteline MCP server.

## Non-Goals

- No permit-worker automation (belongs to `apps/dust-permits/` and `apps/dust-permits-mcp/`).
- No business-side orchestration jobs (belongs to app/worker layers).
- No tests inside package directories (`packages/*`); use top-level `tests/`.

## Safety Rules

- Default behavior must be non-destructive.
- `siteline_query` MCP tool must remain read-only unless explicitly approved.
- CLI `query` should remain read-only by default (`--allow-non-readonly` is explicit override).
- Preserve MCP tool annotations for safe tool routing:
  - `readOnlyHint: true`
  - `destructiveHint: false`
  - `idempotentHint: true`

## API/Runtime Rules

- Use `SITELINE_API_KEY` for auth and `SITELINE_API_URL` for endpoint override.
- Respect Siteline rate limits (2 req/sec) and retry transient failures (429/5xx).
- Keep typed wrappers for key read operations:
  - `currentCompany`
  - `paginatedContracts`
  - `contract`
  - `paginatedPayApps`
  - `payApp`

## MCP Rules

- Prefer typed tools over raw GraphQL where possible.
- MCP tools should define `inputSchema`/`outputSchema`.
- Return `structuredContent` for machine-readable outputs.
- Keep tool names stable unless breaking change is explicitly intended.

## Schema Drift Guard

- Canonical dump: `src/mcp/reference/siteline-api-introspection.json`
- Reference notes: `src/mcp/reference/siteline-api-complete-reference.md`
- If Siteline schema changes, update:
  1. `src/types.ts`
  2. `src/client.ts`
  3. `src/mcp/tools.ts`
  4. `tests/packages/siteline/src/mcp/schema-drift.test.ts`
  5. `src/mcp/reference/siteline-api-introspection.json`

## Tests & Validation

Run from repo root:

```bash
bun x ultracite check packages/siteline/cli.ts \
  packages/siteline/mcp.ts \
  packages/siteline/src/client.ts \
  packages/siteline/src/types.ts \
  packages/siteline/src/mcp/server.ts \
  packages/siteline/src/mcp/tools.ts \
  tests/packages/siteline/src/client.test.ts \
  tests/packages/siteline/src/mcp/schema-drift.test.ts \
  tests/packages/siteline/src/mcp/tools.test.ts

bun test tests/packages/siteline/src/client.test.ts \
  tests/packages/siteline/src/mcp/schema-drift.test.ts \
  tests/packages/siteline/src/mcp/tools.test.ts
```
