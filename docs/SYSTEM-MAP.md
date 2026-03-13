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
- `apps/trigger-dev/hosting/docker/.env`
- `apps/trigger-dev/src/trigger/*.ts` (Trigger.dev task definitions)
- `supabase/functions/README.md`
- `Justfile`

## Runtime Topology

### Core Runtime Services (Docker Compose)

| Service | Entry | Responsibility |
|---|---|---|
| `web` | `apps/web/server.ts` | Frontend + API server on `:3000` |
| `webhook-gateway` | `ops/webhook-gateway/nginx.conf` | Cloudflare webhook ingress bridge on `:4000` -> Supabase Kong `:54321` |
| `pdf-analysis` | `packages/documents/intake/src/pdf_analysis/server.py` | PDF extraction/classification/OCR service on `:4848` |
| `permit-worker` | `apps/dust-permits` | Permit automation API + VNC |
| `aqdata-worker` | `apps/aqdata-worker/src/index.ts` | AQData sync/scrape service on `:47823` |
| `tunnel` (optional) | Cloudflared | Public ingress |

### Trigger.dev (Self-Hosted Background Jobs)

Dashboard: `https://trigger.desertservices.app`

Scheduled and on-demand tasks run as isolated containers via Trigger.dev.
Task definitions live in `apps/trigger-dev/src/trigger/`.

| Task ID | Type | Schedule | Purpose |
|---------|------|----------|---------|
| `permit-sync` | scheduled | `*/30 * * * *` | Company-level dust permit sync |
| `permit-detail-scrape` | scheduled | `*/10 * * * *` | Scrape individual permit details |
| `mailbox-sync` | scheduled | `*/15 * * * *` | Outlook mailbox delta sync |
| `outlook-webhook-subscriptions` | scheduled | `*/30 * * * *` | Ensure Graph webhook subscriptions exist and renew before expiry |
| `email-sync` | on-demand | — | Sync a single email by message ID |
| `attachment-intake` | scheduled | `*/5 * * * *` | Process queued attachment stubs through intake pipeline |
| `body-link-intake` | scheduled | `*/10 * * * *` | Download/process links found in email bodies |
| `document-intake` | on-demand | — | Process forwarded files through classify + parse pipeline |
| `email-triage` | scheduled | `*/5 * * * *` | Classify pending emails |
| `monday-sync-incremental` | scheduled | `*/10 * * * *` | Monday incremental sync via activity log |
| `monday-sync` | scheduled | `0 */6 * * *` | Monday full safety-net sync |
| `monday-sync-item` | on-demand | — | Sync a single Monday item by ID |
| `monday-sync-files` | on-demand | — | Sync/download files for one or more Monday items |
| `monday-sync-targeted` | on-demand | — | Sync specific Monday items by board + item IDs |
| `mailbox-backfill` | on-demand | — | Backfill emails for a mailbox from a given date |
| `db-saturation-alert-monitor` | scheduled | `*/1 * * * *` | Detect/post DB slot saturation alerts |

### Supabase Edge Functions (Webhook Ingress)

- `intake-webhook`
- `monday-webhook`
- `outlook-webhook`

### Cloudflare Worker Deployments

- `estimates-sync` (`apps/cf-workers/estimates-sync-worker`)
- `inspection-router` (`apps/cf-workers/inspections-email-worker`)

## Canonical Runtime Flows

### Document Intake Flow

1. Intake payload arrives at `supabase/functions/intake-webhook`.
2. Edge function validates payload and triggers Trigger.dev `document-intake`.
3. Task writes files to temp directory, runs classify + parse pipeline, stores results in Postgres.

### Outlook Email Flow

0. `outlook-webhook-subscriptions` keeps Microsoft Graph subscriptions renewed and mapped in `outlook_subscriptions`.
1. Microsoft Graph notifications hit `supabase/functions/outlook-webhook`.
2. Edge function triggers Trigger.dev `email-sync` for the changed message.
3. `email-sync` stores/enriches email + attachment stubs.
4. Scheduled tasks `attachment-intake`, `body-link-intake`, and `email-triage` process downstream work with run-level observability.

### Monday Sync Flow

1. Monday webhooks hit `supabase/functions/monday-webhook`.
2. Edge function triggers Trigger.dev `monday-sync-item` for the affected item.
3. `monday-sync-incremental` runs every 10 minutes for activity-log deltas.
4. `monday-sync` runs every 6 hours for full board safety-net sync — estimates, project seeds, file sweep, SharePoint sync, document propagation.

### Permit Flow

1. Payment/issued permit signals are handled in Trigger task flows.
2. Permit sync and detail scrape run via Trigger.dev schedules.

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
