[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/ryaker-outlook-mcp-badge.png)](https://mseep.ai/app/ryaker-outlook-mcp)

# Modular Outlook MCP Server

A modular MCP (Model Context Protocol) server that connects Claude with Microsoft Outlook through the Microsoft Graph API using **app-only (client credentials) authentication** — no browser sign-in required.

Certified by MCPHub <https://mcphub.com/mcp-servers/ryaker/outlook-mcp>

## Directory Structure

```typescript
├── index.ts                 # Main entry point
├── config.ts                # Configuration settings
├── types.ts                 # Shared TypeScript type definitions
├── auth/                    # Authentication modules
│   ├── index.ts             # Authentication exports
│   ├── token-manager.ts     # Token management (client credentials)
│   └── tools.ts             # Auth-related tools
├── calendar/                # Calendar functionality
│   ├── index.ts             # Calendar exports and tool schemas
│   ├── types.ts             # Calendar type definitions
│   ├── list.ts              # List events (calendarView)
│   ├── create.ts            # Create event
│   ├── delete.ts            # Delete event
│   ├── cancel.ts            # Cancel event
│   ├── accept.ts            # Accept event
│   └── decline.ts           # Decline event
├── config/                  # Configuration modules
│   └── mailbox-permissions.ts  # Mailbox permission restrictions
├── email/                   # Email functionality
│   ├── index.ts             # Email exports and tool schemas
│   ├── folder-utils.ts      # Folder resolution utilities
│   ├── list.ts              # List emails
│   ├── search.ts            # Search emails
│   ├── read.ts              # Read email
│   ├── send.ts              # Send email
│   ├── mark-as-read.ts      # Mark as read/unread
│   ├── categories.ts        # Email categories management
│   └── archive-delete.ts    # Archive and delete emails
├── folder/                  # Folder management
│   ├── index.ts             # Folder exports and tool schemas
│   ├── list.ts              # List folders
│   ├── create.ts            # Create folder
│   └── move.ts              # Move emails between folders
├── rules/                   # Inbox rules
│   ├── index.ts             # Rules exports and tool schemas
│   ├── list.ts              # List rules
│   └── create.ts            # Create rule
└── utils/                   # Utility functions
    ├── graph-api.ts         # Microsoft Graph API helper
    └── mock-data.ts         # Test mode data
```

## Features

- **App-only Authentication**: Uses client credentials flow — no browser sign-in or user interaction required
- **Email Management**: List, search, read, send, mark as read
- **Categories Management**: Get master categories and set categories on emails
- **Archive & Delete**: Archive emails to archive folder, soft/hard delete
- **Calendar Management**: List upcoming events (recurring-aware), create, accept, decline, cancel, delete
- **Folder Management**: List, create, move emails between folders
- **Inbox Rules**: List, create, reorder rules
- **Mailbox Permission Restrictions**: Configurable per-mailbox access control
- **Multi-mailbox**: Access multiple mailboxes via the `mailbox` parameter on each tool
- **Test Mode**: Simulated responses for testing without real API calls
- **TypeScript**: Fully typed codebase with strict mode

## Quick Start

1. **Install dependencies**: `bun install`
2. **Azure setup**: Register app in Azure Portal with Application permissions (see below)
3. **Configure environment**: Copy `.env.example` to `.env` and add your Azure credentials
4. **Configure Claude**: Update your Claude Desktop config with the server path
5. **Start using**: No auth server needed — credentials are loaded automatically from env

## Installation

### Prerequisites

- [Bun runtime](https://bun.sh) — fast JavaScript/TypeScript runtime
- Azure account for app registration

```bash
bun install
```

Bun natively supports TypeScript and auto-loads `.env` files, so no additional tooling is needed.

## Azure App Registration & Configuration

This server uses **app-only (client credentials)** authentication. The app acts on behalf of your organization, not on behalf of a specific signed-in user. This requires admin consent for Application permissions.

### 1. App Registration

1. Open [Azure Portal](https://portal.azure.com/)
2. Go to **App registrations** → **New registration**
3. Enter a name (e.g., "Outlook MCP Server")
4. Select **Accounts in this organizational directory only** (single tenant)
5. **No redirect URI needed** — client credentials flow has no browser redirect
6. Click **Register**
7. Copy the **Application (client) ID** → this is your `MS_CLIENT_ID`
8. Copy the **Directory (tenant) ID** from the Overview page → this is your `MS_TENANT_ID`

### 2. Application Permissions

> ⚠️ These are **Application** permissions (not Delegated). They require admin consent.

1. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**
2. Add the following permissions:

| Permission | Purpose |
|-----------|---------|
| `Mail.Read` | Read emails |
| `Mail.ReadWrite` | Move, archive, update emails |
| `Mail.Send` | Send emails |
| `Calendars.ReadWrite` | Read and modify calendar events |
| `MailboxSettings.ReadWrite` | Read and manage inbox rules |

3. Click **Add permissions**
4. Click **Grant admin consent for [your organization]** — this is required for Application permissions

### 3. Client Secret

1. Go to **Certificates & secrets** → **Client secrets** → **New client secret**
2. Enter a description and select the longest expiration available
3. Click **Add**
4. ⚠️ Copy the secret **Value** (not the Secret ID) immediately — it won't be shown again

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
MS_TENANT_ID=your-directory-tenant-id-here
MS_CLIENT_ID=your-application-client-id-here
MS_CLIENT_SECRET=your-client-secret-VALUE-here
USE_TEST_MODE=false
```

**Important**: Use the secret **Value**, not the Secret ID.

### Claude Desktop Configuration

Copy from `claude-config-sample.json` and update paths and credentials:

```json
{
  "mcpServers": {
    "outlook-assistant": {
      "command": "bun",
      "args": [
        "/absolute/path/to/outlook-mcp/index.ts"
      ],
      "env": {
        "USE_TEST_MODE": "false",
        "OUTLOOK_TENANT_ID": "your-tenant-id-here",
        "OUTLOOK_CLIENT_ID": "your-client-id-here",
        "OUTLOOK_CLIENT_SECRET": "your-client-secret-here"
      }
    }
  }
}
```

## Authentication Flow

No browser sign-in or auth server is required. The server automatically fetches an access token using your app credentials when needed:

1. Claude starts the MCP server
2. Server reads `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` from environment
3. On first API call, a token is fetched via `POST /oauth2/v2.0/token` (client credentials)
4. Token is cached in memory and refreshed automatically when it expires

You can verify credentials are working using the `authenticate` tool in Claude.

## Mailbox Parameter

All tools that access Outlook data require a `mailbox` parameter specifying which mailbox to operate on (e.g., `chi@desertservices.net`). This is how the server knows which user's data to access in app-only mode.

Example: "List my last 10 emails from <chi@desertservices.net>"

## Mailbox Permissions

Write operations (send, archive, delete, create/modify rules, move emails, create events) are restricted to specific mailboxes to prevent accidental modifications.

### Allowed Mailboxes (Full Access)

Configured in `config/mailbox-permissions.ts`:
- `contracts@desertservices.net`
- `chi@desertservices.net`
- `dustpermits@desertservices.net`

All other mailboxes are **read-only**. Attempting write operations from an unlisted mailbox returns an error.

## Development

```bash
bun run start        # Start the MCP server
bun run typecheck    # TypeScript type checking
bun run lint         # Check formatting (Biome/Ultracite)
bun run lint:fix     # Auto-fix formatting
bun run inspect      # Open MCP Inspector for interactive testing
```

### Mock Mode

```bash
USE_TEST_MODE=true bun run start           # Start with mock data
```

## Troubleshooting

### Authentication Errors

#### "Missing credentials" on startup

Set all three env vars: `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`

#### "Invalid client secret" (AADSTS7000215)

You used the Secret ID instead of the Secret Value. Go to Azure Portal → Certificates & secrets and copy the **Value** column.

#### 403 Forbidden on API calls

Admin consent has not been granted for Application permissions. Go to Azure Portal → API permissions → **Grant admin consent**.

#### 403 on rules operations

Ensure `MailboxSettings.ReadWrite` Application permission is granted (not just `Mail.ReadWrite`).

#### "Sending is not allowed from this mailbox"

The mailbox is not in the `canSend` list in `config/mailbox-permissions.ts`. Add it or use an allowed mailbox.

### API Errors

#### "cpim_sts_Unsupported_endpoint"

You have a stale version of the server — this error means `me/` endpoints were used. Update to the latest version.

#### 400 on search with attachments filter

This was a known bug in older versions — `$search` and `$filter` cannot be combined. Fixed in v2.1.0.

## Extending the Server

1. Create new module directories (e.g., `contacts/`)
2. Implement tool handlers in separate `.ts` files with proper TypeScript types
3. Export tool definitions from module `index.ts` files
4. Import and add tools to `TOOLS` array in `index.ts`
5. Add any shared types to `types.ts` at the project root
6. Include a `mailbox` required parameter in all tool schemas that make API calls
