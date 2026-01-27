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
bun services/email/census/extract-attachments.ts --limit=10
```

For quick one-offs where no script exists, `bun -e` is acceptable:

```bash
bun -e "import { searchItems } from './services/monday/client'; console.log(await searchItems('7943937855', 'SearchTerm'))"
```

**Shell gotcha**: avoid `!` in inline scripts (interprets as history expansion). Use `myBool === false` instead of `!myBool`.

### Querying SQLite Databases

For ad-hoc queries, use `sqlite3` CLI directly (no Bun overhead):

```bash
sqlite3 services/email/census/census.db
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

For new contracts going through intake, use the 18-step checklist in PROJECT.md. For active projects, document current state from emails instead. Each project needs:

1. Research project (search census DB locally — emails, estimates, attachments)
2. Find estimate in Monday (query `estimates` table in census.db — DO NOT call Monday API)
3. Create/update Notion project page (database ID: `2f5c1835-5bb2-8062-a2a9-c37dd689454e`)
4. Mark Won in Monday, mark competing lost
5. Get estimate PDF + contract PDF
6. Extract contract data
7. Verify insurance
8. Reconcile contract vs estimate
9. Award value in Monday
10. SharePoint folder setup (new pattern — old folders are gone)
11. Finalize Notion page
12. Internal email to internalcontracts@ group
13. Track open items
14. Start dust permit / order SWPPP if applicable

### Notion Projects Database

- Database ID: `2f5c1835-5bb2-8062-a2a9-c37dd689454e`
- Data source: `2f5c1835-5bb2-80b5-99b4-000bc3de5e73`
- Properties: Project name (title), Account (text), Stage (select), Owner (people), Dates (date), Files (file)
- Stage options: Intake, Reconciling, Issues Sent to Customer, Ready to Sign, Waiting on Signature, Signed - Notify Team, Active Project, Done, Canceled

### Key Rules

- **All project files must end up in SharePoint** — cataloging in MinIO is not enough
- **Use the file naming convention** from `services/sharepoint/paths.ts`
- **Link everything with census `notion_project_id`** — emails, attachments tied to Notion project pages
- **Contracts may not be in email** — check DocuSign, Procore, internal contracts group, shared drives
- **Read `.planning/PROJECT.md` and `.planning/STATE.md`** at the start of contract work sessions
- **No `bun -e` for workflows** — write durable `.ts` scripts in the repo that can be run repeatedly and improved over time. Only use `bun -e` for one-off queries if you ask first. Workflows must be files, not inline scripts.
- **READ THE EMAILS before making any determination** — don't just search subjects/metadata. Read `body_preview` for every email on a project to understand what's actually happening before writing anything to Notion or making status calls.

### SharePoint Structure

- Root: `Customer Projects/`
- Status folders: `Active/`, `Finished/`, `Lost/`, `Submitted/`
- Alpha subfolders by **contractor** first letter: `Active/W/`, `Active/M/`, etc.
- Contractor folders: `Active/W/Weis Builders/`
- Project folders inside contractor: `Active/W/Weis Builders/The Verge at Ballpark Village/`
- Subfolders per project: `01-Estimates`, `02-Contracts`, `03-Permits`, `04-SWPPP`, `05-Inspections`, `06-Billing`, `07-Closeout`
- **Full path**: `Customer Projects/Active/{Letter}/{Contractor}/{Project}/{Subfolder}/`
- Sync script: `bun services/sharepoint/sync-project-files.ts --notion-id=<id> --contractor='Weis Builders' --project='The Verge at Ballpark Village'`
- Client: `services/sharepoint/client.ts` — `upload()`, `mkdir()`, `listFiles()`, `search()`, `download()`

---

## Local Data First (IMPORTANT)

**Always query local SQLite databases before calling any external API.** We have synced data from Monday, email, and other sources locally. Do NOT call MCP tools or APIs for data that already exists in these databases.

### Census DB (`services/email/census/census.db`)

- `emails` — All synced emails across mailboxes. Has `notion_project_id`, `project_name`, `contractor_name` for linking.
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
- All searches auto-paginate and exclude "Shell Estimates" by default.
- **Monday URL format**: `https://desert-services-company.monday.com/boards/{boardId}/pulses/{itemId}` — NOT `monday.com/boards/...`. The subdomain is required.
- **When marking Won**: Also mark competing estimates (same project, different GC or earlier bids) as "GC Not Awarded".

### Notion Integration (`services/notion`)

- **Dedupe helpers**: `findOrCreateByTitle`, `findOrCreateByEmail`, `checkForDuplicates`.
- **Status Limitation**: Notion API only accepts default statuses.
  - **Workaround**: Use "Not Started" and put the actual status in "Next Steps" (e.g., "WAITING ON RESPONSE - ...").

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
