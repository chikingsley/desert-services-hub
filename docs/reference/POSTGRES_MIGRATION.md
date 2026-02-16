# Postgres Runtime Notes

The repo runtime is Postgres-first.

- Operational data is stored in Supabase Postgres.
- App and worker services connect via `DATABASE_URL`.
- Local Supabase Postgres runs on port `54322` (see `supabase/config.toml`).

## Start/Stop Local Supabase

```bash
# Start local Supabase stack
bun run db:supabase:start

# Show status/URLs
bun run db:supabase:status

# Stop local Supabase stack
bun run db:supabase:stop
```

## Connection Model

- Dockerized services use:
  - `postgresql://postgres:postgres@host.docker.internal:54322/postgres`
- Shared DB adapter:
  - `lib/db/hub.ts` (Postgres via `bun` SQL with compatibility helpers)

## Notes

- Legacy SQLite migration scripts were removed from `scripts/db/`.
- Some tooling may still use standalone SQLite files for temporary/local caches, but not for operational hub data.
