# Desert Services Hub — System Map

Last updated: 2026-02-16

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
- `Justfile`

## Runtime Topology

### Core Runtime Services (Docker Compose)

| Service | Entry | Responsibility |
|---|---|---|
| `web` | `apps/web/server.ts` | Frontend + API server on `:3000` |
| `background-jobs` | `apps/background-jobs/webhooks.ts` | Webhook ingress + job queue + sync timers (notifications + SWPPP master sync) on `:4747` |
| ~~`notifications`~~ | *(absorbed into background-jobs)* | Notification polling runs as timer in worker.ts |
| `permit-worker` | `apps/dust-permits` | Permit automation API + VNC |
| `tunnel` (optional) | Cloudflared | Public ingress |

### Cloudflare Worker Deployments

- `intake-worker` (`apps/cf-workers/intake-worker`)
- `estimates-sync` (`apps/cf-workers/estimates-sync-worker`)
- `inspection-router` (`apps/cf-workers/inspections-email-worker`)

### In-Process Worker Modules

Loaded by `apps/background-jobs/worker.ts`:
- Intake processing: `apps/background-jobs/lib/intake/files-intake.ts`
- Attachment backfill: `apps/background-jobs/lib/attachment-backfill.ts`
- Estimate extraction triage: `apps/background-jobs/lib/estimate-extraction-triage.ts`
- Contract won bridge: `apps/background-jobs/lib/contracts/contract-won-bridge.ts` (every 2 min)
- Folder watcher poll: `apps/background-jobs/workers/outlook-folder-watcher/lib/poll.ts`
- Estimate linker poll: `apps/background-jobs/workers/estimate-email-linker/lib/poll.ts`
- SWPPP master poll: `packages/sharepoint/workers/swppp-master-poller/lib/sync.ts`

## Canonical Runtime Flows

### Intake Flow (canonical)

1. `intake-worker` receives inbound forwarded email.
2. Worker POSTs to `apps/background-jobs/api/webhooks/intake.ts` (`/api/webhooks/intake`).
3. Webhooks service enqueues `job_type=intake`.
4. `apps/background-jobs/jobs/dispatch.ts` dispatches to `processIntakeJob`.

### Outlook Email Linking Flow

1. Outlook notifications hit `apps/background-jobs/api/webhooks/outlook.ts`.
2. Jobs enqueue as `email_notification`.
3. `apps/background-jobs/jobs/dispatch.ts` processes inserts/attachments.
4. Periodic enrichment runs via folder watcher + estimate linker timers.

### Monday Sync Flow

- `apps/background-jobs/api/webhooks/monday.ts` receives Monday events (`sync_item`, `download_files`).
- Periodic `sync_full` runs from `apps/background-jobs/jobs/dispatch.ts`.

### Permit Email Notification Flow

- Dust permit payment/issued triggers are processed in `apps/background-jobs/jobs/dispatch.ts` via notification handlers.

### Contract Won Bridge Flow

1. `contracts@` email arrives → intake → document extraction → stored in `documents`.
2. `contract_doc_extract` job (Pass 1.5) runs LLM field extraction + langextract NER.
3. Bridge runs every 2 min: classify → link by subject → link by LLM fields → backfill → mark Won → mark Not Awarded.
4. Winning estimate triggers `estimate_won` notification flow.

## Operational Checks

- Runtime health and overlap checks: `just check`
- Cloudflare deployment check: `just cf-check`
- Snapshot status: `just status`
- Docs path guardrail: `just docs-path-check`

## Code-Confirmed Gaps (Current)

- Takeoff SharePoint migration is partially implemented and still needs closeout validation:
  - `apps/web/api/upload.ts` now uploads PDFs to SharePoint and persists `sharepoint://` references.
  - `apps/web/api/takeoffs-by-id.ts` now serves PDF bytes from SharePoint.
  - End-to-end validation and closure work remains tracked in `PEA-61`.

## Active Gaps

- Takeoff SharePoint migration partially implemented (`apps/web/api/upload.ts`, `apps/web/api/takeoffs-by-id.ts`); end-to-end validation remains (`PEA-61`).
- DocuSign Intake Automation: deterministic sandbox harness + intake/project linkage integration pending (`PEA-47`–`PEA-50`).
- OCR benchmarking + pluggable OCR backend gating not yet enforced (`PEA-56`–`PEA-60`).

## Next Workspaces

See design docs for the two main UI gaps:

- `docs/contract-review-workspace.md` — queue + entity viewer + GC response/internal handoff
- `docs/project-operations-dashboard.md` — project-centric view of emails, docs, permits, SWPPP, estimates
