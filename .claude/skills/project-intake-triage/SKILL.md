---
name: project-intake-triage
description: >-
  Triage unknown/unclear projects and estimates in Desert Services Hub
  by searching Postgres for matching emails across all mailboxes,
  downloading all relevant attachments
  (contracts/LOIs/estimates/permits/NOIs/etc.), and assembling a local
  "triage packet" folder with a summary. Use when a user says "what
  project is this?", "find everything for estimate X", "we marked it won
  but have no contract", or provides an email thread/subject/body and
  wants the associated estimate/project and documents.
---

# Project Intake Triage

This skill turns “what is this project?” into a repeatable workflow:
1. Resolve a candidate `estimates` row (and/or `projects` row) from any identifier you have.
2. Find all relevant `emails` across all synced mailboxes.
3. Download every useful attachment into a local triage folder (contracts, LOIs, estimates, permits, NOIs, etc.).
4. Produce a short summary that points a human to the most important docs.

## Fast Path (DB-First, 60-90s)

Use this path for urgent asks like:
- "Find PV B3 and tell me the attached estimate."
- "Do we have a subcontract for this project?"
- "Given this estimate number, what project and contract docs are linked?"

### Rules
- Start in Postgres first (`projects` -> `project_estimates` -> `documents`).
- Do not start with repo-wide text search for data lookups.
- Run focused queries with `bun` SQL if `psql` is unavailable.
- Return a compact answer with IDs and linkage confidence.

### Minimal Query Sequence

1) Resolve project candidates by name/anchor:

```sql
select id, name, project_number, monday_item_id, updated_at
from projects
where name ilike '%pv b3%' or name ilike '%pv%b3%'
order by updated_at desc
limit 20;
```

2) Resolve canonical estimate linkage:

```sql
select pe.project_id, pe.estimate_id, pe.is_canonical, pe.source,
       e.name, e.estimate_number, e.monday_item_id, e.bid_status, e.bid_value, e.awarded_value
from project_estimates pe
join estimates e on e.id = pe.estimate_id
where pe.project_id = <project_id>
order by pe.is_canonical desc nulls last, pe.created_at desc;
```

3) Pull contract/subcontract evidence for that project:

```sql
select d.id, d.project_id, d.estimate_id, d.document_type, d.file_name, d.extraction_status, d.updated_at
from documents d
where d.project_id = <project_id>
  and (
    d.document_type ilike '%contract%'
    or d.file_name ilike '%contract%'
    or d.file_name ilike '%subcontract%'
    or coalesce(d.summary,'') ilike '%contract%'
    or coalesce(d.summary,'') ilike '%subcontract%'
  )
order by d.updated_at desc nulls last;
```

4) If `estimate_id` is null on key contract docs, still trust canonical `project_estimates` linkage and report doc-link gap explicitly.

### Output Contract

Always return:
- `project_id` + project name
- canonical `estimate_id` + estimate number + Monday item id
- top contract/subcontract doc IDs + filenames + extraction status
- confidence (`high` when canonical estimate exists and contract-like docs exist)
- explicit gaps (`contract docs not estimate-linked`, `no canonical estimate`, etc.)

## Fast DoD Audit (Run First)

Use the deterministic audit pack before ad-hoc querying:

```bash
just triage-audit <project_id>
```

This surfaces, in one pass:
- project/folder linkage
- email linkage + duplicate signal
- permit signal + permit-table linkage
- estimate linkage (`project_estimates`)
- attachment/document extraction status
- quick PASS/WARN checklist for triage completeness

For contract-focused triage, also check packet lifecycle queue state:

```bash
docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres -c "
select project_id, project_name, status, packet_type, owner, next_action,
       received_at, sent_back_at, executed_at, minutes_since_received, is_sla_breached
from contract_packet_queue_v
where is_active = true
order by project_id;"
```

For deeper duplicate mailbox-copy analysis (without mutating raw emails):

```bash
just email-dedup-refresh
just email-dedup-report <project_id>
```

**Important constraint:** Outlook folder moves are restricted to “writable” mailboxes (see `apps/cli-tools/email-cli/src/commands/config.ts`). You can still *read* and *download attachments* across mailboxes using app auth; don’t design a workflow that requires moving other people’s mail.

## Quick Start (Email/Estimate -> Everything)

### 0) Resolve Schema-Safe Candidates First (Required)

Use the canonical helper query before any ad-hoc table scans:

```bash
just triage-resolve "Tofel Dent Lariat"
```

This prevents common schema drift mistakes:
- `projects.name` is the project title column (not `projects.project_name`)
- `estimates` has no `project_id`; use `project_estimates`

### 1) Ensure The Outlook Folder Exists (chi@)

```bash
bun apps/cli-tools/email-cli/bin/cli.ts project-folder-mkdir "Mesa AZ Eastmark Stake - Low Mountain Construction" \
  --user chi@desertservices.net --apply
```

The folder watcher should create/link:
- `projects` row (`projects.outlook_folder = <folder name>`)
- `tracked_folders` row (`tracked_folders.display_name = <folder name>`)

### 2) Resolve Project + Folder IDs (DB)

After step 0, use the exact `projects.id` returned there:

```bash
docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres -c "
select p.id as project_id, tf.folder_id
from projects p
join tracked_folders tf on tf.project_id = p.id
where p.outlook_folder = 'Mesa AZ Eastmark Stake - Low Mountain Construction'
limit 1;"
```

For a timeline-style follow-up story after a date:

```bash
just triage-followup-story "lariat village tofel" "Tofel Dent- Lariat contract" "2025-12-01" "tofeldent.com"
```

### 3) Find Candidate Emails (DB)

Search using the most unique anchors you have:
- `estimates.estimate_number` (often appears in `Est_<estimate_number>_...pdf`)
- `estimates.monday_item_id`
- exact subject fragments
- GC/contractor domain (`lowmountain.com`) and address fragments (`10621`, `Williams Field`)

Example (estimate-number focused):

```bash
docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres -c "
select id, received_at, subject, from_email, mailbox_id, has_attachments, attachment_names
from emails
where subject ilike '%eastmark%stake%'
   or attachment_names ilike '%01282507%'
   or body_full ilike '%01282507%'
order by received_at desc
limit 200;"
```

### 3.5) Prefer Canonical Matcher + Review Queue Signals

Before manually guessing links, check if matcher already produced candidates/review items:

```bash
docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres -c "
select id, source, normalized_input, status, created_at
from project_match_reviews
where status = 'pending'
order by created_at desc
limit 50;"
```

And for duplicate mailbox copies while triaging a single project:

```bash
just email-dedup-refresh
just email-dedup-report <project_id>
```

### 4) Link Emails + Estimates Using Canonical Tables (DB)

Once you have a final email ID list, do:
- `UPDATE emails SET project_id = <project_id> WHERE id IN (...);`
- Insert into `estimate_emails` (many-to-many email↔estimate linkage).
- Insert into `project_estimates` (canonical project↔estimate linkage).

Do **not** use legacy `projects.linked_estimate_ids`.

Example:

```bash
docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
begin;
update emails
set project_id = 101
where id in (333003, 332890);

insert into estimate_emails (estimate_id, email_id, match_type, match_detail)
select 71772, e.id, 'agent', 'linked during project triage'
from emails e
where e.id in (333003, 332890)
on conflict do nothing;

insert into project_estimates (project_id, estimate_id)
values (101, 71772)
on conflict do nothing;
commit;"
```

Quick verify:

```bash
docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres -c "
select pe.project_id, pe.estimate_id, e.estimate_number, e.monday_item_id
from project_estimates pe
join estimates e on e.id = pe.estimate_id
where pe.project_id = 101
order by pe.estimate_id desc;"
```

### 5) Download Attachments (Email CLI)

Use `emails.message_id` (Graph message ID) and the mailbox address (`mailboxes.email`) to download attachments.

```bash
# One email:
bun apps/cli-tools/email-cli/bin/cli.ts download-attachments "<GRAPH_MESSAGE_ID>" \
  --user "<mailbox@desertservices.net>" \
  --out "data/email-extracts/<project-slug>/<email_db_id>/"
```

### 6) Ingest PDFs Into `documents` (Email CLI)

Once you have the PDFs downloaded locally, ingest them into Postgres `documents`
and link them to the project/estimate/email/attachment.

Command: `documents-ingest` (requires `--apply`).

Options you’ll usually provide:
- `--project-id <id>` (required)
- `--estimate-id <id>` (optional)
- `--email-id <emails.id>` (optional, for provenance)
- `--attachment-id <attachments.id>` (optional, for provenance)
- `--pipeline ingest|estimate|noi|parse`

Examples:

```bash
# Estimate PDF (fast local parser)
bun apps/cli-tools/email-cli/bin/cli.ts documents-ingest \
  "data/email-extracts/eastmark-stake/estimate/Est_01282507_from_DESERT_SERVICES_LLC_23536.pdf" \
  --project-id 101 --estimate-id 71772 \
  --email-id 295978 --attachment-id 165895 \
  --pipeline estimate --apply

# Contract / subcontract (LLM ingest)
bun apps/cli-tools/email-cli/bin/cli.ts documents-ingest \
  "data/email-extracts/eastmark-stake/master-contract/Master Contract_Desert Services LLC.pdf" \
  --project-id 101 --estimate-id 71772 \
  --email-id 70488 --attachment-id 1735 \
  --pipeline ingest --apply

# NOI certificate (specialized extractor)
bun apps/cli-tools/email-cli/bin/cli.ts documents-ingest \
  "data/email-extracts/eastmark-stake/permits/107263_CGP20_NEWPERMIT_NOI_CERTIFICATE.pdf" \
  --project-id 101 --estimate-id 71772 \
  --email-id 265142 --attachment-id 140117 \
  --pipeline noi --apply

# If a PDF ingests badly due to a weak text layer, use parse+OCR+reconcile:
bun apps/cli-tools/email-cli/bin/cli.ts documents-ingest \
  "data/email-extracts/eastmark-stake/master-contract/Master Contract_Desert Services LLC (002).pdf" \
  --project-id 101 --estimate-id 71772 \
  --email-id 52767 --attachment-id 194784 \
  --pipeline parse --ocr local --reconcile local \
  --document-type subcontract \
  --apply
```

Verify:

```bash
docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres -c "
select id, document_type, file_name, extraction_status, created_at
from documents
where project_id = 101
order by created_at desc;"
```

### 6.5) Build/Update Contract Packet Evidence

When the project has contract packet work, do not rely on `projects.contract_status` alone.
Use canonical packet tables:

```bash
# Find active packet for project
docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres -c "
select id, status, packet_type, owner, next_action, received_at, sent_back_at, executed_at
from contract_packets
where project_id = 101 and is_active = true;"

# Attach an ingested document to the packet with role
docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres -c "
insert into contract_packet_documents (packet_id, document_id, document_role, is_required)
values (5001, 9001, 'primary_contract', true)
on conflict do nothing;"
```

Recommended state flow:
- `requested` -> `received` -> `triage_in_progress` -> `ready_to_send_back` -> `sent_back` -> `awaiting_counterparty` -> `executed`

If a packet is on hold, use `on_hold` and set `next_action` explicitly with owner/timestamp context.

### 7) Optional: Move chi@ Emails Into The Folder (Email CLI)

Only move mail inside writable mailboxes (chi/contracts/dustpermits). To move a chi email:

```bash
bun apps/cli-tools/email-cli/bin/cli.ts move "<GRAPH_MESSAGE_ID>" \
  --user chi@desertservices.net \
  --dest "<tracked_folders.folder_id>" \
  --apply
```
