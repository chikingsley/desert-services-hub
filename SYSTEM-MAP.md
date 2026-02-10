# Desert Services Hub — System Map

## What This System Does

Desert Services provides environmental compliance services (SWPPP, dust control, portable toilets, fencing, etc.) to general contractors in the Phoenix/Maricopa County area. This system manages the entire business lifecycle:

**Bid → Win → Contract → Permits → Work → Inspect → Close**

---

## Architecture Overview

```text
                    ┌─────────────────────────────┐
                    │        MONDAY.COM            │
                    │  Estimating (4,800 items)    │
                    │  Leads (2,000 items)         │
                    │  Projects board              │
                    └──────────┬──────────────────┘
                               │ GraphQL + Webhooks
                               ▼
┌──────────────┐    ┌─────────────────────────────┐    ┌──────────────┐
│   OUTLOOK    │───▶│      POSTGRES (Supabase)     │◀───│  SHAREPOINT  │
│  36 mailboxes│    │  339K emails, 4K accounts    │    │  DataDrive   │
│  real-time   │    │  4.6K contacts, 4.3K est.    │    │  Project     │
│  webhooks    │    │  92 projects, permits, NOIs  │    │  folders     │
└──────────────┘    └──────────┬──────────────────┘    └──────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │  WEB APP    │  │  WEBHOOKS   │  │   WORKERS   │
     │  :3000      │  │  :4747      │  │  CF + CLI   │
     │  SPA + API  │  │  Mon/Out/DP │  │  8 deployed │
     └─────────────┘  └─────────────┘  └─────────────┘
              │                               │
              ▼                               ▼
     ┌─────────────┐              ┌─────────────────┐
     │  BROWSER    │              │  AI / LLM       │
     │  Estimates  │              │  Ollama (local)  │
     │  Takeoffs   │              │  Gemini (cloud)  │
     │  Projects   │              │  Mistral (cloud) │
     │  Permits    │              │  Jina (scraping) │
     │  Map        │              │  PDL (contacts)  │
     └─────────────┘              └─────────────────┘
```

---

## Component Inventory

### Web Application (apps/web/)

| Page | Route | Status | What It Does |
|------|-------|--------|--------------|
| Dashboard | `/` | DONE | Landing page, workflow diagram, quick actions |
| Estimates | `/estimates` | DONE | List all estimates, stats, pagination |
| Estimate Editor | `/estimates/:id` | DONE | Full editor: sections, line items, PDF preview |
| Takeoffs | `/takeoffs` | DONE | List takeoffs |
| Takeoff Editor | `/takeoffs/:id` | PARTIAL | PDF viewer + annotations work, **PDF upload broken (501)** |
| Catalog | `/catalog` | DONE | Browse 2026 pricing catalog (read-only) |
| Contracts | `/contracts` | DONE | Won estimates pipeline with status filters |
| Projects | `/projects` | DONE | All projects with compliance status columns |
| Permits | `/permits` | DONE | Dust permits filed by DS, search + filter |
| Map | `/map` | DONE | MapLibre + Maricopa parcels (client-side) |
| Automation | `/automation` | STUB | VNC viewer shell, no controls |
| Settings | `/settings` | STUB | "Coming soon" placeholder |

### API Endpoints (apps/web/api/)

| Endpoint | Status | Purpose |
|----------|--------|---------|
| `GET/POST /api/estimates` | DONE | List + create estimates |
| `GET/PUT/DELETE /api/estimates/:id` | DONE | Single estimate CRUD |
| `GET /api/estimates/:id/pdf` | DONE | Generate PDF |
| `POST /api/estimates/:id/duplicate` | DONE | Clone estimate |
| `GET/POST /api/takeoffs` | DONE | List + create takeoffs |
| `GET/PUT/DELETE /api/takeoffs/:id` | DONE | Single takeoff CRUD |
| `GET /api/takeoffs/:id/pdf` | BROKEN | Returns 501 (SharePoint migration incomplete) |
| `POST /api/upload/pdf` | BROKEN | Returns 501 (SharePoint migration incomplete) |
| `GET /api/catalog` | DONE | Hardcoded catalog data |
| `GET /api/projects` | DONE | List projects with compliance status |
| `GET /api/permits` | DONE | List permits with filters |
| `GET /api/contracts` | DONE | Won estimates pipeline |
| `GET /api/monday/search` | DONE | LIKE search on estimates |
| `GET /api/archives/*` | DONE | Email archive browser |

### Webhook Server (apps/web/webhooks.ts — port 4747)

| Endpoint | Status | Trigger |
|----------|--------|---------|
| `POST /api/webhooks/monday` | DONE | Monday item changes → enqueue sync_item |
| `POST /api/webhooks/outlook` | DONE | Graph change notifications → enqueue email_notification |
| `POST /api/webhooks/dust-permit-intake` | DONE | Forwarded emails with PDFs → enqueue dust_permit_intake |

### Background Worker (apps/web/worker.ts)

| Job Type | Status | What It Does |
|----------|--------|--------------|
| `sync_item` | DONE | Fetch Monday item → upsert to Postgres |
| `download_files` | DONE | Download PDFs from Monday → run extraction |
| `sync_full` | DONE | Full board sync (every 30 min) |
| `email_notification` | DONE | Process Outlook change → insert email + attachments |
| `contract_intake` | WIP | Classify + extract IC contract PDFs via LLM |
| `dust_permit_intake` | DONE | Parse intake email + extract NOI from PDFs |
| `dust_permit_payment` | DONE | PointAndPay email → billing + invoice PDF attachment |
| `dust_permit_issued_email` | DONE | Maricopa issued email → notification |

**Periodic Timers:**

| Timer | Interval | Status |
|-------|----------|--------|
| Job poller | 5 sec | RUNNING |
| Full Monday sync | 30 min | RUNNING |
| Outlook subscription renewal | 1 hour | RUNNING |
| M365 group sync (IC, etc.) | 15 min | RUNNING |

---

### Workers (apps/workers/)

| Worker | Type | Trigger | Status |
|--------|------|---------|--------|
| **estimates-sync-worker** | Cloudflare | Cron hourly :00 | DEPLOYED — Monday files → SharePoint folders |
| **monday-status-sync-worker** | Cloudflare | Cron hourly :15 | DEPLOYED — GC cleanup, leads sync, project links |
| **inspections-email-worker** | CF Email | Incoming email | DEPLOYED — ComplianceGo → PDF → SharePoint |
| **dust-permit-intake** | CF Email | Incoming email | DEPLOYED — Forwarded PDFs → hub webhook |
| **docusign-file-automation** | CF Email | Incoming email | PARTIAL — Dispatcher works, intake future |
| **permit-workers** | Bun Server | HTTP API + CLI | DEPLOYED — Browser automation + invoice PDF scraping |
| **files-email-intake** | Background | Webhook job queue | WIP — Auto-linking works, LLM extraction incomplete |
| **outlook-folder-watcher** | CLI Poller | systemd service | RUNNING on gmk-server — Folder delta sync |
| **notifications** | CLI Poller | systemd service | RUNNING on gmk-server — Event notifications + drafts |
| **swppp-sync** | CLI Poller | systemd service | RUNNING on gmk-server — SWPPP Master sync |
| **estimate-poller** | Setup Script | Manual | DONE — Webhook config utility only |

---

### CLI Tools (apps/cli-tools/)

| Tool | Commands | Status |
|------|----------|--------|
| **email-cli** | search, get, thread, draft, reply-draft, send-draft, contracts, estimating, ic, folders, mailboxes, groups, templates, move, move-thread, project-hydrate, project-folders | PRODUCTION |
| **monday-cli** | get, search, search-col, boards, columns, groups, update, sync-estimates | PRODUCTION |
| **sharepoint-cli** | walk, sync-project-files, batch-sync | PRODUCTION |
| **quoting-cli** | list, get, create, update, delete, duplicate, pdf | PRODUCTION |
| **pdf-analysis-cli** | ocr, extract, identify, analyze (Python — Gemini/Ollama/Mistral) | PRODUCTION |
| **aqdata-cli** | Client library only, **no CLI commands exposed** | WIP |

---

### Shared Libraries (lib/)

| Library | Purpose | Status |
|---------|---------|--------|
| `lib/db/hub.ts` | Postgres connection (Bun.sql) | DONE |
| `lib/db/repositories/` | 11 repository modules (account, project, email, estimate, permit, etc.) | DONE |
| `lib/db/search.ts` | ILIKE query builder | DONE |
| `lib/db/_legacy/insurance.ts` | (archived) Coverage gap analysis prototype | ARCHIVED — not automated |
| `lib/catalog/` | 2026 pricing catalog + bundles + helpers | DONE |
| `lib/pdf/` | Estimate PDF generation (pdfmake) | DONE |
| `lib/takeoff/` | PDF measurement + annotation tools | DONE |
| `lib/sharepoint/paths.ts` | SharePoint folder routing logic | DONE |
| `lib/graph/token.ts` | MS Graph auth token management | DONE |
| `lib/spam-filter.ts` | Email spam classification | DONE |
| `lib/html-to-text.ts` | HTML → text via HTMLRewriter | DONE |

---

### External Integrations

| Service | Purpose | Status |
|---------|---------|--------|
| **Monday.com** | CRM — estimates, leads, projects | ACTIVE |
| **Microsoft Graph** | Email (36 mailboxes), SharePoint, webhooks | ACTIVE |
| **SharePoint** | Document storage — project folders, PDFs | ACTIVE |
| **Cloudflare** | Tunnel, 5 Workers, Email Routing | ACTIVE |
| **Maricopa Portal** | Dust permit browser automation (Playwright) | ACTIVE |
| **DocuSign** | Contract signing link extraction | ACTIVE |
| **Ollama** | Local LLM — OCR (glm-ocr), text analysis (granite4) | ACTIVE |
| **Google Gemini** | Cloud LLM — OCR, form filling, extraction | ACTIVE |
| **Mistral** | Fallback LLM provider | ACTIVE |
| **Jina AI** | Web scraping, content extraction | ACTIVE |
| **PDL** | Contact enrichment (person + company) | ACTIVE |
| **N8N** | Workflow automation | DORMANT — configured, not integrated |

---

## The Gaps

### GAP 1: No Automated Project Lifecycle

**Problem:** When an estimate is won on Monday, nothing automatically happens. No project record is created, no permits are initiated, no folder structure is set up, no stakeholders are notified.

**Current state:** Projects exist in Postgres (92 rows) but are manually created/linked. The `projects` table has fields for contract_status, dust_permit_status, noi_status, swppp_status, signs_status — but nothing populates them automatically.

**What's needed:** An agent or workflow that triggers on estimate status → "Won":
1. Create project record in Postgres
2. Create SharePoint folder structure (Customer Projects/Active/...)
3. Check if dust permit is needed → initiate permit application
4. Link estimate → project → account
5. Notify relevant stakeholders

### GAP 2: CLI Pollers Not Running as Services

**Resolved (2026-02-09):** Three CLI pollers are now deployed as user `systemd` services on gmk-server:
- `desert-outlook-folder-watcher.service`
- `desert-notifications.service`
- `desert-swppp-sync.service`

**Ongoing:** Keep `bun run ops:check` in startup/deploy validation so regressions are detected immediately.

### GAP 3: Contract/File Intake Pipeline Incomplete

**Problem:** The `files-email-intake` worker (formerly `contract-intake`) has auto-linking and integration tests but the LLM extraction pipeline is incomplete.

**Current state:** Renamed to `files-email-intake`. Email → estimate auto-linking works via contracts pipeline. PDFs are downloaded. But automatic classification + structured extraction isn't finishing.

**What's needed:** Complete the pipeline: PDF → OCR → classify (subcontract? insurance cert? change order?) → extract fields → store in documents table (`documents.summary` + `documents.raw_extraction`).

### GAP 4: No Permit Renewal Automation

**Problem:** The permit worker can renew permits via browser automation, but nothing watches for expiring permits and triggers renewal.

**Current state:** `getExpiringPermits()` exists in the dust-permit repository. The notifications worker can detect expirations. The permit worker can execute renewals. But they're not connected.

**What's needed:** An agent that:
1. Monitors permits expiring in next 30/60/90 days
2. Alerts stakeholders
3. Optionally auto-initiates renewal via permit worker API

### GAP 5: Takeoff PDF Upload Broken

**Problem:** Both `/api/upload/pdf` and `/api/takeoffs/:id/pdf` return 501 — "storage migrated to SharePoint." The takeoff editor works (annotations, measurements) but you can't upload new PDFs to start a takeoff.

**What's needed:** Implement SharePoint-based PDF upload for takeoffs. Upload to SharePoint → store URL in takeoff record → serve via SharePoint URL.

### GAP 6: No Business Dashboard

**Problem:** The dashboard (`/`) is a static landing page with workflow steps. No real-time metrics.

**What's needed:** A dashboard showing:
- Active estimates by status (pie chart)
- Win rate over time
- Permits expiring soon
- Projects needing attention (missing permits, overdue inspections)
- Email volume trends
- Revenue pipeline

### GAP 7: AQ Data CLI Has No Commands

**Problem:** The aqdata-cli has a working client (`AQDataClient`) that can navigate the Maricopa AQ portal, search dust applications, export to Excel, parse results — but no CLI commands are wired up. The `src/commands/` directory is empty.

**What's needed:** Wire up CLI commands: `search`, `export`, `sync-to-db`. This enables market intelligence — track all dust permits in Maricopa County, identify potential customers, monitor competitors.

### GAP 8: Marketing Permits Prospecting Not Automated

**Problem:** `marketing_permits` is populated via permit-workers sync, but there's no scheduled refresh + prospecting workflow (alerts, outreach lists, UI).

**Current state:** `permit-workers` upserts `marketing_permits` from the AQ data portal. Repositories exist for queries (`getActivePermitsByCompany()`, `getPermitsNeedingDetailScrape()`), but there's no recurring agent turning this into sales ops.

**What's needed:** A scheduled job/agent that:
1. Runs a full portal sync (all permits) on a cadence
2. Performs detail scrape for new/changed permits
3. Generates a prospect list + notifications (new Active permits by company, expiring permits, etc.)

### GAP 9: Insurance Gap Checking (Archived)

**Current state:** Prototype exists at `lib/db/_legacy/insurance.ts` and legacy tables (`company_insurance`, `contract_insurance_requirements`). We're dropping those tables and not running this automatically.

**If we revive this:** Store insurance requirements + COIs as `documents` rows (type `INSURANCE_REQUIREMENTS` / `COI`) with structured fields in `documents.raw_extraction`, then run a check during file intake and notify on gaps.

### GAP 10: No Email → Estimate Auto-Linking

**Problem:** Emails and estimates exist in the same database but linking is manual or based on simple text matching. Many emails about estimates aren't linked.

**Current state:** `estimate_emails` table exists (canonical link table). `findEstimate()` can search by number/name. Worker does some thread-based linking. But there's no comprehensive auto-linking.

**What's needed:** An agent that periodically scans unlinked emails, uses subject line / sender / content to match them to estimates, and creates links. Could use local LLM (granite4) for fuzzy matching.

### GAP 11: No Project Compliance Tracking Dashboard

**Problem:** Projects have status fields for: contract, dust_permit, noi, swppp, signs — but there's no view that shows "here are all the things that need to happen for this project and what's done."

**What's needed:** A project detail page showing compliance checklist:
- [ ] Contract signed
- [ ] Dust permit filed → permit #, status, expiration
- [ ] NOI submitted
- [ ] SWPPP book created
- [ ] Signs installed
- [ ] First inspection scheduled

### GAP 12: Stale/Legacy Code

**Resolved (2026-02-09):** Removed 28 dead env vars from `.env` and `.env.example`:
- Notion (9 vars — API key + 7 DB IDs), OpenAI (1 var — empty), MinIO (14 vars — replaced by SharePoint Feb 2026), Tavily (1 var — never implemented).
Only harmless reference remaining: `supabase/config.toml` has `openai_api_key = "env(OPENAI_API_KEY)"` (Supabase Studio template default, no-op when empty).

---

## Priority Matrix

### Must-Have (Close the loop on core business flow)

1. **GAP 1** — Automated project lifecycle (estimate won → project created → permits initiated)
2. **GAP 3** — Complete contract intake pipeline (auto-linking done, LLM extraction next)
3. **GAP 4** — Permit renewal automation

### Should-Have (Improve existing capabilities)

5. **GAP 5** — Fix takeoff PDF upload
6. **GAP 6** — Business metrics dashboard
7. **GAP 10** — Email → estimate auto-linking
8. **GAP 11** — Project compliance tracking

### Nice-to-Have (Growth + intelligence)

9. **GAP 7** — AQ data CLI commands
10. **GAP 8** — Marketing permits prospecting (competitor intelligence)
11. **GAP 9** — Insurance gap checking (archived)

### Done

- **GAP 2** — ~~Deploy notifications + swppp-sync as services~~ (resolved 2026-02-09)
- **GAP 12** — ~~Remove dead integrations from .env~~ (resolved 2026-02-09)

---

## Agent Opportunities

These gaps are ideal for autonomous agents running on gmk-server:

**Agent 1: Project Lifecycle Agent**
- Trigger: Estimate status changes to "Won" (via Monday webhook)
- Actions: Create project, set up SharePoint folders, check if permits needed, create initial tasks
- Uses: Monday API, SharePoint API, Postgres, notification system

**Agent 2: Permit Watchdog Agent**
- Trigger: Daily cron or permit status change
- Actions: Check expiring permits, alert stakeholders, auto-initiate renewals
- Uses: Postgres (permit repository), permit-worker API, email CLI (notifications)

**Agent 3: Email Intelligence Agent**
- Trigger: Every 15 minutes or on new email batch
- Actions: Classify unlinked emails, match to estimates/projects, extract actionable items
- Uses: Postgres, Ollama (granite4 for classification), email repository

**Agent 4: Market Intelligence Agent**
- Trigger: Weekly cron
- Actions: Scrape AQ data portal, update marketing_permits, identify prospects
- Uses: aqdata-cli, Postgres (marketing_permits), notification system

**Agent 5: Contract Processing Agent**
- Trigger: New email in IC group with PDF attachments
- Actions: OCR PDF, classify document type, extract fields, link to estimate/project
- Uses: pdf-analysis-cli, Ollama/Gemini, Postgres (documents, estimates)
