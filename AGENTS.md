# Desert Services Hub

Monorepo for Desert Services operations: estimating, permits, contracts, notifications, and document generation.

## Repo-Wide Rules

- Runtime is self-hosted on `gmk-server` only.
- Operational state is in local Postgres (`host.docker.internal:54322`), not SQLite.
- External traffic is Cloudflare Tunnel to Docker services.
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
  cf-workers/            # Cloudflare Workers

packages/
  permits/               # @permits/client typed permit-worker client
  monday/                # Monday.com API operations
  email/                 # Graph + email templates
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
- `packages/permits/AGENTS.md`: typed client contract and tests.
- `apps/background-jobs/AGENTS.md`: webhook jobs, notification triggers, sync/linking worker rules.
- `apps/web/AGENTS.md`: estimate API guardrails and permit API integration from web.
- `packages/documents/AGENTS.md`: SSSP/SDS generation workflow rules.

## Docker Services

| Service | Container | Port | Purpose |
|---------|-----------|------|---------|
| `web` | `desert-web` | 3000 | Frontend + API |
| `background-jobs` | `desert-webhooks` | 4747 | Webhooks + jobs + timers |
| `permit-worker` | `desert-permit-worker` | 47822 API, 6080 VNC | Permit browser automation |
| `tunnel` | `desert-tunnel` | — | Cloudflare tunnel |

## Permit Worker Integration (Canonical)

```ts
import { PermitClient } from "@permits/client";

const client = new PermitClient();
await client.createPermit(req);
await client.renewPermit(id, req);
await client.renewAndPay(id, req);
await client.closePermit(id, req);
await client.revisePermit(id, req);
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
