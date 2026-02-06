# Codebase Structure

**Analysis Date:** 2026-01-22

## Directory Layout

```
auto-permit/
├── src/                        # Main application code
│   ├── index.ts               # HTTP API server (Bun.serve)
│   ├── cli.ts                 # CLI entry point
│   ├── frontend.tsx           # React app entry point
│   ├── App.tsx                # Root React component
│   ├── form-data.ts           # FormData interface & defaults
│   │
│   ├── api/                   # HTTP handler layer
│   │   ├── permits.ts         # Permit CRUD handlers
│   │   ├── scrape.ts          # Scraping handlers
│   │   ├── sync.ts            # Sync handler
│   │   ├── email.ts           # Email handlers
│   │   └── browser.ts         # Browser session handlers
│   │
│   ├── handlers/              # Business logic layer
│   │   ├── create.ts          # Create permit logic
│   │   ├── renew.ts           # Renew permit logic
│   │   ├── revise.ts          # Revise permit logic
│   │   ├── close.ts           # Close permit logic
│   │   ├── delete.ts          # Delete permit logic
│   │   └── sync.ts            # Sync logic
│   │
│   ├── commands/              # CLI command definitions
│   │   ├── permit/            # Permit subcommands
│   │   │   ├── create.ts      # Create command
│   │   │   ├── renew.ts       # Renew command
│   │   │   ├── close.ts       # Close command
│   │   │   ├── delete.ts      # Delete command
│   │   │   ├── revise.ts      # Revise command
│   │   │   └── list.ts        # List command
│   │   ├── sync.ts            # Sync command
│   │   ├── scrape.ts          # Scrape command
│   │   ├── tools.ts           # Tool-related commands
│   │   └── _shared/           # Shared CLI utilities
│   │       ├── headless.ts    # Headless mode resolution
│   │       └── output.ts      # Output formatting
│   │
│   ├── portal/                # Browser automation layer
│   │   ├── create.ts          # Create flow exports
│   │   ├── create/            # Create application logic
│   │   │   ├── application.ts # Application creation steps
│   │   │   ├── flow.ts        # Full create flows
│   │   │   ├── fill.ts        # Page fill functions (pages 1-4)
│   │   │   ├── fill/          # Page-specific fill logic
│   │   │   │   ├── page2/     # Location/map selection
│   │   │   │   └── page4/     # Dust control categories
│   │   │   ├── navigation.ts  # Page navigation
│   │   │   ├── popup.ts       # Application creation popup
│   │   │   ├── constants.ts   # Flow constants
│   │   │   └── index.ts       # Exports
│   │   ├── close.ts           # Close permit flow
│   │   ├── delete.ts          # Delete permit flow
│   │   ├── resume.ts          # Resume incomplete applications
│   │   ├── scrape.ts          # Permit scraping
│   │   ├── sync-company.ts    # Company permits export download
│   │   ├── sync-marketing.ts  # Marketing permits export download
│   │   ├── pdf.ts             # PDF extraction
│   │   ├── types.ts           # Portal-specific types
│   │   └── utils/             # Portal utilities
│   │       ├── browser.ts     # Browser lifecycle & session mgmt
│   │       ├── login.ts       # Portal authentication
│   │       ├── search.ts      # Permit search operations
│   │       ├── helpers.ts     # Common portal helpers
│   │       ├── config.ts      # Portal config (headless, timeouts)
│   │       ├── sentry.ts      # Error tracking
│   │       └── selectors/     # Form field selectors
│   │           └── index.ts   # SELECTORS constant
│   │
│   ├── db/                    # Database layer
│   │   ├── company-permits.ts # Company permits DB (CRUD)
│   │   ├── marketing-permits.ts # Marketing permits DB (CRUD)
│   │   ├── search.ts          # Permit search queries
│   │   ├── types.ts           # Database entity types
│   │   ├── sync/              # Data synchronization
│   │   │   ├── service.ts     # Sync orchestration
│   │   │   ├── permit-parser.ts # XLS→permit parsing
│   │   │   ├── csv-parser.ts  # CSV parsing
│   │   │   └── upsert.ts      # Insert/update logic
│   │   ├── company-permits.sqlite # Company permits DB file
│   │   └── marketing-permits.sqlite # Marketing permits DB file
│   │
│   ├── components/            # React components
│   │   ├── ui/                # Radix UI primitives
│   │   │   ├── button.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── select.tsx
│   │   │   ├── table.tsx
│   │   │   ├── textarea.tsx
│   │   │   └── badge.tsx
│   │   ├── permits-table/     # Permit data table
│   │   │   ├── data-table.tsx # Table component
│   │   │   ├── columns.tsx    # Column definitions
│   │   │   ├── data-table-column-header.tsx
│   │   │   ├── data-table-view-options.tsx
│   │   │   ├── data-table-pagination.tsx
│   │   │   └── index.ts       # Exports
│   │   ├── vnc-modal.tsx      # VNC viewer modal
│   │   ├── revise-modal.tsx   # Revision form modal
│   │   └── index.ts           # Component exports
│   │
│   ├── lib/                   # Shared utilities & helpers
│   │   ├── types.ts           # Dashboard/UI types (PermitApplication, Permit)
│   │   ├── api.ts             # Frontend API client
│   │   ├── utils.ts           # General utilities
│   │   ├── email-classifier.ts # Email classification logic
│   │   ├── assessor.ts        # Assessment logic
│   │   └── extraction.ts      # Data extraction
│   │
│   ├── email/                 # Email system
│   │   ├── templates/         # Handlebars email templates
│   │   │   ├── 01-dust-permit-submitted.hbs
│   │   │   ├── 02-dust-permit-billing.hbs
│   │   │   ├── 03-dust-permit-issued.hbs
│   │   │   ├── 04-dust-permit-revised.hbs
│   │   │   ├── 05-dust-permit-billing-revised.hbs
│   │   │   ├── 06-dust-permit-reminder.hbs
│   │   │   ├── 07-dust-permit-renewed.hbs
│   │   │   ├── 08-dust-permit-billing-renewed.hbs
│   │   │   ├── swppp-notifications/
│   │   │   ├── index.ts       # Template management
│   │   │   └── README.md
│   │   ├── types.ts           # Email types
│   │   └── client.ts          # Graph API email client
│   │
│   ├── styles/                # CSS & Tailwind
│   │   └── globals.css
│   │
│   └── index.html             # HTML entry point (Bun.serve)
│
├── tests/                     # Test suite
│   ├── e2e/                   # End-to-end tests (browser automation)
│   │   ├── create-fresh.test.ts
│   │   ├── close.test.ts
│   │   ├── login.test.ts
│   │   ├── scrape.test.ts
│   │   ├── sync-*.test.ts
│   │   └── utils/
│   ├── api/                   # API endpoint tests
│   │   ├── permits.test.ts
│   │   ├── email.test.ts
│   │   ├── browser.test.ts
│   │   ├── health.test.ts
│   │   └── assessor.test.ts
│   ├── lib/                   # Library unit tests
│   │   ├── email-classifier.test.ts
│   │   └── extraction-validator.test.ts
│   ├── unit/                  # Pure unit tests
│   │   └── permit-parser.test.ts
│   ├── fixtures/              # Test data
│   │   ├── expected/          # Expected output files
│   │   └── pdfs/              # Test PDF files
│   └── output/                # Test output files
│
├── scripts/                   # Build & utility scripts
│   ├── seed-db.ts             # Database seeding
│   ├── test-email.ts          # Email template testing
│   └── csv-xls-data-manipulation/
│
├── docs/                      # Documentation
│   ├── page-snapshots/        # Portal screenshots
│   ├── contracts/             # Legal documents
│   └── reference/             # Reference docs
│
├── data/                      # Sample data
│   └── samples/               # Test data samples
│
├── .github/                   # GitHub actions
│   └── workflows/
│
├── .planning/                 # GSD planning
│   └── codebase/              # Codebase analysis docs
│
├── package.json               # Node dependencies
├── tsconfig.json              # TypeScript configuration
├── biome.json                 # Biome linter config
├── tailwind.config.ts         # Tailwind CSS config
└── .env.example               # Environment variable template
```

## Directory Purposes

**`src/`:**
- Purpose: All application source code
- Contains: TypeScript/TSX files, HTML entry point, CSS
- Key files: `index.ts` (server), `cli.ts` (CLI), `form-data.ts` (form definition)

**`src/api/`:**
- Purpose: HTTP request handlers
- Contains: Route handler functions that call business logic
- Key files: `permits.ts` (CRUD), `sync.ts` (data sync), `browser.ts` (session management)

**`src/handlers/`:**
- Purpose: Business logic layer with Zod validation
- Contains: Core permit operations, input validation, error handling
- Key files: `create.ts`, `renew.ts`, `close.ts` (with `.schema` exports for CLI)

**`src/commands/`:**
- Purpose: CLI command definitions (Citty)
- Contains: Argument parsing, command metadata, delegation to handlers
- Key files: `permit/create.ts`, `permit/renew.ts`, `cli.ts` routing

**`src/portal/`:**
- Purpose: Maricopa County portal automation
- Contains: Playwright-based browser automation, form filling, navigation
- Key files: `create/` (application creation), `utils/` (login, browser mgmt)

**`src/portal/utils/selectors/`:**
- Purpose: Form field XPath/CSS selectors
- Contains: `SELECTORS` object implementing `SelectorMap` type
- Generated from: `FormData` interface via TypeScript mapped types

**`src/db/`:**
- Purpose: SQLite database operations
- Contains: Schema, CRUD functions, sync/import logic
- Key files: `company-permits.ts`, `company-permits.sqlite` (actual DB)

**`src/components/`:**
- Purpose: React UI components
- Contains: Radix UI-based buttons, dialogs, tables
- Key files: `permits-table/` (permit list), `ui/` (basic components)

**`src/lib/`:**
- Purpose: Shared utilities and dashboard types
- Contains: Type definitions, API client, helpers
- Key files: `types.ts` (PermitApplication, Permit), `api.ts` (fetch wrapper)

**`src/email/`:**
- Purpose: Email sending and templates
- Contains: Handlebars templates, Graph API client
- Key files: `templates/index.ts` (template loading), `client.ts` (send logic)

**`tests/`:**
- Purpose: Test suite (unit, API, E2E)
- Contains: Bun test files, fixtures, expected outputs
- Key files: `e2e/` (browser tests), `api/` (endpoint tests)

## Key File Locations

**Entry Points:**
- `src/index.ts`: HTTP API server (run with `bun src/index.ts`)
- `src/cli.ts`: CLI entry point (run with `bun src/cli.ts <command>`)
- `src/frontend.tsx`: React app entry (loaded by `src/index.html`)

**Core Type Definitions:**
- `src/form-data.ts`: FormData interface, defaults, helper functions
- `src/lib/types.ts`: Dashboard types (PermitApplication, Permit, DisplayStatus)
- `src/portal/types.ts`: Portal types (BrowserInstance, SearchCriteria, SearchResult)
- `src/db/types.ts`: Database entity types (Company, Permit, Job)

**Database:**
- `src/db/company-permits.ts`: Company permits DB module
- `src/db/company-permits.sqlite`: SQLite database file (created on first run)
- `src/db/sync/`: Data import pipeline

**Form Configuration:**
- `src/form-data.ts`: FormData interface definition
- `src/portal/utils/selectors/index.ts`: SELECTORS constant
- `src/portal/create/fill/*.ts`: Page fill functions

**Portal Automation:**
- `src/portal/create/`: Application creation workflows
- `src/portal/close.ts`: Permit closing
- `src/portal/utils/browser.ts`: Browser lifecycle
- `src/portal/utils/login.ts`: Portal authentication

**Configuration:**
- `src/portal/utils/config.ts`: Headless mode, timeouts, script settings
- `.env` (not in repo): Environment variables for credentials

## Naming Conventions

**Files:**
- kebab-case: `permit-parser.ts`, `data-table.tsx`, `company-permits.ts`
- Exception: `App.tsx`, `FormData.ts` (PascalCase for React/main exports)

**Directories:**
- kebab-case: `permits-table/`, `data-table-column-header.tsx`
- Multi-word descriptive names for clarity

**Functions:**
- camelCase: `createPermit()`, `fillPage1()`, `getOrCreateBrowserSession()`
- Handlers: `handle*` prefix: `handleCreatePermit()`, `handleSync()`
- Utilities: `with*` pattern: `withBrowser()`, `withSentry()`

**Types:**
- PascalCase: `FormData`, `PermitApplication`, `BrowserInstance`
- Enum-like: `EntityType`, `ControlMeasure`
- Schemas: `*Schema` suffix: `createSchema`, `renewSchema`

**Constants:**
- SCREAMING_SNAKE_CASE: `DEFAULT_COPY_FROM_APP`, `SETTLE_MS`, `PORTAL_BASE_URL`
- Config objects: snake_case keys: `config.scripts`, `config.timeouts`

**Selectors:**
- Path-based: `portal.pageMarkers.page5Submit`, `selectors.categoryC.c1.preWater.Primary`
- Descriptor: Each field has clear XPath/CSS identifying form element

## Where to Add New Code

**New Permit Operation (e.g., "Modify"):**
1. Add schema to `src/handlers/modify.ts` (with `.schema` export)
2. Add handler function to same file
3. Add API endpoint to `src/index.ts` routes
4. Add CLI command to `src/commands/permit/modify.ts`
5. Portal logic in `src/portal/modify.ts` (if needed)
6. Tests in `tests/api/permits.test.ts` and `tests/e2e/`

**New Form Field:**
1. Add field to `FormData` interface in `src/form-data.ts`
2. Add default value to `DEFAULTS` object in same file
3. TypeScript error in `src/portal/utils/selectors/index.ts` (SELECTORS missing field)
4. Add selector to `SELECTORS` object
5. Update fill function in `src/portal/create/fill/page*.ts`
6. Test with form data in `tests/fixtures/`

**New Database Table:**
1. Add schema to `src/db/company-permits.ts` (or new file)
2. Add TypeScript type to `src/db/types.ts`
3. Add CRUD functions to same module as schema
4. Export type and functions

**New API Endpoint:**
1. Add handler function to `src/api/new-feature.ts`
2. Add route to `src/index.ts` routes object
3. Add schema to handler file (if input validation needed)
4. Test in `tests/api/new-feature.test.ts`

**New React Component:**
1. Create in `src/components/` with kebab-case filename
2. Use Radix UI primitives from `src/components/ui/`
3. Use Tailwind classes
4. Export from component's `index.ts` if in subdirectory
5. Import in `src/App.tsx` or other components

**New CLI Command:**
1. Create `src/commands/category/command-name.ts`
2. Export default Citty command definition
3. Add to `src/cli.ts` subCommands
4. Handler calls function from `src/handlers/`

**Test Coverage:**
- Unit: Place in `tests/unit/` for pure functions
- API: Place in `tests/api/` for HTTP endpoints
- E2E: Place in `tests/e2e/` for browser automation
- Run with: `bun test tests/` or `bun test <test-file>`

## Special Directories

**`src/db/`:**
- Purpose: SQLite database files and operations
- Generated: `*.sqlite` files created on first schema initialization
- Committed: No (add to `.gitignore`)
- Location: Default is `src/db/`, override with env var

**`tests/output/`:**
- Purpose: Test-generated files (PDFs, logs)
- Generated: Yes, during test execution
- Committed: No
- Contents: PDFs extracted from permits, diagnostic output

**`tests/fixtures/`:**
- Purpose: Test data and expected outputs
- Generated: No
- Committed: Yes
- Contents: Sample form data, expected HTML/PDF results

**`data/samples/`:**
- Purpose: Sample data for development
- Generated: No
- Committed: Possibly (if non-sensitive)
- Contents: Example CSV exports, test permit IDs

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents
- Generated: Yes (by `/gsd:map-codebase`)
- Committed: Yes
- Contents: ARCHITECTURE.md, STRUCTURE.md, TESTING.md, etc.

