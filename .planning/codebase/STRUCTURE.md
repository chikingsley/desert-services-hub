# Codebase Structure

**Analysis Date:** 2026-01-22

## Directory Layout

```text
```

## Directory Purposes

**src/:**

- Purpose: All application code
- Contains: Server, API handlers, frontend React app
- Key files: `server.ts` (Bun entry), `frontend/main.tsx` (React entry)

**src/api/:**

- Purpose: RESTful HTTP request handlers
- Contains: Request processing, database queries, response formatting
- Key files: `quotes.ts`, `quotes-by-id.ts`, `takeoffs.ts`, `quotes.test.ts`

**src/frontend/:**

- Purpose: React Single Page Application
- Contains: Router, pages, components, styling
- Key files: `App.tsx` (router), `main.tsx` (entry), `pages/*.tsx` (route components)

**src/frontend/components/:**

- Purpose: Reusable UI building blocks
- Contains: shadcn/ui primitives in `ui/` subdirectory, domain components in feature subdirs
- Key files: `ui/button.tsx`, `quotes/quote-workspace.tsx`, `takeoffs/takeoff-viewer.tsx`

**src/frontend/pages/:**

- Purpose: Full-page components that map to routes
- Contains: Components that use React Router loaders to fetch data
- Pattern: Each file exports a page component and a loader function

**lib/:**

- Purpose: Shared business logic and utilities
- Contains: Database layer, PDF generation, type definitions, helper functions
- Key files: `db/index.ts` (database), `types.ts` (domain types), `utils.ts` (helpers)

**lib/db/:**

- Purpose: SQLite database abstraction
- Contains: Database instance singleton, schema creation, exported `db` object
- Key files: `index.ts` (single file with all schema)

**lib/pdf/:**

- Purpose: PDF document generation
- Contains: pdfmake document structure builders, pdf-lib concatenation
- Key files: `pdf-builder.ts` (document definitions), `generate-pdf.ts` (API)

**lib/pdf-takeoff/:**

- Purpose: PDF annotation library for measurement tools
- Contains: Annotation data structures, measurement calculations, shape utilities
- Key files: `index.ts`, `measurements.ts`

**lib/schemas/:**

- Purpose: Zod validation schemas for input validation
- Contains: Reusable schema definitions
- Key files: `manual-inputs.ts`

**services/:**

- Purpose: External service integrations and business logic
- Contains: Client libraries, MCP servers, workflow orchestration
- Key directories: `email/` (Graph), `monday/` (CRM), `notion/` (docs), `quoting/` (pricing)

**tests/:**

- Purpose: Unit and integration tests
- Contains: Test files co-located by domain
- Pattern: Files matching `*.test.ts` or `*.spec.ts`

**public/:**

- Purpose: Static assets served directly by Bun
- Contains: Images, logos, test files
- Key files: `logo.png` (used in PDF generation)

**scripts/:**

- Purpose: One-off utility scripts and data migrations
- Contains: Non-production code for maintenance
- Key files: `test-pdf-gen.ts` (PDF testing)

**.planning/codebase/:**

- Purpose: GSD mapping documents
- Contains: This file and other architecture/quality docs

## Key File Locations

**Entry Points:**

- `src/server.ts`: Bun server main entry (initializes routes, starts listening)
- `src/frontend/main.tsx`: React app entry (mounts to DOM, creates router)
- `src/frontend/index.html`: HTML shell served by Bun

**Configuration:**

- `tsconfig.json`: TypeScript configuration, path aliases (@/* → project root)
- `biome.jsonc`: Ultracite/Biome linting and formatting rules
- `package.json`: Dependencies and build scripts
- `lib/db/index.ts`: Database schema and initialization

**Core Logic:**

- `lib/types.ts`: All TypeScript interfaces (Quote, Takeoff, Catalog, etc.)
- `lib/db/index.ts`: SQLite schema, all table definitions
- `lib/pdf/pdf-builder.ts`: PDF document structure (26KB, most complex file)
- `lib/utils.ts`: Helper functions (cn, formatCurrency, formatDate, etc.)

**Quotes Domain:**

- `src/api/quotes.ts`: Create quote, list quotes
- `src/api/quotes-by-id.ts`: Get/update/delete quote, duplicate, generate PDF
- `src/frontend/pages/quote-editor.tsx`: Quote editor UI
- `src/frontend/components/quotes/quote-workspace.tsx`: Main editing component

**Takeoffs Domain:**

- `src/api/takeoffs.ts`: Create takeoff, list takeoffs
- `src/api/takeoffs-by-id.ts`: Get/update/delete takeoff
- `src/frontend/pages/takeoff-editor.tsx`: PDF viewer and annotation UI
- `src/frontend/components/takeoffs/takeoff-viewer.tsx`: PDF canvas

**Catalog:**

- `src/api/catalog.ts`: Fetch catalog hierarchy
- `src/frontend/pages/catalog.tsx`: Catalog management UI

**Testing:**

- `src/api/quotes.test.ts`: Quote API test suite (600+ lines)
- `services/quoting/mcp-server.test.ts`: Quoting service tests
- `tests/lib/pdf/generate.test.ts`: PDF generation tests

## Naming Conventions

**Files:**

- PascalCase for React components: `QuoteEditor.tsx`, `QuotesTable.tsx`
- kebab-case for other files: `quote-editor.ts`, `pdf-builder.ts`
- `.test.ts` suffix for test files
- No barrel files (index.ts re-exports) - import directly from modules

**Directories:**

- Plural for feature collections: `quotes/`, `takeoffs/`, `components/`, `services/`
- Singular for specific domains: `lib/pdf/`, `lib/schemas/`, `lib/db/`
- Feature-based organization: `src/frontend/components/quotes/`, `src/frontend/pages/`

**Components:**

- React components named as export: `function QuoteEditor() { ... } export function QuoteEditor() { }`
- Props interfaces named `{ComponentName}Props`
- Page components end with "Page": `QuotesPage`, `QuoteEditorPage`

**Types:**

- Database row types suffixed `Row`: `QuoteRow`, `QuoteVersionRow`, `QuoteLineItemRow`
- Application types unadorned: `Quote`, `QuoteVersion`, `QuoteLineItem`
- Input/payload types suffixed `Input`: `QuoteLineItemInput`
- Request parameter types use Bun convention: `type BunRequest = Request & { params: { id: string } }`

**Database:**

- Table names plural snake_case: `quotes`, `quote_versions`, `quote_line_items`
- Foreign keys: `quote_id`, `version_id`, `section_id`
- Boolean flags as `is_*`: `is_locked`, `is_current`, `is_excluded`, `is_active`, `is_takeoff_item`
- Timestamps: `created_at`, `updated_at` (ISO 8601 strings)

## Where to Add New Code

**New Feature/Domain:**

- Create directory in `src/frontend/pages/`: `my-feature.tsx` (with loader export)
- Create directory in `src/frontend/components/`: `src/frontend/components/my-feature/`
- Add route in `src/frontend/App.tsx` router config
- Create API handlers in `src/api/my-feature.ts`
- Add routes in `src/server.ts` route object
- Add table(s) in `lib/db/index.ts`
- Add types in `lib/types.ts`

**New Component/Module:**

- UI primitives go in `src/frontend/components/ui/`
- Feature-specific components go in `src/frontend/components/{feature}/`
- Don't create barrel files - import directly from component files

**Utilities/Shared Logic:**

- General utilities: `lib/utils.ts`
- Domain-specific logic: `lib/{domain}/` (like `lib/pdf/`, `lib/pdf-takeoff/`)
- Validation schemas: `lib/schemas/{domain}.ts`
- Type definitions: Always in `lib/types.ts` (single source of truth)

**Tests:**

- Unit tests for API handlers: `src/api/{handler}.test.ts`
- Unit tests for lib code: `tests/lib/{module}.test.ts`
- Component tests: `tests/components/{feature}/{component}.test.ts`
- Use `bun:test` runner, follow AAA pattern (Arrange-Act-Assert)

**Services & Integrations:**

- New external service: Create directory in `services/`: `services/new-service/client.ts`
- MCP servers: `services/{service}/mcp-server.ts`
- Avoid business logic in services - keep them thin wrappers around SDKs

## Special Directories

**public/:**

- Purpose: Static assets served directly by Bun (bypasses React router)
- Generated: No (user-maintained)
- Committed: Yes
- Path mapping: Served at `/` on web (e.g., `/public/logo.png` → accessed as `/logo.png`)

**lib/db/app.db:**

- Purpose: SQLite database file at runtime
- Generated: Yes (created automatically if missing)
- Committed: No (in .gitignore)
- Location: Co-located with `lib/db/index.ts` or via DATABASE_PATH env var

**node_modules/:**

- Purpose: Bun dependencies
- Generated: Yes (`bun install`)
- Committed: No (in .gitignore)

**.git/:**

- Purpose: Version control
- Generated: Yes
- Committed: Yes

---

*Structure analysis: 2026-01-22*
