# External Integrations

**Analysis Date:** 2026-01-22

## APIs & External Services

**Email & Communications:**

- Microsoft Graph (Email) - Search, read, send emails in Office 365 mailboxes
  - SDK/Client: `@microsoft/microsoft-graph-client` 3.0.7
  - Implementation: `services/email/client.ts` (GraphEmailClient)
  - Auth: Azure AD client credentials (app-only) or device code flow (delegated)
  - Env vars: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
  - MCP Server: `services/email/mcp-server.ts` - Exposes 25+ email tools

**Project Management:**

- Monday.com CRM - Manage boards, items, columns for project tracking
  - SDK/Client: Custom GraphQL client in `services/monday/client.ts`
  - API URL: `https://api.monday.com/v2`
  - Auth: Bearer token in Authorization header
  - Env var: `MONDAY_API_KEY`
  - Rate limiting: Auto-pagination with 500-item page size
  - Webhook support: `src/api/webhooks.ts` handles Monday events (challenge verification, name changes)
  - MCP Server: `services/monday/mcp-server.ts` - Board and item operations

**Documentation & Knowledge Base:**

- Notion API - Query databases, create/update pages, file uploads
  - SDK/Client: Custom HTTP wrapper in `services/notion/client.ts`
  - API Version: 2022-06-28
  - Auth: Bearer token (NOTION_API_KEY)
  - Env vars: `NOTION_API_KEY`, multiple database IDs (NOTION_ACCOUNTS_DB_ID, NOTION_CONTACTS_DB_ID, etc.)
  - Rate limiting: 350ms delay between requests to respect rate limits
  - MCP Server: `services/notion/mcp-server.ts`

**File Storage & Collaboration:**

- Microsoft Graph (SharePoint) - Access DataDrive site and shared documents
  - SDK/Client: `services/sharepoint/client.ts` (SharePointClient)
  - Implementation: Graph API with app-only auth
  - Default site: `sites/DataDrive`
  - Default drive: "Documents" (Shared Documents)
  - Auth: Azure AD client credentials via `@azure/identity`
  - Env vars: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
  - Operations: List files, search, download, upload

**AI & Content Analysis:**

- Google Gemini API - Vision, text generation, structured extraction
  - SDK: `@google/genai` 1.38.0
  - Models used:
    - `gemini-3-flash-preview` - Company enrichment, contract reconciliation
    - `gemini-2.5-pro` - Contract extraction
    - `gemini-2.5-flash` - Estimate extraction, inline tasks
    - `gemini-2.5-flash-lite` - Labor parsing
  - Auth: API key (GEMINI_API_KEY)
  - Usage: PDF extraction, structured data generation with JSON schema responses

**Web Search & Content Extraction:**

- Jina API - Search and content extraction for company enrichment
  - Usage: `services/enrichment/jina-gemini.ts`
  - Endpoint: Implied REST API for search and content reading
  - Auth: API key (JINA_API_KEY)
  - Workflow: Search for company info → Extract URLs → Feed to Gemini for structured extraction

**Data Enrichment:**

- People Data Labs (PDL) - Person and company enrichment
  - SDK: `peopledatalabs` 14.1.1
  - Client: `services/enrichment/pdl/client.ts`
  - APIs: Person enrichment/search/identify, Company enrichment/search, Support utilities
  - Auth: API key (PEOPLE_DATA_LABS_API_KEY)
  - Rate limits: Varies by endpoint (free tier: 10-100 calls/minute, monthly limits)
  - Usage: Enrich contractor and client data with company info

**Automation & Workflow:**

- n8n - Low-code workflow automation platform
  - Client: `services/n8n/client.ts`
  - API: REST API with workflow management
  - Auth: API key (N8N_API_KEY)
  - Env vars: `N8N_API_KEY`, `N8N_BASE_URL`
  - Capabilities: Create/update workflows, trigger webhooks, manage nodes
  - Webhook support: Built-in workflow triggering via HTTP POST

## Data Storage

**Databases:**

- SQLite via `bun:sqlite`
  - Connection: `lib/db/index.ts` - Native Bun driver
  - Path: Configurable via `DATABASE_PATH` env var (defaults to `lib/db/app.db`)
  - Features: WAL mode enabled, foreign key constraints enabled
  - Tables: Takeoffs, Quotes, Catalog, Monday cache, Bundle items
  - Access pattern: Direct SQL queries from API handlers (no ORM)

**File Storage:**

- MinIO S3-compatible object storage
  - Client: `minio` 8.0.6
  - Config: `lib/minio.ts`
  - Buckets:
    - `TAKEOFFS` (default: "takeoffs") - PDF documents for measurement
    - `QUOTES` (default: "quotes") - Generated quote PDFs
    - `THUMBNAILS` (default: "thumbnails") - Page previews
  - Auth: Access key + secret key
  - Env vars: `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET_*`
  - Implementation: Bucket initialization with auto-create, file upload with content type

**Caching:**

- Database caching for Monday.com items
  - Table: `monday_cache` in SQLite
  - Fields: board_id, board_title, name, group_id, column_values, synced_at
  - Pattern: Fetch-through cache with timestamp tracking

## Authentication & Identity

**Auth Providers:**

- Azure Active Directory (AAD) / Microsoft Entra
  - Multi-tenant support via `AZURE_TENANT_ID`
  - Two auth modes:
    - Client credentials (app-only): For background/automated tasks
    - Device code flow (delegated): For interactive user actions
  - Packages: `@azure/identity` 4.13.0 (credentials), `@azure/msal-node` (MSAL)
  - Token caching: File-based cache in `services/email/token-cache.ts`
  - Scopes: Mail.Read, Mail.ReadWrite, Mail.Send, User.Read
  - Env vars: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`

**API Keys (Stateless):**

- Monday.com: Bearer token in Authorization header
- Notion: Bearer token with custom "Notion-Version" header
- Google Gemini: API key in request payload
- Jina: API key (mechanism unspecified)
- People Data Labs: API key in SDK initialization
- n8n: API key in request headers

## Monitoring & Observability

**Error Tracking:**

- None detected - No Sentry, Bugsnag, or similar integrations

**Logs:**

- Console-based logging via `console.log` and `console.error`
- MCP server logs: Unstructured messages to stdout
- Webhook logging: Basic error logging in `src/api/webhooks.ts`
- No centralized logging service (logs, Datadog, etc.)

## CI/CD & Deployment

**Hosting:**

- Not specified in codebase - Deployment target unknown
- Likely: Self-hosted or cloud VM (considering n8n and MinIO setup)

**CI Pipeline:**

- No GitHub Actions, GitLab CI, or other CI config detected
- Local build/test: `bun run check` and `bun test`

## Environment Configuration

**Required env vars (critical):**

- `AZURE_TENANT_ID` - Azure AD tenant ID for Microsoft Graph
- `AZURE_CLIENT_ID` - Azure AD app ID
- `AZURE_CLIENT_SECRET` - Azure AD client secret
- `MONDAY_API_KEY` - Monday.com GraphQL API key
- `NOTION_API_KEY` - Notion API key
- `GEMINI_API_KEY` - Google Gemini API key
- `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` - MinIO S3 storage
- `DATABASE_PATH` - SQLite database file location

**Optional env vars:**

- `JINA_API_KEY` - Jina web search and extraction
- `PEOPLE_DATA_LABS_API_KEY` - PDL enrichment
- `N8N_API_KEY`, `N8N_BASE_URL` - n8n workflow automation
- `GOOGLE_MAPS_API_KEY`, `TAVILY_API_KEY`, `OPENAI_API_KEY` - Additional services
- Multiple Notion database IDs (NOTION_ACCOUNTS_DB_ID, NOTION_CONTACTS_DB_ID, etc.)
- Multiple Monday.com board IDs

**Secrets location:**

- `.env` file (local development)
- Environment variables (production deployment)
- Bun auto-loads `.env` on startup

## Webhooks & Callbacks

**Incoming Webhooks:**

- Monday.com → `POST /api/webhooks/monday`
  - Challenge verification for webhook registration
  - Event types: `change_name` (updates item name in cache)
  - Signature verification: None detected (security concern)

**Outgoing Webhooks:**

- n8n workflows can be triggered via webhook
- Desert Services sends to n8n via HTTP POST to workflow URLs

## MCP Server Integration

**Active MCP Servers:**
All services expose tools via Model Context Protocol servers:

- `services/email/mcp-server.ts` - Email search, send, manage (25+ tools)
- `services/monday/mcp-server.ts` - Board and item operations
- `services/notion/mcp-server.ts` - Database queries and page management
- `services/quoting/mcp-server.ts` - Quote creation, updates, PDF export
- `services/swppp-master/mcp-server.ts` - SWPPP project management
- `services/contract/file-automation/docusign/mcp-server.ts` - Contract signing automation

**MCP Tool Pattern:**

- Tools accept Zod-validated JSON schema inputs
- Schema conversion: `zod-to-json-schema` for tool definitions
- Error handling: Clear error messages on schema validation failure
- Response format: Structured JSON with success/error status

## Rate Limiting & Quotas

**Known limits:**

- Notion API: 350ms delay between requests (enforced in client)
- Monday.com: 500-item page size with auto-pagination
- People Data Labs: Varies by endpoint (10-100 calls/min on free tier)
- Gemini API: Implicit rate limiting by Google Cloud quotas

---

*Integration audit: 2026-01-22*
