# Architecture

**Analysis Date:** 2026-01-22

## Pattern Overview

**Overall:** Layered API + CLI architecture with browser automation, modular handlers, and shared data access patterns.

**Key Characteristics:**
- Thin HTTP handler layer (routes → business logic)
- Command-line interface via Citty for programmatic access
- Portal automation through Playwright with intelligent error handling
- Dual-database system (company permits + marketing/sales data)
- Form-first approach with type-safe selector mapping
- Singleton browser session for API server efficiency

## Layers

**Presentation Layer (Frontend):**
- Purpose: React dashboard for permit management
- Location: `src/frontend.tsx`, `src/App.tsx`, `src/components/`
- Contains: React components, UI primitives (Radix), permit table
- Depends on: `/api/*` endpoints
- Used by: Web browsers via `src/index.html`

**HTTP API Layer:**
- Purpose: REST endpoints for dashboard and external clients
- Location: `src/index.ts` (Bun.serve routes), `src/api/*.ts` (handlers)
- Contains: Route definitions, parameter parsing, HTTP response wrapping
- Depends on: Handlers layer, browser session management
- Used by: Frontend, external API clients

**Command-Line Interface:**
- Purpose: Programmatic access for automation and scripting
- Location: `src/cli.ts` (main), `src/commands/` (subcommands)
- Contains: Citty command definitions, parameter validation
- Depends on: Handlers layer
- Used by: Scripts, CI/CD, manual operations

**Handlers Layer (Business Logic):**
- Purpose: Orchestrate operations, validate input, coordinate dependencies
- Location: `src/handlers/*.ts` (create, renew, close, delete, sync, scrape)
- Contains: Schema validation (Zod), input/output transformation, error handling
- Depends on: Portal layer, database layer, form data
- Used by: API handlers, CLI commands

**Portal Automation Layer:**
- Purpose: Browser automation for Maricopa County dust permit portal
- Location: `src/portal/*.ts` (high-level flows), `src/portal/create/*` (modular steps)
- Contains: Navigation, form filling, extraction, search, login, PDF handling
- Depends on: Playwright browser instance, utilities
- Used by: Handlers (create, renew, close), CLI operations

**Database Layer:**
- Purpose: Persistent data storage for permits, companies, jobs
- Location: `src/db/company-permits.ts`, `src/db/marketing-permits.ts`
- Contains: SQLite operations (CRUD), schema, queries
- Depends on: Bun SQLite API
- Used by: Handlers, API endpoints, form population

**Synchronization Layer:**
- Purpose: Import permit data from portal into databases
- Location: `src/db/sync/` (service, parsers, upsert)
- Contains: XLS/CSV parsing, data mapping, upsert logic
- Depends on: Database layer, portal sync functions
- Used by: Handlers, scheduled tasks

**Utilities & Infrastructure:**
- Purpose: Cross-cutting concerns (browser mgmt, login, config, error tracking)
- Location: `src/portal/utils/` (browser, login, config, sentry, helpers)
- Contains: Browser lifecycle, authentication, configuration loading, Sentry integration
- Depends on: Playwright, environment
- Used by: All layers

## Data Flow

**Permit Creation Flow:**

1. User/API request → HTTP handler (`src/api/permits.ts:handleCreatePermit`)
2. Validate input with Zod schema (`src/handlers/create.ts:createSchema`)
3. Get/create browser session (`src/portal/utils/browser.ts:getOrCreateBrowserSession`)
4. Authenticate if needed (`src/portal/utils/login.ts:login`)
5. Portal automation (`src/portal/create.ts:createApplicationFull`):
   - Select flow (new-company or existing-company)
   - Fill Page 1 (applicant) with form data
   - Fill Page 2 (location) from map selection
   - Fill Page 3 (project details)
   - Fill Page 4 (dust control measures)
   - Extract application ID from confirmation
6. Store result in database (`src/db/company-permits.ts:insertPermit`)
7. Return response to client

**Synchronization Flow:**

1. Sync request → Handler (`src/handlers/sync.ts:syncPermits`)
2. Browser automation (`src/portal/sync-company.ts`, `src/portal/sync-marketing.ts`):
   - Download "Export to Excel" from portal
   - Save XLS files locally
3. Parse permits (`src/db/sync/permit-parser.ts:parsePermitExport`):
   - Convert XLS HTML table to structured data
   - Extract permit ID, dates, billing, status
4. Upsert to database (`src/db/sync/upsert.ts:insertPermits`):
   - Check for existing permits
   - Insert new, update existing, preserve timestamps
5. Return statistics (new records, total count)

**State Management:**

- **Request State:** Stored in request object, passed through handler → portal → utilities
- **Browser State:** Singleton session (`globalSession`) shared across API calls for efficiency
- **Permit State:** Persisted in SQLite (company-permits.sqlite, marketing-permits.sqlite)
- **Authentication State:** Session cookies managed by Playwright browser context
- **Form State:** Built dynamically from `FormData` interface, merged with defaults

## Key Abstractions

**BrowserInstance:**
- Purpose: Encapsulates browser, context, page as a single managed unit
- Location: `src/portal/types.ts:BrowserInstance`
- Files: Used throughout `src/portal/` and browser management
- Pattern: Created by `createBrowser()`, passed to `withBrowser()` wrapper

**FormData Interface:**
- Purpose: Type-safe, hierarchical structure for all form fields
- Location: `src/form-data.ts:FormData`
- Files: Referenced in handlers, portal fill functions, form defaults
- Pattern: Immutable definition drives selector map (`SelectorMap`) and validation

**SelectorMap (Type-Safe Form Selectors):**
- Purpose: Auto-generated from FormData to ensure selectors stay in sync with fields
- Location: `src/portal/utils/selectors.ts:SELECTORS`
- Files: Implements `SelectorMap` type (auto-generated from FormData)
- Pattern: TypeScript mapped type (`SelectorFor<T>`) ensures compile-time validation

**Handler Schema Pattern:**
- Purpose: Zod-based validation with AI-tool descriptions
- Location: `src/handlers/*.ts` (e.g., `createSchema`, `renewSchema`)
- Files: Used by CLI (Citty), API (request body), AI agents
- Pattern: Schema includes `.describe()` for tool descriptions, optional AI parameters

**Portal Wrapper Functions:**
- Purpose: Organize complex automation into manageable steps
- Location: `src/portal/create/flow.ts`, `src/portal/create/fill/*.ts`
- Files: `createApplicationFull`, `fullCreateFlow`, `fillPage1`, `fillPage2`, etc.
- Pattern: Each function takes page + context + data, returns typed result

**SearchCriteria & SearchResult:**
- Purpose: Unified interface for permit search operations
- Location: `src/portal/types.ts:SearchCriteria`, `SearchResult`
- Files: Used in `src/portal/search.ts`, API endpoint
- Pattern: Flexible search (permitId, projectName, or companyName)

## Entry Points

**API Server:**
- Location: `src/index.ts`
- Triggers: `bun src/index.ts` or `npm start`
- Responsibilities:
  - Initialize Sentry error tracking
  - Define Bun.serve routes for all endpoints
  - Manage static asset serving (React dashboard)
  - Route requests to API handlers

**CLI Entry:**
- Location: `src/cli.ts`
- Triggers: `bun src/cli.ts <command>`
- Responsibilities:
  - Define subcommands (create, renew, close, delete, sync, scrape, list)
  - Delegate to command modules
  - Parse CLI arguments via Citty

**Direct Portal Operations:**
- Location: Various scripts (e.g., `bun src/create-application-full.ts`)
- Purpose: Run portal automation without server/CLI framework
- Used for: Testing, debugging, batch operations

## Error Handling

**Strategy:** Multi-layer error handling with Sentry integration and early returns.

**Patterns:**

- **Validation Errors:** Zod schema validation in handlers, return 400 with schema error
  - Example: `src/handlers/create.ts` validates input and formData

- **Browser Errors:** Try-catch in portal functions, captured with operation context
  - Example: Login failure returns `{ success: false, error: "..." }`
  - `src/portal/utils/sentry.ts:captureError()` logs to Sentry with context

- **API Handler Errors:** Wrapped in try-catch, return 500 response
  - Example: `src/api/permits.ts` catches all exceptions, returns error JSON

- **Database Errors:** Transaction rollback (WAL mode), error propagation
  - Schema validation prevents most errors at insert time

- **Async Operation Errors:** withBrowser wrapper handles cleanup
  - Browser always closes even if operation fails (unless keepOpen=true)

## Cross-Cutting Concerns

**Logging:**
- Standard: `console.log()`, `console.error()` to stderr
- Pattern: Progress messages prefixed with emoji (📡, ✓, ✗, 🌐)
- Sentry: Errors automatically captured with operation context
- Location: `src/portal/utils/sentry.ts` for error tracking

**Validation:**
- Zod schemas at handler layer: `src/handlers/*.ts`
- Form data validation in fill functions: `src/portal/create/fill/*.ts`
- Database schema constraints: `src/db/company-permits.ts`
- Pattern: Fail fast with descriptive error messages

**Authentication:**
- Portal credentials: Environment variables (PORTAL_USERNAME, PORTAL_PASSWORD)
- Graph API: Azure MSAL (token-based)
- Pattern: Login once per browser session, reuse context cookies
- Location: `src/portal/utils/login.ts`

**Configuration:**
- Portal settings (headless, screenshots, timeouts): `src/portal/utils/config.ts`
- Database paths: Environment variables with defaults
- API credentials: Environment variables
- Pattern: Load from env, use defaults if missing
- Debug: Override via `--headless`/`--headed` flags
