# Monday Board Migration Sheet

Date: 2026-02-07
Scope: live audit of active boards in workspace `8970676` (`Desert Services`)

Boards audited:
- Estimating (`7943937851`)
- Leads (`7943937841`)
- Projects (`8692330900`)
- Dust Permits (`9850624269`)
- SWPPP Plans (`9778304069`)
- Inspection Reports (`8791849123`)
- Contractors (`7943937856`)
- Contacts (`7943937855`)
- Service Lines (`8686470518`)

Source data snapshot:
- `/Users/chiejimofor/Documents/Github/desert-services-hub/data/monday-board-audit-2026-02-07.json`

## Rules For This Migration

- No destructive changes until parity is proven.
- Add direct/queryable columns first.
- Backfill existing data.
- Dual-write from automation.
- Cut over reads in code and workers.
- Only then mark old columns for deletion.

## Global Findings

- Mirror-heavy boards are the current bottleneck:
  - Leads: 10 mirror columns out of 20 total.
  - Projects: 10 mirror columns out of 40 total.
- Estimating already has direct relations with mixed population paths:
  - `board_relation_mkzdd0r4` (Contractors - Direct) populated on 2,964 rows.
  - 742 rows have direct contractor blank but all 742 have contact-relation fallback (`deal_contact`) available.
  - `board_relation_mm065k5n` is blank on 73 rows where legacy `deal_contact` still carries linkage.
- Projects Service Lines currently uses split semantics:
  - 154 rows are mirror-only (`lookup_mktg3b6w`) with no direct service-line relation.
  - 34 rows are direct-only (`board_relation_mkp8pr9e`).
  - 4 rows have both populated.
- Dust Permits also uses mixed paths:
  - 18 rows have account mirror populated while direct contractor relation is blank; all 18 are estimate-linked.
  - 17 rows have contacts mirror populated while direct contact relation is blank; all 17 are estimate-linked.
- Inspection Reports has broken/unused account/contact wiring:
  - `lookup_mkqy8nyj` (Account mirror) usage is 0%.
  - `board_relation_mkz5x9hg` (Contacts relation) usage is 0%.
  - Account mirror points to a project source column id (`board_relation_mkp8qh5n`) that is not present on Projects now.

## Code Touchpoints To Update Before Column Cleanup

- Leads sync worker currently depends on Leads mirror bid status:
  - `/Users/chiejimofor/Documents/Github/desert-services-hub/apps/workers/monday-status-sync-worker/src/index.ts:95`
  - `/Users/chiejimofor/Documents/Github/desert-services-hub/apps/workers/monday-status-sync-worker/src/index.ts:797`
- Estimating sync docs/types still acknowledge mirror contractor fallback:
  - `/Users/chiejimofor/Documents/Github/desert-services-hub/packages/monday/SYNC-KNOWLEDGE.md:41`
  - `/Users/chiejimofor/Documents/Github/desert-services-hub/packages/monday/src/types.ts:97`
- Monday CLI board map is stale for Contacts/Contractors IDs:
  - `/Users/chiejimofor/Documents/Github/desert-services-hub/packages/monday/cli/cli.ts:24`
  - Active IDs are in `/Users/chiejimofor/Documents/Github/desert-services-hub/packages/monday/src/types.ts:37`

## Board-by-Board Migration Plan

## Estimating (`7943937851`)

Snapshot:
- Items: 4,843
- Columns: 39
- Relation/Mirror columns: 11

Keep:
- `board_relation_mkzdd0r4` Contractors - Direct
- `board_relation_mm065k5n` Contacts - Direct
- `board_relation_mktgzr87` Service Lines
- `board_relation_mktgebxf` link to Projects
- `board_relation_mkxm6jb1` Dust Permits
- Core status/date/file columns used by downstream workers

Add:
- No mandatory schema adds before parity; direct columns already exist.

Backfill:
- For stricter direct-only queryability, fill `board_relation_mkzdd0r4` from contact fallback on the 742 rows where direct is blank.
- Fill `board_relation_mm065k5n` from `deal_contact` where direct is blank (73 rows).

Deprecate (after parity + code cutover):
- `deal_account` (mirror Contractor)
- `deal_contact` (legacy contacts relation) when direct contacts is authoritative

Delete-later candidates (confirm business intent first):
- `deal_close_probability` (0% usage)
- `deal_forecast_value` (0% usage)
- `formula_mm063qae` (0% usage)
- `formula_mm06d2ra` (0% usage)

## Leads (`7943937841`)

Snapshot:
- Items: 1,195
- Columns: 20
- Relation/Mirror columns: 11 (10 mirrors)

Keep:
- `board_relation_mktg3z60` Estimate Name (primary relation)
- `color_mm068kjz` Overall Status
- Activity and notes columns used by sales workflow

Add:
- `Contractors - Direct` relation to Contractors (`7943937856`)
- `Contacts - Direct` relation to Contacts (`7943937855`)
- `Projects - Direct` relation to Projects (`8692330900`)
- `Service Lines - Direct` relation to Service Lines (`8686470518`)
- Optional: `Bid Status (Synced)` local status column if you want no mirror dependency in automations

Backfill:
- Populate new direct columns from linked Estimate (`board_relation_mktg3z60`) for all 1,191 linked leads.

Deprecate (after dual-write + worker update):
- `lookup_mktg16w4` Bid Value
- `lookup_mktg8b1z` Bid Status
- `lookup_mktgdjyy` Estimating Contact
- `lookup_mktgwrz4` Sales Contact
- `lookup_mktgymd0` Contractor
- `lookup_mktgp8h8` Estimate
- `lookup_mktgy51v` Location
- `lookup_mktgygpd` Project Start Date
- `lookup_mktg6byf` Project End Date
- `lookup_mm02tb0k` Sales Rep

Delete-later candidates:
- `lead_owner` (0% usage) unless repurposed as the canonical sales owner field

## Projects (`8692330900`)

Snapshot:
- Items: 1,449
- Columns: 40
- Relation/Mirror columns: 13

Keep:
- `board_relation_mktgn7cb` Linked Estimate
- `board_relation_mkpf1kvf` Inspection Reports
- `board_relation_mkp8pr9e` Service Lines (make this canonical)
- Project status/owner and operational contact fields

Add:
- `Contractors - Direct` relation to Contractors (`7943937856`)
- `Contacts - Direct` relation to Contacts (`7943937855`)
- Optional: dedicated canonical `Project Start Date` and `Project End Date` if old date columns remain preferred for querying

Backfill:
- If Projects should be directly queryable without estimate mirrors, backfill `board_relation_mkp8pr9e` on the 154 mirror-only rows.
- Fill new direct contractor/contact relations from linked estimate.
- Decide whether `location_mkqb4cqh` remains canonical and backfill from mirror where needed.

Deprecate (after parity + downstream updates):
- `lookup_mktrxkzr` Location
- `lookup_mktgnedy` Account
- `lookup_mktgs814` Contact
- `lookup_mkxdrrhk` Territory Owner (Mirror)
- `lookup_mkxkarwp` Mirror
- `lookup_mktg3b6w` Service Lines
- `lookup_mktg32bm` Onsite Contact
- `lookup_mktg90j7` Awarded Value
- `lookup_mktg2473` Start Date
- `lookup_mktgrjg` End Date

Delete-later candidates:
- `formula_mkrn66h5` Completion % (old)
- `formula_mkv5bsz` Formula

## Dust Permits (`9850624269`)

Snapshot:
- Items: 160
- Columns: 36
- Relation/Mirror columns: 8

Keep:
- `board_relation_mkxmhqdf` Estimate
- `board_relation_mkxfk8ky` Contractors
- `board_relation_mkxmh6zg` Contacts
- Permit lifecycle/status columns

Add:
- Optional: `Projects - Direct` relation if project-level reporting is needed here.

Backfill:
- If Dust Permits needs fully direct account/contact querying, fill:
  - `board_relation_mkxfk8ky` on 18 estimate-backed mirror rows.
  - `board_relation_mkxmh6zg` on 17 estimate-backed mirror rows.

Deprecate (after parity):
- `lookup_mkxp5f5n` Account (mirror)
- `lookup_mkxpsgqk` Contacts (mirror)
- `lookup_mkxmqvqk` Account (mirror)
- `lookup_mkyn642v` Estimate (mirror) when direct estimate relation is sufficient for querying

Delete-later candidates:
- None urgent beyond mirror cleanup.

## SWPPP Plans (`9778304069`)

Snapshot:
- Items: 25
- Columns: 8

Keep:
- `board_relation_mktmfqzj` Estimating
- Plan file and lifecycle status columns

Add:
- Optional: `Projects - Direct` and `Service Lines - Direct` if this board participates in active service reporting.

Backfill:
- None urgent.

Deprecate:
- `lookup_mktmqf1r` (mirror Status) if a local synced status becomes the query source.

Delete-later candidates:
- None immediate.

## Inspection Reports (`8791849123`)

Snapshot:
- Items: 1,809
- Columns: 41

Keep:
- `board_relation_mkpfq0mk` Project (high usage)
- Inspection provider/status/notes fields

Add:
- `Contractors - Direct` relation to Contractors (`7943937856`)
- `Contacts - Direct` relation to Contacts (`7943937855`) if needed operationally
- Optional: `Service Lines - Direct` relation for filtering/reporting

Backfill:
- Populate new direct contractor/contact from linked project/estimate context.

Deprecate:
- `lookup_mkqy8nyj` Account mirror (0% usage)
- `board_relation_mkz5x9hg` Contacts relation (0% usage) unless reactivated

Delete-later candidates:
- The 0%-usage account/contact pair after replacement is live.

## Contractors (`7943937856`)

Snapshot:
- Items: 1,502
- Columns: 21

Keep:
- `account_contact` Contacts relation
- Core account metadata used by sync/matching

Add:
- Optional: explicit relation to Projects if you want contractor-centric operational views from this board.

Backfill:
- Optional data quality backfill for owner/priority fields.

Deprecate:
- None mandatory.

Delete-later candidates (confirm business need first):
- `dropdown_mkp0qb0` Project Types (0%)
- `color_mkp0z3hj` Pref. Fence Vendor (0%)
- `color_mkp0pg9v` Pref. Porto Vendor (0%)
- `color_mkp0xrh` Pref. Storm Vendor (0%)
- `date_mkp0msw1` Last Contacted (0%)

## Contacts (`7943937855`)

Snapshot:
- Items: 4,647
- Columns: 20

Keep:
- `contact_account` Contractor relation
- Contact identity and communication fields
- `multiple_person_mkx1zntf` Territory Owner

Add:
- Optional: normalized `Sales Rep` people field if you want a single canonical owner propagated to Leads/Projects.

Backfill:
- Optional: improve `board_relation_mkp8e0s2` Projects link coverage (currently low).

Deprecate:
- `board_relation_mktbfpdc` link to Incoming Calls (0%) if duplicate of the actively used incoming-calls relation

Delete-later candidates:
- `board_relation_mktbfpdc` after confirming no hidden automation dependency.

## Service Lines (`8686470518`)

Snapshot:
- Items: 8
- Columns: 5

Keep:
- `name` (dimension key)
- `color_mkp05f9z` Service Type
- `board_relation_mkp8rqas` link to Projects

Add:
- Optional: standardized `service_line_code` text key for integrations/reporting
- Optional: operational KPI fields if they will be auto-populated

Backfill:
- Fill missing project links if that one unlinked row should be linked.

Deprecate:
- None required.

Delete-later candidates:
- `person` Director and `numeric_mkp078t7` Avg. Lead Time only if you decide not to use them programmatically.

## Suggested Execution Sequence

1. Fix board-id drift in local CLI references and freeze current schema snapshot.
2. Add direct relation columns on Leads/Projects/Inspection Reports where missing.
3. Run backfills listed above and write a parity report per board.
4. Update workers to read canonical direct fields first (especially Leads sync).
5. Run dual-write period for 2 to 4 weeks.
6. Mark legacy mirror columns as deprecated in title/description.
7. Delete deprecated columns only after parity and automation checks pass.

## Service-Line Reporting Direction (Brainstorm)

If the goal is: "show all active TF / roll-off / water truck / stormwater / inspections by project", treat Service Lines as a dimension and avoid manual board entry.

Recommended path:
- Make direct Service Lines relations canonical on Projects and Estimating.
- Build a derived operational dataset in `Supabase Postgres` from Monday relations + worker events.
- Drive views/reporting from that dataset, not from manual mirror columns.

This keeps boards semi-autonomous and programmatic while still giving you operational visibility by service line.
