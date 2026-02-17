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
- `apps/web/webhooks.ts`
- `apps/web/worker.ts`
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
- Intake processing: `apps/background-jobs/lib/files-intake.ts`
- Attachment backfill: `apps/background-jobs/lib/attachment-backfill.ts`
- Estimate extraction triage: `apps/background-jobs/lib/estimate-extraction-triage.ts`
- Folder watcher poll: `apps/background-jobs/workers/outlook-folder-watcher/lib/poll.ts`
- Estimate linker poll: `apps/background-jobs/workers/estimate-email-linker/lib/poll.ts`
- SWPPP master poll: `packages/sharepoint/workers/swppp-master-poller/lib/sync.ts`

## Canonical Runtime Flows

### Intake Flow (canonical)

1. `intake-worker` receives inbound forwarded email.
2. Worker POSTs to `apps/web/api/webhooks/intake.ts` (`/api/webhooks/intake`).
3. Webhooks service enqueues `job_type=intake`.
4. `apps/web/jobs/dispatch.ts` dispatches to `processFilesIntake`.

Compatibility still active:
- Alias webhook routes in `apps/web/webhooks.ts`: `/api/webhooks/files-intake`, `/api/webhooks/contracts-intake`
- Alias job types in `apps/web/jobs/dispatch.ts`: `files_intake`, `contracts_email_intake`

### Outlook Email Linking Flow

1. Outlook notifications hit `apps/web/api/webhooks/outlook.ts`.
2. Jobs enqueue as `email_notification`.
3. `apps/web/jobs/dispatch.ts` processes inserts/attachments.
4. Periodic enrichment runs via folder watcher + estimate linker timers.

### Monday Sync Flow

- `apps/web/api/webhooks/monday.ts` receives Monday events (`sync_item`, `download_files`).
- Periodic `sync_full` runs from `apps/web/jobs/dispatch.ts`.

### Permit Email Notification Flow

- Dust permit payment/issued triggers are processed in `apps/web/jobs/dispatch.ts` via notification handlers.

## Operational Checks

- Runtime health and overlap checks: `just check`
- Cloudflare deployment check: `just cf-check`
- Snapshot status: `just status`
- Docs path guardrail: `just docs-path-check`

## Code-Confirmed Gaps (Current)

- Intake aliases are still supported for compatibility; full alias retirement is not yet complete.
- Takeoff SharePoint migration is partially implemented and still needs closeout validation:
  - `apps/web/api/upload.ts` now uploads PDFs to SharePoint and persists `sharepoint://` references.
  - `apps/web/api/takeoffs-by-id.ts` now serves PDF bytes from SharePoint.
  - End-to-end validation and closure work remains tracked in `PEA-61`.

## Actionable Backlog (Linear)

As of 2026-02-13, sourced from open issues in team `Peacockery`.

### Track A — Contract Intake Queue v1

Project: `Contract Intake Queue v1`

In progress:
- `PEA-17` (required estimate linking workflow)

Todo queue:
- `PEA-14`, `PEA-15`, `PEA-16`, `PEA-18`, `PEA-19`, `PEA-20`, `PEA-21`, `PEA-22`, `PEA-23`

Execution next:
1. Finish `PEA-17`.
2. Deliver backend contract + state model (`PEA-14`, `PEA-22`).
3. Ship triage UI + required actions (`PEA-15`, `PEA-16`, `PEA-18`, `PEA-19`, `PEA-20`).
4. Close with audit/runbook (`PEA-21`, `PEA-23`).

### Track B — DocuSign Intake Automation

Project: `DocuSign Intake Automation`

Open issues:
- `PEA-47`, `PEA-48`, `PEA-49`, `PEA-50`

Execution next:
1. Build deterministic sandbox harness (`PEA-47`).
2. Harden retrieval reliability (`PEA-48`).
3. Integrate with canonical intake/project linkage (`PEA-49`).
4. Add observability + runbook (`PEA-50`).

### Track C — OCR / PDF Extraction Roadmap

Project: `Kreuzberg PDF Extraction Roadmap (30/60/90)`

Open issues:
- `PEA-56`, `PEA-57`, `PEA-58`, `PEA-59`, `PEA-60`

Execution next:
1. Ship benchmark + gating baseline (`PEA-56`).
2. Land pluggable OCR backends (`PEA-57`, `PEA-58`, `PEA-60`).
3. Enforce repo hardening gates (`PEA-59`).

### Track D — SWPPP ↔ Projects Unification

Project: `SWPPP Scheduling ↔ Projects Unification`

Open issues:
- `PEA-34`, `PEA-35`, `PEA-36`, `PEA-37`, `PEA-38`, `PEA-39`, `PEA-40`, `PEA-41`

Execution next:
1. Stabilize matching and reconciliation queue (`PEA-34`, `PEA-35`).
2. Run historical backfill + audit (`PEA-36`).
3. Expand context graph and ops workflow (`PEA-37`, `PEA-38`, `PEA-39`, `PEA-41`).

### Track E — Takeoff SharePoint Migration

- `PEA-61` (in progress): backend migration landed for `apps/web/api/upload.ts` and `apps/web/api/takeoffs-by-id.ts`; remaining work is end-to-end validation, fallback verification, and closeout.

## Recently Completed Baseline

Project `Contracts Worker Deprecation & Runtime Audit` is completed; its execution issues are done (`PEA-24`, `PEA-25`, `PEA-26`, `PEA-27`, `PEA-29`, `PEA-30`, `PEA-31`, `PEA-32`, `PEA-51`, `PEA-52`, `PEA-53`, `PEA-54`).
