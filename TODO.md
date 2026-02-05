# Desert Services Hub - Current Tasks

**Last Updated:** 2026-02-04

Active work areas and known tasks for the Desert Services Hub platform.

---

## Contract Processing Pipeline (Active)

See `apps/contract/PROJECT.md` for full 15-step workflow and `STATE.md` for current status.

### Immediate Work

- [ ] Test redesigned workflow on next incoming contract
  - `workflow/queue.ts` - view contracts@ queue
  - `workflow/collect.ts` - gather PDFs
  - `workflow/extract.ts` - citation-based extraction
  - `workflow/reconcile.ts` - math-verified reconciliation
  - Template-based emails (Handlebars)

- [ ] Wire up LLM extraction to workflow
  - Connect Claude/Gemini to extraction prompts
  - Use Zod schemas with citation requirements

- [ ] Add email sending automation
  - Auto-send from templates
  - GC response handling

### Contract Workflow Backlog

- [ ] Monday/Notion integration after contract processing
- [ ] Auto-mark competing bids as lost in Monday
- [ ] SharePoint folder automation for new contracts
- [ ] Build contract queue management UI

---

## Documentation Updates (In Progress)

- [x] Update CLAUDE.md — removed census.db refs, fixed architecture
- [x] Update README.md — corrected structure (apps/web, apps/quoting, apps/contract-ui)
- [x] Update AGENTS.md — added quoting path context
- [x] Update .mcp.json — fixed quoting server path
- [x] Archive old TODO.md to TODO-ARCHIVE-2025-01.md

---

## Known Technical Debt

### Hub Database (hub.db)

- [ ] Verify all services use correct hub.db path (`apps/contract/hub.db`)
- [ ] Update any remaining scripts referencing old census.db paths
- [ ] Document migration path from census.db (if any data still needed)

### Services Cleanup

- [ ] `services/quoting/` was moved to `apps/quoting/` — verify no stale imports
- [ ] `services/mistral/` is Python-based — ensure uv environment documented
- [ ] `services/n8n/` — verify workflows still functional

### Workers

- [ ] `ds-estimates-sync-worker` — verify Monday sync still working
- [ ] `ds-inspections-email-worker` — check inspection processing
- [ ] `ds-contracts-dispatcher` — verify DocuSign integration
- [ ] `ds-monday-status-sync-worker` — status sync health

---

## Future Work (Unprioritized)

### Quoting App (`apps/web/`)

- [ ] Quote versioning and finalization
- [ ] Undo/redo UI for quote editor
- [ ] Takeoff upload modal
- [ ] Custom scale calibration for takeoffs
- [ ] PDF compression pipeline
- [ ] Email integration for sending quotes

### Contract UI (`apps/contract-ui/`)

- [ ] Stabilize experimental contract processing UI
- [ ] Project tracking dashboard
- [ ] Contract queue management interface

### Data Quality

- [ ] Contact enrichment batch processing
- [ ] Account-company linking improvements
- [ ] Estimate-email linking coverage expansion

---

## Reference

### Key Locations

- **Main App**: `apps/web/` — Bun full-stack (quotes, takeoffs, contracts, catalog)
- **Quoting MCP**: `apps/quoting/` — Quote generation and catalog
- **Contract Workflow**: `apps/contract/` — Processing pipeline
- **Hub Database**: `apps/contract/hub.db` — Primary data store
- **Monday Sync CLI**: `workers/ds-estimates-sync-worker/cli/hub.ts`

### Current Stats (Hub DB)

- 237,758 emails synced
- 125,235 attachments cataloged
- 4,843 estimates
- 3,611 accounts

### Documentation

- `CLAUDE.md` — Engineering standards and patterns
- `apps/contract/PROJECT.md` — Contract workflow
- `apps/contract/STATE.md` — Current processing state
- `workers/ds-estimates-sync-worker/SYNC-KNOWLEDGE.md` — Monday sync patterns
