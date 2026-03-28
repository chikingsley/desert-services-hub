# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-02-22

### Fixed

- **BREAKING BUG**: All `me/` endpoints replaced with `users/{mailbox}/` — `me/` is invalid with client credentials (app-only) auth and returned `cpim_sts_Unsupported_endpoint` for every API call
- **BREAKING BUG**: `getCurrentUserEmail()` called `GET /me` which silently failed, causing all permission checks to block every write operation (send, archive, delete, rules); removed and replaced with explicit `mailbox` parameter
- **BREAKING BUG**: Double URL-encoding of email IDs — `encodeURIComponent(emailId)` in handlers conflicted with path-segment encoding in `graph-api.ts`; removed pre-encoding from all handlers
- `$search` and `$orderby` cannot be combined for mail endpoints — removed `$orderby` when `$search` is active in `email/search.ts`
- `$search` and `$filter` cannot be combined for mail endpoints — `addBooleanFilters` no longer called when `$search` is set
- `fallbackRequestHandler` anti-pattern replaced with proper `setRequestHandler(ListToolsRequestSchema)` and `setRequestHandler(CallToolRequestSchema)` SDK calls
- `accept-event` tool was registered but its handler was never added to the tools array — now correctly wired up
- Added `isError: true` to all error return paths across all handlers
- Added `additionalProperties: false` to all tool input schemas

### Added

- `mailbox` required parameter on every tool that accesses Outlook data — specifies which mailbox to operate on in app-only context
- Calendar `list-events` now uses `calendarView` endpoint instead of `events` — correctly expands recurring event instances within a 30-day window
- Former local test suite covered mailbox permissions, tool schemas, error responses, and mock mode (114 tests)
- Updated SDK to `@modelcontextprotocol/sdk` v1.26.0

### Removed

- `outlook-auth-server.ts` — delegated OAuth auth server, no longer needed with client credentials
- `getCurrentUserEmail()` from `config/mailbox-permissions.ts`
- `bun run auth-server` script from `package.json`
- One-off root-level dev scripts: `create-notifications-rule.ts`, `debug-env.ts`, `find-folder-ids.ts`, `move-github-emails.ts`, `test-config.ts`, `test-pagination.ts`
- Shell scripts: `backup-logs.sh`, `test-direct.sh`, `test-modular-server.sh`
- `package-lock.json` (project uses Bun, not npm)
- Unused `zod` dependency

### Required Azure Permission Changes

- `MailboxSettings.ReadWrite` Application permission required for rules operations (previously undocumented; `Mail.ReadWrite` alone is insufficient)
- `Mail.Send` Application permission required for sending (separate from `Mail.ReadWrite`)
- No Redirect URI needed in Azure app registration for client credentials flow

## [2.0.0] - 2025-01-29

### Changed

- **BREAKING**: Converted entire codebase from JavaScript to TypeScript
- **BREAKING**: Migrated from Node.js to Bun runtime
- Replaced Node.js http.createServer with Bun.serve() for auth server
- Replaced https.request with native fetch() for all API calls
- Replaced fs.readFileSync/writeFileSync with Bun.file() and Bun.write()
- Removed Express dependency (auth server now uses Bun native APIs)
- Removed dotenv dependency (Bun auto-loads .env files)

### Added

- **Email categories**: get-master-categories, set-email-categories tools
- **Email management**: archive-email, delete-email tools
- **Mailbox permissions**: Restrict send/modify operations to specific mailboxes (contracts@, chi@, dustpermits@)
- Shared TypeScript types in types.ts
- Calendar-specific types in calendar/types.ts
- Strict TypeScript configuration with full type safety

### Removed

- All JavaScript files (replaced with TypeScript)
- Express-based OAuth server module (auth/oauth-server.ts)
- Jest and supertest dependencies (use bun test)
- Node.js-specific APIs throughout codebase

### Technical

- Uses Bun.serve() with routes pattern for HTTP server
- Uses native fetch() for Microsoft Graph API calls
- Uses Bun.file() for token storage and file operations
- Full ESM module system with proper imports/exports

## [1.0.0] - 2024-12-05

### Added

- Initial public release
- MCP server for Claude to access Outlook via Microsoft Graph API
- OAuth 2.0 authentication with automatic token refresh
- **Email tools**: list, read, search, send, mark as read
- **Calendar tools**: list, create, accept, decline, cancel, delete events
- **Folder tools**: list, create, move mail folders
- **Rules tools**: list, create inbox rules
- Test mode with mock data for development
- Biome linting configuration
- 85 passing tests
- MIT License

### Technical

- Uses `@modelcontextprotocol/sdk` v1.24.3
- Modular architecture with separate files per operation
- Token storage in `~/.outlook-mcp-tokens.json`
- Configurable via environment variables

[2.1.0]: https://github.com/peacockery-studio/outlook-mcp/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/peacockery-studio/outlook-mcp/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/peacockery-studio/outlook-mcp/releases/tag/v1.0.0
