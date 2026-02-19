# Background Jobs (`apps/background-jobs`)

Webhook receiver, queue handlers, and polling workers.

## Scope

- `webhooks.ts` and `api/aqdata.ts`: runtime entry + AQData trigger endpoints.
- `jobs/*`: queue job handlers (`permit-sync`, email, intake, sync).
- `worker.ts`: pgmq queue consumer (no domain timers).
- `workers/*`: folder watcher/linker and other periodic workers.
- `@monday/sync/*`: Monday estimate/status/sharepoint/project-seed sync logic (package-owned).
- `@email/notifications/*`: email-trigger detection and draft notification delivery.

## Runtime Rules

- Canonical runtime is `pg_cron` (scheduler) + `pgmq` (queue) with `worker.ts` as queue consumer.
- Do not run parallel `systemd` services for folder watcher or estimate-email-linker.
- Persistent state belongs in Postgres via `@lib/db/client` and repository modules.
- Lint/format policy: never run `biome`; use `ultracite` only.
- Tests for this app belong under top-level `tests/apps/background-jobs/...` (mirrored source path), not inside `apps/background-jobs/...`.

## Notification Pipeline

```text
Outlook webhook -> enqueue email_notification
-> sync email body/metadata
-> detect trigger type
-> enqueue dust_permit_payment or dust_permit_issued
-> enrich metadata/PDF/cost breakdown
-> create notification draft via Graph API
```

Trigger types:
- `pointandpay_payment`
- `maricopa_issued`

Key files:
- `packages/email/src/notifications/email-triggers.ts`
- `packages/email/src/notifications/email-trigger-handlers.ts`
- `jobs/permit-sync.ts`

## Permit Integration Rules

- Use `PermitClient` from `@permits/client` for permit-worker calls.
- Do not inline ad-hoc permit-worker HTTP calls.
- Permit sync cooldown/timeouts live in `jobs/config.ts` and `jobs/permit-sync.ts`.

## Email Linking Rules

- Folder watcher poll cadence is minute-based via `pg_cron` (`bg_folder_watcher`).
- Estimate-email linker poll cadence is minute-based via `pg_cron` (`bg_estimate_linker`).
- Use shared matcher contract from `lib/db/repositories/project.ts`.
- For ambiguous matches, upsert `project_match_reviews` with `status='pending'`.
- Never overwrite non-null `emails.project_id` links.
- `estimate_emails` writes must stay idempotent (`ON CONFLICT DO NOTHING`).

## Useful Commands

```bash
# logs

docker compose logs -f background-jobs

# trigger the runtime worker from repo root
bun apps/background-jobs/worker.ts
```
