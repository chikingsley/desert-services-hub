# SQLite -> Local Supabase/Postgres (Incremental)

This repo can run a **half-migration** safely:

- Keep SQLite (`lib/db/hub.db`) as current source.
- Stand up local Supabase/Postgres in parallel.
- Backfill data from SQLite into local Postgres.
- Verify parity.
- Switch app code gradually later.

## 1) Bootstrap local Supabase

```bash
bash scripts/db/bootstrap-supabase-local.sh
```

This starts local Supabase and writes `.env.supabase.local` with `DATABASE_URL` + Supabase API keys.

## 2) Run SQLite -> Postgres load

```bash
bash scripts/db/sqlite-to-local-postgres.sh
```

What it does:
1. Resets local Supabase Postgres (`db reset --local --no-seed`).
2. Creates a consistent SQLite snapshot from WAL.
3. Removes SQLite FTS virtual tables/triggers from the snapshot.
4. Uses `pgloader` (Docker) to copy schema + data into local Postgres.
5. Adds Postgres text-search support (`search_document` + GIN index on `emails`).

## 3) Verify counts

```bash
bash scripts/db/verify-local-postgres.sh
```

This compares per-table row counts between SQLite and local Postgres (excluding SQLite internal + FTS tables).

## 4) Wire local env into app (optional)

To print current env variables again:

```bash
bash scripts/db/supabase-env.sh
```

To regenerate `.env.supabase.local`:

```bash
bash scripts/db/supabase-env.sh .env.supabase.local
```

## 5) Stop local Supabase

```bash
npx --yes supabase stop --workdir .
```

## Notes

- This is intentionally non-disruptive to current SQLite runtime code.
- Existing app/worker code still uses `bun:sqlite` until you switch repositories/DB adapter.
- Supabase migration tooling is strongest for Postgres->Supabase workflows; for SQLite, `pgloader` is the practical path.
