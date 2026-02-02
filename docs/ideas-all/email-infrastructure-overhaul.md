# Email Infrastructure Overhaul

**Status:** Idea / Discussion  
**Created:** 2026-01-28  
**Contributors:** Chi, Claude

---

## The Problem

We have powerful email capabilities scattered across the codebase:

1. **MCP Server** (`services/email/mcp-server.ts`) - Full Graph API access for Claude Code
2. **Census System** (`services/contract/census/`) - Email sync, discovery, account linking
3. **HTTP Server** (`services/email/http-server.ts`) - API for n8n workflows
4. **Draft Email Skill** (`.claude/skills/draft-email/`) - Voice/tone for drafting

But there's no **real-time response loop**. Emails come in, sit there, and I have to manually check and respond. For emails with clear answers (like "what's the status of my permit?"), I should get a pop-up with a draft I can approve and send.

---

## Two Connected Ideas

### Idea 1: Census as Core Infrastructure

Census is buried in `services/contract/` but it's actually the foundation for ALL email automation. It should be its own service.

**Current location:**
```text
services/contract/census/
├── db.ts              # SQLite schema (emails, accounts, projects, attachments)
├── sync-all.ts        # Sync all mailboxes
├── discovery.ts       # JWZ threading + multi-signal matching
└── ...
```

**Proposed location:**
```text
services/census/
├── db.ts                 # SQLite schema + helpers
├── sync/
│   ├── mailboxes.ts      # Sync mailboxes from Graph
│   ├── groups.ts         # Sync M365 groups
│   ├── accounts.ts       # Account/domain linking
│   └── scheduler.ts      # Cron/continuous sync
├── discovery/
│   ├── engine.ts         # Discovery engine (JWZ + multi-signal)
│   └── api.ts            # Discovery API
├── cli.ts                # bun census sync/search/stats
├── api.ts                # HTTP API
├── mcp-server.ts         # MCP for AI access
└── webhooks/
    └── graph.ts          # Microsoft Graph webhook receiver
```

**Why this matters:**
- Census becomes the single source of truth for all email data
- CLI for manual ops (`bun census sync --watch`)
- API for n8n/other services
- MCP for AI agents
- WebSocket for real-time notifications to Swift app

### Idea 2: Email Response Assistant (Swift App)

A native macOS menu bar app that:
1. Receives notifications when new emails arrive (via WebSocket from Census)
2. Shows a pop-up with the email + AI-generated draft response
3. Lets me edit and approve the draft
4. Sends via existing email infrastructure

**UI Pattern (already have this in adhd-ui):**
```swift
@main
struct DesertEmailAssistantApp: App {
    var body: some Scene {
        MenuBarExtra {
            MenuBarView()  // Dropdown showing pending emails
        } label: {
            Label("Email", systemImage: "envelope.badge")
        }
        .menuBarExtraStyle(.window)
        
        WindowGroup("Review", id: "email-review") {
            EmailReviewPanel()  // Floating window for draft review/edit/send
        }
        .windowLevel(.floating)
    }
}
```

**Flow:**
```text
New email arrives
       │
       ▼
Census receives via webhook/poll
       │
       ▼
Census classifies + generates draft (optional)
       │
       ▼
WebSocket pushes to Swift app
       │
       ▼
Native macOS notification appears
       │
       ▼
Click → Floating panel with email + draft
       │
       ▼
Review → Edit (optional) → Approve → Send
```

---

## How They Connect

```text
                    Microsoft Graph
                          │
           ┌──────────────┴──────────────┐
           │ Webhook: new email          │ Polling: fallback
           ▼                             ▼
     ┌─────────────────────────────────────────┐
     │              Census Service              │
     │                                          │
     │  ┌─────────┐  ┌─────────┐  ┌──────────┐ │
     │  │  Sync   │  │   DB    │  │ Discovery│ │
     │  │         │  │ SQLite  │  │  Engine  │ │
     │  └────┬────┘  └────┬────┘  └────┬─────┘ │
     │       │            │            │       │
     │       └────────────┼────────────┘       │
     │                    │                    │
     │  ┌─────────────────┼─────────────────┐  │
     │  │ CLI │ HTTP API │ MCP │ WebSocket  │  │
     │  └─────────────────┼─────────────────┘  │
     └────────────────────┼────────────────────┘
                          │
        ┌─────────────────┼─────────────────────┐
        │                 │                     │
        ▼                 ▼                     ▼
   Manual CLI         n8n/API             Swift App
   (bun census)       (automation)     (DesertEmailAssistant)
                                              │
                                              ▼
                                    ┌─────────────────┐
                                    │ Floating Panel  │
                                    │ - Email preview │
                                    │ - Draft response│
                                    │ - Edit / Send   │
                                    └─────────────────┘
```

---

## Census CLI Commands

```bash
# Sync operations
bun census sync                      # Full sync all mailboxes
bun census sync --mailbox chi@...    # Single mailbox
bun census sync --incremental        # Only new since last sync
bun census sync --since yesterday    # Since specific date
bun census sync --watch              # Continuous mode (every 5 min)

# Query operations
bun census search "sprouts permit"   # Full-text search
bun census recent                    # Last 10 emails
bun census recent --limit 50         # Last 50 emails
bun census stats                     # Email/account statistics
bun census unlinked                  # Emails without project links

# Discovery
bun census discover 39009            # Find all related emails
bun census thread 39009              # Get conversation thread

# Accounts
bun census accounts                  # List all accounts
bun census accounts --type contractor # Filter by type
```

---

## Census HTTP API

```markdown
# Emails
GET  /census/emails                  # List/search emails
GET  /census/emails/:id              # Get single email
GET  /census/emails/:id/thread       # Get conversation thread
GET  /census/emails/:id/discover     # Discovery results
GET  /census/emails/:id/attachments  # List attachments

# Accounts
GET  /census/accounts                # List accounts
GET  /census/accounts/:id            # Get account
GET  /census/accounts/:id/emails     # Emails for account

# Projects
GET  /census/projects                # List projects
GET  /census/projects/:id/emails     # Emails for project

# Stats
GET  /census/stats                   # Overall statistics

# Real-time
WS   /census/stream                  # WebSocket for new emails
POST /census/webhooks/graph          # Microsoft Graph webhook

# Response Queue (for Swift app)
GET  /census/queue                   # Pending response items
POST /census/queue/:id/send          # Approve and send response
POST /census/queue/:id/skip          # Skip/dismiss item
```

---

## Census MCP Tools

```typescript
// For Claude Code / AI agents
const tools = [
  "census_search",        // Search emails by query
  "census_get_email",     // Get single email with body
  "census_get_thread",    // Get conversation thread
  "census_discover",      // Find related emails
  "census_recent",        // Get recent emails
  "census_stats",         // Get statistics
  "census_accounts",      // List accounts
  "census_projects",      // List projects
];
```

---

## Swift App Structure

```text
DesertEmailAssistant/
├── DesertEmailAssistantApp.swift    # Main app, MenuBarExtra
├── AppDelegate.swift                 # .accessory policy
├── Services/
│   ├── CensusClient.swift           # HTTP + WebSocket to Census
│   ├── DraftGenerator.swift         # AI draft generation
│   └── NotificationService.swift    # UNUserNotificationCenter
├── Models/
│   ├── QueuedEmail.swift            # Pending email model
│   └── DraftResponse.swift          # Draft response model
└── Views/
    ├── MenuBarView.swift            # Dropdown with queue count + list
    └── EmailReviewPanel.swift       # Floating review/edit/send panel
```

---

## Response Queue Schema

New table in Census for pending responses:

```sql
CREATE TABLE response_queue (
  id INTEGER PRIMARY KEY,
  email_id INTEGER NOT NULL REFERENCES emails(id),
  
  -- Generated draft
  draft_subject TEXT,
  draft_body TEXT,
  draft_to TEXT,           -- JSON array
  draft_cc TEXT,           -- JSON array
  
  -- AI metadata
  intent_detected TEXT,    -- "question", "request", "fyi", etc.
  confidence REAL,
  
  -- Status
  status TEXT DEFAULT 'pending',  -- pending, sent, skipped, edited
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  responded_at TEXT,
  
  UNIQUE(email_id)
);
```

---

## Intent Detection (Future)

Start simple, get smarter:

**Phase 1: Pattern-based**
- Email ends with `?` → likely a question
- Contains "status of", "update on" → status request
- From known contacts about known projects → high priority

**Phase 2: LLM-assisted**
- Use Claude to classify intent + generate draft
- Confidence scoring
- Learn from corrections

**Phase 3: Smart routing**
- Auto-categorize by type (contract, permit, estimate, etc.)
- Route to appropriate workflow
- Some responses fully automated (with approval)

---

## Open Questions

1. **Where does draft generation happen?**
   - In Census service (server-side)?
   - In Swift app (client-side via Claude API)?
   - Both? (Census generates, Swift can regenerate)

2. **What triggers a queue item?**
   - All external emails?
   - Only emails with detected questions?
   - Only emails from known accounts?
   - Configurable rules?

3. **How much editing in Swift vs full email client?**
   - Simple text editing in panel?
   - Or just approve/reject, edit in Outlook?

4. **Offline handling?**
   - What if Swift app is closed?
   - Queue persists in Census, shows on next open?

5. **Container deployment?**
   - Census runs in Docker/Cloudflare Worker?
   - Swift app connects to deployed endpoint?
   - Local dev vs production URLs?

---

## Implementation Order

### Phase 1: Census Restructure
1. Move census from `services/contract/census/` to `services/census/`
2. Update imports across codebase
3. Add CLI entry point (`bun census`)
4. Add `--watch` mode for continuous sync

### Phase 2: Census API
1. HTTP API server with basic endpoints
2. WebSocket for real-time new email notifications
3. Response queue table + endpoints

### Phase 3: Swift App MVP
1. Menu bar skeleton (copy from adhd-ui)
2. Connect to Census WebSocket
3. Show notification on new email
4. Basic review panel (read-only first)

### Phase 4: Draft Generation
1. Integrate draft-email skill context
2. Generate drafts for queued items
3. Edit + send flow in Swift app

### Phase 5: Graph Webhooks
1. Set up webhook endpoint
2. Register with Microsoft Graph
3. Switch from polling to webhook-driven

---

## Related Files

**Current census:**
- `services/contract/census/db.ts` - Schema
- `services/contract/census/sync-all.ts` - Sync logic
- `services/contract/census/discovery.ts` - Discovery engine

**Email MCP:**
- `services/email/mcp-server.ts` - Current email MCP

**Draft skill:**
- `.claude/skills/draft-email/SKILL.md` - Voice profile
- `.claude/skills/draft-email/voice-profile.md` - Tone/style
- `.claude/skills/draft-email/examples/` - Example emails

**Existing Swift patterns:**
- `adhd-ui/ADHDTimer/ADHDTimerApp.swift` - MenuBarExtra pattern
- `adhd-ui/ADHDTimer/Views/MenuBarView.swift` - Dropdown UI
- `adhd-ui/ADHDTimer/Views/FloatingTimerView.swift` - Floating window

---

## Feedback Requested

Looking for input on:
- Architecture decisions (where should what live?)
- Priority of features
- UI/UX for the Swift app
- Integration points with existing workflows
- Deployment strategy

Add your thoughts below or create linked docs for specific deep-dives.

---

## Discussion

<!-- Add comments/thoughts here -->
