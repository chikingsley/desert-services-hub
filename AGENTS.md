# Desert Services Hub - Agent Notes

This repo runs with a Docker Compose runtime:
- **Docker Compose** for always-on web/webhooks/permit-worker + poller services.

## Deployment Model (Authoritative)

- Single environment: **self-hosted on `gmk-server`**.
- Runtime/database are local Docker containers on that host.
- Public ingress is via **Cloudflare Tunnel** to those containers.
- Do not assume a separate hosted/remote Supabase environment for runtime operations.

## Where This Runs

- Primary host: `gmk-server`
- Repo path: `/home/simon/github/desert-services-hub`

## First Commands (Ops)

- `just up`        : build + start docker stack, strict health gate
- `just status`    : human-readable snapshot (docker + HTTP + pollers + best-effort CF)
- `just check`     : strict health gate (non-zero if core runtime is down)
- `just services-status` : focused status for poller containers

## Code Quality

- `just code-check` : typecheck + lint
- `just fix`        : autofix lint issues
- `just docs-path-check` : validates AGENTS/skill file-path references stay aligned
- Lint/fix standard: use Ultracite (`bun run lint`, `bun run fix`, or `ultracite check/fix <files>` for targeted runs).
- Avoid direct `biome check`/`biome lint` for normal lint workflows; use Biome directly only for operations Ultracite cannot express, then re-run `bun run lint`.

Note: repo tests include **integration coverage** that can trigger Microsoft device-login and create Outlook drafts.

## Estimate Guardrails (Required)

- Do not rely on free-form estimate line-item text; route estimate create/update through API validation.
- Validation source of truth: `packages/estimates/src/estimating/estimate-payload-validation.ts`.
- Line items must resolve to catalog code/exact name; persisted values must be canonical `item_name` + catalog `description`.
- When `line_items` are provided, required fields are `job_name`, `client_name`, `job_address`, and `client_address`.
- `job_address` and `client_address` must be a normalized two-line address (`street` on line 1, `city/state/zip` on line 2).
- `sections` cannot be updated without `line_items` in the same payload.
- Validation failures must hard-fail with `400` (issues payload), never silent fallback.
- Regression coverage for this behavior lives in:
  - `apps/web/api/estimates/estimates.test.ts`
  - `tests/components/estimates/estimate-workspace.test.ts`

## Runtime Inventory

Docker Compose (see `docker-compose.yml`):
- `web` (port 3000)
- `webhooks` (port 4747)
- `permit-worker` (port 47822)
- `notifications` (poller loop)
- `swppp-sync` (poller loop)
- `tunnel` (optional)

## Runtime Truth (2026-02-12)

Active worker/runtime components:
- Cloudflare Workers (`apps/cf-workers/`): `intake-worker`, `monday-status-sync-worker`, `inspections-email-worker`, `docusign-file-automation` (dispatcher partial).
- In-process background-jobs modules (`apps/background-jobs/workers/`): `estimates-sync-worker`, `outlook-folder-watcher`, `estimate-email-linker`, `estimate-poller`, `buildingconnected-file-sync`.
- Docker services: `background-jobs` (webhooks + job queue + sync timers), `notifications`, `swppp-sync`, `permit-worker`, `web`.

Notes:
- Intake runtime lives in `apps/background-jobs/lib/*`; avoid reintroducing legacy standalone intake worker folders.

Estimate-email linking runtime:
- Runs inside `apps/background-jobs/worker.ts` as a periodic backfill timer (every 60s).
- No separate `systemd` unit should run for estimate-email-linker.

Project-linking runtime (shared matcher):
- Canonical matcher lives in `lib/db/repositories/project.ts` (`findProjectCandidates`, `findBestProjectMatch`).
- Shared text normalization/token helpers live in `lib/db/repositories/project.ts`.
- Folder watcher flow: project linking + thread expansion + deterministic single-estimate linking + ranked multi-estimate linking + periodic estimate-email backfill.
- Ambiguous project matches are persisted to `project_match_reviews` (`status='pending'`) for manual triage instead of silent fallback.

## Email/Document Linking Safety (Required)

- Never trust folder membership alone for project linking; require subject/name evidence or an existing same-project thread anchor.
- Never auto-overwrite a non-null `emails.project_id` with a different project ID; create review/triage evidence instead.
- For attachment/document backfills, do not copy `emails.project_id` into `documents.project_id` when the email subject does not match project hints.
- Before generating contract/safety deliverables from linked records, verify project linkage and resolve cross-project evidence first.

## Debugging Shortcuts

- Docker:
  - `docker compose ps`
  - `docker compose logs -f web|webhooks|permit-worker|notifications|swppp-sync`
- Pollers:
  - `docker compose logs -f notifications`
  - `docker compose logs -f swppp-sync`

## Docs

- `SYSTEM-MAP.md` for the current runtime map and data flows.
- `CLAUDE.md` for detailed conventions and testing rules.

## Safety Docs Ops (SSSP/SDS)

- Primary SSSP input for current LGE packet:
  - `data/triage/1400-w-3rd/sssp-input.json`
- Generate SSSP PDF:
  - `bun packages/documents/pdf-generation-cli/cli/cli.ts safety sssp generate --in <input.json> --out <output.pdf>`
- SSSP section selection (CLI override):
  - `--sections water-truck,street-sweeping,portable-sanitation`
  - `--sections all`
- SSSP JSON controls:
  - Preferred section list: `sections` (`water-truck`, `street-sweeping`, `portable-sanitation`) with at least one value.
  - Contact people are configured under `contacts[]` and must include at least 5 contacts with `role`, `name`, and `phone`.
  - Cover fields currently rendered: `projectName`, `gcName`, `date`, `projectAddress`, `jobNumber`.
- Contact policy for this flow:
  - Project lead defaults to the assigned Site Services Manager (SSM) from current sales-territory assignment, unless user overrides.
  - For lead/field/dispatcher contacts, format phone as two lines:
    - `C: (###) ###-####`
    - `O: (###) ###-####`
  - Do not wrap phone numbers within a line.
- Work Mac delivery:
  - Use SSH alias `work-mac` from `~/.ssh/config`.
  - Copy outputs to project folder:
    - `~/Downloads/1400w3rd/`
  - Open with Preview via AppleScript:
    - `osascript -e 'tell application "Preview" to open POSIX file "...pdf"'`

## SDS CLI (Inventory vs Binder)

- Tool location:
  - `packages/documents/pdf-generation-cli/cli/cli.ts`
  - `packages/documents/pdf-generation-cli/README.md`
- Input file (current working set):
  - `data/sds/sds-input.json`
- Two output modes:
  - Inventory only:
    - `bun packages/documents/pdf-generation-cli/cli/cli.ts safety sds generate --in data/sds/sds-input.json --out data/sds/SDS_Chemical_Inventory.pdf`
  - Full binder (inventory + appended SDS sheets):
    - `bun packages/documents/pdf-generation-cli/cli/cli.ts safety sds generate --in data/sds/sds-input.json --out data/sds/SDS_Binder.pdf --include-sheets`
- Optional flags:
  - `--download-sheets-from-url`: fetch entry `url` when local `pdfPath` is not present.
  - `--fail-on-missing-sheets`: exit non-zero if any sheet could not be appended.
- Naming standard:
  - List-only deliverable: `SDS_Chemical_Inventory*.pdf`
  - Full packet deliverable: `SDS_Binder*.pdf`

## Codex Chat History Retrieval

- If a user asks to find something from prior Codex chats (examples: "look in my chat history", "find a past codex chat", "find what we did before"), search local Codex logs directly under `~/.codex/`.
- Always check both:
  - `~/.codex/history.jsonl` for quick prompt/session ID clues.
  - `~/.codex/sessions/**/*.jsonl` for full transcript matches.
- Use `rg` first with user-provided anchor terms, then broaden terms if needed.
- Return the exact matching session/log path(s) and a short reason why each is relevant.
- Do not stop at a generic "I can't see other chats" response when local `~/.codex` logs are available in this environment.

## Project Triage DoD

For "find this project / build a packet / what is linked?" work, verify these conditions:

Definition of done (triage-ready baseline):

- Project row exists and status fields are explicit.
- Outlook folder linkage exists (`tracked_folders.project_id`).
- Relevant emails are linked (`emails.project_id`) and duplicate signal is reviewed.
- Estimate linkage exists in `project_estimates` (not old `projects.linked_estimate_ids`).
- Dust permit linkage is explicit in `dust_permits_filed_by_desert_services.project_id` or status evidence is clearly pending.
- Attachments/documents presence is verified in `attachments` and `documents` with extraction status summary.
- A short packet summary is written under `data/triage/<slug>/README.md` with exact evidence paths.

Notes:

- `data/triage/...` is a working packet area; not a standalone system-of-record.
- When needed for durability, ensure important files are represented in `documents` and/or moved to SharePoint.
- For duplicate mailbox-copy analysis, prefer `public.project_email_dedup_mv` and `just email-dedup-refresh`.

## Schema Source of Truth

To avoid schema drift mistakes during agent runs, prefer this order:

1. Live DB introspection (`\\d+ <table>`, targeted SQL) against the self-hosted Postgres container (`supabase_db_desert-services-hub`).
2. Current migrations under `supabase/migrations/`.
3. Runtime usage in repo (`lib/db/repositories/*`, `apps/web/api/*`).

Legacy drift traps to avoid:

- `projects` uses `name` (not `project_name`).
- `estimates` does **not** have `project_id`; project linkage is via `project_estimates`.

Do not assume older columns still exist just because old code/comments mention them.

## Query Routing Policy (Required)

To prevent regressions from ad-hoc query patterns:

- `/api/emails` default no-filter list must use `public.email_list_dedup_mv`.
- `/api/emails` filtered list/search paths must use canonical logic in `apps/web/api/emails/emails.ts` (not new bespoke scans).
- Email search must prefer `search_document @@ websearch_to_tsquery(...)` when available.
- Estimate fuzzy candidate matching must use `lib/db/repositories/estimate-email.ts` query shape aligned to trigram index usage.
- Queue/dequeue logic must reuse canonical prepared statements in `apps/web/worker.ts`.

For any new/changed DB query path, include:

- `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` before/after.
- explicit index usage confirmation (or rationale for sequential scan).
- impact/risk/effort classification in the change summary.

## Contract Packet Lifecycle (Required)

`projects.contract_status` is a coarse summary projection only (`Pending/Received/Sent Back/Executed`).
For packet-level operations, use canonical tables/views:

- `contract_packets` (one active row per project contract cycle)
- `contract_packet_documents` (packet -> one-or-many `documents`)
- `contract_packet_queue_v` (ops queue with SLA clock fields)

Agent rules:

- Do not treat `Pending` as actionable detail. Read `contract_packets.status`, `next_action`, and timestamps.
- Track packet shape explicitly via `contract_packets.packet_type`:
  - `single_pdf`, `multi_doc_packet`, `mixed`, `unknown`
- For “do we have the contract packet?” use evidence:
  - `contract_packet_documents` rows + `documents` provenance (email/attachment/file path)
- For SLA reporting use `contract_packet_queue_v.minutes_since_received` and `is_sla_breached`.
- Keep `projects.contract_status` aligned as a coarse projection, but do not use it as the source of truth for workflow decisions.

## Contract Status Fast Paths (Required)

Use these for quick project-level contract checks (coarse projection only):

- `just contracts-status-summary` → one-row counts (`pending/received/sent_back/executed/total`)
- `just contracts-pending` → ordered pending-project list
- `just contracts-pending-csv` → writes `data/reports/contracts-pending.csv`

Guardrail:

- Do not run ad-hoc SQL for these standard checks unless debugging.
- For pending checks, use the index-friendly predicate shape:
  - `contract_status = 'Pending' OR contract_status IS NULL`
  - Avoid `COALESCE(...)` in the `WHERE` clause.

Note:

- `projects.contract_status` is still a coarse summary projection.
- For packet-level operational workflow and SLA, use `contract_packets`, `contract_packet_documents`, and `contract_packet_queue_v`.
