# Auto-Dust-Permit TODO

## 🔥 Critical: Architecture Consolidation

### API/Handler Unification

- [x] ~~**Consolidate API to use Handlers**~~: API now imports and uses handler Zod schemas for validation. Types are shared via `lib/types.ts`.
- [x] ~~**Add revise handler**~~: `src/handlers/revise.ts` - Fully implemented with CLI, API, UI modal, and AI tools.

### Sync Reimplementation

- [x] ~~**Real sync workflow**~~: Implemented portal sync:
  1. Download XLS exports from Maricopa portal (authenticated)
  2. Convert XLS → JSON (using xls-parser)
  3. Upsert into SQLite databases
  4. Integrated into CLI and API
- [x] ~~Mark current `sync` command as deprecated or rename to `import-csv`~~: Replaced CSV sync with Portal sync.

### Extract Deprecation (Claude Code Path)

- [x] ~~**Evaluate extract redundancy**~~: Claude Code skills now handle NOI/plan extraction; old Jina→Gemini pipeline removed.
- [x] ~~Decide on `extract` fallback~~: `extract` handler/command/endpoint removed in favor of skills + validators.

---

## 🚀 Post-v1.0.0 Roadmap

### Core Automation

- [ ] **Optimize `resume.ts`**: Refine logic for resuming interrupted applications.
- [ ] **PDF Generator Workflow**: Implement workflow for generating permit summary PDFs.
- [ ] **Retry logic at handler level**: Portal helpers have retries, but handlers should gracefully retry full operations on transient failures.
- [ ] **Error recovery for failed jobs**: Jobs table exists but no recovery mechanism.

### Dashboard & UI

- [ ] **Production Optimization**: Audit Dashboard React app for production builds.
- [ ] **Wire up revise modal**: Connect `src/components/revise-modal.tsx` to backend once handler exists.

### Integrations

- [ ] **MCP Server**: Wrap API/handlers in Model Context Protocol server.
  - Enable AI agents (Claude, Cursor) to call `create`, `revise`, `status` tools directly.
  - Handlers already have Zod schemas compatible with tool calling.
- [ ] **n8n integration**: Wire webhooks to n8n workflows.
- [ ] **Notion sync**: Update Notion records with permit status.

### Observability

- [ ] **Robust Sentry usage**: Currently initialized but underutilized. Add:
  - Breadcrumbs for each portal operation
  - User context (company, permit ID)
  - Performance tracking for slow operations
- [ ] **Real-time progress tracking**: WebSocket or SSE for operation progress.

### Notifications

- [ ] **Auto-email on permit actions**: Per `docs/workflows.md` gap analysis.
- [ ] **Expiration reminders**: Cron job to check permits expiring within 30 days.

---

## 📁 File Organization

### Target Structure

```
src/
├── cli.ts                 # CLI entry point
├── index.ts               # API entry point (Bun.serve)
├── handlers/              # Business logic (single source of truth)
│   ├── create.ts          # ✅ Done
│   ├── renew.ts           # ✅ Done
│   ├── close.ts           # ✅ Done
│   ├── delete.ts          # ✅ Done
│   ├── list.ts            # ✅ Done
│   ├── sync.ts            # ⚠️ Needs reimplementation
│   └── revise.ts          # ✅ Done
├── commands/              # CLI wrappers around handlers ✅
├── api/                   # HTTP wrappers (now uses handler schemas) ✅
├── portal/                # Browser automation (stable)
└── db/                    # Database operations (stable)
```

---

## ✅ Completed

- [x] Consolidate scripts into unified CLI with citty
- [x] Create handlers layer with Zod schemas
- [x] Add list, create commands to CLI
- [x] Replace PDF extraction pipeline with Claude Code skills + validators
- [x] Export AI tool schemas in `src/commands/tools.ts`
- [x] Seed databases from CSV data
- [x] Consolidate API to use handler schemas (removed duplicate types)
- [x] Shared types: `lib/types.ts` + `form-data.ts` are single sources of truth
