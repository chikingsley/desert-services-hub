---
description: Project-wide conventions for Desert Services Hub (Bun full-stack, services, standards)
alwaysApply: true
---

# Desert Services Hub

This is the unified repository for the Desert Services ecosystem, combining the Bun full-stack web applications and the core automation services.

## Core Tech Stack

- **Runtime**: Bun
- **Framework**: Bun.serve() with React SPA (native Bun routing)
- **Styling**: Tailwind CSS
- **Database**: SQLite via `bun:sqlite` (Bun's built-in driver)
- **Linting/Formatting**: Biome (via Ultracite)

## Tooling & Runtime

Default to using **Bun** instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun run dev` for development (Bun.serve with hot reload)
- Use `bun install` for dependency management
- Use `bunx <package> <command>` instead of `npx`
- Bun automatically loads `.env`, so don't use `dotenv`

### Running Scripts

Prefer running actual `.ts` files with `bun` for type safety:

```bash
bun apps/contract-ui/contract/db/sync/all.ts
```

For quick one-offs where no script exists, `bun -e` is acceptable:

```bash
bun -e "import { searchItems } from './workers/ds-estimates-sync-worker/monday/client'; console.log(await searchItems('7943937855', 'SearchTerm'))"
```

**Monday GraphQL one-offs** (for bulk searches/updates in `workers/ds-estimates-sync-worker/`):

```bash
cd workers/ds-estimates-sync-worker && bun -e '
import { query } from "./monday/client";
const result = await query(`
  query {
    boards(ids: 7943937851) {
      items_page(limit: 100, query_params: {
        rules: [{column_id: "name", compare_value: ["TF"], operator: contains_text}]
      }) { items { id name } }
    }
  }
`);
console.log(result.boards[0].items_page.items);
'
```

**Shell gotcha**: avoid `!` in inline scripts (interprets as history expansion). Use `myBool === false` instead of `!myBool`.

### Querying SQLite Databases

For ad-hoc queries, use `sqlite3` CLI directly (no Bun overhead):

```bash
sqlite3 apps/contract-ui/contract/hub.db
```

Then run queries:

```sql
.mode column
.headers on
SELECT from_email, COUNT(*) as c FROM emails GROUP BY from_email ORDER BY c DESC LIMIT 10;
```

Type `.quit` to exit.

**Do NOT use `bun -e` for database queries** - the process startup is slow. Use `sqlite3` for exploration, save scripts as `.ts` files for reusable operations.

---

## Code Organization & Standards

### NO TABLES. EVER

Do not use markdown tables in emails, drafts, documentation, or any output. Use bullet points, labeled lines, or plain text instead. Tables render poorly in email clients and are hard to read.

### General Conventions

- **No barrel files**: Import directly from modules, not through `index.ts` re-exports.
- **Direct imports**: Always import from the specific file that defines what you need.
- **Use `type` over `interface`**: Prefer type aliases for consistency.
- **Unused Variables**: Prefix intentionally unused variables with `_` (e.g., `const { used, _unused } = obj;`).

### Linting & Formatting (Biome)

This project uses **Ultracite** (a Biome preset).

- `bunx ultracite check` # Check for issues
- `bunx ultracite fix`   # Auto-fix issues
- Ignore files via `includes` with `!` prefix in `biome.jsonc`.

---

## Contract Cascade — Active Workflow (READ THIS FIRST)

The primary work right now is processing contracts through the intake pipeline. The full workflow is defined in `apps/contract-ui/contract/PROJECT.md`. Project state is in `apps/contract-ui/contract/STATE.md`. Read both at the start of any contract-related session.

### What's Happening Right Now

We are manually processing ~25 projects. Some are new intake, some are already active. **READ THE EMAILS FIRST** before applying any checklist. The emails tell you what stage the project is actually in. Don't assume intake — check the timeline, check what's already happening.

For new contracts going through intake, see `apps/contract-ui/contract/PROJECT.md`. For active projects, document current state from emails instead. Each project needs:

1. Research project (search hub.db locally — emails, estimates, attachments)
2. Find estimate in Monday (query `estimates` table in hub.db — DO NOT call Monday API)
3. Mark Won in Monday, mark competing lost
4. Get estimate PDF + contract PDF
5. Extract contract data
6. Verify insurance
7. Reconcile contract vs estimate
8. Award value in Monday
9. SharePoint folder setup
10. Internal email to internalcontracts@ group
11. Track open items
12. Start dust permit / order SWPPP if applicable

### Key Rules

- **All project files must end up in SharePoint** — cataloging in MinIO is not enough
- **Use the file naming convention** from `services/sharepoint/paths.ts`
- **Contracts may not be in email** — check DocuSign, Procore, internal contracts group, shared drives
- **Read `apps/contract-ui/contract/PROJECT.md` and `apps/contract-ui/contract/STATE.md`** at the start of contract work sessions
- **No `bun -e` for workflows** — write durable `.ts` scripts in the repo that can be run repeatedly and improved over time. Only use `bun -e` for one-off queries if you ask first. Workflows must be files, not inline scripts.
- **READ THE EMAILS before making any determination** — don't just search subjects/metadata. Read `body_preview` for every email on a project to understand what's actually happening.

### SharePoint Structure

- Root: `Customer Projects/`
- Status folders: `Active/`, `Finished/`, `Lost/`, `Submitted/`
- Alpha subfolders by **contractor** first letter: `Active/W/`, `Active/M/`, etc.
- Contractor folders: `Active/W/Weis Builders/`
- Project folders inside contractor: `Active/W/Weis Builders/The Verge at Ballpark Village/`
- Subfolders per project: `01-Estimates`, `02-Contracts`, `03-Permits`, `04-SWPPP`, `05-Inspections`, `06-Billing`, `07-Closeout`
- **Full path**: `Customer Projects/Active/{Letter}/{Contractor}/{Project}/{Subfolder}/`
- Sync script: `bun services/sharepoint/sync-project-files.ts --contractor='Weis Builders' --project='The Verge at Ballpark Village'`
- Client: `services/sharepoint/client.ts` — `upload()`, `mkdir()`, `listFiles()`, `search()`, `download()`

---

## Discovering Existing Utilities

**Before creating new scripts or utilities, search the codebase for existing solutions:**

- Use `codebase_search` to find existing functions: "How to search hub database for attachments?", "How to download files from MinIO?"
- Check `apps/contract-ui/contract/db/repositories/attachment.ts` for file download utilities
- Check `apps/contract-ui/contract/db/repositories/` for database query functions
- Review `CLAUDE.md` sections for documented patterns and utilities
- Look for similar scripts in `scripts/` folder before creating new ones

**Common utilities are already documented in this file** - search for relevant sections before implementing from scratch.

## Local Data First (IMPORTANT)

**Always query local SQLite databases before calling any external API.** We have synced data from Monday, email, and other sources locally. Do NOT call MCP tools or APIs for data that already exists in these databases.

### Hub DB (`apps/contract-ui/contract/hub.db`)

The primary consolidated database containing:

- `emails` — All synced emails across mailboxes (237K+). Has `project_name`, `contractor_name` for linking.
- `attachments` — 125K+ email attachments cataloged. Has `storage_bucket`, `storage_path` for MinIO references.
- `estimates` — 4,843 estimates synced from Monday. Has `monday_item_id`, `name`, `estimate_number`, `contractor`, `bid_status`, `bid_value`, `awarded_value`, `sharepoint_url`, storage paths.
- `projects` — Projects extracted from email data. Has `monday_item_id`, `account_id`, `email_count`.
- `accounts` — Account/company records linked across systems (3,600+).
- `contacts` — Contact records synced from Monday CONTACTS board.
- `mailboxes` — Email mailbox configurations.
- `estimate_emails` — Pre-computed links between estimates and emails.

### Monday Cache (`workers/ds-estimates-sync-worker/monday/monday-cache.db`)

- Local cache of Monday board data.

### Other Local DBs

- `services/inspections/inspections.db` — Inspection records
- `services/sharepoint/swppp/swppp-master.db` — SWPPP master data
- `lib/db/app.db` — Application database (quotes, takeoffs, catalog)
- `apps/contract-ui/contract/projects/projects.db` — Contract processing project tasks

### When to use APIs vs local data

- **Search for an estimate** → query `estimates` table in hub.db
- **Find emails for a project** → query `emails` table in hub.db
- **Find attachments** → query `attachments` table in hub.db
- **Only use MCP/API** when local data is stale, missing, or you need to write/update the remote system

### Downloading Files from MinIO

All email attachments and estimate PDFs are stored in MinIO. **DO NOT** use curl, `mc` CLI, or email API to download - use the utilities in the hub.db repositories.

**Download a single attachment:**

```typescript
import { downloadAttachment, getAttachmentContent } from '@/apps/contract-ui/contract/db/repositories/attachment';

await downloadAttachment(12345, 'output/contract.pdf');

// Or get bytes without saving
const content = await getAttachmentContent(12345); // Uint8Array
```

**Get attachment info:**

```typescript
import { db } from '@/apps/contract-ui/contract/db/connection';

const attachments = db
  .query<{ id: number; name: string; storage_path: string | null }, [string]>(
    `SELECT a.id, a.name, a.storage_path
     FROM attachments a
     WHERE a.storage_path IS NOT NULL
       AND a.name LIKE ?
     ORDER BY a.id DESC
     LIMIT 20`
  )
  .all('%W-9 2026%');
```

**Search by email subject/body with attachment filename filter**:

```typescript
import { db } from '@/apps/contract-ui/contract/db/connection';

const attachments = db
  .query<{ id: number; name: string; storage_path: string | null }, [string, string, string]>(
    `SELECT DISTINCT a.id, a.name, a.storage_path
     FROM attachments a
     JOIN emails e ON a.email_id = e.id
     WHERE a.storage_path IS NOT NULL
       AND (e.subject LIKE ? OR e.body_full LIKE ?)
       AND a.name LIKE ?
     ORDER BY e.received_at DESC`
  )
  .all('%W9%', '%W9%', '%2026%');
```

**Low-level access (`lib/minio.ts`):**

- `getFile(bucket, path)` → `Uint8Array`
- `getPresignedUrl(bucket, path)` → temporary URL
- `BUCKETS.EMAIL_ATTACHMENTS`, `BUCKETS.MONDAY_ESTIMATES`

---

## OCR & Document Processing

### Gemini 3 Flash OCR (plan-analysis/)

All OCR is handled by the **plan-analysis** Python package using Gemini 3 Flash. This provides better accuracy than traditional OCR, especially for construction documents with technical drawings.

**Location:** `plan-analysis/` directory

**Basic OCR:**

```bash
cd plan-analysis/
just ocr "/path/to/document.pdf"
# Creates: /path/to/document.gemini.md
```

**With page limit (for testing):**

```bash
just ocr-limit "/path/to/document.pdf" 5
```

**Read the output:**

```bash
Read "/path/to/document.gemini.md"
```

### Agentic Vision (Detailed Inspection)

For construction plans requiring detailed analysis (counting, measuring, verification):

```python
from plan_analysis import PlanAnalyzer

analyzer = PlanAnalyzer()

# Agentic vision with zoom and code execution
result = analyzer.detailed_inspection(
    image_path="./plan.pdf",
    inspection_prompt="Count all sediment basins and measure their volume"
)

# Returns structured data:
# - inspected_areas: list of examined regions with coordinates
# - findings: detailed observations per area  
# - measurements: calculated values
# - compliance_status: pass/fail per item
```

**What agentic vision does:**

1. **Think**: Analyzes the plan and inspection prompt
2. **Act**: Generates Python code to crop/zoom specific areas
3. **Observe**: Re-analyzes cropped sections with fresh context
4. **Report**: Returns structured findings

**When to use:**

- Verifying critical values from OCR
- Counting elements (basins, inlets, structures)
- Extracting measurements from drawings
- Cross-referencing text with visual elements

### OCR Quality

**Gemini 3 Flash vs Traditional OCR:**

- **"BUILDING CODE"**: Traditional OCR reads "MILKING CODE" — Gemini 3 Flash reads correctly
- **Repeated garbage**: Traditional OCR repeats "DIMENSIONS ARE INCREASED" ×17 — Gemini 3 Flash returns clean output
- **Technical drawings**: Traditional OCR garbles — Gemini 3 Flash returns structured data
- **Measurements**: Traditional OCR misses — Gemini 3 Flash extracts with units

**All documents** (contracts, plans, drawings) should use the plan-analysis OCR.

---

## Services & APIs

### Microsoft Graph / Email (`services/email`)

#### Email CLI (USE THIS)

**ALWAYS use the CLI for email operations. Do NOT use MCP tools or `bun -e` inline scripts.**

```bash
# Location
bun services/email/cli.ts <command> [options]

# Create a draft
bun services/email/cli.ts draft \
  --to "eva@desertservices.net,jayson@desertservices.net" \
  --cc "don@desertservices.net" \
  --subject "Subject here" \
  --body '<div>HTML body here</div>' \
  --no-signature

# Search emails
bun services/email/cli.ts search "query" --user chi@desertservices.net
bun services/email/cli.ts contracts "Layton"      # Search contracts@ mailbox
bun services/email/cli.ts estimating "bid"        # Search estimating@ mailbox

# Reply to email
bun services/email/cli.ts reply-draft "search query" --body "Reply text"
bun services/email/cli.ts reply-draft-by-id <messageId> --body "Reply text"

# Send draft
bun services/email/cli.ts send-draft <draftId>

# Use template
bun services/email/cli.ts send-template dust-permit-issued \
  --to "contact@gc.com" \
  --subject "Dust Permit Issued - Project X" \
  --vars '{"recipientName":"John","projectName":"Project X"}'

# M365 Groups (InternalContracts, etc.)
bun services/email/cli.ts ic                      # List InternalContracts
bun services/email/cli.ts ic "Helen"              # Search InternalContracts
bun services/email/cli.ts groups                  # List all groups
```

**Key flags:**
- `--no-signature` — Skip auto-signature (Outlook adds it)
- `--to`, `--cc` — Comma-separated emails
- `--body` — HTML body content
- `--attachments` — Comma-separated file paths

**Full help:** `bun services/email/cli.ts --help`

#### Email Formatting (IMPORTANT)

- **MUST** use HTML (markdown renders as literal text).
- **Font**: Aptos 12pt (`<body style="font-family: 'Aptos', sans-serif; font-size: 12pt;">`).
- **Lists**: Use native `<ul>`/`<li>` or `<ol>` tags.

#### Email Census (IMPORTANT)

**NEVER filter by `is_internal`.** It's just metadata (sender is @desertservices.net), not a relevance filter. Internal emails contain forwards, contract discussions, project updates - the actual work.

```sql
-- WRONG
SELECT * FROM emails WHERE is_internal = 0;

-- RIGHT: Just query what you need
SELECT * FROM emails e JOIN mailboxes m ON e.mailbox_id = m.id
WHERE m.email = 'contracts@desertservices.net';
```

### MondayCRM (`workers/ds-estimates-sync-worker/monday/`)

#### Workspaces

There are **two workspaces both named "Desert Services"**:

- **8970676** (Main CRM) - Active workspace, synced to hub.db
  - Boards: ESTIMATING, LEADS, CONTRACTORS, CONTACTS, PROJECTS, DUST_PERMITS, INSPECTION_REPORTS, SWPPP_PLANS, INCOMING_CALLS, FIELD_OPPORTUNITIES
- **8240372** (Procurement) - **Archived**, data extracted to `scripts/procurement.db`
  - Boards: OPEN_BIDS, BIDS_SENT, CHECKLIST, DUST_PERMITS_WM, SIGNAGE, SWPPP_MASTER, INSPECTIONS_WM

See `workers/ds-estimates-sync-worker/monday/types.ts` for `WORKSPACE_IDS` and full `BOARD_IDS` reference.

#### Boards

- **Board IDs**: `ESTIMATING`, `LEADS`, `CONTRACTORS`, `CONTACTS`, `PROJECTS`, `DUST_PERMITS`, etc.
- **Methods**: `searchItems`, `getItems`, `getItem`, `createItem`, `updateItem`.
- All searches auto-paginate and exclude "Shell Estimates" and "Sales Team Estimates" by default.
- **Monday URL format**: `https://desert-services-company.monday.com/boards/{boardId}/pulses/{itemId}` — NOT `monday.com/boards/...`. The subdomain is required.
- **When marking Won**: Also mark competing estimates (same project, different GC or earlier bids) as "GC Not Awarded".

#### Efficient GraphQL Queries

For large-scale searches or batch updates, use `query_params` with `contains_text` operator:

```typescript
// Search items containing "TF" in name - much faster than fetching all
query {
  boards(ids: ${BOARD_ID}) {
    items_page(limit: 500, query_params: {
      rules: [{column_id: "name", compare_value: ["TF"], operator: contains_text}]
    }) {
      cursor
      items { id name group { title } }
    }
  }
}

// Update item name
mutation {
  change_simple_column_value(
    board_id: ${BOARD_ID}
    item_id: ${itemId}
    column_id: "name"
    value: "${escapedName}"
  ) { id }
}
```

**For detailed patterns**, see `workers/ds-estimates-sync-worker/SYNC-KNOWLEDGE.md` which documents:

- Cursor-based pagination with filtering
- Standard item name prefixes (TF, PJ, CFS, MISC, etc.)
- Board relation vs mirror column handling
- Retry logic for API flakiness

#### Hub.db Sync CLI (CRITICAL)

**Location:** `workers/ds-estimates-sync-worker/cli/`

**The hub CLI is part of the estimates sync worker package.** It syncs Monday boards to hub.db using the Monday service client. This is a LOCAL CLI tool (not the Worker).

```bash
cd workers/ds-estimates-sync-worker

# Sync Monday → hub.db (READ-ONLY from Monday)
bun cli/hub.ts sync contacts      # CONTACTS board → contacts table
bun cli/hub.ts sync contractors   # CONTRACTORS board → accounts table
bun cli/hub.ts sync estimates     # ESTIMATING board → estimates table
bun cli/hub.ts sync all           # All boards

bun cli/hub.ts stats              # Show current counts

# Create/update (writes to BOTH hub.db AND Monday)
bun cli/hub.ts create account --name="Company" --domain=company.com --type=contractor
bun cli/hub.ts update contact <id> --email=x@y.com --mobile=5551234 --push
bun cli/hub.ts move contact <id> --group=ACTIVE
bun cli/hub.ts link contact <id> --account=<account_id>
```

**Note:** This uses `workers/ds-estimates-sync-worker/monday/client.ts` for Monday API calls, NOT the Worker's inline fetch.

**API settings that MUST be followed (PAGE_SIZE = 100):**

```typescript
// In workers/ds-estimates-sync-worker/monday/client.ts
const PAGE_SIZE = 100;    // NOT 500 - larger sizes cause timeouts
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;
```

**Hub.db location:** `apps/contract-ui/contract/hub.db`

**CRITICAL: Local changes MUST sync to Monday.** Hub.db is a local cache - any create/update must also happen in Monday:
- Creating an account locally → also create in Monday CONTRACTORS board via MCP
- Updating a contact → use `--push` flag to sync to Monday
- Moving a contact to a group → CLI automatically updates Monday

**Creating accounts in Monday:**
```bash
# Create account via CLI (preferred)
bun workers/ds-estimates-sync-worker/cli/hub.ts create account --name="Company Name" --domain=domain.com

# Then update local hub.db with the Monday ID
sqlite3 apps/contract-ui/contract/hub.db "UPDATE accounts SET monday_account_id = 'MONDAY_ID' WHERE id = LOCAL_ID;"
```

**Tables:**
- `contacts` — synced from CONTACTS board, has `group_id`, `group_title`, `account_id`, phone fields (`mobile_phone`, `office_phone`, `company_phone`, `company_fax`)
- `accounts` — synced from CONTRACTORS board + email-derived companies
- `estimates` — synced from ESTIMATING board, preserves local enrichments (project_id, storage paths)

**Contact management:**

```bash
# Update contact and push to Monday
bun cli/hub.ts update contact <id> --email=x@y.com --push

# Move contact to a group
bun cli/hub.ts move contact <id> --group=MARKETING
```

**Valid groups for move:** `ACTIVE`, `OPEN_BIDS`, `BIDS_SENT`, `SWPPP`, `PERSONAL_EMAIL`, `INSUFFICIENT_INFO`, `MARKETING`

**Looking up new groups:** If a new group is added in Monday and not in the CLI, use the Monday MCP to get the group ID, then add it to `CONTACT_GROUPS` in `workers/ds-estimates-sync-worker/cli/hub.ts`:

```bash
# Query board structure via Monday API directly
# See workers/ds-estimates-sync-worker/SYNC-KNOWLEDGE.md for examples
```

**Contact Enrichment Workflow:**

When enriching contacts, the goal is to **extract and record all useful information**, not just categorize:

1. **Search email** (MCP or hub.db) by contact name or email domain
2. **Extract from signatures:** title, phone, mobile, company name, ROC# (contractor license)
3. **Update the contact** with all found info using CLI with `--push`
4. **Add notes** to `contractor_search_notes` documenting what was found
5. **Create account** in BOTH hub.db AND Monday if new company discovered
6. **Link contact** to account via `account_id`

```bash
# Update contact with extracted info
bun cli/hub.ts update contact <id> --email=x@y.com --mobile=4805551234 --title="Project Manager" --push

# Add notes to local DB
sqlite3 apps/contract-ui/contract/hub.db "UPDATE contacts SET contractor_search_notes = 'Company Name - type. Customer for X service. Found via email signature.' WHERE id = ID;"
```

Use the `contact-enricher` subagent (`.claude/agents/contact-enricher.md`) for batch enrichment.

**Linking contacts to contractors:** Contacts have `account_id` (FK to accounts table) to link them to a contractor. To find unlinked contacts:

```sql
-- Contacts without a contractor
SELECT id, name, email, group_title
FROM contacts
WHERE account_id IS NULL OR account_id = '';

-- Contacts with email that could be auto-linked by domain
SELECT c.id, c.name, c.email, a.id as account_id, a.name as contractor
FROM contacts c
JOIN accounts a ON LOWER(SUBSTR(c.email, INSTR(c.email, '@') + 1)) = LOWER(a.domain)
WHERE (c.account_id IS NULL OR c.account_id = '')
  AND c.email IS NOT NULL;
```

## Workers Architecture (IMPORTANT)

The `workers/` folder contains **hybrid packages** - each worker is both a Cloudflare Worker AND a local CLI toolkit. This is intentional and critical to understand.

### Pattern: Worker + CLI

Each worker package follows this structure:

```text
workers/ds-{name}/
├── src/index.ts           # Cloudflare Worker entry point
├── wrangler.toml          # Worker deployment config
├── package.json           # Scripts for both Worker and CLI
│
├── cli/                   # LOCAL CLI tools (Bun, NOT Worker)
│   └── *.ts               # Run with: bun cli/xxx.ts
│
├── scripts/               # LOCAL utility scripts (some workers)
│   └── *.ts               # Run with: bun scripts/xxx.ts
│
└── *.ts                   # Standalone CLI scripts at root
```

### Critical Distinction

| Aspect | Cloudflare Worker | Local CLI |
|--------|-------------------|-----------|
| **Runtime** | Cloudflare's edge network | Your local machine (Bun) |
| **Trigger** | HTTP requests, Cron schedules | Manual command line |
| **Monday API** | Raw `fetch()` (inline) | Imports `monday/client` (local to worker) |
| **SharePoint** | Raw `fetch()` to Graph API | `@microsoft/microsoft-graph-client` SDK |
| **Database** | None (stateless) | Direct SQLite access to hub.db |
| **Use case** | Automated background tasks | Manual operations, debugging, one-offs |

### The Workers

#### 1. ds-estimates-sync-worker
**Most complex - has BOTH Worker AND extensive CLI**

**Worker (`src/index.ts`):**
- Runs hourly via Cron
- Syncs Monday estimates → SharePoint folders
- Creates/moves folders based on bid status
- Downloads files from Monday, uploads to SharePoint
- Has its own inline Monday client (raw fetch)

**CLI (`cli/` and root-level scripts):**
```bash
cd workers/ds-estimates-sync-worker

# Hub CLI - Monday → hub.db sync (uses local monday/)
bun cli/hub.ts sync contacts      # Sync CONTACTS board
bun cli/hub.ts sync contractors   # Sync CONTRACTORS board
bun cli/hub.ts sync estimates     # Sync ESTIMATING board
bun cli/hub.ts sync all           # All boards
bun cli/hub.ts stats              # Show counts
bun cli/hub.ts create account --name="XYZ" --domain=xyz.com
bun cli/hub.ts update contact <id> --email=x@y.com --push
bun cli/hub.ts move contact <id> --group=ACTIVE

# SharePoint sync (standalone script)
bun sync-estimates.ts --dry-run
bun sync-estimates.ts --limit=100
```

**Key Files:**
- `cli/hub.ts` - Main hub CLI (imports from `../monday/`)
- `cli/sync/*.ts` - Individual board sync modules
- `sync-estimates.ts` - SharePoint sync script
- `SYNC-KNOWLEDGE.md` - Critical API patterns and gotchas

#### 2. ds-inspections-email-worker
**Worker + Scripts**

**Worker (`src/index.ts`):**
- Receives forwarded inspection emails
- Parses PDF attachments
- (Likely syncs to somewhere - check implementation)

**Scripts (`scripts/`):**
```bash
cd workers/ds-inspections-email-worker
bun scripts/check-inspection.ts     # Check inspection status
bun scripts/manual-upload.ts        # Manual PDF upload
```

**Also has:** `sharepoint-inspections-folders-sync/` - Separate folder sync tool

#### 3. ds-contracts-dispatcher
**Worker ONLY** (no CLI)

- Receives emails at `contracts-dispatch@desertservices.app`
- Classifies contract-related emails
- Triggers DocuSign link finding
- Simple worker, no local CLI needed

#### 4. ds-monday-status-sync-worker
**Worker ONLY** (no CLI)

- Syncs Monday item status changes
- Likely updates external systems based on status

### Common Confusion

**Mistake:** "The estimates sync worker replaces the Monday service"

**Reality:** 
- The **Worker** (`src/index.ts`) does automated SharePoint syncing (runs hourly)
- The **CLI** (`cli/`) does Monday → hub.db syncing (run manually)
- They share a folder but do different things
- The CLI heavily depends on `monday/client` (now inside worker)

**Mistake:** "I can use the Graph SDK in the Worker"

**Reality:**
- Workers use raw `fetch()` to Microsoft Graph
- CLI scripts use `@microsoft/microsoft-graph-client` SDK
- Different auth mechanisms (Worker env vs local Azure credentials)

### When to Use What

**Use the Worker when:**
- You want automated background syncing
- You need it to run on a schedule (cron)
- You're deploying, not debugging

**Use the CLI when:**
- You need to manually trigger a sync
- You're debugging why something didn't sync
- You need to backfill or fix data
- You want to preview changes (--dry-run)

### Environment Variables

**Workers** use `.dev.vars` + Wrangler secrets:
```bash
wrangler secret put MONDAY_API_KEY
```

**CLI scripts** use `.env` file or local environment:
```bash
export MONDAY_API_KEY=xxx
bun cli/hub.ts sync estimates
```

### TypeScript Configs

Workers have TWO tsconfigs because of the dual runtime:
- `tsconfig.json` - Worker (Cloudflare Workers types)
- `tsconfig.cli.json` - CLI (Bun types)

---

### SharePoint (`services/sharepoint`)

- `listFiles(path)`, `search(query)`, `download(path)`, `upload(path, name, buffer)`.

### PDF Triage & Generation

- **Triage**: `triageDocument(path)` classifies PDFs (SWPPP, Dust, etc.).
- **Generation**: `lib/pdf/generate.ts` (App) and `apps/quoting/pdf.ts` (MCP Server).

---

## n8n & Automation Conventions

- **Authorization Headers**: Use raw expression `={{ $json.access_token }}`. Do NOT manually prepend "Bearer ".
- **Workflow Updates**: Payload must include exactly `name`, `nodes`, `connections`, and `settings`.
- **Credential IDs**: Use the `id` field (e.g., `58WyX3gCRVkPPHjm`), not just the name.

---

## Testing (AAA Pattern)

Use `bun test`. All tests follow **Arrange-Act-Assert** with cleanup.

### Test Types

- **Unit tests** (`*.unit.test.ts`): Mocked logic, no credentials needed.
- **Integration tests** (`*.integration.test.ts`): Real API calls, requires `.env`.

### Integration Testing Safety

1. Create test resources with `_TEST_DELETE_ME_` prefix.
2. Perform operations on test resources only.
3. **Always** clean up in `afterAll`.

```typescript
describe("resource", () => {
  const ids: string[] = [];
  afterAll(async () => { for (const id of ids) await client.delete(id); });
  it("lifecycle", async () => {
    const res = await client.create({ name: "_TEST_DELETE_ME_" });
    ids.push(res.id);
    expect(res.id).toBeDefined();
  });
});
```

---

## Gemini Model Usage (IMPORTANT)

Always use current model IDs. Outdated models will be blocked by a pre-tool hook.

- `gemini-3-pro-preview` (Latest, most intelligent)
- `gemini-3-flash-preview` (Latest, balanced)
- `gemini-2.5-pro` (Advanced thinking)
- `gemini-2.5-flash` (Stable, performant)

**NEVER use**: `gemini-1.5-*`, `gemini-1.0-*`, `gemini-pro`, `gemini-ultra`.

---

## Email-to-Project Linking (Domain Knowledge)

This section describes how emails relate to projects and estimates at Desert Services. This knowledge is critical for associating emails with the correct projects.

### Project vs Estimate vs Folder

- **Estimate**: A bid sent to a contractor for a specific scope | Source: Monday.com ESTIMATING board
- **Project**: A grouping of estimates for the same job site | Source: Derived from estimate names
- **Folder**: Chi's manual organization of emails by project | Source: Outlook `Projects/Active/`

Multiple estimates can belong to one project (e.g., different contractors bidding, or TF vs EC services).

### Estimate Name Patterns

Estimates follow naming conventions that indicate service lines:

- `TF: PROJECT NAME` — Temp Fence estimate
- `PT: PROJECT NAME` — Porta-Potty estimate  
- `EC: PROJECT NAME` — Erosion Control estimate
- `PROJECT NAME` (no prefix) — Standard SWPPP/Dust estimate

**These prefixes should be stripped when matching to projects.** "TF: MODERA PV" and "MODERA PV" are the same project.

### Contractor Domain Linking

The most reliable way to link emails to projects:

1. **Each estimate has a contractor** (e.g., "BPR Companies")
2. **Each contractor has a domain** (e.g., "bprcompanies.com")
3. **Emails from/to that domain relate to that contractor's estimates**

```sql
-- Find contractor for a project
SELECT e.contractor, a.domain
FROM estimates e
JOIN accounts a ON LOWER(a.name) LIKE '%' || LOWER(SUBSTR(e.contractor, 1, 10)) || '%'
WHERE e.name LIKE '%MODERA%';
```

### Conversation Threading

Emails in the same conversation share a `conversation_id`. If one email is linked to a project, all emails in that conversation should be linked.

```sql
-- Expand links via conversation threads
UPDATE emails SET project_id = ?
WHERE conversation_id IN (
  SELECT conversation_id FROM emails WHERE project_id = ?
) AND project_id IS NULL;
```

### Folder Emails as Ground Truth

Chi's Outlook folders (`Projects/Active/`) are manually curated. Emails in a folder ARE definitively linked to that project. Link by `internet_message_id` (RFC 2822 ID), not Graph's internal `message_id`.

```sql
-- Match folder email to DB email
SELECT * FROM emails WHERE internet_message_id = ?;
```

### Common Matching Mistakes

**DO NOT** text-search project names against email content. This causes massive false positives:

- "Good 2 Go" matches any email with "good" or "go"
- "Project N" matches any email with "project"
- "Indian School" matches other schools, not just Goldwater

**DO** use:

1. Folder emails (ground truth)
2. Contractor domain matching
3. Conversation thread expansion
4. Manual verification for ambiguous cases

### Aliases

When folder names don't exactly match estimate names, add an alias:

```sql
INSERT INTO project_aliases (project_id, alias, normalized_alias, source)
VALUES (?, ?, ?, 'outlook_folder');
```

Example: Folder "Elanto at Prasada" → Estimate "PRASADA CLUBHOUSE"

---

## Dust Permit Billing (Internal Workflow)

When a dust permit is submitted and paid, send an internal billing notification to the billing team. This is NOT a customer-facing email.

### Recipients

- **TO:** eva@desertservices.net, jayson@desertservices.net
- **CC:** don@desertservices.net, francine@desertservices.net, kendra@desertservices.net

### Subject Format

`Dust Permit Billing - {PROJECT NAME}`

Do NOT include contractor name in parentheses. Just the project name.

### Data Sources

1. **Point and Pay confirmation email** — Payment date, confirmation ID, card last 4, cardholder, permit cost
2. **Permit application/issued email** — Application #, Facility ID, site address, acreage
3. **Monday ESTIMATING board** — Schedule value (from awarded estimate)
4. **Notion Dust Permits** — Project details, accelerated processing status

### Schedule Values (Dust Permits)

Standard pricing from catalog:
- **Standard dust permit:** $5,000
- **Accelerated processing fee:** $500 (when applicable)
- **Revision/renewal:** $2,500

### HTML Formatting Rules (CRITICAL)

See `.claude/skills/draft-email/html-reference.md` for full reference. Key rules:

- **Use `<b>` not `<strong>`** — Outlook renders differently
- **Use plain `<ul>` with NO style attribute** — Outlook's native margins work correctly
- **Do NOT add `<div><br></div>` before/after lists** — Creates double spacing
- **Do NOT use `<p>` tags** — Outlook double-spaces them
- **Signature is added by Outlook** — Use `skipSignature: true` when creating drafts

**Correct list pattern:**
```html
<div>Intro text.</div>
<ul>
<li><div><b>Label:</b> Value</div></li>
</ul>
<div>Closing text.</div>
```

**WRONG patterns:**
- `<ul style="margin-top:0; margin-bottom:0">` — removes all spacing
- `<div><br></div>` before/after `<ul>` — double spacing
- `<strong>Label:</strong>` — use `<b>` instead

### Template

The billing template is at `services/email/email-templates/dust-permit-billing.hbs`. Variables:
- `recipientName`, `accountName`, `projectName`, `address`
- `applicationNumber`, `permitNumber` (Facility ID), `acceleratedProcessing`
- `vendorName`, `permitCost`, `acceleratedFee` (optional), `scheduleValue`
- `paymentMethod`, `paymentDate`, `confirmationId`, `cardLastFour`, `cardholderName`
- `invoiceNumber`, `invoiceDate`

### Example Workflow

1. Find Point and Pay confirmation in chi@ inbox (search "Point and Pay" or "Maricopa County")
2. Extract: payment date, confirmation #, card last 4, cardholder, amount
3. Find permit application/issued email for project details
4. Look up schedule value in Monday (awarded estimate value)
5. Create draft using template or MCP `create_draft` tool
6. Review in Outlook, then send

---

## Estimate Email History (Pre-computed)

**IMPORTANT:** Before manually searching for estimate emails, check the pre-computed `estimate_emails` table first.

### Quick Query

```sql
-- Get emails for an estimate
SELECT e.subject, e.from_email, e.received_at, ee.match_type
FROM estimate_emails ee
JOIN emails e ON e.id = ee.email_id
WHERE ee.estimate_id = (SELECT id FROM estimates WHERE estimate_number = 'EST-12345')
ORDER BY e.received_at DESC;
```

### Coverage Stats (Feb 2026)

- Building Connected: 70%
- PlanHub: 39%
- Email/Direct/Same Day: 25-30%

1,236 of 4,781 estimates have pre-computed email links.

### If estimate_emails is empty

1. **Run manual research** - search emails by contractor domain + project name tokens
2. **Link using repository**: `apps/contract-ui/contract/db/repositories/estimate-email.ts`
   - `linkEmailToEstimate(estimateId, emailId, "manual", "agent research")`
   - `findEstimate("search")` - find by estimate_number or name
   - `getEstimateEmails(estimateId)` - get all linked emails

### Re-sync all estimate emails

```bash
bun apps/contract-ui/contract/db/sync/estimate-emails.ts
```

Takes ~1 min. Matches by contractor + name tokens, expands via threads.
