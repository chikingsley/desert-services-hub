# Projects DB Plan

## Purpose

Local SQLite database for tracking projects and deliverables. Eventually merges back into `hub.db` and syncs to Monday PROJECTS board.

## Current State

- `projects.db` - Local database
- `monday_columns` table - Tracks what Monday columns to keep/delete/add
- `projects` table - Real project data
- `tasks` table - Granular deliverable tracking (if needed)

## Workflow

1. **Create project locally** - Assign project number, capture basic info
2. **Track deliverables** - Contract, dust permit, NOI, SWPPP, signs
3. **Sync to Monday** - Once stable, push changes to PROJECTS board
4. **Merge to hub.db** - Eventually consolidate into single local DB

## Monday Board Changes (Planned)

### Columns to DELETE (26 total)
All mirrors and redundant fields. See `monday_columns` table where `action = 'delete'`.

### Columns to ADD (16 total)
- Project Number (text)
- Contractor (text)
- PO Number (text)
- Awarded Value (number)
- Start/End Date (date)
- Location (location)
- Primary Contact (text)
- Contract Status + File
- SOV File
- Dust Permit Status + File
- NOI Status
- SWPPP Status
- Signs Status

### Columns to KEEP (14 total)
- Name, Subitems, Project Owner, Project Status
- Inspection Reports, Submit Inspection, Linked Estimate
- Address fields (Building, Street, City, State, Zip)
- C/I, Project Created

## Project Number Format

Simple sequential: `1001`, `1002`, `1003`, ...
- 4+ digits
- No year prefix
- Auto-increment

## Deliverable Statuses

| Deliverable | Statuses |
|-------------|----------|
| Contract | Pending → Received → Executed |
| Dust Permit | Not Needed / Pending → Filed → Received |
| NOI | Not Needed / In Progress → Submitted → Approved |
| SWPPP | Not Needed / Drafting → Submitted → Approved |
| Signs | Not Needed / Ordered → Received → Delivered |

## CLI Commands (TODO)

```bash
# Add a project
bun projects/cli.ts add --name "Project Name" --contractor "GC Name" --po "PO-123"

# Update deliverable
bun projects/cli.ts update 1001 --contract-status "Executed"

# List projects
bun projects/cli.ts list

# Sync to Monday (future)
bun projects/cli.ts sync-monday
```
