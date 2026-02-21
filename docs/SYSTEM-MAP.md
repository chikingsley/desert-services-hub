# Desert Services Hub — System Map

Last updated: 2026-02-19

## Purpose

This file is the current runtime map and active execution backlog.
It is intentionally present-state only: no deprecated architecture history.

Scope boundary:
- Runtime topology, runtime flows, active gap/backlog tracking live here.
- Repository structure, package ownership, and coding standards live in `REPO_ORGANIZATION.md`.

## Runtime Sources of Truth

- `docker-compose.yml`
- `apps/background-jobs/webhooks.ts`
- `apps/background-jobs/worker.ts`
- `supabase/functions/README.md`
- `supabase/migrations/20260219120000_pgmq_pgcron_atomic_rewrite.sql`
- `Justfile`

## Runtime Topology

### Core Runtime Services (Docker Compose)

| Service | Entry | Responsibility |
|---|---|---|
| `web` | `apps/web/server.ts` | Frontend + API server on `:3000` |
| `background-jobs` | `apps/background-jobs/webhooks.ts` | AQData endpoints, intake webhook adapter, pgmq queue consumer on `:4747` |
| `pdf-analysis` | `packages/documents/intake/src/pdf_analysis/server.py` | PDF extraction/classification/OCR service on `:4848` |
| `permit-worker` | `apps/dust-permits` | Permit automation API + VNC |
| `aqdata-worker` | `apps/aqdata-worker/server.ts` | AQData sync/scrape service on `:47823` |
| `tunnel` (optional) | Cloudflared | Public ingress |

### Supabase Edge Functions (Webhook Ingress)

- `monday-webhook`
- `outlook-webhook`
- `intake-webhook` (forwarder to `background-jobs` intake endpoint)

### Cloudflare Worker Deployments

- `intake-worker` (`apps/cf-workers/intake-worker`)
- `estimates-sync` (`apps/cf-workers/estimates-sync-worker`)
- `inspection-router` (`apps/cf-workers/inspections-email-worker`)

### Queue Runtime

- Queue backend: `pgmq.q_background_jobs`
- Scheduler: `pg_cron` jobs `bg_*`
- Consumer/dispatcher: `apps/background-jobs/jobs/dispatch.ts`
- Queue operations: `apps/background-jobs/jobs/queue.ts`

## Canonical Runtime Flows

### Intake Flow (canonical)

1. Intake payload arrives from `apps/cf-workers/intake-worker` (or `supabase/functions/intake-webhook`).
2. `apps/background-jobs/api/webhooks/intake.ts` saves attachments/linked files to local intake storage.
3. Intake webhook enqueues `job_type=intake` via `public.enqueue_background_job`.
4. `apps/background-jobs/jobs/dispatch.ts` routes to `processIntakeJob`.

### Outlook Email Flow

1. Microsoft Graph notifications hit `supabase/functions/outlook-webhook`.
2. Edge function enqueues `email_notification` via `public.enqueue_background_job`.
3. `apps/background-jobs/jobs/dispatch.ts` runs `processEmailNotificationJob`.
4. Triage may enqueue follow-on jobs (`dust_permit_payment`, `dust_permit_issued_email`, `contract_email_received`).
5. Periodic email/project enrichment runs through cron-driven jobs (`folder_watcher_poll`, `estimate_linker_maintenance`, `account_linking`, `contact_linking`, `contact_enrichment`).

### Monday Sync Flow

1. Monday webhooks hit `supabase/functions/monday-webhook`.
2. Edge function enqueues `sync_item`.
3. `processSyncItemJob` syncs one item and may enqueue `download_files`.
4. `sync_full` runs on schedule and orchestrates estimate sync, project seed sync, estimate file sweep, SharePoint sync, and document project propagation.

### Contract Won Bridge Flow

1. `contract_won_bridge` runs on `pg_cron`.
2. Bridge pipeline classifies/links contract emails, enqueues `contract_doc_extract`, backfills docs, and marks Won/Lost.
3. Winning estimate updates trigger downstream notifications logic.

### Permit Flow

1. Payment/issued jobs are enqueued by email triage.
2. Handlers run permit sync orchestration via `@permits/client` (`apps/background-jobs/jobs/permit-sync.ts`).
3. Notification drafts/events are emitted by `lib/notifications/*`.

## Operational Checks

- Runtime health and overlap checks: `just check`
- Cloudflare deployment check: `just cf-check`
- Snapshot status: `just status`
- Docs path guardrail: `just docs-path-check`

## Code-Confirmed Gaps (Current)

- Takeoff SharePoint migration is partially implemented and still needs closeout validation:
  - `apps/web/api/upload.ts` uploads PDFs to SharePoint and persists `sharepoint://` references.
  - `apps/web/api/takeoffs-by-id.ts` serves PDF bytes from SharePoint.
  - End-to-end validation and closure work remains tracked in `PEA-61`.

## Active Gaps

- Takeoff SharePoint migration partially implemented (`apps/web/api/upload.ts`, `apps/web/api/takeoffs-by-id.ts`); end-to-end validation remains (`PEA-61`).
- DocuSign Intake Automation: deterministic sandbox harness + intake/project linkage integration pending (`PEA-47`–`PEA-50`).
- OCR benchmarking + pluggable OCR backend gating not yet enforced (`PEA-56`–`PEA-60`).

## Next Workspaces

See design docs for the two main UI gaps:

- `docs/contract-review-workspace.md` — queue + entity viewer + GC response/internal handoff
- `docs/project-operations-dashboard.md` — project-centric view of emails, docs, permits, SWPPP, estimates
