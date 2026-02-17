# Background Jobs (`apps/background-jobs`)

Webhook receiver, queue handlers, and polling workers.

## Scope

- `webhooks.ts` and `api/webhooks/*`: intake endpoints.
- `jobs/*`: queue job handlers (`permit-sync`, email, intake, sync).
- `worker.ts`: in-process pollers/timers.
- `workers/*`: folder watcher, estimate poller/linker, other periodic workers.
- `lib/notifications/*`: email-trigger detection and draft notification delivery.

## Runtime Rules

- Canonical runtime is `worker.ts` poll loops.
- Do not run parallel `systemd` services for folder watcher or estimate-email-linker.
- Persistent state belongs in Postgres via `@lib/db/hub` and repository modules.

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
- `lib/notifications/email-triggers.ts`
- `lib/notifications/email-trigger-handlers.ts`
- `jobs/permit-sync.ts`

## Permit Integration Rules

- Use `PermitClient` from `@permits/client` for permit-worker calls.
- Do not inline ad-hoc permit-worker HTTP calls.
- Permit sync cooldown/timeouts live in `jobs/config.ts` and `jobs/permit-sync.ts`.

## Email Linking Rules

- Folder watcher poll interval: 30s (configured in `worker.ts`).
- Estimate-email linker poll interval: 60s (configured in `worker.ts`).
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
