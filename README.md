# Desert Services Hub

Unified operations platform for Desert Services, combining Bun web apps,
automation workers, and domain packages.

## Deployment Model

- Primary runtime is self-hosted on `gmk-server`.
- Core services and operational Postgres run in local Docker containers.
- Public ingress is exposed through Cloudflare Tunnel.

## Canonical Docs (Start Here)

- `REPO_ORGANIZATION.md` — canonical repo structure, standards, and ownership.
- `SYSTEM-MAP.md` — current runtime topology, active flows, and execution backlog.
- `docs/reference/README.md` — index of cross-domain reference docs and archives.

## Repository Layout (Current)

- `apps/` — runtime applications and workers
- `apps/web/` — frontend + API server
- `apps/trigger-dev/` — Trigger.dev self-host stack + task definitions
- `apps/dust-permits/` — permit automation runtime
- `apps/cf-workers/` — Cloudflare worker deployments
- `packages/` — domain packages (`email`, `monday`, `sharepoint`, `documents`, `contracts`, `estimates`, etc.)
- `lib/` — shared cross-domain infrastructure (`db`, Graph auth, utilities)
- `supabase/` — database migrations and local Supabase config
- `docs/` — cross-domain docs + archive (domain-specific docs are co-located in owning package/app)

## Primary Database

Self-hosted Postgres (Supabase local stack):

- Local connection: `postgresql://postgres:postgres@host.docker.internal:54322/postgres`
- Runtime notes: `docs/reference/POSTGRES_MIGRATION.md`

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)
- [just](https://github.com/casey/just)
- [Python](https://www.python.org/) (3.11+)
- [uv](https://docs.astral.sh/uv/) (for Python package workflows)

### Install

```bash
bun install
```

### Development

```bash
# Main web app
bun run dev
```

## Operations Quick Commands

```bash
# Runtime status snapshot
just status

# Strict health check
just check

# Cloudflare deployment check
just cf-check
```

## Local Database Runtime

```bash
# Start local Supabase stack
bun run db:supabase:start

# Show status
bun run db:supabase:status

# Stop stack
bun run db:supabase:stop
```

## Additional Documentation

- Engineering and agent conventions: `CLAUDE.md`
- Contracts workflow: `packages/contracts/PROJECT.md`, `packages/contracts/STATE.md`
