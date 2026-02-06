# External Integrations

**Analysis Date:** 2026-01-22

## APIs & External Services

**Maricopa County Dust Permit Portal:**
- Portal URL: `https://dm.maricopa.gov/`
- Service: County dust permit application and management
- SDK/Client: Playwright (browser automation)
- Auth: Username/password (`DUST_PERMIT_USERNAME`, `DUST_PERMIT_PASSWORD`)
- Location: `src/portal/` contains all automation logic
- Flows: Create new permits, renew, revise, close, scrape permit data

**Google Gemini API (AI Extraction):**
- Service: LLM-powered form data extraction and PDF processing
- SDK/Client: `@google/genai` (v1.34.0)
- Auth: API key (`GEMINI_API_KEY`)
- Model: `gemini-2.5-flash-lite` (production) - 1.5x faster, 20% cheaper
- Location: `src/commands/tools.ts`, `src/portal/` modules
- Usage: Extract structured data from PDFs, determine form field values
- Fallback: None (required for core form extraction workflow)

**Microsoft Graph API (Email & Teams):**
- Service: Microsoft 365 email operations and Teams integration
- SDK/Client: `@microsoft/microsoft-graph-client` (v3.0.7)
- Auth Modes:
  - App-only (client credentials): `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
  - Delegated (user sign-in): Device code flow with MSAL
- Scopes: `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`, `User.Read`
- Location: `src/email/client.ts` (GraphEmailClient), `src/api/email.ts` (handlers)
- Usage: Send permit notifications, search email inbox, Teams bot integration
- Auth Library: `@azure/msal-node` (3.8.5) for delegated auth, `@azure/identity` (4.13.0) for app auth
- Token Cache: File-based cache via `src/email/token-cache.ts`

**Maricopa County Assessor API:**
- Service: Parcel data lookup and property information
- URL: `https://mcassessor.maricopa.gov`
- ArcGIS MapServer: `https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0/query`
- Auth: Optional API key (`ASSESSOR_API_KEY`)
- SDK/Client: Fetch API (native HTTP)
- Location: `src/lib/assessor.ts`
- Usage: Look up parcel geometry, owner info, acreage by coordinates or APN

**Maricopa County GIS/ArcGIS:**
- Service: Public GIS data and mapping
- URL: `https://gis.mcassessor.maricopa.gov`
- Auth: None (public)
- SDK/Client: Fetch API
- Location: `src/lib/assessor.ts`
- Usage: Parcel geometry, spatial queries

**Jina AI (Web Scraping - Optional):**
- Service: Web scraping and content extraction (optional)
- Auth: API key (`JINA_API_KEY`)
- SDK/Client: Fetch API
- Location: Not currently integrated in codebase (configured but unused)
- Status: Optional, deprecated in favor of Gemini extraction

**Notion API (Optional):**
- Service: Notion database integration
- SDK/Client: `@notionhq/client` (v5.6.0)
- Auth: API token
- Location: Not currently integrated in codebase
- Status: Dependency present but not used

## Data Storage

**Databases:**
- SQLite 3 (local, via bun:sqlite)
- Company permits: `src/db/company-permits.sqlite`
  - Tables: companies, permits, jobs, audit logs
  - WAL mode enabled for concurrent access
  - Client: `Database` from `bun:sqlite` (no ORM)
- Marketing permits: `src/db/marketing-permits.sqlite`
  - Tables: market_permits
  - Contains scraped market data for sales leads
  - Connection: Via `bun:sqlite`

**File Storage:**
- Local filesystem only
- Output directory: `./output/` (configurable)
- PDF exports: Generated via `src/portal/pdf.ts`
- Excel exports: Downloaded from portal, parsed via `xlsx` library

**Caching:**
- In-memory: Browser session singleton (`src/portal/utils/browser.ts`)
- File-based: Email token cache (`src/email/token-cache.ts`)
- Token expiration: Handled by MSAL and Microsoft identity libraries

## Authentication & Identity

**Auth Providers:**

1. **Maricopa County Portal:**
   - Type: Custom (username/password)
   - Implementation: Playwright login flow (`src/portal/utils/login.ts`)
   - Flow: Navigate to portal, enter credentials, wait for redirect
   - Credentials: `DUST_PERMIT_USERNAME`, `DUST_PERMIT_PASSWORD`

2. **Microsoft Entra ID (Azure AD):**
   - Type: OAuth 2.0
   - Modes:
     - **App-only (client credentials):** Service-to-service, no user interaction
       - Client: `@azure/identity` ClientSecretCredential
       - Credentials: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
     - **Delegated (user sign-in):** User context via device code flow
       - Client: `@azure/msal-node` PublicClientApplication
       - Flow: DeviceCodeRequest (user signs in via browser)
   - Implementation: `src/email/client.ts` GraphEmailClient
   - Scopes: Mail.Read, Mail.ReadWrite, Mail.Send, User.Read

3. **Google API:**
   - Type: API Key
   - Credentials: `GEMINI_API_KEY`
   - Implementation: Direct API key auth for Gemini

4. **Sentry (Error Tracking):**
   - Type: DSN-based auth
   - Credentials: `SENTRY_DSN`
   - Implementation: `src/portal/utils/sentry.ts`

## Monitoring & Observability

**Error Tracking:**
- Sentry (`@sentry/bun` v10.32.1)
  - DSN: `SENTRY_DSN` (optional)
  - Automatic error capture when initialized
  - Functions: `src/portal/utils/sentry.ts`
  - Usage: `initSentry()` at app startup, `captureError()`, `withSentry()` wrapper

**Logs:**
- Console output (stderr for logs, stdout for data)
- Sentry for production errors
- No centralized log aggregation configured

**Development Debugging:**
- Playwright headless mode toggle (`HEADLESS` env var)
- Verbose mode: `config.verbose` (0=silent, 1=normal, 2=debug)
- Browser inspection: VNC/local browser when `HEADLESS=false`

## CI/CD & Deployment

**Hosting:**
- Bun server (self-hosted or cloud-ready)
- Port: 47822 (configurable via `PORT` env var)
- Protocol: HTTP/WebSocket

**CI Pipeline:**
- Not detected (no GitHub Actions, GitLab CI, etc.)

**Deployment:**
- Manual via Bun commands
- Docker-ready (Bun supports containerization)
- Cloudflare Tunnel support: `bun run tunnel` (requires `CLOUDFLARE_TUNNEL_TOKEN`)

## Environment Configuration

**Required Environment Variables:**
- `DUST_PERMIT_USERNAME` - Portal login email
- `DUST_PERMIT_PASSWORD` - Portal login password
- `GEMINI_API_KEY` - Google Gemini API key

**Optional Environment Variables:**
- `AZURE_TENANT_ID` - Microsoft Entra tenant ID
- `AZURE_CLIENT_ID` - Microsoft app client ID
- `AZURE_CLIENT_SECRET` - Microsoft app client secret
- `ASSESSOR_API_KEY` - Maricopa County Assessor API key
- `JINA_API_KEY` - Jina web scraping key
- `SENTRY_DSN` - Sentry error tracking URL
- `HEADLESS` - Browser visibility (`true`/`false`)
- `PORT` - API server port (default: 47822)
- `NODE_ENV` - Environment (`development`/`production`)
- `COMPANY_NAME` - Default company for permits
- `COPY_FROM_APP_NUMBER` - Template permit ID to copy from
- `IS_NEW_COMPANY` - Force new company flow
- `COMPANY_PERMITS_DB_PATH` - Custom company DB path
- `MARKET_PERMITS_DB_PATH` - Custom market DB path
- `CLOUDFLARE_TUNNEL_TOKEN` - For tunnel command

**Secrets Location:**
- `.env` file (local development, not committed)
- Environment injection (production)
- Azure Key Vault (optional, for production)

## Webhooks & Callbacks

**Incoming Webhooks:**
- `/swppp-plan-notifications` - Endpoint for SWPPP plan notifications
  - Handler: `src/api/email.ts` handleSwpppEmail()
  - Purpose: Receive permit notifications, send templated emails

**Outgoing Webhooks:**
- None detected
- Email sending via Microsoft Graph API (asynchronous)
- No callback/retry infrastructure

## API Design

**Server Routes:**

**Health & Status:**
- `GET /health` - Health check endpoint
- `GET /api/browser/status` - Browser session status

**Permits API:**
- `GET /api/permits` - List all permits (with filters: status, company)
- `POST /api/permits/create` - Create new permit
- `GET /api/permits/:id` - Get permit details
- `DELETE /api/permits/:id` - Delete permit
- `DELETE /api/permits/drafts` - Delete all drafts
- `POST /api/permits/:id/renew` - Renew permit
- `POST /api/permits/:id/close` - Close permit
- `POST /api/permits/:id/revise` - Revise permit

**Scrape API:**
- `POST /api/scrape/pdf` - Extract data from PDF
- `GET /api/scrape/:id` - Scrape permit by ID

**Sync API:**
- `POST /api/sync` - Sync market permits from CSV/downloads

**Browser Control:**
- `POST /api/browser/start` - Start browser session
- `POST /api/browser/stop` - Stop browser session

**Email API:**
- `GET /api/email/templates` - List email templates
- `POST /api/email/send` - Send email

## Data Exchange Formats

**Permitted Import/Export:**
- Excel (xlsx) - Market permit data via `xlsx` library
- JSON - API request/response bodies
- HTML - Portal scraping and export parsing
- PDF - Permit documents via `pdf-lib`

---

*Integration audit: 2026-01-22*
