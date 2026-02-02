# DS Contracts Dispatcher Worker

Cloudflare Worker that receives emails forwarded from contracts@desertservices.net via Email Routing, classifies them, and dispatches appropriate actions.

## Project Overview

- **Email**: `contracts-dispatch@desertservices.app`
- **Worker URL**: `contracts-dispatcher.cheez2012.workers.dev`
- **Source**: Emails forwarded from `contracts@desertservices.net`

## Triggers

1. **"Requested new link"** in body → Finds new DocuSign signing link
2. *(future)* DocuSign attachment forwarded → Kicks off contract intake
3. *(future)* Other patterns

## Quick Commands

```bash
# Local development (connects to real Cloudflare)
bun run dev

# Deploy to production
bun run deploy

# View live logs
bun run tail

# Run tests
bun test
```

## Architecture

```text
src/
├── index.ts        # Worker entry point (email + HTTP handlers)
├── docusign.ts     # DocuSign link extraction
└── graph.ts        # Microsoft Graph token handling
```

## Environment

Worker secrets configured via `wrangler secret put`:
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

## Bun Usage

- Use `bun <file>` instead of `node` or `ts-node`
- Use `bun test` for tests
- Use `bun install` for dependencies
