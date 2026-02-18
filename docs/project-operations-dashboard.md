# Project Operations Dashboard

A project-centric view of everything: emails, documents, permits, estimates, contracts, SWPPP — all in one place.

## What it is

Every project has a trail of activity across multiple systems: estimate in Monday.com, contract in `contracts@`, dust permit in Maricopa, SWPPP in SharePoint, emails in Outlook. Right now, getting a full picture requires querying multiple places.

The dashboard surfaces all of that in a single project detail view, with accurate email linkage (already running in the background via the folder watcher + estimate linker).

## Phase 1 (running now)

The data linkage pipeline is live:

```text
Outlook folder watcher (every 30s) → sets emails.project_id for project emails
Estimate linker (every 60s) → links emails to estimates via pulse ID, estimate #, conversation thread
Contract won bridge (every 2 min) → marks estimates Won/Not Awarded, links contract docs
```

All the data exists in Postgres. What's missing is a UI to show it.

## What it should show (project detail view)

For a single project:

| Section | Data source |
|---|---|
| Header | `projects` — name, contractor, location, folder |
| Estimate | `estimates` — number, value, status (Won/Lost/Pending) |
| Contract | `documents` — received date, contract value, review status |
| Dust permit | `dust_permits_filed_by_desert_services` — status, acreage, expiry |
| SWPPP | `swppp_work_orders` — active/inactive, last inspection |
| Emails | `emails` — timeline of all project emails, sorted by date |
| Documents | `documents` — all attached files (contracts, NOIs, plans, etc.) |

## Current state of the projects list

`apps/web/frontend/pages/contracts.tsx` is the closest thing — it's a filterable list of estimates with contract + permit status columns. It's read-only and shows no email timeline or document detail.

There's no project detail page at all yet.

## What's missing

- **Project list page** — list of all projects with status summary (estimate status, contract, permit)
- **Project detail page** — the full view described above
- **Email timeline** — chronological list of emails linked to the project, with sender + subject
- **Document list** — all documents with type badges (contract, NOI, LOI, plan, etc.)
- **Status rollup** — single-line summary: `Estimate Won · Contract Received · Permit Active · SWPPP Current`
- **Linkage confidence** — surface projects where `emails.project_id` was auto-assigned but unreviewed

## Relationship to other workspaces

The Contract Review Workspace (`docs/contract-review-workspace.md`) is a focused flow for processing incoming contracts. The Project Operations Dashboard is the broader view after contracts are processed — it's where you check project health, not where you action new arrivals.

Eventually the dashboard becomes the primary operational interface, replacing ad-hoc Monday.com lookups for project status.

## Key tables

```sql
projects              -- master list, project_id is the join key
emails                -- project_id set by folder watcher + estimate linker
estimate_emails       -- estimate ↔ email links
project_estimates     -- project ↔ estimate links
documents             -- contracts, NOIs, permits, etc. linked via email or direct
dust_permits_filed_by_desert_services  -- permit status + acreage
swppp_work_orders     -- SWPPP master from SharePoint
```
