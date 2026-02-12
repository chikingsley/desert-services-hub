# Desert Services Hub — Architecture Overview

What everything does, how it fits together, and what's redundant.

---

## Databases

**Supabase Postgres** (local Supabase DB on port `54322`) — The single source of truth. Everything syncs into here.
- emails (237K+), attachments (125K+), estimates (4,800+), projects, accounts (3,600+), contacts (4,600+), swppp_work_orders (2,973), mailboxes, estimate_emails

**Local SQLite files (non-operational for hub data):**
- `apps/cli-tools/sharepoint-cli/swppp/swppp-master.db` — legacy SWPPP cache used by specific CLI tooling.
- `apps/workers/inspections-email-worker/inspections-app-idea/inspections.db` — prototype/demo app data.

---

## CLI Tools (`apps/cli-tools/`)

**email-cli** — Email operations via Microsoft Graph. Search, read, draft, send, reply, folder management, M365 group access. 12 mailboxes synced.

**monday-cli** — Monday.com GraphQL client. Board queries, item CRUD, cursor-based pagination. PAGE_SIZE=100, MAX_RETRIES=5.

**sharepoint-cli** — SharePoint file operations via Graph SDK. Upload (auto-chunking at 5MB), download, list, search. Also houses the SWPPP master Excel reader (`swppp/client.ts`).

**pdf-analysis-cli** — Python. OCR with three providers: Gemini (best), local Ollama, Mistral. Commands: ocr, extract, identify, analyze.

**quoting-cli** — Quote PDF generation.

---

## Workers (`apps/workers/`)

**swppp-sync** — Polls SharePoint SWPPP Master Excel every 60s, upserts work orders into Supabase Postgres, auto-links contractors to accounts. CLI: `bun cli/sync.ts`, `bun cli/status.ts`.

**estimate-poller** — Polls Monday ESTIMATING board every 60s, syncs new/updated estimates to Supabase Postgres, auto-links to projects. CLI: `bun cli/watch.ts`, `bun cli/status.ts`.

**estimates-sync-worker** — Cloudflare Worker. Runs hourly via cron. Syncs Monday estimates to SharePoint folder structure (organized by bid status). Downloads files from Monday, uploads to SharePoint. Also contains the hub CLI (`apps/contract/cli/hub.ts`) for manual Monday-to-Postgres syncs.

**outlook-folder-watcher** — Polls Graph delta API every 60s. Detects new folders under `Projects/Active/` and new emails in tracked folders. Auto-matches folders to projects, links emails to Supabase Postgres.

**monday-status-sync-worker** — Cloudflare Worker. Runs hourly. Three jobs: (1) GC Cleanup — marks competing estimates as "GC Not Awarded" when one wins, (2) Leads Sync — propagates status from estimates to leads, (3) Project Link Sync — enforces board cross-references.

**inspections-email-worker** — Cloudflare Email Worker. Receives ComplianceGo inspection emails at `inspections@desertservices.app`, parses report URLs, generates PDFs via Browser Rendering API, uploads to SharePoint.

**permit-workers** — Dockerized Playwright automation for Maricopa County Dust Control Portal. Create, revise, renew, close permits. Includes React dashboard, REST API, VNC access. Uses Gemini for PDF parsing.

**email-sync** — Polls Microsoft Graph API every 5min, incremental sync of all 12 mailboxes + M365 groups into Supabase Postgres. Runs enrichment pipeline after each cycle (domain extraction, platform senders, account linking). CLI: `bun cli/sync.ts`, `bun cli/status.ts`.

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

**Estimate syncing has 3 touch points:**
1. `estimate-poller` — always-on local poller, Monday to Supabase Postgres (60s)
2. `estimates-sync-worker` — Cloudflare cron, Monday to SharePoint (hourly)
3. `hub.ts sync estimates` — manual CLI command, Monday to Supabase Postgres

The poller (#1) is the always-on replacement for manual syncs (#3). The SharePoint worker (#2) does something different (file organization, not database sync). No actual redundancy — they complement each other.

**Email sync now has an always-on worker:**
`email-sync` worker polls every 5 minutes. The manual `email-cli/sync/mailboxes.ts` still works for one-off syncs with custom options (date ranges, specific mailboxes).

**SWPPP data in two places:**
`sharepoint-cli/swppp/db.ts` has the old standalone swppp-master.db. `swppp-sync` worker now syncs directly into Supabase Postgres. The old db.ts and swppp-master.db are vestigial — Supabase Postgres is the canonical source.

---

## Data Flow

```text
Monday.com
  ESTIMATING board ──→ estimate-poller (60s) ──→ Supabase Postgres estimates
  ESTIMATING board ──→ estimates-sync-worker (hourly) ──→ SharePoint folders
  CONTACTS board ──→ hub.ts sync contacts (manual) ──→ Supabase Postgres contacts
  CONTRACTORS board ──→ hub.ts sync contractors (manual) ──→ Supabase Postgres accounts
  Status changes ──→ monday-status-sync-worker (hourly) ──→ Monday boards (GC cleanup, leads sync)

SharePoint
  SWPPP Master Excel ──→ swppp-sync (60s) ──→ Supabase Postgres swppp_work_orders
  Projects/Active/ folders ──→ outlook-folder-watcher (60s) ──→ Supabase Postgres folder tracking

Microsoft Graph (Email)
  12 mailboxes ──→ email-sync worker (5min) ──→ Supabase Postgres emails + attachments + enrichment
  M365 groups ──→ email-sync worker (5min) ──→ Supabase Postgres emails

Inspection Emails
  inspections@desertservices.app ──→ inspections-email-worker ──→ SharePoint PDFs

Dust Permits
  permit-workers (Docker) ──→ Maricopa County Portal (Playwright automation)

Notifications
  database events ──→ notifications worker (5min) ──→ stakeholder routing ──→ email drafts
```
