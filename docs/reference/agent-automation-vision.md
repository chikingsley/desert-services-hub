# Agent Automation Vision

Captured Feb 2026 from brainstorm session. This is the north star, not a build plan.

## The Goal (2 months out)

Chi doesn't touch email. Agents handle the front-end workflow. Chi is the human doing QuickBooks, editing final outputs, checking boxes, crossing T's, dotting I's. Revenue generation, not email management.

## What's Actually Repetitive (automate these first)

### Dust Permit Billing

- Trigger: Point and Pay confirmation email arrives
- Always the same: extract payment info, look up estimate, draft billing email
- Recipients never change, format never changes
- **Status: Partially automated** (template exists, still manual trigger)

### Contract Intake

- Trigger: New contract email in contracts@ or InternalContracts
- Steps are documented in PROJECT.md
- Same questions every time: do we have insurance? what's the schedule of values? any flagged items?
- **Status: Manual with tooling** (scripts exist for individual steps)

### Project Status Check

- "What needs to be done on these projects?"
- Check each active project against its checklist
- Flag missing items, overdue responses, unsigned documents
- **Status: Manual** (ground truth folders exist but no automated sweep)

### Schedule of Values Extraction

- Contract comes in, extract the SOV, compare against our estimate
- Flag discrepancies, missing mobilization, scope gaps
- **Status: Script exists** for extraction, comparison is manual

### Repetitive Email Responses

- Scope clarification requests (same questions)
- Insurance certificate requests
- Dust permit status updates
- SWPPP document transmittals
- **Status: Manual** but patterns are consistent

## Architecture Decision: Don't Over-Engineer

### Rejected approaches

- Full agent orchestration framework (nanoclaw-style) - too much infrastructure
- Custom message broker / IPC system
- Microservices architecture
- Building a UI dashboard for agent status

### What we actually need

- **Skills**: Claude Code skills that encapsulate specific workflows (already have this)
- **Cron scripts**: Bun scripts that run on schedule to check for new work (simple, proven)
- **hub.db as the backbone**: Everything reads/writes to SQLite (already true)
- **Email CLI as the interface**: Draft, review, send (already built)

### The insight

The orchestration layer is Claude Code itself. Skills = agent specialization.
Subagents = parallel work. The polling loop is just `bun script.ts` on a cron.
No new framework needed.

## Future Exploration (not now)

### Vector Embeddings (sqlite-vec)

- Would help with semantic email search ("find everything about the school job")
- Keyword matching covers 80% of cases today
- Revisit when the pipeline is actually running and hitting matching failures at scale
- Could run batch embedding overnight on gmk-server with local model

### Document Pipeline (100% accuracy)

- Drawings are the hardest - preserving spatial context from construction plans
- Gemini 3 Flash handles text well but drawings need agentic vision (zoom + re-analyze)
- Goal: OCR once, trust the output, never re-process
- Current gap: no standardized "document record" format

### Nanoclaw / Agent Framework

- Forked to chi's GitHub for reference
- Key patterns worth borrowing: SQLite task queue, isolated agent contexts, cron scheduling
- Don't need the WhatsApp layer or container isolation
- If we ever need always-on background agents, this is the reference architecture
- Repo: github.com/gavrielc/nanoclaw (forked)

## Priority Order

1. Wire up existing skills into end-to-end workflows (contract intake, dust permit billing)
2. Add cron checks for new work (poll contracts@ for unprocessed emails)
3. Codify business rules (mobilization requirements, Tucson restrictions, insurance minimums)
4. Revisit embeddings / agent framework only when manual steps are actually eliminated
