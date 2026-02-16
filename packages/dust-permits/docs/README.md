# Documentation

## Quick Links

| Doc | Description |
|-----|-------------|
| [Architecture](./architecture.md) | System design and data flow |
| [API](./api.md) | HTTP API endpoints |
| [Webhook Contract](./contracts/webhook-source-interface.ts) | Data contract for triggering permits |

## Folder Structure

```text
docs/
├── README.md              # This file
├── architecture.md        # System architecture
├── api.md                 # API reference
├── contracts/
│   └── webhook-source-interface.ts  # Webhook data contract
├── reference/
│   ├── gemini-api.md              # Gemini AI API reference
│   ├── maricopa-assessor.md       # Maricopa Assessor API
│   ├── playwright-patterns.md     # Browser automation patterns
│   └── element-recorder-usage.md  # Element recorder tool
└── page-snapshots/
    ├── maricopa/          # Maricopa County portal HTML snapshots
    └── pima/              # Pima County portal HTML snapshots
```

## Key Concepts

### Data Flow

```text
Webhook Source → API Server → PDF Extraction → Form Filling → Maricopa Portal
      ↓              ↓               ↓              ↓               ↓
  ProjectFiles   Download       FormData       Browser        Application
  (PDF URLs)     PDFs          Structured     Automation      Submitted
```

### Source Layout

| Directory | Purpose |
|-----------|---------|
| `src/portal/` | Browser automation for Maricopa County portal |
| `src/pdf/` | AI-powered data extraction from PDFs |
| `src/email/` | Microsoft Graph email integration |
| `src/db/` | SQLite database access |
| `src/api/` | HTTP API handlers |

### Browser Session Patterns

| Pattern | Location | Purpose |
|---------|----------|---------|
| **Singleton API Session** | `src/api/browser.ts` | Reuse browser across HTTP requests |
| **Per-Test Session** | `tests/e2e/utils/harness.ts` | Isolated browser per test |

Both use core utilities from `src/portal/utils/browser.ts`.

## External Links

- [Maricopa Dust Control Portal](https://dm.maricopa.gov/DMCPortal/)
- [Google Gemini API](https://ai.google.dev/gemini-api/docs)
- [Playwright Docs](https://playwright.dev)
