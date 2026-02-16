# Desert Services Hub — Architecture Overview

What everything does, how it fits together, and what's redundant.

Status: historical snapshot. For current architecture and repo layout, use
`REPO_ORGANIZATION.md` (structure/standards) and `SYSTEM-MAP.md` (runtime/active backlog)
as canonical sources.

---

## Databases

**Supabase Postgres** (local Supabase DB on port `54322`) — The single source of truth. Everything syncs into here.
- emails (237K+), attachments (125K+), estimates (4,800+), projects, accounts (3,600+), contacts (4,600+), swppp_work_orders (2,973), mailboxes, estimate_emails

**Local SQLite files (non-operational for hub data):**
- `apps/workers/inspections-email-worker/inspections-app-idea/inspections.db` — prototype/demo app data.

---

## CLI Tools (`packages/`)

**email** (`packages/email/`) — Email operations via Microsoft Graph. Search, read, draft, send, reply, folder management, M365 group access. 12 mailboxes synced.

**monday package** — Monday.com GraphQL client and helpers in `packages/monday/`.

**sharepoint** (`packages/sharepoint/`) — SharePoint file operations via Graph SDK. Upload (auto-chunking at 5MB), download, list, search. Includes SWPPP tooling and folder sync worker.

**pdf-analysis-cli** — Python. OCR with three providers: Gemini (best), local Ollama, Mistral. Commands: ocr, extract, identify, analyze.

**quoting-cli** — Quote PDF generation.

---

## Workers (`apps/workers/`)

**swppp-sync** — Polls SharePoint SWPPP Master Excel every 60s, upserts work orders into Supabase Postgres, auto-links contractors to accounts. CLI: `bun cli/sync.ts`, `bun cli/status.ts`.

**estimate-poller** — Polls Monday ESTIMATING board every 60s, syncs new/updated estimates to Supabase Postgres, auto-links to projects. CLI: `bun cli/watch.ts`, `bun cli/status.ts`.

**estimates-sync-worker** — Library module (`lib/sharepoint-sync.ts`) that runs inside the web worker's `sync_full` job. Syncs Monday estimates to SharePoint folder structure (organized by bid status). Downloads files from Monday, uploads to SharePoint. CF Worker was removed 2026-02-11; cron had already been disabled in favor of the web worker.

**outlook-folder-watcher** — Polls Graph delta API every 60s. Detects new folders under `Projects/Active/` and new emails in tracked folders. Auto-matches folders to projects, links emails to Supabase Postgres.

**monday-status-sync-worker** — Cloudflare Worker. Runs hourly. Three jobs: (1) GC Cleanup — marks competing estimates as "GC Not Awarded" when one wins, (2) Leads Sync — propagates status from estimates to leads, (3) Project Link Sync — enforces board cross-references.

**inspections-email-worker** — Cloudflare Email Worker. Receives ComplianceGo inspection emails at `inspections@desertservices.app`, parses report URLs, generates PDFs via Browser Rendering API, uploads to SharePoint.

**permit-workers** — Dockerized Playwright automation for Maricopa County Dust Control Portal. Create, revise, renew, close permits. Includes React dashboard, REST API, VNC access. Uses Gemini for PDF parsing.

**notifications** — Polls Supabase Postgres every 5min for events needing notifications (permit expirations, estimate wins, permit submissions/issuances). Stakeholder-based routing — configurable per event type. CLI: `bun cli/watch.ts`, `bun cli/status.ts`, `bun cli/seed-stakeholders.ts`.

---

## Apps

**apps/contract** — Contract intake cascade. Hub CLI for syncing Monday boards to Postgres and creating/updating contacts and accounts. Database repositories for all Supabase Postgres tables. Contract processing workflow (intake, reconciliation, insurance verification, SharePoint setup).

**apps/talon** — Python. Email signature extraction using Talon heuristics + local LLM (Ollama granite4). Extracts titles, phones, company names from email signatures.

**apps/web** — Bun.serve() full-stack app on port 4747. React SPA with API routes. Modules: estimates, takeoffs, catalog, email archive, Monday search, webhooks.

---

## Shared Libraries (`lib/`)

**lib/db/** — Hub database connection, schema, types, repositories (account, attachment, email, estimate, estimate-email, mailbox, permit, project, stats).

**lib/estimating/** — Estimate CRUD operations, versioned line items with sections.

**lib/pdf/** — PDF generation utilities.

**lib/catalog/** — Service catalog items and pricing.

---

## Redundancies and Overlap

**Estimate syncing has 3 touch points (all in web worker):**
1. `estimate-poller` — syncs Monday ESTIMATING board to Postgres (every 10min via sync_full job)
2. `estimates-sync-worker` — syncs Monday files to SharePoint folders (runs after estimate-poller in sync_full job)
3. `estimate-email-linker` — links emails to estimates via deterministic signals (every 60s)

These are a pipeline, not redundancy: Monday→DB (#1), DB+emails→joins (#3), Monday→SharePoint (#2).

**Email sync is handled by the web worker timers:**
`outlook-folder-watcher` polls Graph deltas every 30s. The `estimate-email-linker` backfills estimate↔email links every 60s. M365 group sync runs every 15min via `@email/sync/groups`. One-off mailbox sync remains available at `packages/email/cli/sync-mailboxes.ts` with custom options (date ranges, mailbox filters).

**SWPPP data in two places:**
`packages/sharepoint/swppp/` and `swppp-sync` worker keep SWPPP data synchronized into Supabase Postgres. Supabase remains the canonical source.

---

## Data Flow

```text
Monday.com
  ESTIMATING board ──→ estimate-poller (60s) ──→ Supabase Postgres estimates
  ESTIMATING board ──→ estimates-sync-worker (sync_full job) ──→ SharePoint folders
  CONTACTS board ──→ hub.ts sync contacts (manual) ──→ Supabase Postgres contacts
  CONTRACTORS board ──→ hub.ts sync contractors (manual) ──→ Supabase Postgres accounts
  Status changes ──→ monday-status-sync-worker (hourly) ──→ Monday boards (GC cleanup, leads sync)

SharePoint
  SWPPP Master Excel ──→ swppp-sync (60s) ──→ Supabase Postgres swppp_work_orders
  Projects/Active/ folders ──→ outlook-folder-watcher (60s) ──→ Supabase Postgres folder tracking

Microsoft Graph (Email)
  12 mailboxes ──→ outlook-folder-watcher (30s) ──→ Supabase Postgres emails + attachments
  M365 groups ──→ web worker group sync (15min) ──→ Supabase Postgres emails

Inspection Emails
  inspections@desertservices.app ──→ inspections-email-worker ──→ SharePoint PDFs

Dust Permits
  permit-workers (Docker) ──→ Maricopa County Portal (Playwright automation)

Notifications
  database events ──→ notifications worker (5min) ──→ stakeholder routing ──→ email drafts
```
