# Desert Services Hub — Architecture Overview

What everything does, how it fits together, and what's redundant.

---

## Databases

**hub.db** (`lib/db/hub.db`) — The single source of truth. Everything syncs into here.
- emails (237K+), attachments (125K+), estimates (4,800+), projects, accounts (3,600+), contacts (4,600+), swppp_work_orders (2,973), mailboxes, estimate_emails

**projects.db** (`apps/contract/projects/projects.db`) — Contract intake task tracking. 92 active projects with processing stages.

**estimate-poller.db** (`apps/workers/estimate-poller/estimate-poller.db`) — Local state for the estimate poller (last sync cursor, change log).

**app.db** (`lib/db/app.db`) — Web app database (quotes, takeoffs, catalog items).

---

## CLI Tools (`apps/cli-tools/`)

**email-cli** — Email operations via Microsoft Graph. Search, read, draft, send, reply, folder management, M365 group access. 12 mailboxes synced.

**monday-cli** — Monday.com GraphQL client. Board queries, item CRUD, cursor-based pagination. PAGE_SIZE=100, MAX_RETRIES=5.

**sharepoint-cli** — SharePoint file operations via Graph SDK. Upload (auto-chunking at 5MB), download, list, search. Also houses the SWPPP master Excel reader (`swppp/client.ts`).

**pdf-analysis-cli** — Python. OCR with three providers: Gemini (best), local Ollama, Mistral. Commands: ocr, extract, identify, analyze.

**quoting-cli** — Quote PDF generation.

---

## Workers (`apps/workers/`)

**swppp-sync** — Polls SharePoint SWPPP Master Excel every 60s, upserts work orders into hub.db, auto-links contractors to accounts. CLI: `bun cli/sync.ts`, `bun cli/status.ts`.

**estimate-poller** — Polls Monday ESTIMATING board every 60s, syncs new/updated estimates to hub.db, auto-links to projects. CLI: `bun cli/watch.ts`, `bun cli/status.ts`.

**estimates-sync-worker** — Cloudflare Worker. Runs hourly via cron. Syncs Monday estimates to SharePoint folder structure (organized by bid status). Downloads files from Monday, uploads to SharePoint. Also contains the hub CLI (`apps/contract/cli/hub.ts`) for manual Monday-to-hub.db syncs.

**outlook-folder-watcher** — Polls Graph delta API every 60s. Detects new folders under `Projects/Active/` and new emails in tracked folders. Auto-matches folders to projects, links emails to hub.db.

**monday-status-sync-worker** — Cloudflare Worker. Runs hourly. Three jobs: (1) GC Cleanup — marks competing estimates as "GC Not Awarded" when one wins, (2) Leads Sync — propagates status from estimates to leads, (3) Project Link Sync — enforces board cross-references.

**inspections-email-worker** — Cloudflare Email Worker. Receives ComplianceGo inspection emails at `inspections@desertservices.app`, parses report URLs, generates PDFs via Browser Rendering API, uploads to SharePoint.

**permit-workers** — Dockerized Playwright automation for Maricopa County Dust Control Portal. Create, revise, renew, close permits. Includes React dashboard, REST API, VNC access. Uses Gemini for PDF parsing.

**email-sync** — Polls Microsoft Graph API every 5min, incremental sync of all 12 mailboxes + M365 groups into hub.db. Runs enrichment pipeline after each cycle (domain extraction, platform senders, account linking). CLI: `bun cli/sync.ts`, `bun cli/status.ts`.

**notifications** — Polls hub.db every 5min for events needing notifications (permit expirations, estimate wins, permit submissions/issuances). Stakeholder-based routing — configurable per event type. CLI: `bun cli/watch.ts`, `bun cli/status.ts`, `bun cli/seed-stakeholders.ts`.

---

## Apps

**apps/contract** — Contract intake cascade. Hub CLI for syncing Monday boards to hub.db, creating/updating contacts and accounts. Database repositories for all hub.db tables. Contract processing workflow (intake, reconciliation, insurance verification, SharePoint setup).

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
1. `estimate-poller` — always-on local poller, Monday to hub.db (60s)
2. `estimates-sync-worker` — Cloudflare cron, Monday to SharePoint (hourly)
3. `hub.ts sync estimates` — manual CLI command, Monday to hub.db

The poller (#1) is the always-on replacement for manual syncs (#3). The SharePoint worker (#2) does something different (file organization, not database sync). No actual redundancy — they complement each other.

**Email sync now has an always-on worker:**
`email-sync` worker polls every 5 minutes. The manual `email-cli/sync/mailboxes.ts` still works for one-off syncs with custom options (date ranges, specific mailboxes).

**SWPPP data in two places:**
`sharepoint-cli/swppp/db.ts` has the old standalone swppp-master.db. `swppp-sync` worker now syncs directly into hub.db. The old db.ts and swppp-master.db are vestigial — hub.db is the canonical source.

---

## Data Flow

```text
Monday.com
  ESTIMATING board ──→ estimate-poller (60s) ──→ hub.db estimates
  ESTIMATING board ──→ estimates-sync-worker (hourly) ──→ SharePoint folders
  CONTACTS board ──→ hub.ts sync contacts (manual) ──→ hub.db contacts
  CONTRACTORS board ──→ hub.ts sync contractors (manual) ──→ hub.db accounts
  Status changes ──→ monday-status-sync-worker (hourly) ──→ Monday boards (GC cleanup, leads sync)

SharePoint
  SWPPP Master Excel ──→ swppp-sync (60s) ──→ hub.db swppp_work_orders
  Projects/Active/ folders ──→ outlook-folder-watcher (60s) ──→ hub.db folder tracking

Microsoft Graph (Email)
  12 mailboxes ──→ email-sync worker (5min) ──→ hub.db emails + attachments + enrichment
  M365 groups ──→ email-sync worker (5min) ──→ hub.db emails

Inspection Emails
  inspections@desertservices.app ──→ inspections-email-worker ──→ SharePoint PDFs

Dust Permits
  permit-workers (Docker) ──→ Maricopa County Portal (Playwright automation)

Notifications
  hub.db events ──→ notifications worker (5min) ──→ stakeholder routing ──→ email drafts
```
