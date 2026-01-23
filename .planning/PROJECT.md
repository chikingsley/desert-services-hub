# Contract Cascade

## What This Is

A contract intake and task management system for Desert Services. When a contract arrives at contracts@desertservices.net, the system auto-detects it, parses the context (project name, contractor, what's needed), and spawns the right tasks in Notion with the artifacts attached. People can pick up tasks and execute without hunting for information.

## Core Value

When a contract arrives, the right tasks spawn with the right context, and people can just execute.

## Requirements

### Validated

- ✓ Email integration via Microsoft Graph — existing (`services/email/`)
- ✓ Monday.com integration — existing (`services/monday/`)
- ✓ Notion integration — existing (`services/notion/`)
- ✓ Contract reconciliation templates — existing (`services/contract/`)
- ✓ PDF parsing capability — existing (`lib/pdf/`, `pdfjs-dist`)
- ✓ Estimate data model — existing (`lib/db/`, quote versioning)

### Active

- [ ] **DETECT-01**: System monitors contracts@desertservices.net for incoming contracts/POs/LOIs
- [ ] **DETECT-02**: System identifies contract emails vs other emails (classification)
- [ ] **PARSE-01**: System extracts project name from contract document
- [ ] **PARSE-02**: System extracts contractor name from contract document
- [ ] **PARSE-03**: System finds original estimate in Monday.com by matching project/contractor
- [ ] **PARSE-04**: System extracts contact information (who to email for follow-ups)
- [ ] **TASK-01**: System creates tasks in Notion when contract detected
- [ ] **TASK-02**: Each task has context attached: contract PDF, original estimate, contact info
- [ ] **TASK-03**: Reconcile contract task created with comparison checklist
- [ ] **TASK-04**: Email contractor task created (ask if they want us to start anything)
- [ ] **TASK-05**: Update QuickBooks task created
- [ ] **TASK-06**: Update Monday.com task created
- [ ] **TASK-07**: Notify internal team task created (installations, inspectors, billing)
- [ ] **TASK-08**: Start dust permit task created (if applicable based on contract)
- [ ] **TASK-09**: Order SWPPP plan task created (if applicable based on contract)
- [ ] **TASK-10**: Tasks are assignable to specific people
- [ ] **TRACK-01**: Task completion status is visible (open, in progress, done)
- [ ] **TRACK-02**: Time from contract arrival to completion is measurable

### Out of Scope

- Downstream dependent tasks (signs, narrative, installation tracking) — defer to v2
- Full activity history UI — defer to v2
- Agent automation of task execution — defer to v2; v1 is human scaffolding
- Mobile app — web/Notion only
- QuickBooks integration — manual update, just track that it was done
- Real-time email webhooks — v1 can poll or be triggered manually

## Context

**Current state:**
- Contracts funnel to contracts@desertservices.net
- Owner is the bottleneck for processing everything
- No task tracking — things live in inbox, get forgotten, become fires
- "We're not surviving" — critical urgency

**Existing pieces to cherry-pick:**
- Email client with full Graph API access (`services/email/client.ts`, `services/email/mcp-server.ts`)
- Monday.com client with search, create, update (`services/monday/client.ts`, `services/monday/mcp-server.ts`)
- Notion integration with findOrCreate helpers (`services/notion/mcp-server.ts`)
- Contract intake flow started (`services/contract/file-automation/`)
- PDF parsing via pdfjs-dist
- Email templates exist

**Users:**
- Owner (currently drowning)
- One admin being trained
- Possibly one more hire
- Eventually agents (backfill over time)

**Notion structure:**
- Partially exists; task database needs work

## Constraints

- **Timeline**: Critical — need something working in days, not weeks
- **Interface**: Tasks display in Notion — people work there, not a new UI
- **Tech stack**: Bun + TypeScript, build on existing services
- **Accuracy**: Contract parsing must be reliable — can't miss key terms (maintenance, T&M, vague language)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Tasks in Notion | People already work there, no new UI to learn | — Pending |
| Cherry-pick existing code | Faster than rewriting, email/Monday/Notion already work | — Pending |
| 7 immediate tasks | Core cascade that prevents fires, defer dependent tasks | — Pending |
| No real-time webhooks v1 | Adds complexity, polling or manual trigger is sufficient | — Pending |

---
*Last updated: 2026-01-22 after initialization*
