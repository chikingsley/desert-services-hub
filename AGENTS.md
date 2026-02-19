# Desert Services Hub

Monorepo for Desert Services operations: estimating, permits, contracts, notifications, and document generation.

## Repo-Wide Rules

- Runtime is self-hosted on `gmk-server` only.
- Operational state is in local Postgres (`host.docker.internal:54322`), not SQLite.
- External traffic is Cloudflare Tunnel to Docker services.
- Lint/format policy: never run `biome`; use `ultracite` only.
- Test placement policy: keep tests in top-level `tests/` only, mirrored by domain path (for example `tests/apps/web/...`, `tests/lib/...`, `tests/packages/...`). Do not place new tests inside `apps/*`, `lib/*`, or `packages/*`.
- For permit-worker API calls from app code, use `@permits/client` (`PermitClient`), not ad-hoc `fetch()`.
- Permit runtime and permit client are separate concerns:
  - `apps/dust-permits/` = Playwright runtime + API server.
  - `packages/permits/` = typed HTTP client contract.

## Monorepo Map

```text
apps/
  web/                   # Frontend SPA + API
  background-jobs/       # Webhook receiver + queue + polling workers
  dust-permits/          # Permit-worker runtime (Playwright + API)
  aqdata-worker/         # AQData worker (export sync + detail scrape + PDF enrichment)
  cf-workers/            # Cloudflare Workers

packages/
  permits/               # @permits/client typed permit-worker client
  monday/                # Monday.com API operations
  email/                 # Graph + email templates
  enrichment/            # PDL, Jina, Clearbit, avatar enrichment services
  documents/             # PDF analysis/generation pipelines
  contracts/             # Contract tooling
  narratives/            # Narrative generation

lib/
  db/                    # Postgres client/repositories/types
  catalog/               # Service catalog + pricing
  estimating/            # Estimate logic
  graph/, sharepoint/    # Microsoft Graph + SharePoint helpers
  pdf/, pdf-takeoff/     # Shared PDF utilities
```

## Scoped AGENTS (Use Nearest Scope)

- `apps/dust-permits/AGENTS.md`: permit runtime API, browser automation, E2E/VNC run context.
- `apps/aqdata-worker/AGENTS.md`: AQData sync/scrape runtime, parser/persistence boundaries.
- `packages/permits/AGENTS.md`: typed client contract and tests.
- `apps/background-jobs/AGENTS.md`: webhook jobs, notification triggers, sync/linking worker rules.
- `apps/web/AGENTS.md`: estimate API guardrails and permit API integration from web.
- `packages/enrichment/AGENTS.md`: PDL, Jina, Clearbit enrichment services (standalone, no email dependency).
- `packages/documents/AGENTS.md`: SSSP/SDS generation workflow rules.

## Docker Services

| Service | Container | Port | Purpose |
|---------|-----------|------|---------|
| `web` | `desert-web` | 3000 | Frontend + API |
| `background-jobs` | `desert-webhooks` | 4747 | Webhooks + jobs + timers |
| `permit-worker` | `desert-permit-worker` | 47822 API, 6080 VNC | Permit browser automation |
| `aqdata-worker` | `desert-aqdata-worker` | 47823 | AQData export sync + detail scrape |
| `tunnel` | `desert-tunnel` | — | Cloudflare tunnel |

## Permit Worker Integration

- **Shell / Claude Code**: Use the CLI — `bun run permit <command>` (wraps `PermitClient`, defaults to `http://localhost:47822`)
- **App code** (web, background-jobs): Use `PermitClient` from `@permits/client` (defaults to `http://permit-worker:47822`)
- **Never** write inline bun scripts or raw curl for permit operations.

```bash
# Examples
bun run permit close D0063827 --reason completed
bun run permit renew D0063827 --company "Weis Builders Inc"
bun run permit scrape-pdf D0063827
bun run permit health
```

## Canonical Commands

```bash
# Build/deploy runtime

docker compose build web background-jobs permit-worker
docker compose up -d

# Logs

docker compose logs -f web
docker compose logs -f background-jobs
docker compose logs -f permit-worker

# Permit client integration tests (live permit-worker container; no mock server)

bun run permits:guard:no-mock
bun run permits:test:client

# Renew+pay E2E in permit-worker runtime context

bun run permits:test:renew-and-pay
```

## Database Access

```bash
# from gmk-server

docker exec supabase_db_desert-services-hub psql -U postgres

# from tailscale client

psql -h gmk-server -p 54322 -U postgres
```

## Intake Refactor Contract (Strict)

Build code as thin orchestration + isolated processors. No exceptions unless explicitly approved.

### Architecture Rules

- Keep runners/jobs thin. They only coordinate flow, retries, and persistence calls.
- Put document/file processing logic in `packages/documents/*`, not in job runners.
- One processor per file/domain concern (pdf, image, office, text, zip, classify).
- Shared logic goes in small reusable modules (no giant utility blobs).
- No compatibility aliases/shims. Use only `tsconfig` path aliases.
- No dead code, no parallel legacy paths, no temporary fallback branches.

### File and Type Rules

- Type-only files must be named `types.ts` and contain only types/interfaces.
- Do not define runtime logic in `types.ts`.
- Avoid re-export chains unless needed for public package API.
- Keep imports explicit and local to the boundary module.

### Pipeline Rules

- Default pipeline is `extract -> classify`.
- Keep OCR as a separate higher-level pipeline, not implicit fallback in the fast path.
- Prefer deterministic stage boundaries and composable functions.

### Quality Gates (Required Before Done)

- Run `ultracite` on every touched file.
- Never run `biome check`.
- Add/adjust tests for touched behavior (unit first; integration when boundary changed).
- Verify no stale imports/references remain after refactor.
- Verify old replaced module is deleted in the same PR/commit.

### Commit Rules

- Atomic commits only (single concern per commit).
- Commit message must state architectural intent (e.g. `refactor(intake): split processors by file type`).
- Do not mix unrelated cleanup into the same commit.

### PR/Review Output Format

- First: findings/risks/regressions.
- Then: changed files and why.
- Then: exact commands run (lint/tests/typecheck) and result.

### Reference Standards

- Hexagonal Architecture (Ports and Adapters): <https://alistair.cockburn.us/hexagonal-architecture>
- Layered Architecture (Presentation-Domain-Data): <https://martinfowler.com/bliki/PresentationDomainDataLayering.html>
- Pipes and Filters: <https://learn.microsoft.com/en-us/azure/architecture/patterns/pipes-and-filters>
