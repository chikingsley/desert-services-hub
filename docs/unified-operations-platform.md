# Unified Operations Platform: Inbox-Zero Integration Plan

## Context

Desert Services Hub has a mature email ingestion + classification pipeline (36 mailboxes, 15 categories, project/estimate matching, 30+ pgmq job types) but lacks an email client UI, a rule engine for multi-action triggers, draft generation, and a learning loop. Inbox-zero has all of these as a Next.js SaaS app.

**This plan ports inbox-zero's concepts into DSH's existing architecture** (Bun server, raw SQL, pgmq, React SPA). It is a conceptual port — we study inbox-zero's patterns and build them natively. No Prisma, no Next.js, no multi-tenant auth.

**Existing plans absorbed:**
- `docs/contract-review-workspace.md` → Phase 5
- `docs/project-operations-dashboard.md` Phases 2-5 → Phases 2, 4, 7, 8

---

## What to Port from Inbox-Zero

| Port | Feature | Reference File |
|------|---------|---------------|
| YES | 3-tier rule engine (static → learned → AI) | `apps/inbox-zero/.../match-rules.ts` |
| YES | Action system (draft, reply, label, webhook, delayed) | `apps/inbox-zero/.../execute.ts`, `actions.ts` |
| YES | Thread tracking (TO_REPLY, AWAITING_REPLY, FYI) | `apps/inbox-zero/.../reply-tracker/` |
| YES | Draft generation with thread context | `apps/inbox-zero/.../reply/draft-reply.ts` |
| YES | Learning from corrections (GroupItem patterns) | `apps/inbox-zero/.../group/find-matching-group.ts` |
| YES | Mail client UI patterns (inbox list, thread view, compose) | `apps/inbox-zero/.../mail/` pages |
| YES | Rule management UI | `apps/inbox-zero/.../automation/` pages |
| NO | Multi-tenant auth, per-user OAuth | Single-tenant, internal tool |
| NO | Gmail/Google-specific | Outlook only via Graph API |
| NO | Prisma ORM | Raw SQL via @lib/db/hub |
| NO | Vercel AI SDK | Direct LLM calls (Ollama/Gemini/Anthropic) |
| NO | Bulk unsubscribe, cold email blocker, newsletter tracking | Not relevant for business ops |
| NO | Premium/billing, Loops, Resend, Tinybird | Not needed |
| NO | Upstash Redis/QStash | pgmq + pg_cron |
| NO | Google Drive filing | SharePoint (Phase 8) |

---

## Phase 0: Schema Extensions

**Goal:** Create the database tables that power the rule engine, thread tracking, and draft queue. No UI or API yet — just the foundation.

### New Tables

```sql
-- Rules: user-defined automation rules (inspired by inbox-zero Rule model)
CREATE TABLE rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  instructions TEXT,                    -- AI prompt for this rule
  -- Static conditions (all AND'd together when present)
  condition_from TEXT,                  -- regex/wildcard on from address
  condition_to TEXT,                    -- regex/wildcard on to address
  condition_subject TEXT,               -- regex on subject
  condition_body TEXT,                  -- regex on body
  condition_operator TEXT DEFAULT 'AND', -- AND|OR between static+AI
  -- Classification filter (DSH-specific: only run on certain triage categories)
  condition_classification TEXT[],      -- e.g. {'CONTRACT','DUST_PERMIT'}
  -- Behavior
  run_on_threads BOOLEAN DEFAULT TRUE,
  enabled BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  -- Learned pattern group
  group_id INTEGER REFERENCES rule_groups(id),
  -- System rules (TO_REPLY, AWAITING_REPLY, etc.)
  system_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Rule actions: what happens when a rule matches
CREATE TABLE rule_actions (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                   -- draft_reply|reply|forward|label|archive|webhook|create_task|link_project|enqueue_job
  -- Action-specific fields
  label TEXT,                           -- for label action
  to_address TEXT,                      -- for forward/reply/send
  subject_template TEXT,                -- for send/forward
  content_template TEXT,                -- for reply/draft (supports {{variables}})
  webhook_url TEXT,                     -- for webhook action
  job_type TEXT,                        -- for enqueue_job action (pgmq job type)
  delay_minutes INTEGER DEFAULT 0,      -- delayed execution
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Learned pattern groups (inbox-zero GroupItem concept)
CREATE TABLE rule_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  rule_id INTEGER,                      -- back-reference (nullable during creation)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE rule_group_items (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES rule_groups(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                   -- from|subject|domain
  value TEXT NOT NULL,                  -- the pattern value
  is_exclusion BOOLEAN DEFAULT FALSE,   -- exclude rather than include
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Executed rules: audit trail of every rule evaluation
CREATE TABLE executed_rules (
  id SERIAL PRIMARY KEY,
  email_id INTEGER NOT NULL REFERENCES emails(id),
  rule_id INTEGER REFERENCES rules(id),
  thread_id TEXT,                       -- conversation_id from emails table
  status TEXT DEFAULT 'pending',        -- pending|applying|applied|skipped|error
  match_reason TEXT,                    -- static|learned_pattern|ai|system_preset
  ai_reasoning TEXT,                    -- LLM explanation
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Executed actions: what actions were actually taken
CREATE TABLE executed_actions (
  id SERIAL PRIMARY KEY,
  executed_rule_id INTEGER NOT NULL REFERENCES executed_rules(id) ON DELETE CASCADE,
  action_id INTEGER REFERENCES rule_actions(id),
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',        -- pending|completed|error
  result_data JSONB,                    -- action-specific result (draft_id, label_id, etc.)
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Thread tracking (inbox-zero TO_REPLY/AWAITING_REPLY concept)
CREATE TABLE thread_trackers (
  id SERIAL PRIMARY KEY,
  email_id INTEGER NOT NULL REFERENCES emails(id),
  conversation_id TEXT NOT NULL,
  project_id INTEGER REFERENCES projects(id),
  status TEXT NOT NULL,                 -- to_reply|awaiting_reply|fyi|resolved
  assigned_to TEXT,                     -- mailbox or person responsible
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(conversation_id, status)       -- one active tracker per thread+status
);

-- Draft queue (from project-operations-dashboard.md Phase 3)
CREATE TABLE draft_queue (
  id SERIAL PRIMARY KEY,
  email_id INTEGER REFERENCES emails(id),
  project_id INTEGER REFERENCES projects(id),
  rule_id INTEGER REFERENCES rules(id),
  graph_draft_id TEXT,                  -- Graph API message ID
  mailbox_id INTEGER REFERENCES mailboxes(id), -- always Chi's
  status TEXT DEFAULT 'pending',        -- pending|generated|approved|edited|rejected|sent
  generated_body TEXT,
  final_body TEXT,
  context_snapshot JSONB,               -- frozen project+estimate+contract context used for generation
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);

-- Scheduled actions (delayed execution, from inbox-zero ScheduledAction)
CREATE TABLE scheduled_actions (
  id SERIAL PRIMARY KEY,
  executed_rule_id INTEGER NOT NULL REFERENCES executed_rules(id),
  action_id INTEGER NOT NULL REFERENCES rule_actions(id),
  email_id INTEGER NOT NULL REFERENCES emails(id),
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',        -- pending|executed|cancelled
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### New columns on existing tables

```sql
-- emails: add rule evaluation tracking
ALTER TABLE emails ADD COLUMN IF NOT EXISTS rules_evaluated_at TIMESTAMPTZ;
```

### Files to create

- `lib/db/repositories/rules.ts` — CRUD for rules, rule_actions, rule_groups, rule_group_items
- `lib/db/repositories/executed-rules.ts` — insert/update executed_rules + executed_actions
- `lib/db/repositories/thread-trackers.ts` — CRUD for thread_trackers
- `lib/db/repositories/draft-queue.ts` — CRUD for draft_queue
- `lib/db/repositories/scheduled-actions.ts` — CRUD for scheduled_actions

### Dependencies

- None (foundation layer)

---

## Phase 1: Email Client UI

**Goal:** A real email client view in the existing React SPA. Read from existing `emails` table — no new data needed.

### New API Routes (apps/web/server.ts)

```sql
GET  /api/inbox                    — paginated inbox (filterable by mailbox, classification, project, date range, read/unread)
GET  /api/inbox/thread/:id         — full conversation thread (all emails sharing conversation_id, with bodies)
GET  /api/inbox/stats              — unread counts per mailbox, per classification
POST /api/inbox/mark-read          — mark email(s) as read
POST /api/inbox/compose            — create Graph API draft in specified mailbox
POST /api/inbox/reply              — create Graph API reply draft
POST /api/inbox/send               — send a draft via Graph API
```

### New Frontend Pages

| Page | Route | What it shows |
|------|-------|--------------|
| Inbox | `/inbox` | Email list with mailbox tabs, search, classification filters. Inspired by inbox-zero's mail page. |
| Thread View | `/inbox/thread/:id` | Full conversation with bodies, attachments, classification badge, project link. Side panel or full page. |
| Compose | Modal/drawer | New email or reply. Rich text editor, recipient picker, mailbox selector. |

### Key Components (apps/web/frontend/components/)

- `inbox/email-list.tsx` — sortable, filterable email list
- `inbox/email-row.tsx` — single email row (from, subject, preview, time, classification badge, project badge)
- `inbox/thread-view.tsx` — conversation thread renderer
- `inbox/compose-modal.tsx` — email compose/reply form
- `inbox/mailbox-tabs.tsx` — tab bar for switching mailboxes

### Existing code to wire in

- `packages/email/` — Graph API for sending/drafting (already has `createDraft`, `sendMail`, etc.)
- `lib/db/` — emails table queries (extend existing patterns)
- Email body rendering — emails table has `body_preview` and `body_full`

### Inbox-zero reference

- `apps/inbox-zero/apps/web/app/(app)/[emailAccountId]/mail/` — mail UI page structure
- Component patterns for thread view, email list, compose

### Dependencies

- None (reads existing data)

---

## Phase 2: Project Activity Feed + Detail Page

**Goal:** "Which projects need attention right now?" — from `docs/project-operations-dashboard.md` Phase 2.

### New API Routes

```text
GET  /api/projects/activity        — projects ranked by urgency (unresponded inbound count, last activity)
GET  /api/projects/:id/detail      — full project context: emails, documents, estimates, permits, contracts, SWPPP
GET  /api/projects/:id/timeline    — chronological activity stream (emails, status changes, document arrivals)
```

### New Frontend Pages

| Page | Route | What it shows |
|------|-------|--------------|
| Activity Feed | `/projects/activity` | Project cards ranked by urgency. Badge: "3 unresponded" or "all clear". |
| Project Detail | `/projects/:id` | Full context: header, status rollup, estimate, contract, permit, SWPPP, email timeline, documents, linkage confidence |

### SQL (materialized view or fast query)

The `unresponded_inbound_count` query from `docs/project-operations-dashboard.md`:
- Inbound emails with no outbound reply from our team within 24h
- Ranked by unresponded count DESC, then last activity DESC

### Existing code to wire in

- `apps/web/api/projects/projects.ts` — existing project list API (extend, don't replace)
- `lib/db/repositories/project-matching.ts` — project data
- Existing `emails`, `documents`, `estimates`, `dust_permits_filed_by_desert_services`, `swppp_work_orders` tables

### Dependencies

- Phase 1 (thread view links from project detail page to inbox thread view)

---

## Phase 3: Rule Engine

**Goal:** Port inbox-zero's 3-tier rule matching into DSH. One email can fire N actions.

### Architecture

```sql
Email arrives (existing pipeline)
  → Triage classifies (existing: lib/triage/triage.ts)
  → NEW: enqueue `rule_evaluation` job
  → Background worker: evaluate rules for this email
    → Tier 1: Static conditions (regex on from/to/subject/body + classification filter)
    → Tier 2: Learned patterns (rule_group_items match on from/subject/domain)
    → Tier 3: AI fallback (LLM with rule instructions as context)
  → For each matched rule: execute actions via pgmq
    → draft_reply → enqueue generate_reply_draft
    → label → Graph API add label/category
    → forward → Graph API forward
    → webhook → HTTP POST
    → create_task → insert into thread_trackers or external system
    → link_project → update emails.project_id
    → enqueue_job → send to pgmq (any existing job type)
```

### New Files

- `lib/rules/match.ts` — 3-tier matching (port of inbox-zero's `match-rules.ts`)
- `lib/rules/evaluate.ts` — static condition evaluation (port of `evaluateRuleConditions`)
- `lib/rules/execute.ts` — action runner (port of inbox-zero's `execute.ts`)
- `lib/rules/ai-choose.ts` — LLM rule selection (port of `ai-choose-rule.ts`)
- `lib/rules/group-match.ts` — learned pattern matching
- `lib/rules/types.ts` — type definitions

### New pgmq Job Types

- `rule_evaluation` — evaluate all rules for one email
- `rule_action_execute` — execute one action for a matched rule
- `scheduled_action_tick` — execute delayed actions that are due

### New API Routes (rule management UI)

```sql
GET    /api/rules                  — list all rules with actions
POST   /api/rules                  — create rule + actions
PUT    /api/rules/:id              — update rule
DELETE /api/rules/:id              — delete rule
POST   /api/rules/:id/test        — dry-run a rule against a specific email
GET    /api/rules/history          — recent executed_rules with match reasons
POST   /api/rules/groups/:id/items — add learned pattern to a group
```

### New Frontend Pages

| Page | Route | What it shows |
|------|-------|--------------|
| Rules | `/rules` | List of rules with match counts, enable/disable toggle, drag-to-reorder |
| Rule Editor | `/rules/:id` | Edit rule: conditions, AI instructions, actions, learned patterns |
| Rule History | `/rules/history` | Recent rule evaluations with reasoning, match type badges |

### Integration with existing triage

- Triage runs FIRST (classification, project/estimate matching)
- Rule evaluation runs AFTER triage, in a separate job
- Rules can filter by classification: e.g. "only run on CONTRACT emails"
- Rules augment triage, don't replace it

### Inbox-zero reference

- `apps/inbox-zero/.../match-rules.ts` — the core 3-tier matching algorithm
- `apps/inbox-zero/.../execute.ts` — action execution loop with error tracking
- `apps/inbox-zero/.../ai-choose-rule.ts` — LLM rule selection prompt structure

### Dependencies

- Phase 0 (schema)

---

## Phase 4: Draft Engine

**Goal:** Contextual reply generation — from `docs/project-operations-dashboard.md` Phase 3.

### Architecture

```typescript
Inbound email needs response (triggered by rule or thread tracker)
  → Assemble context:
      - Project: name, contractor, status, awarded value
      - Estimate: number, line items, total
      - Contract: key terms, extraction entities
      - Permit: status, expiry, acreage
      - Last 5 emails in thread
  → LLM generates reply draft (Chi's voice, project-aware)
  → Graph API creates draft in Chi's mailbox ONLY
  → Insert into draft_queue (status: generated)
  → Draft appears in review queue
```

### New Files

- `lib/drafts/generate.ts` — context assembly + LLM draft generation
- `lib/drafts/context.ts` — gathers project+estimate+contract+permit context
- `lib/drafts/graph-draft.ts` — creates Graph API draft (Chi's mailbox only, hard-coded)

### New pgmq Job Type

- `generate_reply_draft` — assemble context, call LLM, create Graph draft, insert draft_queue row

### New API Routes

```sql
GET  /api/drafts                   — draft queue (pending, generated, approved, rejected)
GET  /api/drafts/:id               — single draft with context snapshot
POST /api/drafts/:id/approve       — mark approved, optionally send
POST /api/drafts/:id/edit          — update body, mark edited
POST /api/drafts/:id/reject        — mark rejected with reason
POST /api/drafts/:id/send          — send the draft via Graph API
```

### New Frontend Pages

| Page | Route | What it shows |
|------|-------|--------------|
| Draft Queue | `/drafts` | List of generated drafts: email subject, project, status, generated time |
| Draft Review | `/drafts/:id` | Side-by-side: original email + generated draft. Edit, approve, reject buttons. Context panel shows project/estimate/contract/permit data used. |

### Critical constraint

- **Chi's mailbox only.** `mailbox_id` is a constant, not a parameter. The draft engine hard-codes the target.

### Inbox-zero reference

- `apps/inbox-zero/.../reply/draft-reply.ts` — draft generation with thread context
- `apps/inbox-zero/.../choose-rule/choose-args.ts` — template variable filling

### Dependencies

- Phase 0 (draft_queue table)
- Phase 3 (rule engine triggers draft generation)
- Phase 2 (project context for draft assembly)

---

## Phase 5: Contract Review Workspace

**Goal:** From `docs/contract-review-workspace.md`. Focused UI for processing contracts@ arrivals.

### New API Routes

```text
GET  /api/contracts/review-queue   — contracts@ emails grouped by project, unreviewed count
GET  /api/contracts/review/:id     — single contract: document text, entities, flags, email thread
POST /api/contracts/review/:id/act — generate GC response or internal handoff draft
POST /api/contracts/review/:id/status — mark reviewed/actioned
```

### New Frontend Pages

| Page | Route | What it shows |
|------|-------|--------------|
| Contract Queue | `/contracts/review` | Deduplicated by project. Latest doc per project, email count badge. |
| Contract Review | `/contracts/review/:id` | Side-by-side: PDF iframe + entity-highlighted text + attributes panel. Flag panel (at-risk, scope delta, penalty language, missing exhibits, math check). Action buttons. |

### New Components

- `contracts/entity-viewer.tsx` — port of langextract visualization.py to React (color-coded entity spans, hover tooltips, attributes panel)
- `contracts/flag-panel.tsx` — business rule violation cards
- `contracts/action-buttons.tsx` — generate GC response, internal handoff

### Email templates (new)

- `packages/email/src/email-templates/gc-response.hbs`
- `packages/email/src/email-templates/internal-handoff.hbs`

### Existing code to wire in

- `packages/contracts/src/contract-doc-extract-queue.ts` — extraction data
- `packages/documents/langextract/` — entity data in `documents.raw_extraction`
- `packages/contracts/ground-truth/PATTERNS.md` — validation rules

### Dependencies

- Phase 4 (draft generation for GC response and internal handoff)

---

## Phase 6: Thread Tracking

**Goal:** Port inbox-zero's TO_REPLY / AWAITING_REPLY / FYI tracking. Integrates with activity feed.

### How it works

```text
Outbound email sent → status: awaiting_reply (we're waiting for them)
Inbound email on tracked thread → status: to_reply (we need to respond)
User marks resolved → status: resolved
FYI → informational, no response needed
```

### New Files

- `lib/thread-tracking/tracker.ts` — state machine for thread status transitions
- `lib/thread-tracking/auto-detect.ts` — heuristics for auto-detecting TO_REPLY vs FYI

### Integration points

- Rule engine (Phase 3): system rules with `system_type = 'TO_REPLY'` etc.
- Activity feed (Phase 2): unresponded count now uses thread_trackers, not just email timing heuristics
- Draft engine (Phase 4): thread_trackers with status=to_reply can auto-trigger draft generation

### New API Routes

```text
GET  /api/threads/tracking         — all active thread trackers, filterable by status/project
POST /api/threads/:id/track        — set tracking status for a thread
POST /api/threads/:id/resolve      — mark resolved
```

### UI Integration

- Activity feed cards show tracker status badges (TO_REPLY, AWAITING_REPLY)
- Inbox email rows show tracker status
- Bulk actions: "Mark resolved", "Mark FYI"

### Inbox-zero reference

- `apps/inbox-zero/.../reply-tracker/` — thread tracking state machine
- `apps/inbox-zero/.../check-sender-reply-history.ts` — heuristic for filtering noise senders

### Dependencies

- Phase 0 (thread_trackers table)
- Phase 2 (activity feed integration)
- Phase 3 (system rules trigger tracking)

---

## Phase 7: Learning Loop

**Goal:** From `docs/project-operations-dashboard.md` Phase 4 + inbox-zero's GroupItem patterns.

### Two feedback mechanisms

**1. Draft feedback (DSH-specific)**
- Approved drafts → positive examples for similar emails (stored in draft_queue with status + final_body)
- Edited drafts → log the delta (generated_body vs final_body)
- Rejected drafts → negative examples
- These become few-shot examples for future drafts on similar email types
- Query: "find approved drafts for this project's classification type"

**2. Rule corrections → learned patterns (from inbox-zero)**
- When AI matches a rule and user confirms → add sender/subject to rule's learned pattern group
- Next time same sender/subject appears → skip AI, use learned pattern directly
- When AI matches wrong → user corrects → add to correct rule's group, exclude from wrong rule's group
- Over time: AI gets called less, learned patterns handle more

### New Files

- `lib/learning/draft-examples.ts` — retrieves relevant past drafts as few-shot examples
- `lib/learning/pattern-learning.ts` — creates group items from confirmed/corrected rule matches

### New API Routes

```text
POST /api/rules/learn              — confirm or correct a rule match (creates group items)
GET  /api/drafts/examples          — fetch similar past drafts for context
```

### UI Integration

- Rule history page: "Was this match correct?" → Yes/No → learns pattern
- Draft review: after approval, system auto-learns the pattern

### Dependencies

- Phase 3 (rule engine with groups)
- Phase 4 (draft queue with approval tracking)

---

## Phase 8: SharePoint Canonical Sync

**Goal:** From `docs/project-operations-dashboard.md` Phase 5. Auto-file attachments to canonical SharePoint structure.

```text
/Projects/{project_number} - {name}/
  Contracts/
  Permits/
  Estimates/
  Correspondence/
  Plans/
```

### New pgmq Job Type

- `sharepoint_file_sync` — triggered per classified attachment, files to correct subfolder

### Logic

- Email attachment classified (by triage or rule engine) → determine subfolder from classification
- Deduplication: same attachment from multiple mailboxes → store once (hash-based)
- Estimate finalized → write canonical PDF to Estimates/
- Can be triggered as a rule action (`type: 'sharepoint_sync'`)

### Existing code to wire in

- `lib/sharepoint/` — existing SharePoint helpers
- `packages/email/` — attachment download

### Dependencies

- Phase 1 (attachments accessible via inbox UI)
- Phase 3 (rule actions can trigger filing)

---

## Implementation Order + Status

```text
Phase 0: Schema Extensions          DONE — 9 tables, 15 indexes, 5 repository modules
  ↓
Phase 1: Email Client UI            DONE (functional) — API + frontend + compose/reply
  ↓                                  TODO: redesign UI to match DSH theme (current version is ugly)
Phase 2: Project Activity Feed      NEXT — depends on Phase 1 for thread links
  ↓
Phase 3: Rule Engine                ← depends on Phase 0, the brain of the system
  ↓
Phase 4: Draft Engine               ← depends on Phase 0 + 2 + 3
  ↓
Phase 5: Contract Review            ← depends on Phase 4 for draft generation
  ↓
Phase 6: Thread Tracking            ← depends on Phase 0 + 2 + 3
  ↓
Phase 7: Learning Loop              ← depends on Phase 3 + 4
  ↓
Phase 8: SharePoint Sync            ← depends on Phase 3, can be done anytime after
```

Phases 1 and 2 can be done in parallel. Phases 5, 6, 7, 8 can be done in any order after their dependencies.

### Phase 1 UI Rework (deferred)

The inbox page, thread panel, and compose modal are functional but the design is generic/ugly.
Needs a full visual pass to match the DSH desert theme (warm colors, card styles, spacing,
the same polish as the estimates/contracts pages). This is cosmetic — the API layer and data
flow are correct and don't need to change.

---

## Verification Strategy

Each phase has its own verification:
- **Phase 0:** `\dt public.rules*` + `\dt public.thread_*` + `\dt public.draft_*` + `\dt public.scheduled_*` confirm tables exist
- **Phase 1:** Open inbox in browser, see emails from all 36 mailboxes, click into thread, compose a test draft
- **Phase 2:** Open activity feed, verify projects ranked by urgency, click into project detail, see full context
- **Phase 3:** Create a test rule, send a test email, verify rule matches and action executes. Check `executed_rules` table.
- **Phase 4:** Trigger draft generation for a project email, verify draft appears in Chi's Outlook and in draft_queue
- **Phase 5:** Open contract review queue, verify deduplication, view entities, generate GC response draft
- **Phase 6:** Verify outbound email sets awaiting_reply, inbound email sets to_reply, resolution works
- **Phase 7:** Approve a draft, verify learned pattern created. Correct a rule match, verify group item added.
- **Phase 8:** Classify an attachment, verify it appears in correct SharePoint folder

Tests: each phase adds unit tests to `tests/` mirroring the source path (per repo conventions). Integration tests replay real emails from the database.

---

## What This Replaces

After full implementation, the existing `docs/contract-review-workspace.md` and `docs/project-operations-dashboard.md` become historical context. This plan supersedes both. The existing triage system (`lib/triage/`) continues to run — the rule engine augments it, doesn't replace it.
