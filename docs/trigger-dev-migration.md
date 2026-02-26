# Trigger.dev Migration Status

Last updated: 2026-02-26

Dashboard: <https://trigger.desertservices.app>

## Purpose

Track migration from legacy `pgmq` / `pg_cron` queue orchestration to Trigger.dev tasks, plus current cutover risks and next actions.

This is a present-state operational doc, not historical design.

## Source of Truth

- Task definitions: `apps/trigger-dev/src/trigger/*.ts`
- Trigger config: `trigger.config.ts`
- Runtime topology: `docker-compose.yml`
- Webhook ingress: `supabase/functions/*-webhook/index.ts`
- DB teardown migration: `supabase/migrations/20260226113000_remove_legacy_background_queue.sql`

## Current Trigger Tasks

### Webhook-triggered / on-demand tasks

| Task ID | Entry Source | File |
|---|---|---|
| `email-sync` | `outlook-webhook` | `apps/trigger-dev/src/trigger/mailbox-sync.ts` |
| `document-intake` | `intake-webhook` | `apps/trigger-dev/src/trigger/document-intake.ts` |
| `monday-sync-item` | `monday-webhook` | `apps/trigger-dev/src/trigger/monday-sync.ts` |
| `monday-sync-targeted` | manual/API | `apps/trigger-dev/src/trigger/monday-sync.ts` |
| `mailbox-backfill` | manual/API | `apps/trigger-dev/src/trigger/mailbox-sync.ts` |
| `email-triage-one` | manual/API | `apps/trigger-dev/src/trigger/email-triage.ts` |
| `email-triage-backfill` | manual/API | `apps/trigger-dev/src/trigger/email-triage.ts` |
| `dust-permit-notification` | manual/API + triage routing | `apps/trigger-dev/src/trigger/dust-permit-notification.ts` |

### Scheduled tasks

| Task ID | Schedule | File |
|---|---|---|
| `mailbox-sync` | `*/15 * * * *` | `apps/trigger-dev/src/trigger/mailbox-sync.ts` |
| `email-triage` | `*/5 * * * *` | `apps/trigger-dev/src/trigger/email-triage.ts` |
| `attachment-intake` | `*/5 * * * *` | `apps/trigger-dev/src/trigger/attachment-intake.ts` |
| `body-link-intake` | `*/10 * * * *` | `apps/trigger-dev/src/trigger/body-link-intake.ts` |
| `monday-sync-incremental` | `*/10 * * * *` | `apps/trigger-dev/src/trigger/monday-sync.ts` |
| `monday-sync` | `0 */6 * * *` | `apps/trigger-dev/src/trigger/monday-sync.ts` |
| `permit-sync` | `*/30 * * * *` | `apps/trigger-dev/src/trigger/permit-sync.ts` |
| `permit-detail-scrape` | `*/10 * * * *` | `apps/trigger-dev/src/trigger/permit-detail-scrape.ts` |
| `db-saturation-alert-monitor` | `*/1 * * * *` | `apps/trigger-dev/src/trigger/ops-alerts.ts` |

### Non-production test tasks (still deployed)

| Task ID | File | Risk |
|---|---|---|
| `load-test-db-ping` | `apps/trigger-dev/src/trigger/load-test-db-ping.ts` | Can create large pending backlog if triggered repeatedly |
| `load-test-db-saturation` | `apps/trigger-dev/src/trigger/load-test-db-saturation.ts` | Can intentionally exhaust Postgres slots |

## Completed Migration Work

- Webhook ingress moved to Trigger task triggers:
  - `outlook-webhook` -> `email-sync`
  - `monday-webhook` -> `monday-sync-item`
  - `intake-webhook` -> `document-intake`
- Legacy `apps/background-jobs` runtime removed from active code paths.
- Legacy intake CF worker removed.
- Legacy queue DB objects teardown migration added:
  - unschedules `bg_*` cron jobs
  - drops `schedule_background_job` / `enqueue_background_job`
  - drops `background_job_dead_letters`
  - drops `pgmq` queue `background_jobs`

## Current Operational Findings

- Root-cause contributor for container pressure:
  - high backlog from `load-test-db-ping` and `load-test-db-saturation`.
- DB saturation errors occurred during backlog windows:
  - `remaining connection slots are reserved for roles with the SUPERUSER attribute`.
- `db-saturation-alert-monitor` is currently running successfully, but had earlier failures during saturation windows.

## Remaining Work

1. Prevent recurrence of load-test backlog in production:
   - gate test task triggers to non-prod only, or remove from deployed Trigger project.
2. Add explicit queue/concurrency hard limits for high-volume tasks where needed.
3. Harden failure visibility:
   - keep Discord alerts active
   - add email alert channel verification
   - monitor all critical task failures, not only DB-slot pattern.
4. Keep docs aligned:
   - `SYSTEM-MAP.md` and this file should reflect actual schedules and task IDs from code.

## Immediate Operator Checks

- Task health in dashboard: `https://trigger.desertservices.app`
- Local Trigger stack status:
  - `just trigger-ps`
  - `just trigger-health`
- Local runtime check:
  - `just check`
- DB teardown verification (local Supabase):
  - `to_regclass('pgmq.q_background_jobs') IS NULL`
  - no `bg_%` entries in `cron.job`
