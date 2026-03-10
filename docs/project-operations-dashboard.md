# Project Operations Dashboard

A project-centric operational interface for Desert Services. Not an email client — a **project operations dashboard** where email is the primary input channel, projects are the unit of work, and actionable drafts are the output.

## Architecture

```text
INGESTION (done)              ACTION LAYER (building)

 Emails → Classify → Tag ──┐     ┌── Project Activity Feed
                            │     │     (what happened, ranked by urgency)
 Permits → Track ───────────┤     │
                            ├────→├── Draft Engine
 Contracts → Link ──────────┤     │     (contextual reply generation)
                            │     │
 Estimates → Match ─────────┘     ├── Review Queue
                                  │     (approve / edit / reject drafts)
                                  │
                                  └── SharePoint Sync
                                        (canonical file storage per project)
```

## Phase 1: Data Linkage Pipeline (running)

All ingestion and linkage is event-driven via pgmq + pg_cron:

| Job | Schedule | What it does |
|-----|----------|--------------|
| `outlook_folder_watch` | Every 30s | Syncs emails from all mailboxes, sets `emails.project_id` |
| `estimate_linker_maintenance` | Every 10 min | Links emails to estimates via pulse ID, estimate #, conversation thread backfill |
| `contract_won_bridge` | Every 2 min | Marks estimates Won/Not Awarded, links contract docs to projects |
| `email_triage_batch` | Every 60s | Classifies unclassified emails (CONTRACT, ESTIMATE, DUST_PERMIT, etc.) |
| `contact_enrichment` | Every 5 min | Enriches new contacts via PDL/Clearbit/avatar |

All data lands in Postgres. The linkage layer is mature — emails are tagged to projects, estimates are linked to emails, contracts are linked to estimates.

## Phase 2: Project Activity Feed (next)

The first piece of the action layer. Surfaces "which projects need attention right now."

### What it needs

A materialized view (or fast query) that answers per project:

```sql
-- Conceptual: projects ranked by "needs attention"
SELECT
  p.id, p.name, p.contractor,
  p.contract_status, p.dust_permit_status,
  latest.received_at AS last_activity,
  latest.subject AS last_email_subject,
  latest.from_name AS last_email_from,
  latest.classification AS last_email_type,
  unresponded.count AS unresponded_inbound_count
FROM projects p
LEFT JOIN LATERAL (
  SELECT received_at, subject, from_name, classification
  FROM emails WHERE project_id = p.id
  ORDER BY received_at DESC LIMIT 1
) latest ON TRUE
LEFT JOIN LATERAL (
  -- Inbound emails with no outbound reply from our team within 24h
  SELECT count(*)::int AS count
  FROM emails e
  WHERE e.project_id = p.id
    AND e.is_internal = 0
    AND NOT EXISTS (
      SELECT 1 FROM emails reply
      WHERE reply.project_id = p.id
        AND reply.is_internal = 1
        AND reply.received_at > e.received_at
        AND reply.received_at < e.received_at + interval '24 hours'
    )
) unresponded ON TRUE
ORDER BY unresponded.count DESC NULLS LAST, latest.received_at DESC NULLS LAST
```

### API

- `GET /api/projects/activity` — paginated list of projects ranked by urgency (unresponded inbound emails, recent activity)
- `GET /api/projects/:id/activity` — timeline of emails, documents, status changes for a single project

### UI

Project cards ranked by urgency. Each card shows:
- Project name + contractor
- Status rollup: `Estimate Won · Contract Received · Permit Active`
- Latest email (subject, sender, time)
- Badge: "3 unresponded" or "all clear"
- Click → project detail page

### Project detail page

| Section | Data source |
|---|---|
| Header | `projects` — name, contractor, location, awarded value |
| Status rollup | contract_status, dust_permit_status, noi_status, swppp_status, signs_status |
| Estimate | `estimates` — number, value, status (Won/Lost/Pending), current version total |
| Contract | `documents` — received date, contract value, review status |
| Dust permit | `dust_permits_filed_by_desert_services` — status, acreage, expiry |
| SWPPP | `swppp_work_orders` — active/inactive, last inspection |
| Email timeline | `emails WHERE project_id = ?` — chronological, with classification badges |
| Documents | `documents WHERE project_id = ?` — type badges (contract, NOI, LOI, plan) |
| Linkage confidence | Flag auto-assigned `project_id` links that haven't been reviewed |

## Phase 3: Draft Engine

Contextual reply generation for project emails that need a response.

### How it works

```text
Inbound email on tracked project (needs response)
  → Assemble context:
      - Project: name, contractor, status, awarded value
      - Estimate: number, line items, total
      - Contract: key terms, flags
      - Permit: status, expiry
      - Last 5 emails in thread
  → LLM generates reply draft (in Chi's voice, project-aware)
  → Graph API creates draft in Chi's mailbox ONLY (hard-scoped, not parameterized)
  → Draft appears in review queue
```

### Critical constraint

Drafts are created in **one mailbox only** — Chi's. This is a constant, not a parameter. The recent incident where drafts appeared in other people's mailboxes happened because the mailbox ID was dynamic. The draft engine hard-codes the target mailbox.

### New infrastructure needed

- New job type: `generate_reply_draft` (pgmq)
- Trigger: inbound email on a tracked project, classified as needing response
- New table: `draft_queue` — tracks draft lifecycle

```sql
CREATE TABLE draft_queue (
  id SERIAL PRIMARY KEY,
  email_id INTEGER REFERENCES emails(id),       -- the inbound email being replied to
  project_id INTEGER REFERENCES projects(id),
  graph_draft_id TEXT,                           -- Graph API message ID of the draft
  mailbox_id INTEGER REFERENCES mailboxes(id),   -- always Chi's mailbox
  status TEXT DEFAULT 'pending',                 -- pending | approved | edited | rejected
  generated_body TEXT,                           -- the LLM-generated draft text
  final_body TEXT,                               -- what was actually sent (if edited)
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
```

## Phase 4: Learning Loop

Approved and edited drafts feed back into the system.

- **Approved as-is** → log as positive example for similar emails
- **Edited before sending** → log the delta (what was changed and why)
- **Rejected** → log as negative example
- These become few-shot examples for future drafts on similar email types
- Classification rules that trigger "no reply needed" get refined over time

## Phase 5: SharePoint Canonical Sync

Background job that maintains a canonical folder structure per project in SharePoint.

```text
/Projects/{project_number} - {name}/
  ├── Contracts/
  ├── Permits/
  ├── Estimates/
  ├── Correspondence/
  └── Plans/
```

- When an email attachment is classified → file it to the right subfolder
- When an estimate is finalized → write the canonical PDF
- Deduplication: same attachment from multiple mailboxes → store once
- New job type: `sharepoint_file_sync` (pgmq, triggered per classified attachment)

## Current state

### What exists

- **Projects list page** — filterable by contract_status, dust_status, sortable, with search. Shows email count, awarded value, last seen. (`apps/web/api/projects/projects.ts`, `apps/web/frontend/pages/projects.tsx`)
- **Data linkage** — all pipelines running, emails tagged to projects, estimates linked
- **Email classification** — triage pipeline classifies all inbound (CONTRACT, ESTIMATE, DUST_PERMIT, etc.)
- **All API routes Zod-validated** — shared validation primitives in `apps/web/api/validation.ts`

### What doesn't exist yet

- **Project detail page** — no page for viewing a single project's full context
- **Activity feed** — no "needs attention" ranking
- **Draft engine** — no auto-generated replies
- **`draft_queue` table** — doesn't exist
- **SharePoint sync** — no automated filing
- **SOV tracking table** — mentioned as future need for tracking scope of values

## Relationship to inbox-zero

inbox-zero is a general-purpose email client with an AI rule engine. The project operations dashboard is a **domain-specific operations interface** that uses email as input but organizes around projects.

**Use inbox-zero for:**
- Graph API patterns (draft creation, send, folder management)
- UI components if they fit the stack
- Rule engine concept (rewired to our classification system)

**Build natively:**
- Project activity feed (depends on project_id linkage, not generic email rules)
- Draft engine (needs project context — estimate, contract, permit — that inbox-zero can't access)
- Review queue (project-scoped, not inbox-scoped)
- SharePoint sync (domain-specific filing logic)

## Key tables

```sql
projects              -- master list, project_id is the join key
emails                -- project_id set by folder watcher + estimate linker
estimate_emails       -- estimate <> email links (with match_type)
project_estimates     -- project <> estimate links (with canonical flag)
documents             -- contracts, NOIs, permits, etc. linked via email or direct
dust_permits_filed_by_desert_services  -- permit status + acreage + expiry
swppp_work_orders     -- SWPPP master from SharePoint
draft_queue           -- (future) draft lifecycle tracking
```
