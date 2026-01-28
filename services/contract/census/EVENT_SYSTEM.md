# Event System Architecture

## Overview

This document describes the event-driven orchestration layer for Desert Services. When actions happen (permit submitted, contract signed, plan delivered), the system logs events and spawns actions that agents or workers execute.

**Core Principle:** Project is the central hub. Everything links to a project. When something happens to a project, events fire and actions spawn.

---

## Data Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              PROJECT HUB                                 │
│                                                                         │
│   projects ◄─────┬─────── estimates (from Monday)                       │
│      │           ├─────── contracts (future)                            │
│      │           ├─────── permits (dust permits)                        │
│      │           └─────── plans (SWPPP, etc.)                           │
│      │                                                                  │
│      └──────────► stakeholders (who to notify per project)              │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                           EVENT STREAM                                   │
│                                                                         │
│   TRIGGER              EVENT                    ACTIONS                  │
│   ───────              ─────                    ───────                  │
│   permit submitted  → "permit_submitted"    → send_customer_email       │
│                                              → send_internal_billing    │
│   permit issued     → "permit_issued"       → send_customer_email       │
│   contract signed   → "contract_signed"     → notify_internal_team      │
│                                              → update_monday             │
│   plan delivered    → "plan_delivered"      → send_to_stakeholders      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tables

### stakeholders

Contacts associated with a project who receive deliverables or notifications.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| project_id | INTEGER | FK to projects |
| account_id | INTEGER | FK to accounts (their company) |
| name | TEXT | Contact name |
| email | TEXT | Contact email |
| role | TEXT | Role on project (see Role Types below) |
| is_primary | INTEGER | 1 if primary contact for this role |
| notify_on | TEXT | JSON array of event types they receive |
| source | TEXT | How we found them: email, contract, manual |
| notes | TEXT | Any notes about this contact |
| created_at | TEXT | Timestamp |
| updated_at | TEXT | Timestamp |

**Role Types:**
- `pm` - Project Manager (external)
- `super` - Superintendent (external)
- `billing_external` - Billing contact at GC (external)
- `owner_rep` - Owner's representative (external)
- `internal_billing` - Desert Services billing team (internal)
- `internal_ops` - Desert Services operations (internal)
- `internal_permits` - Desert Services permits team (internal)

**Agent Questions:**
- "Who are the stakeholders for this project?"
- "Who should receive the permit notification?"
- "Do you want to add/edit stakeholders before sending?"

---

### permits

Dust permits linked to projects. Synced from auto-permit or created directly.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| application_number | TEXT | D number (e.g., D0064501) - UNIQUE |
| permit_number | TEXT | F number when issued |
| project_id | INTEGER | FK to projects |
| account_id | INTEGER | FK to accounts |
| status | TEXT | See Status Types below |
| permit_type | TEXT | dust, noi |
| acreage | REAL | Project acreage |
| fee | REAL | Permit fee |
| site_address | TEXT | Site address |
| submitted_at | TEXT | When submitted to county |
| paid_at | TEXT | When payment processed |
| issued_at | TEXT | When permit issued |
| expires_at | TEXT | Expiration date |
| customer_notified_at | TEXT | When customer email sent |
| internal_notified_at | TEXT | When internal billing notified |
| auto_permit_synced_at | TEXT | Last sync from auto-permit DB |
| created_at | TEXT | Timestamp |
| updated_at | TEXT | Timestamp |

**Status Types:**
- `draft` - Being prepared, not submitted
- `submitted` - Submitted to county, awaiting payment
- `pending_payment` - Submitted but payment not processed
- `processing` - Paid, county is processing
- `active` - Issued and active
- `expired` - Past expiration date
- `closed` - Closed out
- `superseded` - Replaced by revision/renewal

---

### events

Log of things that happened. Immutable audit trail.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| project_id | INTEGER | FK to projects (nullable for system events) |
| event_type | TEXT | Type of event (see Event Types below) |
| event_data | TEXT | JSON payload with event details |
| source | TEXT | Where event originated: auto-permit, email, manual, api |
| source_id | TEXT | ID in source system (e.g., D number) |
| actor | TEXT | Who/what triggered: user email, system, agent |
| created_at | TEXT | When event occurred |

**Event Types:**

Permit Events:
- `permit_submitted` - Permit application submitted to county
- `permit_paid` - Payment processed
- `permit_issued` - Permit approved and issued
- `permit_revised` - Permit revision submitted
- `permit_renewed` - Permit renewal submitted
- `permit_closed` - Permit closed out
- `permit_expired` - Permit reached expiration

Contract Events:
- `contract_received` - Contract arrived (email, DocuSign, etc.)
- `contract_extracted` - Data extracted from contract
- `contract_reconciled` - Reconciliation complete
- `contract_issues_sent` - Issues sent to customer
- `contract_approved` - Contract approved to sign
- `contract_signed` - Contract executed
- `contract_rejected` - Contract rejected/canceled

Plan Events:
- `plan_ordered` - SWPPP/plan ordered from engineer
- `plan_received` - Plan received from engineer
- `plan_delivered` - Plan delivered to customer

General Events:
- `stakeholder_added` - New stakeholder added to project
- `stakeholder_updated` - Stakeholder info changed
- `project_created` - New project created
- `project_status_changed` - Project status updated

---

### actions

Things to do in response to events. Workers/agents execute these.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| event_id | INTEGER | FK to events (what triggered this) |
| project_id | INTEGER | FK to projects |
| action_type | TEXT | Type of action (see Action Types below) |
| action_config | TEXT | JSON config (template, recipients, etc.) |
| status | TEXT | pending, running, complete, failed, skipped |
| priority | INTEGER | Execution priority (lower = higher priority) |
| attempt_count | INTEGER | Number of execution attempts |
| last_error | TEXT | Error message if failed |
| started_at | TEXT | When execution started |
| completed_at | TEXT | When execution completed |
| result | TEXT | JSON result (email ID, etc.) |
| created_at | TEXT | Timestamp |

**Action Types:**

Email Actions:
- `send_customer_email` - Send email to external stakeholders
- `send_internal_billing` - Send to internal billing team
- `send_internal_ops` - Send to internal operations
- `send_internal_permits` - Send to internal permits team

System Actions:
- `update_monday` - Update Monday.com item
- `create_notion_task` - Create task in Notion
- `update_notion_page` - Update Notion project page
- `sync_to_sharepoint` - Upload files to SharePoint

**Status Flow:**
```
pending → running → complete
                  → failed (can retry)
        → skipped (manually skipped)
```

**Agent Questions:**
- "There are 2 pending actions for this project. Execute them?"
- "Action failed: [error]. Retry or skip?"
- "Review actions before executing?"

---

### workflows

Templates defining what actions fire on what events. Configurable.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| name | TEXT | Human-readable name |
| event_type | TEXT | Event that triggers this workflow |
| action_type | TEXT | Action to spawn |
| action_config | TEXT | Default JSON config for action |
| is_active | INTEGER | 1 if enabled, 0 if disabled |
| conditions | TEXT | JSON conditions (optional filtering) |
| created_at | TEXT | Timestamp |
| updated_at | TEXT | Timestamp |

**Default Workflows:**

```
permit_submitted:
  → send_customer_email (template: dust-permit-submitted)
  → send_internal_billing (template: dust-permit-billing)

permit_issued:
  → send_customer_email (template: dust-permit-issued)

permit_renewed:
  → send_customer_email (template: dust-permit-renewed)
  → send_internal_billing (template: dust-permit-billing-renewed)

contract_signed:
  → send_internal_ops (template: internal-handoff)
  → update_monday (set status: Won)
```

---

## Usage Patterns

### Pattern 1: Manual Trigger (Current)

Agent or user triggers an event manually:

```typescript
// 1. Log the event
const event = await logEvent({
  project_id: 123,
  event_type: "permit_submitted",
  event_data: {
    application_number: "D0064501",
    acreage: 63.87,
    fee: 6870
  },
  source: "manual"
});

// 2. Spawn actions based on workflows
await spawnActionsForEvent(event.id);

// 3. Execute pending actions
await executePendingActions(project_id: 123);
```

### Pattern 2: Webhook from Auto-Permit (Future)

Auto-permit sends webhook after submission:

```typescript
// POST /api/events/permit-submitted
{
  application_number: "D0064501",
  project_name: "Lexington 420...",
  company_name: "Stevens Leinweber",
  acreage: 63.87,
  fee: 6870
}

// Handler:
// 1. Find or create project by name matching
// 2. Find or create permit record
// 3. Log event
// 4. Spawn actions
// 5. Optionally auto-execute or queue for review
```

### Pattern 3: Agent Workflow (Target State)

Agent walks through the process interactively:

```
Agent: "Permit D0064501 was submitted for Lexington 420 - Northern Pkwy.
        I found 3 stakeholders from email history:
        - Missy Peterson (PM) - mpeterson@stevensleinweber.com
        - Craig Schlueter (Super) - cschlueter@stevensleinweber.com
        - Ryan Patterson (PM) - rpatterson@stevensleinweber.com

        Do you want to edit stakeholders before I send notifications?"

User: "Add Ryan Park - RPark@stevensleinweber.com as a contact"

Agent: "Added. Ready to send:
        1. Customer email to: Missy, Craig, Ryan Patterson, Ryan Park
        2. Internal billing email to: kendra@, jayson@, eva@

        Send now?"

User: "Yes"

Agent: [Executes actions, logs results]
       "Done. Customer email sent (ID: xxx). Billing email sent (ID: yyy)."
```

---

## File Locations

- Schema: `services/contract/census/migrations/001-event-system.sql`
- Types: `services/contract/census/event-types.ts`
- Functions: `services/contract/census/events.ts`
- Email templates: `services/email/email-templates/`

---

## Integration Points

### Auto-Permit (company-permits.sqlite)

Sync permits from auto-permit DB:
- Path: `/Users/chiejimofor/Documents/Github/auto-permit/src/db/company-permits.sqlite`
- Tables: `permits`, `companies`
- Sync: On-demand or scheduled, match by application_number

### Monday.com

- Estimates already synced to `estimates` table
- Future: Update bid_status via action

### Email Templates

Existing templates in `services/email/email-templates/`:
- `dust-permit-submitted.hbs` - Customer notification
- `dust-permit-billing.hbs` - Internal billing notification
- `dust-permit-issued.hbs` - Customer notification
- etc.

### Notion

- Projects database: `2f5c1835-5bb2-8062-a2a9-c37dd689454e`
- Future: Create/update project pages via action

---

## Next Steps

1. [x] Document architecture (this file)
2. [ ] Run migration to add tables
3. [ ] Create TypeScript types and functions
4. [ ] Wire up first workflow (permit_submitted)
5. [ ] Backfill stakeholders from email history
6. [ ] Add sync from auto-permit
7. [ ] Build agent interface for interactive workflow

---

*Last updated: 2026-01-28*
