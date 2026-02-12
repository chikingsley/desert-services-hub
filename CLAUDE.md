# Desert Services Hub

Monorepo for Desert Services operations: estimating, dust permits, contracts, notifications, email processing.

## Deployment Model (Authoritative)

- This system is **self-hosted only** on `gmk-server`.
- Core runtime services and the operational Postgres database run in local Docker containers.
- External access is through **Cloudflare Tunnel** routing to Docker services.
- Do not treat runtime data changes as targeting a separate hosted Supabase environment.

## Monorepo Structure

```text
apps/
  web/                    # Frontend SPA + API + background worker (estimates, catalog, notifications)
  workers/
    permit-workers/       # Maricopa County dust permit browser automation (Playwright)
    notifications/        # Email notification triggers, delivery, stakeholder routing
    email-sync/           # Outlook email sync via Microsoft Graph
    inspections-email-worker/  # ComplianceGo → SharePoint (Cloudflare Worker)
    docusign-file-automation/  # DocuSign contract dispatch (Cloudflare Worker)
    dust-permit-intake/   # Permit request intake processing
    files-email-intake/       # Email file auto-linking pipeline
    contract-intake/          # Deprecated legacy worker (dormant, not active runtime)
    estimate-poller/
    estimates-sync-worker/
    monday-status-sync-worker/
    outlook-folder-watcher/
    swppp-sync/
  cli-tools/
    email-cli/            # Email templates (Handlebars), subscription management
    aqdata-cli/           # Air quality data scraping
    monday-cli/           # Monday.com API operations
    sharepoint-cli/       # SharePoint file operations
    pdf-analysis-cli/     # PDF extraction with Gemini
    quoting-cli/          # Estimate quoting tools
  contract/               # Contract parsing and management

lib/                      # Shared libraries (imported by all apps)
  catalog/                # Service catalog with pricing (dust permit fee schedule, etc.)
  db/                     # Database client (self-hosted Postgres in Docker), repositories, types
  graph/                  # Microsoft Graph API client
  sharepoint/             # SharePoint file operations
  estimating/             # Estimating logic
  pdf/                    # PDF generation utilities
  pdf-takeoff/            # PDF quantity takeoff
  takeoff/                # Takeoff calculations
  assets/                 # Shared assets (logos, etc.)
```

## Docker Services

All services run on gmk-server. **Claude Code runs directly on gmk-server — never SSH into it.**

| Service | Container | Port | Purpose |
|---------|-----------|------|---------|
| `web` | `desert-web` | 3000 | Frontend + API + background job worker |
| `webhooks` | `desert-webhooks` | 4747 | Monday + Outlook webhook receiver |
| `permit-worker` | `desert-permit-worker` | 47822 (API), 47821 (VNC) | Browser automation for Maricopa permits |
| `notifications` | `desert-notifications` | — | Notifications poll loop (event detection + draft queueing) |
| `swppp-sync` | `desert-swppp-sync` | — | SWPPP Master sync poll loop |
| `tunnel` | `desert-tunnel` | — | Cloudflare tunnel (exposes webhooks + web) |

### Public URLs (via Cloudflare Tunnel)

- `webhooks.desertservices.app` → webhooks container (port 4747)
- `web.desertservices.app` → web container (port 3000)

### Inter-Container Networking

All containers share `desert-services-hub_default` Docker network. Use **service names** for internal calls:

```text
web → permit-worker:47822    # Scrape permits, generate PDFs
web → host.docker.internal:54322  # Postgres (self-hosted Supabase stack DB container)
webhooks → host.docker.internal:54322  # Postgres
notifications → host.docker.internal:54322  # Postgres
swppp-sync → host.docker.internal:54322  # Postgres + Graph-backed SWPPP master reads
```

### Commands

```bash
# Build & deploy
docker compose build web webhooks permit-worker notifications swppp-sync
docker compose up -d

# Rebuild single service
docker compose build web && docker compose up -d web

# Logs
docker compose logs -f web
docker compose logs -f webhooks
docker compose logs -f notifications
docker compose logs -f swppp-sync
docker compose logs -f permit-worker

# Restart
docker compose restart web
```

## Permit-Worker API (port 47822)

The web container calls the permit-worker for browser automation tasks. Key endpoints:

| Method | Endpoint | Purpose | Returns |
|--------|----------|---------|---------|
| `POST` | `/api/scrape/pdf` | Scrape permit + generate PDF | `{ data: PermitData, pdfPath, pdfBase64 }` |
| `GET` | `/api/scrape/:id` | Scrape permit data only | `{ data: PermitData }` |
| `POST` | `/api/permits/create` | Create new permit application | `{ applicationId }` |
| `POST` | `/api/permits/:id/renew` | Renew a permit | `{ applicationId }` |
| `POST` | `/api/permits/:id/close` | Close a permit | `{ success }` |
| `POST` | `/api/invoices/pdf` | Search & download invoice PDF | `{ success, pdfBase64 }` |
| `POST` | `/api/sync` | Sync permits from portal | `{ synced }` |
| `GET` | `/api/browser/status` | Browser session status | `{ isRunning, isLoggedIn }` |

**`PermitData` key fields** (returned by scrape endpoints):
- `applicationId`, `projectName`, `companyName`, `status`
- `disturbedArea` — acreage string (e.g. "64.3 Acres"). **Never null for valid permits.**
- `locations[]` — address, city, parcel (APN), lat/lng
- `contact`, `applicantCompany`, `applicantOwner`, `primaryContact`
- `project` — name, description, start/end dates
- `issueDate`, `expirationDate`, `createdDate`

## NOI Extraction Contract (Dust Permit + Narrative)

When consuming parsed NOI data (from `pdf-analysis` / intake workers), use this precedence:

- Permit number:
  - Prefer `ltfNumber` (numeric canonical ID), fallback `permitId` (e.g. `AZC114131`).
- Site identity:
  - `siteName` as canonical project/site name signal.
  - `siteAddress` as primary project address if plan/estimate address is missing.
- SWPPP contact:
  - Prefer explicit SWPPP contact block:
    - `swpppContactFirstName` + `swpppContactLastName`
    - `swpppContactEmail`
    - `swpppContactPhone`
  - Fallback to applicant block only if SWPPP contact fields are missing.
- Applicant/operator block:
  - `applicantName`, `applicantAddress1/2`, `applicantCity/State/Zip`.
- Site metrics:
  - `acresDisturbed` can be used as disturbed-acreage fallback when plan acres are missing.

Primary references:
- `apps/workers/dust-permit-intake/lib/intake.ts`
- `apps/cli-tools/pdf-analysis-cli/src/pdf_analysis/noi.py`
- `apps/workers/permit-workers/tests/lib/extraction-validator.ts`

## Dust Permit Tier Scale

Source of truth for Maricopa tier pricing and fee split:
- `lib/db/types.ts` → `DUST_PERMIT_TIERS`
  - Includes acreage bands, total price, ADEQ fee, and filing/admin fee.
- Billing computation uses the same table:
  - `apps/workers/notifications/lib/email-triggers.ts` (`computeCostBreakdown`).

## Notification Pipeline

```text
Email arrives → Graph webhook → POST /api/webhooks/outlook
  → enqueue email_notification job → worker syncs email
  → detectDustPermitEmailTrigger() matches sender/body patterns
  → enqueue dust_permit_payment or dust_permit_issued job
  → handler enriches metadata (cost breakdown, acreage, PDF)
  → createNotificationDraft() → Outlook draft via Graph API
```

**Trigger types:**
- `pointandpay_payment` — PointAndPay payment confirmation → billing + submitted notifications
- `maricopa_issued` — "Dust Permit Issued" from Maricopa → issued notification

**Email templates:** `apps/cli-tools/email-cli/src/email-templates/*.hbs`

## Shared Libraries (`lib/`)

| Library | Key Exports | Usage |
|---------|-------------|-------|
| `@lib/catalog` | `getAllItems()` | Service pricing, dust permit fee schedule by acreage tier |
| `@lib/db/hub` | `db` | Postgres client (Bun.sql) with SQLite-compatible API |
| `@lib/db/repositories` | `getPermitById()`, `upsertPermit()`, etc. | Permit CRUD operations |
| `@lib/db/types` | `Permit`, `NotificationEventType` | TypeScript interfaces |
| `@email/client` | `GraphEmailClient` | Microsoft Graph email operations |
| `@email/email-templates` | `getTemplate()`, `getLogoAttachment()` | Handlebars template rendering |

## Estimate Payload Guardrails

- Create/update estimate payload validation is centralized in `lib/estimating/estimate-payload-validation.ts`.
- API enforcement points:
  - `apps/web/api/estimates.ts` (`POST /api/estimates`)
  - `apps/web/api/estimates-by-id.ts` (`PUT /api/estimates/:id`)
- Required invariants:
  - Line items must resolve to catalog code or exact catalog item name.
  - Persist canonical `item_name` + catalog `description` only (no free-form description drift).
  - If `line_items` are present, require `job_name`, `client_name`, `job_address`, `client_address`.
  - Addresses must normalize to two-line format.
  - Reject `sections` updates that do not include `line_items`.
- Validation failures return HTTP `400` with issue details; do not implement silent defaulting.
- Write-path warning: direct SQL writes can bypass these guards. For estimate creation/updates, use validated API/CLI paths.
- Regression tests:
  - `apps/web/api/estimates.test.ts`
  - `tests/components/estimates/estimate-workspace.test.ts`

## Database

**All persistent state lives in self-hosted Postgres (Supabase local stack) on port 54322. No SQLite for operational data.**

If you need to store worker state, event logs, config, or any persistent data — add a table to Postgres. Do NOT create local SQLite databases. The only acceptable SQLite usage is for throwaway CLI caches (e.g., SharePoint SWPPP cache, one-time data extracts).

Connection: `@lib/db/hub` provides a Postgres client with SQLite-compatible API (`db.query().get()`, `db.query().all()`, `db.run()`).

### Key Tables

| Table | Purpose |
|-------|---------|
| `projects` | All projects (name, contractor, outlook_folder, permit/contract status) |
| `emails` | Synced Outlook emails |
| `estimate_emails` | Canonical email ↔ estimate links (join table) |
| `estimates` | Bid estimates from Monday.com |
| `project_estimates` | Canonical project ↔ estimate links (join table) |
| `dust_permits_filed_by_desert_services` | Maricopa dust permits |
| `documents` | Parsed documents (contracts/LOIs/etc.) + extraction JSON |
| `accounts` | Contractor/company accounts |
| `contacts` | People (email, phone, title) |
| `notifications` | Notification event log (type, status, metadata, draft ID) |
| `outlook_subscriptions` | Graph webhook subscriptions per mailbox |
| `tracked_folders` | Outlook folder watcher — tracked mail folders + delta tokens |
| `folder_watcher_config` | Outlook folder watcher — config (mailbox, poll interval, delta links) |
| `folder_watcher_events` | Outlook folder watcher — event log |
| `estimate_poller_config` | Estimate poller — config (sync timestamps) |
| `estimate_poller_events` | Estimate poller — event log |
| `project_aliases` | Alternative names for project matching |
| `project_match_reviews` | Persisted manual-review queue for ambiguous project matches |
| `webhook_jobs` | Background job queue for webhook processing |

### Email Linking Runtime Notes

- Canonical runtime:
  - Folder watcher polling runs in `apps/web/worker.ts` via `pollFolderWatcher()` every 30s.
  - Estimate-email backfill runs in `apps/web/worker.ts` via `pollEstimateEmailLinker()` every 60s.
  - Do not run parallel `systemd` services for folder watcher or estimate-email-linker.
- Folder watcher project linking (`apps/workers/outlook-folder-watcher/lib/projects.ts`):
  - Folder-to-project matching is centralized in `findProjectByFolder()` and the shared matcher contract:
    - `findBestProjectMatch({ primaryText, aliasHints, contractorHint })`.
    - Reason-scored candidates from `findProjectCandidates()` combine:
      1. exact `normalized_name`
      2. exact `project_aliases.normalized_alias`
      3. exact `outlook_folder`
      4. account hint
      5. token overlap on project/contractor/address text
    - Folder watcher first applies deterministic exact text match (`findProjectByText`) before ranked auto-linking.
    - Ranked auto-linking only applies when score/gap thresholds pass.
    - If ranked candidates exist but are ambiguous, a `project_match_reviews` row is upserted with `status='pending'` and the folder remains unlinked.
    - If no viable candidates exist, folder watcher creates a new project.
  - Shared normalization + token rules live in `lib/project-matching.ts`; do not re-implement local fuzzy/token logic in workers.
  - Attempts direct email lookup by `internet_message_id`, then fallback to Graph `message_id`.
  - Sets `emails.project_id` only when currently `NULL` (never overwrites another project link).
  - Expands project link across `conversation_id` thread (`UPDATE ... WHERE project_id IS NULL`).
- Folder watcher estimate linking (`linkMessagesToProjectEstimates`):
  - If project has exactly one linked estimate in `project_estimates`, links deterministically.
  - If project has multiple estimates, calls ranked matcher (`findEstimateCandidatesForEmail`) and only auto-links when decision says `autoLink=true`.
  - Rejects ranked matches outside the project's estimate set.
- Dust-permit intake project linking (`apps/workers/dust-permit-intake/lib/project-matcher.ts`):
  - Uses the same shared project matcher contract (subject-first, then NOI-site-first) for consistency with folder watcher and SWPPP reconciliation.
  - Non-auto-link outcomes are persisted to `project_match_reviews` for operator triage.
- Periodic estimate-email backfill (`apps/workers/estimate-email-linker/lib/poll.ts`):
  - Processes unlinked candidate emails incrementally using cursor `estimate_email_linker_last_email_id` in `estimate_poller_config`.
  - Matching priority:
    1. Monday pulse/item ID exact match (`monday_pulse_id`).
    2. Estimate number exact match (`estimate_number`) with disambiguation using project-estimate intersection, then sender domain.
    3. Optional project-single fallback (`project_estimates_single`), currently disabled in worker runtime (`enableProjectSingle: false`).
  - Writes are idempotent via `ON CONFLICT DO NOTHING` on `estimate_emails`.

```bash
# Direct psql (from gmk-server)
docker exec supabase_db_desert-services-hub psql -U postgres

# From other machines on Tailscale
psql -h gmk-server -p 54322 -U postgres  # password: postgres
```

Supabase Studio: `http://gmk-server:54323`

## SSSP / SDS Workflow Standard

Use this when users request Site-Specific Safety Plans (SSSP) or Safety Data Sheets (SDS) packets.

### Source of Truth

- SSSP generator:
  - `apps/cli-tools/sssp-cli/`
  - `lib/pdf/sssp/`
- Current LGE working packet:
  - `data/triage/1400-w-3rd/`
  - SSSP input: `data/triage/1400-w-3rd/sssp-input.json`

### Contact Assignment Rule

- If user asks who should be listed as project lead, default to the assigned Site Services Manager from the latest sales-territory file/email.
- For this 1400 W 3rd packet, `LGE Design Build` maps to `Lacie Slevin`.
- If user provides an override, always prefer user instruction.

### Contact Formatting Rule

- For lead/field/dispatcher rows, phone should be split into two lines:
  - `C: (###) ###-####`
  - `O: (###) ###-####`
- Keep phone-number style consistent across rows (parentheses format).
- Phone lines should not wrap mid-number.

### Delivery Rule (Work Mac)

- Claude runs on server; open files on work Mac via SSH:
  - `scp <file> work-mac:~/Downloads/1400w3rd/<final-name>.pdf`
  - `ssh work-mac 'osascript -e "tell application \"Preview\" to open POSIX file \"/Users/chiejimofor/Downloads/1400w3rd/<final-name>.pdf\""'`
- Keep final, client-facing names in `~/Downloads/1400w3rd/`.
- Move intermediate revisions (`rNN`) into `~/Downloads/1400w3rd/archive/`.

## SDS Binder Generation

When user asks for SDS output, clarify whether they want:
- `SDS Chemical Inventory` (list only), or
- `SDS Binder` (inventory + appended SDS sheets).

Commands:

```bash
# Inventory only
bun apps/cli-tools/sds-cli/bin/cli.ts generate \
  --in data/sds/sds-input.json \
  --out data/sds/SDS_Chemical_Inventory.pdf

# Binder (append sheets)
bun apps/cli-tools/sds-cli/bin/cli.ts generate \
  --in data/sds/sds-input.json \
  --out data/sds/SDS_Binder.pdf \
  --include-sheets
```

Important:
- `entry.pdfPath` in `data/sds/sds-input.json` is preferred for reliable binder output.
- `--download-sheets-from-url` can be used to fetch from `entry.url`.
- `--fail-on-missing-sheets` should be used for strict, client-facing final builds.
