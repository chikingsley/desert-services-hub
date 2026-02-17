# Contracts Pipeline Architecture

**Updated:** 2026-02-16
**Purpose:** Single source of truth for how contract documents flow through the system, what's connected, and where the gaps are.

## How It Works Today (The Reality)

```sql
                           INCOMING
                           ========

  GC sends contract email
         │
         ▼
  ┌─────────────────────────────────────────────────┐
  │  Outlook: contracts@desertservices.net           │
  │  (or forwarded from a personal mailbox)          │
  └────────────┬────────────────────────────────────┘
               │
               │  Graph webhook fires
               ▼
  ┌─────────────────────────────────────────────────┐
  │  POST /api/webhooks/outlook                      │
  │  (background-jobs container)                     │
  │                                                  │
  │  ✅ Stores email row in `emails` table           │
  │  ✅ Downloads attachments → `attachments` table  │
  │  ❌ Does NOT classify email                      │
  │  ❌ Does NOT link to project                     │
  │  ❌ Does NOT trigger parsing                     │
  │  ❌ Does NOT create contract packet              │
  └────────────┬────────────────────────────────────┘
               │
               ▼
          🛑 DEAD END
     (attachments sit with extraction_status = 'pending')


  TO GET ANYTHING PARSED, you must manually forward
  the email to intake@desertservices.app:

  ┌─────────────────────────────────────────────────┐
  │  Forward email → intake@desertservices.app       │
  │                                                  │
  │  intake-worker (Cloudflare) receives it          │
  │  → Extracts attachments + file-sharing links     │
  │  → Preserves original sender/subject             │
  │  → POSTs to /api/webhooks/intake                 │
  │  → Also forwards to chi@ (you still get it)     │
  └────────────┬────────────────────────────────────┘
               │
               ▼
  ┌─────────────────────────────────────────────────┐
  │  Intake Pipeline (DOES WORK)                     │
  │                                                  │
  │  1. Saves files to disk                          │
  │  2. Enqueues `intake` job                        │
  │  3. Routes by file type:                         │
  │     PDF → Kreuzberg text extract (fast)          │
  │           fallback → OCR (GLM + Kimi reconcile)  │
  │     XLSX → Kreuzberg native extraction           │
  │     Images → GLM OCR                             │
  │  4. Classifies document type (heuristic):        │
  │     contract, subcontract, sov, insurance,       │
  │     po, plan_set, noi, estimate, etc.            │
  │  5. Stores in `documents` table                  │
  │  6. Auto-links to email by subject match         │
  │  7. Auto-links to project via conversation       │
  │  8. Uploads to SharePoint project folder         │
  └─────────────────────────────────────────────────┘
```

## Where Projects Come From

Projects are NOT created manually. Two automated sources:

### Source 1: Estimate Sync (Primary)

```sql
Monday.com ESTIMATING board
    │
    │  Syncs every ~60 seconds (estimate-poller worker)
    ▼
syncEstimates() → estimates table
    │
    │  Immediately after sync:
    ▼
syncProjectSeedsFromEstimates()
    │
    │  Groups estimates by normalized name + location
    │  Searches for existing project match:
    │    1. Exact seed_key match
    │    2. Exact normalized_name match
    │    3. project_aliases match
    │  If no match → CREATE PROJECT (lifecycle_state = 'seed')
    │  If match → link via project_estimates
    │
    │  Also:
    │    - Sets canonical estimate (won > pending won > bid sent > recent)
    │    - Promotes seed → active when estimate is won/pending-won
    │    - Moves stale seeds → lost after 45 days
    ▼
projects table + project_estimates join table
```

**Key file:** `apps/background-jobs/workers/estimate-poller/lib/project-seed-sync.ts`

### Source 2: Outlook Folder Watcher (Secondary)

```sql
New folder appears under Projects/Active/
    │
    │  Folder name: "ProjectName - Contractor"
    │  Polls every ~30 seconds
    ▼
findProjectByFolder()
    │
    │  1. Exact outlook_folder match
    │  2. Exact normalized_name match
    │  3. Ranked token scoring
    │
    │  High confidence → link folder to existing project
    │  Ambiguous → upsert project_match_reviews (pending)
    │  No match → CREATE PROJECT from folder name
    ▼
projects table (with outlook_folder set)
```

**Key file:** `apps/background-jobs/workers/outlook-folder-watcher/lib/projects.ts`

### Example: Redpoint Headquarters

```text
Monday.com estimate "1000- Redpoint headquarte" (02112623, bid_status: Bid Sent)
    → estimate sync created project #24243
    → project_estimates links estimate 1000870 to project 24243
    → contractor: "Redpoint Contracting"
```

## What's In The Database Right Now (Redpoint Example)

| Table | Data | Status |
|-------|------|--------|
| `emails` | 7 copies of the contract email | ✅ Stored |
| `attachments` | 3 real files × 7 emails (37 rows) | ⚠️ All `extraction_status = 'pending'` |
| `emails.classification` | NULL | ❌ Not classified |
| `emails.project_id` | NULL | ❌ Not linked |
| `projects` | #24243 "1000- Redpoint headquarte" | ✅ Exists |
| `project_estimates` | estimate 1000870 linked | ✅ Linked |
| `estimates.bid_status` | "Bid Sent" | ⚠️ Should be "Won" now |
| `documents` | None for this contract | ❌ Nothing parsed |
| `contract_packets` | None | ❌ No packet |

**The 3 real attachments sitting untouched:**
1. `1000 - Subcontract.002 - SWPPP - Desert Services.pdf` (477KB) — the contract
2. `1000 - Sub - AIA Pay App Form - Template.xlsx` (32KB) — pay app template
3. `1000 - Preliminary Notice Information Sheet-REV.1.pdf` (53KB) — prelien notice form

## Contract Packet Lifecycle (Schema Exists, Not Wired Up)

The `contract_packets` table tracks a contract through its lifecycle:

```text
requested → received → triage_in_progress → ready_to_send_back
                                                    │
                                               sent_back → awaiting_counterparty → executed
                                                    │
                                                on_hold / archived
```

Each packet has:
- `project_id` — which project this is for
- `status` — lifecycle state
- `owner` — who's responsible
- `next_action` — what needs to happen
- `sla_minutes` — default 1440 (24 hours)
- `is_active` — only one active packet per project

Documents link to packets via `contract_packet_documents` with roles:
- `primary_contract` — the actual subcontract PDF
- `po` — purchase order
- `insurance` — COI / ACORD cert
- `sov` — schedule of values
- `plan_set` — project plans
- `exhibit` — contract exhibits
- `supporting` — everything else

A queue view `contract_packet_queue_v` shows SLA breach status.

**What's missing:** Nothing automatically creates a packet or links documents to it. The `backfillContractPacketDocuments()` function exists but only runs if documents are already in the `documents` table with a project link.

## What Needs To Go Back To The GC

After receiving a contract, Desert Services needs to send back:

### Always Required

1. **GC Response Email** — acknowledgment, scope clarifications if needed, promise of COI
2. **W-9** — current company tax form
3. **COI (Certificate of Insurance)** — requested from Katie Beck at WTW broker
   - Must include correct certificate holder, additional insured, endorsements
   - Takes time (broker turnaround), so request immediately

### If Contract Has Issues

4. **Marked-up contract PDF** — redlines with scope/value corrections
5. **Scope clarification notes** — what's in vs. out of estimate

### If Requested

6. **Schedule of Values** — line items from estimate in GC's format
7. **Portal registration** — Procore, Textura, GC Pay, etc.
8. **Bonding documents** — if contract requires bond
9. **Certified payroll setup** — if Davis-Bacon / prevailing wage

### Internal

10. **Internal handoff email** — project record, contacts, billing setup, open questions

## SOV Comparison: What Exists

| Capability | Status |
|-----------|--------|
| Estimate line items stored (`estimate_sections` + `estimate_line_items`) | ✅ Working |
| Canonical estimate per project (`project_estimates.is_canonical`) | ✅ Working |
| Publish estimate as project SOV (`project_sov_master`) | ✅ Working |
| SOV revision history (`project_sov_revisions`) | ✅ Schema exists |
| Extract SOV from contract PDF | ❌ Not built |
| Line-by-line comparison (estimate SOV vs contract SOV) | ❌ Not built |
| Total-level math check (UI only) | ⚠️ Frontend component exists |

**Key files:**
- `lib/db/repositories/project-sov.ts` — SOV snapshot management
- `lib/db/repositories/project-estimate.ts` — canonical estimate selection
- `apps/web/frontend/components/contracts/contract-detail-panel.tsx` — math check UI

## The Gaps (In Priority Order)

### Gap 1: Contract Emails Don't Trigger Processing

**Problem:** Emails to contracts@ are stored but nothing happens after that.

**What needs to happen:**
When an email lands in the contracts@ mailbox (or when attachments are detected on a contract-like email), the system should automatically:
1. Classify the email as contract-related
2. Link it to the matching project
3. Process attachments through the existing intake/parse pipeline
4. Create or update a contract packet

**Two approaches:**
- **A) Auto-process from email webhook** — detect contract patterns in the outlook webhook handler, trigger intake pipeline on attachments directly
- **B) Auto-forward to intake** — when the system detects a contract email, programmatically forward it to the intake pipeline (reuse existing flow)

### Gap 2: Email-to-Project Linking For Contracts

**Problem:** Contract emails have `project_id = NULL`. The folder watcher only watches `Projects/Active/`, not the contracts folder.

**What exists that could help:**
- The email subject `"1000 - Subcontrat.002 - SWPPP ($7,930.00) - Redpoint Headquarters."` contains the job number `1000` and project name `Redpoint Headquarters`
- Project #24243 already exists with name `"1000- Redpoint headquarte"`
- The shared project matcher (`lib/project-matching.ts`) can fuzzy-match by tokens

**What needs to happen:**
Subject-based project matching for contract emails, using the same matcher infrastructure the folder watcher uses.

### Gap 3: Contract Packet Auto-Creation

**Problem:** No packet exists for Redpoint even though a contract email arrived.

**What needs to happen:**
When a contract-classified document is linked to a project, auto-create a `contract_packets` row with:
- `status = 'received'`
- `received_at = now()`
- `packet_type` inferred from number/types of attachments

The `backfillContractPacketDocuments()` function already handles linking docs to packets — it just needs packets to exist.

### Gap 4: SOV Extraction From Contract PDF

**Problem:** Can't compare contract values to estimate if we can't extract structured line items from the contract PDF.

**What needs to happen:**
After a contract PDF is parsed (OCR + reconciled markdown), run extraction to pull:
- Total contract value
- Line items with quantities, units, unit prices
- Scope description per line item

Then compare against the canonical estimate's line items.

### Gap 5: Outgoing Document Generation

**Problem:** No automated way to prepare the response packet (GC email, redlines, COI request).

**What needs to happen:**
Templates exist in `packages/contracts/templates/` but aren't wired to any automation. Eventually:
- Auto-generate GC response draft from template
- Auto-request COI from broker
- Track what's been sent and what's outstanding

## Key Files Reference

| Component | Path |
|-----------|------|
| Email webhook | `apps/background-jobs/api/webhooks/outlook.ts` |
| Intake webhook | `apps/background-jobs/api/webhooks/intake.ts` |
| Intake pipeline | `apps/background-jobs/lib/files-intake.ts` |
| File processors | `apps/background-jobs/lib/files-intake-processors.ts` |
| Parse pipeline (OCR) | `apps/background-jobs/lib/parse-intake.ts` |
| Post-processing/linking | `apps/background-jobs/jobs/intake-processing.ts` |
| Document classifier | `packages/documents/pdf-analysis-cli/src/pdf_analysis/classify.py` |
| Intake CF worker | `apps/cf-workers/intake-worker/src/index.ts` |
| Email processing | `apps/background-jobs/jobs/email-processing.ts` |
| Project seed sync | `apps/background-jobs/workers/estimate-poller/lib/project-seed-sync.ts` |
| Folder watcher projects | `apps/background-jobs/workers/outlook-folder-watcher/lib/projects.ts` |
| Project matching | `lib/project-matching.ts` |
| Project SOV | `lib/db/repositories/project-sov.ts` |
| Canonical estimate | `lib/db/repositories/project-estimate.ts` |
| Contract packets schema | `supabase/migrations/20260212170000_contract_packet_lifecycle.sql` |
| SOV master schema | `supabase/migrations/20260212230000_project_sov_master.sql` |
| Contract templates | `packages/contracts/templates/` |
| Contract review suite | `packages/contracts/review/src/contract_review/` |
| Post-contract process | `packages/contracts/docs/post-contract-process.md` |
| Packet lifecycle spec | `packages/contracts/docs/contract-packet-lifecycle-2026-02-12.md` |
| Web API | `apps/web/api/contracts/contracts.ts` |
| Frontend UI | `apps/web/frontend/pages/contracts.tsx` |

## Runtime Services

| Service | Container | What It Does For Contracts |
|---------|-----------|---------------------------|
| `background-jobs` | `desert-webhooks` | Email webhook, job queue, intake processing, folder watcher, estimate sync |
| `web` | `desert-web` | Contracts API, frontend UI, SOV endpoints |
| `intake-worker` | Cloudflare Edge | Receives forwarded emails, extracts attachments, posts to intake webhook |
| `docusign-dispatcher` | Cloudflare Edge | Routes DocuSign signing links from contracts@ |
