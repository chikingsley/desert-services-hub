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
- **Database**: SQLite (`better-sqlite3` for app, `bun:sqlite` for scripts)
- **Linting/Formatting**: Biome (via Ultracite)

## Tooling & Runtime
Default to using **Bun** instead of Node.js.
- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun run dev` for Next.js development
- Use `bun install` for dependency management
- Use `bunx <package> <command>` instead of `npx`
- Bun automatically loads `.env`, so don't use `dotenv`

### Inline Scripts with `bun -e`
For quick one-off queries, use `bun -e` instead of creating temporary script files:
```bash
# Query Monday board
bun -e "import { searchItems } from './services/monday/client'; console.log(await searchItems('7943937855', 'SearchTerm'))"
```
**Shell gotcha**: avoid `!` in inline scripts (interprets as history expansion). Use `myBool === false` instead of `!myBool`.

---

## Code Organization & Standards

### NO TABLES. EVER.
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

### MondayCRM (`services/monday`)
- **Board IDs**: `ESTIMATING`, `LEADS`, `CONTRACTORS`, `CONTACTS`, `PROJECTS`, `DUST_PERMITS`, etc.
- **Methods**: `searchItems`, `getItems`, `getItem`, `createItem`, `updateItem`.
- All searches auto-paginate and exclude "Shell Estimates" by default.

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
