# Monday/Local/SWPPP Sync Status

Snapshot time: `2026-02-20 04:00:00+00`

## 1) Local DB vs Monday (Estimates)

- Local estimates total: `4492`
- Local estimates with `monday_item_id`: `4482` (`99.78%`)
- SWPPP-linked estimates (via `project_estimates`): `608`
- SWPPP-linked estimates with `monday_item_id`: `608` (`100%`)

SWPPP-linked estimate statuses:
- `Won`: `463`
- `GC Not Awarded`: `140`
- `Lost`: `2`
- `Add to Projects`: `2`
- `Yet to Bid`: `1`

Notes:
- Active SWPPP overlap estimate statuses are terminal now (`Won/GC Not Awarded/Lost` only).
- Contract-won pipeline now writes `Won/Lost` status + Date Awarded/awarded values on Monday estimate items.

## 2) SWPPP Work Orders vs Local Projects

SWPPP rows by worksheet:
- `SWPPP B & V`: `2926`
- `Confirmed Schedule`: `133`
- `Need to Schedule`: `33`

Active SWPPP (`Confirmed Schedule` + `Need to Schedule`) project linkage:
- Distinct active SWPPP projects linked to local `project_id`: `90`
- Active SWPPP rows with `project_id IS NULL`: `0`

Unlinked active SWPPP rows (`project_id IS NULL`):
- none

Recently linked (high confidence):
- `81` (`Northern Parkway Bldg D`) -> project `24257` (`Northern Parkway Bldg D`)
- `128` (`The Verge at Ballpark`) -> project `76` (`The Verge at Ballpark Village`)
- `18` (`SCAHCC LTC Facility ...`) -> project `23769` (`SAN CARLOS APACHE HEALTHCARE`)

## 3) Local Projects Lifecycle vs SWPPP Active

Local projects lifecycle counts (post-enrichment 2026-02-20):
- `seed`: `1972`
- `active`: `88`
- `archived`: `1162`
- `lost`: `67`

Definition: `active` = has an open SWPPP work order on "Confirmed Schedule" or "Need to Schedule" worksheet. Everything else with completed work (WOs, QB jobs, Won estimates) is `archived`.

Data enrichment pass (2026-02-20) applied:
- 670 SWPPP work orders linked to projects (90% coverage, up from 68%)
- 324 QB jobs linked to projects (47% coverage, up from 26%)
- 92 project address backfills, 331 awarded_value backfills from won estimates
- 88 projects with active WOs promoted to `active`
- 857 projects with only completed work (B&V WOs, QB jobs, Won estimates) archived

## 4) Local Projects vs Monday Projects Board

- `projects.monday_item_id` populated rows: `0 / 3288`

Interpretation:
- We currently do not maintain a persisted local mapping to Monday Projects board items.
- Monday project linking exists at Monday relation-column level, but local `projects` table has no stored Monday item ids yet.

## 5) What Was Fixed In This Pass

- Seed promotion bug fixed: `seed -> active` now occurs when active/won signal exists.
- Project-link sync default changed to enabled.
- Contract-won pipeline now updates:
- local estimate won/lost + awarded fields
- Monday estimate `deal_stage`, `deal_close_date` (Date Awarded), `deal_actual_value`
- Contract-won lifecycle refresh now runs immediately after won/lost updates.

## 6) Remaining Backlog To Reach 100% Coverage

- Active SWPPP `project_id` linkage backlog: `0` rows.
- Decide and implement local persistence for Monday Projects item mapping (`projects.monday_item_id`) if 3-way parity at project level is required in DB.
- Continue contract packet backfill to improve awarded value and Date Awarded quality for older won records.
- Deduplicate local `accounts` and `contacts` tables (normalize domains/emails, merge malformed Monday-style variants, and preserve canonical `monday_*` IDs + assignment fields).

### Monday Estimate Status Updates Needed (2026-02-20)

**243 Monday estimate items** need their `bid_status` updated to `Won`. These are canonical estimates for projects that have linked SWPPP work orders or QuickBooks jobs (proof of work performed), but Monday still shows a non-won status:

| Current Monday Status | Count | Action |
|----------------------|-------|--------|
| Bid Sent | 183 | Mark Won |
| GC Not Awarded | 53 | Mark Won (Desert subcontracted even though GC wasn't awarded to the bidding GC) |
| Yet to Bid | 3 | Mark Won |
| Lost | 3 | Mark Won |
| Add to Projects | 1 | Mark Won |

These updates should go through the existing `contract-won` pipeline or a bulk Monday API update targeting `deal_stage` on each estimate's `monday_item_id`.

Additionally, **non-canonical estimates** on these 882 won projects should be reviewed — estimates from competing GCs on the same project should be marked `Lost` or `GC Not Awarded` in Monday.

## 7) Sync Runtime Model (2026-02-19)

- Canonical business logic now lives in `packages/monday/src/sync/*` (estimate sync, status sync, SharePoint sync).
- Edge webhook ingress (`/functions/v1/monday-webhook`) responds to Monday challenge verification and enqueues `sync_item` only for ESTIMATING item events (when `pulseId` exists).
- Edge webhook ingress also enqueues `monday_status_sync` with dedupe enabled for fast post-change reconciliation.
- Cron fallback/reconciliation remains active via `pg_cron` with `bg_sync_full` every 10 minutes.
- Cron fallback/status reconciliation remains active via `pg_cron` with `bg_monday_status_sync` hourly.
- Operational note: if near-real-time status propagation is needed for additional boards, include those board IDs in `MONDAY_WEBHOOK_BOARD_IDS` and keep periodic cron as safety net.

## 8) Webhook-Only Gaps (Why Cron Stays)

- Board webhooks can be missing/disabled/misconfigured per board; cron recovers drift.
- Webhook payloads are event-scoped, but project/account/contact reconciliation is cross-item and still needs periodic full convergence.
- Some changes arrive as events without a useful item context for `sync_item`; periodic full sync captures those misses.
- If edge/background runtime is down during Monday retry windows, cron backfill ensures eventual consistency.

## 9) Structure Cleanup (2026-02-19)

- Legacy shell folders `apps/background-jobs/workers/monday-status-sync` and `apps/background-jobs/workers/estimates-sync-worker` were removed.
- Canonical Monday docs now live in `packages/monday/` (`SYNC-KNOWLEDGE.md`, `MONDAY_COLUMNS_CURRENT.md`, `STATUS.md`).
- Project-seed lifecycle logic moved into `packages/monday/src/sync/project-seed/*`; background-jobs now calls package exports directly.
- Manual Monday backfill and project-seed CLIs live in `packages/monday/cli/` (`backfill-files.ts`, `project-seed-sync.ts`).
- `backfill-files.ts` is a file-asset recovery command (`processItemFiles`) and does not duplicate project-seed lifecycle logic.
