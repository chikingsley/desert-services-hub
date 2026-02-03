---
description: Project-wide conventions for Desert Services Hub (Next.js, Bun, services, standards)
alwaysApply: true
---

# Desert Services Hub

This is the unified repository for the Desert Services ecosystem, combining the Next.js web application and the core automation services.

## Core Tech Stack

- **Runtime**: Bun
- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS
- **Database**: SQLite via `bun:sqlite` (Bun's built-in driver)
- **Linting/Formatting**: Biome (via Ultracite)

## Tooling & Runtime

Default to using **Bun** instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun run dev` for Next.js development
- Use `bun install` for dependency management
- Use `bunx <package> <command>` instead of `npx`
- Bun automatically loads `.env`, so don't use `dotenv`

### Running Scripts

Prefer running actual `.ts` files with `bun` for type safety:

```bash
bun services/contract/census/sync/all.ts
```

For quick one-offs where no script exists, `bun -e` is acceptable:

```bash
bun -e "import { searchItems } from './services/monday/client'; console.log(await searchItems('7943937855', 'SearchTerm'))"
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
sqlite3 services/contract/census/census.db
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

The primary work right now is processing contracts through the intake pipeline. The full workflow is defined in `.planning/PROJECT.md`. Project state is in `.planning/STATE.md`. Read both at the start of any contract-related session.

### What's Happening Right Now

We are manually processing ~25 projects. Some are new intake, some are already active. **READ THE EMAILS FIRST** before applying any checklist. The emails tell you what stage the project is actually in. Don't assume intake — check the timeline, check what's already happening.

For new contracts going through intake, see `.planning/PROJECT.md`. For active projects, document current state from emails instead. Each project needs:

1. Research project (search census DB locally — emails, estimates, attachments)
2. Find estimate in Monday (query `estimates` table in census.db — DO NOT call Monday API)
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
- **Read `.planning/PROJECT.md` and `.planning/STATE.md`** at the start of contract work sessions
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

- Use `codebase_search` to find existing functions: "How to search census database for attachments?", "How to download files from MinIO?"
- Check `services/contract/census/files.ts` for file download utilities
- Check `services/contract/census/db.ts` for database query functions
- Review `CLAUDE.md` sections for documented patterns and utilities
- Look for similar scripts in `scripts/` folder before creating new ones

**Common utilities are already documented in this file** - search for relevant sections before implementing from scratch.

## Local Data First (IMPORTANT)

**Always query local SQLite databases before calling any external API.** We have synced data from Monday, email, and other sources locally. Do NOT call MCP tools or APIs for data that already exists in these databases.

### Census DB (`services/contract/census/census.db`)

- `emails` — All synced emails across mailboxes. Has `project_name`, `contractor_name` for linking.
- `attachments` — 20k+ email attachments cataloged. Has `storage_bucket`, `storage_path` for MinIO references.
- `estimates` — 4,749 estimates synced from Monday. Has `monday_item_id`, `name`, `estimate_number`, `contractor`, `bid_status`, `bid_value`, `awarded_value`, `sharepoint_url`, storage paths.
- `projects` — Projects extracted from email data. Has `monday_item_id`, `account_id`, `email_count`.
- `accounts` — Account/company records linked across systems.
- `mailboxes` — Email mailbox configurations.

### Monday Cache (`services/monday/monday-cache.db`)

- Local cache of Monday board data.

### Other Local DBs

- `services/inspections/inspections.db` — Inspection records
- `services/sharepoint/swppp/swppp-master.db` — SWPPP master data
- `lib/db/app.db` — Application database (quotes, takeoffs, catalog)

### When to use APIs vs local data

- **Search for an estimate** → query `estimates` table in census.db
- **Find emails for a project** → query `emails` table in census.db
- **Find attachments** → query `attachments` table in census.db
- **Only use MCP/API** when local data is stale, missing, or you need to write/update the remote system

### Downloading Files from MinIO

All email attachments and estimate PDFs are stored in MinIO. **DO NOT** use curl, `mc` CLI, or email API to download - use the utilities in `services/contract/census/files.ts`.

**Download a single attachment:**

```typescript
import { downloadAttachment } from '@/services/contract/census/files';

await downloadAttachment(12345, 'output/contract.pdf');
```

**Download all attachments for a project:**

```typescript
import { downloadProjectFiles } from '@/services/contract/census/files';

const files = await downloadProjectFiles(
  'Elanto at Prasada',
  'services/contract/ground-truth/elanto/'
);
// Returns: ['services/contract/ground-truth/elanto/Contract.pdf', ...]
```

**Get file content without saving:**

```typescript
import { getAttachmentContent } from '@/services/contract/census/files';

const content = await getAttachmentContent(12345); // Uint8Array
```

**Available utilities (`services/contract/census/files.ts`):**

- `downloadAttachment(id, outputPath)` — Download single file by attachment ID
- `downloadProjectFiles(searchTerm, folder)` — Download all PDFs matching search (searches by email subject/project/contractor, not filename)
- `downloadAttachmentsToFolder(ids[], folder)` — Download specific attachments
- `getAttachmentContent(id)` — Get file bytes without saving
- `downloadFromStoragePath(path, outputPath)` — Download using raw storage path

**Low-level access (`lib/minio.ts`):**

- `getFile(bucket, path)` → `Uint8Array`
- `getPresignedUrl(bucket, path)` → temporary URL
- `BUCKETS.EMAIL_ATTACHMENTS`, `BUCKETS.MONDAY_ESTIMATES`

### Searching Census Database for Attachments

**Search by email subject/project/contractor** (uses `searchAttachments` from `db.ts`):

```typescript
import { searchAttachments } from '@/services/contract/census/db';

const attachments = searchAttachments('Elanto at Prasada');
// Searches email subject, project_name, contractor_name - NOT attachment filename
```

**Search by attachment filename** (direct DB query):

```typescript
import { db } from '@/services/contract/census/db/connection';

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
import { db } from '@/services/contract/census/db/connection';

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

**Note**: `searchAttachments()` searches by email metadata (subject/project/contractor), not attachment filenames. For filename searches, query the database directly as shown above.

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

| Issue | Traditional OCR | Gemini 3 Flash |
|-------|----------------|----------------|
| "BUILDING CODE" | "MILKING CODE" | ✓ Correct |
| Repeated garbage | "DIMENSIONS ARE INCREASED" ×17 | ✓ Clean output |
| Technical drawings | Garbled | ✓ Structured data |
| Measurements | Missed | ✓ Extracted with units |

**All documents** (contracts, plans, drawings) should use the plan-analysis OCR.

---

## Services & APIs

### Microsoft Graph / Email (`services/email`)

#### Client Usage

```typescript
import { GraphEmailClient } from './services/email/client';
const email = new GraphEmailClient({ azureTenantId, azureClientId, azureClientSecret });
email.initAppAuth(); // Use initUserAuth() for delegated access

await email.searchEmails({ query: 'invoice', userId: 'user@domain.com' });
await email.sendEmail({ to: [...], subject: '...', body: '<div>HTML</div>', bodyType: 'html' });
```

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

### MondayCRM (`services/monday`)

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

### SharePoint (`services/sharepoint`)

- `listFiles(path)`, `search(query)`, `download(path)`, `upload(path, name, buffer)`.

### PDF Triage & Generation

- **Triage**: `triageDocument(path)` classifies PDFs (SWPPP, Dust, etc.).
- **Generation**: `lib/pdf/generate.ts` (App) and `services/quoting/pdf.ts` (Advanced/BackPage).

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

| Concept | Definition | Source |
|---------|------------|--------|
| **Estimate** | A bid sent to a contractor for a specific scope | Monday.com ESTIMATING board |
| **Project** | A grouping of estimates for the same job site | Derived from estimate names |
| **Folder** | Chi's manual organization of emails by project | Outlook `Projects/Active/` |

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

| Source | Coverage |
|--------|----------|
| Building Connected | 70% |
| PlanHub | 39% |
| Email/Direct/Same Day | 25-30% |

1,236 of 4,781 estimates have pre-computed email links.

### If estimate_emails is empty

1. **Run manual research** - search emails by contractor domain + project name tokens
2. **Link using repository**: `services/contract/census/db/repositories/estimate-email.ts`
   - `linkEmailToEstimate(estimateId, emailId, "manual", "agent research")`
   - `findEstimate("search")` - find by estimate_number or name
   - `getEstimateEmails(estimateId)` - get all linked emails

### Re-sync all estimate emails

```bash
bun services/contract/census/sync/estimate-emails.ts
```

Takes ~1 min. Matches by contractor + name tokens, expands via threads.
