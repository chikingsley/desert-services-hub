# Outlook MCP Server

MCP server providing Claude with access to Microsoft Outlook via the Microsoft Graph API. Part of the Desert Services Hub monorepo.

## Development

- `bun run start` - Start the MCP server (auto-discovered via `.mcp.json` in repo root)
- `bun run auth-server` - Start OAuth authentication server on port 3333
- `bun run test-mode` - Start in test mode with mock data
- `bun run inspect` - MCP Inspector for interactive testing
- `bunx tsc --noEmit --project apps/outlook-mcp/tsconfig.json` - Type check
- `bun x ultracite check apps/outlook-mcp/` - Lint check
- `bunx kill-port 3333` - Kill auth server port if busy

## Architecture

### Core

- `index.ts` - Entry point, combines all module tools, handles MCP protocol
- `config.ts` - API endpoints, field selections, auth settings (uses `AZURE_*` env vars)
- `types.ts` - Shared TypeScript type definitions

### Modules

- `auth/` - OAuth 2.0 with token management (`ensure.ts`, `tools.ts`, `token-manager.ts`, `token-storage.ts`)
- `email/` - Full email operations (see tools below)
- `folder/` - Folder operations (list, create, move)
- `rules/` - Inbox rules management
- `utils/` - Graph API client (`graph-api.ts`), OData helpers, mock data
- `config/` - Mailbox permissions

### No barrel files

All imports use explicit leaf module paths (e.g., `@outlook/auth/ensure`, `@outlook/email/tools`).

## Available Tools (28 total)

### Auth (2)

- `authenticate` - Initiate OAuth flow
- `get-auth-status` - Check authentication status

### Email — Core (5)

- `list-emails` - List emails from inbox or folder
- `search-emails` - Search with filters (from, to, subject, attachments, unread)
- `read-email` - Read email by ID (includes conversationId for thread retrieval)
- `send-email` - Compose and send immediately
- `mark-as-read` - Mark email read/unread

### Email — Drafts (3)

- `create-draft` - Create draft email (safe compose-then-send workflow)
- `update-draft` - Edit an existing draft
- `send-draft` - Send a previously created draft

### Email — Reply & Forward (5)

- `reply` - Send reply immediately
- `reply-all` - Send reply-all immediately
- `forward` - Forward to new recipients immediately
- `create-reply-draft` - Create draft reply (review before sending)
- `create-forward-draft` - Create draft forward (review before sending)

### Email — Attachments (2)

- `list-attachments` - List attachments on an email (name, type, size, ID)
- `get-attachment` - Download attachment content (base64 for file attachments)

### Email — Threads (1)

- `get-thread` - Get all messages in a conversation by conversationId

### Email — Organization (4)

- `get-master-categories` - Get available categories
- `set-email-categories` - Set categories on an email
- `archive-email` - Move email to Archive
- `delete-email` - Soft or permanent delete

### Folder (3)

- `list-folders` - List all mail folders
- `create-folder` - Create a new folder
- `move-emails` - Move emails between folders

### Rules (3)

- `list-rules` - List inbox rules
- `create-rule` - Create inbox rule
- `edit-rule-sequence` - Change rule priority order

## Mailbox Permissions

Write operations are restricted by mailbox:

| Mailbox | Read | Send | Modify/Delete | Draft |
|---------|------|------|---------------|-------|
| contracts@ | yes | yes | yes | yes |
| chi@ | yes | yes | yes | yes |
| dustpermits@ | yes | yes | yes | yes |
| All others | yes | no | no | no |

## Environment Variables

Uses root `.env` (Bun auto-loads):
- `AZURE_TENANT_ID` - Azure AD tenant ID
- `AZURE_CLIENT_ID` - App registration client ID
- `AZURE_CLIENT_SECRET` - Client secret **value** (not the secret ID)

## Authentication

Uses client credentials flow (app-only auth):
1. Start auth server: `bun run auth-server`
2. Use `authenticate` tool to get OAuth URL
3. Complete browser auth
4. Tokens stored in `~/.outlook-mcp-tokens.json` and auto-refreshed

## Graph API Patterns

- `callGraphAPI()` - Single request with OData encoding
- `callGraphAPIPaginated()` - Auto-pagination up to maxCount
- Path segments are auto-encoded; do NOT pre-encode message IDs
- `$filter` is encoded separately from other query params
- Empty responses return `{}`
