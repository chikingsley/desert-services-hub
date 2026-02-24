# Desert Services Hub — System Map

Last updated: 2026-02-24

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
- `src/trigger/*.ts` (Trigger.dev task definitions)
- `supabase/functions/README.md`
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

### Trigger.dev (Self-Hosted Background Jobs)

Dashboard: `https://trigger.desertservices.app`

Scheduled and on-demand tasks run as isolated containers via Trigger.dev.
Task definitions live in `src/trigger/`.

| Task ID | Type | Schedule | Purpose |
|---------|------|----------|---------|
| `permit-sync` | scheduled | `*/30 * * * *` | Company-level dust permit sync |
| `permit-detail-scrape` | scheduled | `*/10 * * * *` | Scrape individual permit details |
| `mailbox-sync` | scheduled | `*/5 * * * *` | Outlook mailbox delta sync |
| `email-sync` | on-demand | — | Sync a single email by message ID |
| `email-enrichment` | on-demand | — | Enrich email metadata (contacts, domains) |
| `attachment-intake` | on-demand | — | Process email attachments through intake pipeline |
| `body-link-intake` | on-demand | — | Download and process links found in email bodies |
| `document-intake` | on-demand | — | Process forwarded files through classify + parse pipeline |
| `monday-sync` | scheduled | `*/30 * * * *` | Full Monday.com board sync |
| `monday-sync-item` | on-demand | — | Sync a single Monday item by ID |
| `monday-sync-targeted` | on-demand | — | Sync specific Monday items by board + item IDs |
| `mailbox-backfill` | on-demand | — | Backfill emails for a mailbox from a given date |

### Supabase Edge Functions (Webhook Ingress)

- `monday-webhook`
- `outlook-webhook`

### Cloudflare Worker Deployments

- `intake-worker` (`apps/cf-workers/intake-worker`)
- `estimates-sync` (`apps/cf-workers/estimates-sync-worker`)
- `inspection-router` (`apps/cf-workers/inspections-email-worker`)

### pgmq Queue (Event-Driven Jobs)

Event-driven jobs still use pgmq for dispatch. These are enqueued by email triage and webhook handlers.

- Queue backend: `pgmq.q_background_jobs`
- Consumer/dispatcher: `apps/background-jobs/jobs/dispatch.ts`
- Queue operations: `apps/background-jobs/jobs/queue.ts`

Active job types:
- `contract_doc_extract` — Extract data from contract documents
- `contract_email_received` — Process incoming contract emails
- `contract_won_bridge` — Classify/link contracts, mark Won/Lost
- `dust_permit_payment` — Process permit payment confirmation emails
- `dust_permit_issued_email` — Process permit issuance emails
- `estimate_triage` — Run estimate extraction triage
- `attachment_backfill` — Backfill missing email attachment records
- `body_link_manual_followup` — Track links requiring manual download
- `aqdata_sync` — Trigger AQData sync via aqdata-worker
- `aqdata_detail_scrape` — Scrape individual AQData permit details

## Canonical Runtime Flows

### Document Intake Flow

1. Intake payload arrives from `apps/cf-workers/intake-worker`.
2. `apps/background-jobs/api/webhooks/intake.ts` saves files to local storage and triggers Trigger.dev `document-intake` task.
3. Task writes files to temp directory, runs classify + parse pipeline, stores results in Postgres.

### Outlook Email Flow

1. Microsoft Graph notifications hit `supabase/functions/outlook-webhook`.
2. Edge function triggers Trigger.dev `mailbox-sync` which calls `email-sync` per message.
3. `email-sync` enriches each email via `email-enrichment`, processes attachments via `attachment-intake`, and processes body links via `body-link-intake`.
4. Email triage may enqueue pgmq follow-on jobs (`dust_permit_payment`, `dust_permit_issued_email`, `contract_email_received`).

### Monday Sync Flow

1. Monday webhooks hit `supabase/functions/monday-webhook`.
2. Edge function triggers Trigger.dev `monday-sync-item` for the affected item.
3. `monday-sync` runs on schedule (every 30 min) for full board sync — estimates, project seeds, file sweep, SharePoint sync, document propagation.

### Contract Won Bridge Flow

1. `contract_won_bridge` runs on pgmq schedule.
2. Bridge pipeline classifies/links contract emails, enqueues `contract_doc_extract`, backfills docs, and marks Won/Lost.
3. Winning estimate updates trigger project seed sync.

### Permit Flow

1. Payment/issued email jobs are enqueued by email triage via pgmq.
2. Payment handler runs permit sync orchestration via `@permits/client`.
3. Scheduled permit sync and detail scrape run via Trigger.dev.

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
