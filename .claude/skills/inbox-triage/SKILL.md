---
description: Email inbox triage - what's done, what needs action, what can be archived. Uses census DB for context.
user_invocable: true
---

# Inbox Triage Skill

Process your inbox efficiently: scan, score urgency, work through emails one at a time.

## When to Use

- User says "what's in my inbox" or "triage my inbox"
- User says "what needs attention" or "what's pending"
- User wants to catch up on emails after being away
- User says "inbox zero" or "clear my inbox"

## Prerequisites

- Census DB synced (`bun services/contract/census/sync-all.ts`)
- For write operations (archive, move, categorize): Outlook MCP configured

## Workflow

### Phase 1: Context Loading

Before triage, load configuration:

1. Read `logs/triage/config/urgency-rules.md` for scoring rules
2. Read `logs/triage/config/folder-rules.md` for filing patterns
3. Read `logs/triage/contractors/` for contractor context
4. Read `logs/triage/projects/` for project context

If `logs/triage/` doesn't exist, guide user through setup (see Setup Mode below).

### Phase 2: Quick Scan

Query census DB for recent emails to chi@:

```typescript
// Query recent emails
const db = new Database('./services/contract/census/census.db');
const emails = db.query(`
  SELECT e.*, m.email as mailbox
  FROM emails e
  JOIN mailboxes m ON e.mailbox_id = m.id
  WHERE m.email = 'chi@desertservices.net'
  AND e.received_at > datetime('now', '-14 days')
  ORDER BY e.received_at DESC
`).all();
```

Score each email by urgency:

- 🔴 **Urgent**: VIP sender, contract deadline, "urgent" in subject, >7 days old
- 🟡 **Attention**: Follow-up needed, review requested, 3-7 days old
- ⚪ **Routine**: Newsletters, notifications, informational

Present summary table:

```markdown
## Inbox Triage - {DATE} ({COUNT} emails)

| # | Urgency | Classification | From | Subject | Age |
|---|---------|----------------|------|---------|-----|
| 1 | 🔴 | CONTRACT | ... | ... | 5d |
```

Ask: "Ready to process? Start with urgent items?"

### Phase 3: Conversational Processing

Work through emails starting with 🔴, then 🟡, then ⚪.

For each email:

1. **Present** the email with:
   - Full content (from census DB body_preview or body_full)
   - Classification (CONTRACT, DUST_PERMIT, SWPPP, etc.)
   - Related project context (if any in logs/triage/projects/)
   - Related Monday estimate (if monday_estimate_id exists)

2. **Discuss** options:
   - What's being asked/needed?
   - Any context from contractor logs?

3. **User chooses action:**
   - **Respond** → Draft email using draft-email skill
   - **File** → Move to folder (requires Outlook MCP)
   - **Archive** → Archive in Outlook (requires Outlook MCP)
   - **Process** → Trigger contract-intake or dust-permit-intake skill
   - **Defer** → Flag for follow-up, note when
   - **Skip** → Move to next email

4. **Update logs:**
   - Note decision in relevant project/contractor log
   - If new contractor/project, offer to create log file

5. **Next email**

### Phase 4: Summary

After processing:

```markdown
## Triage Summary - {DATE}

**Processed:** X emails
- Responded: X
- Filed: X
- Archived: X
- Processed (contracts): X
- Deferred: X

**New logs created:**
- contractors/acme-construction.md
- projects/phoenix-warehouse.md

**Still pending:** X emails flagged for follow-up
```

## Setup Mode (First Run)

If `logs/triage/` doesn't exist:

1. Create directory structure:

```bash
mkdir -p logs/triage/config
mkdir -p logs/triage/contractors
mkdir -p logs/triage/projects
```

1. Copy templates:

```bash
cp .claude/skills/inbox-triage/templates/urgency-rules.md logs/triage/config/
cp .claude/skills/inbox-triage/templates/folder-rules.md logs/triage/config/
```

1. Optional: Analyze inbox patterns
   - Fetch recent emails from census DB
   - Identify top senders → suggest VIPs
   - Identify common domains → suggest auto-file rules

## Urgency Scoring Rules

### VIP Senders (always 🔴)

- Loaded from `logs/triage/config/urgency-rules.md`
- Default: emails from contractors with active contracts

### Classification Boost

- CONTRACT → +1 urgency (time-sensitive)
- DUST_PERMIT → +1 urgency (deadlines)
- ESTIMATE_REQUEST → neutral

### Age Rules
>
- >7 days in inbox → 🔴
- 3-7 days → 🟡
- <3 days → ⚪

### Keyword Triggers

- 🔴: urgent, ASAP, deadline, past due, final notice
- 🟡: follow-up, reminder, review, update

## Key Resources

- **Census DB:** `services/contract/census/census.db`
- **Email CLI:** `bun services/email/cli.ts`
- **Contract Queue:** `bun services/contract/workflow/queue.ts`
- **Draft Email Skill:** `.claude/skills/draft-email/SKILL.md`
- **Contract Intake Skill:** `.claude/skills/contract-intake/SKILL.md`
- **Dust Permit Skill:** `.claude/skills/dust-permit-intake/SKILL.md`

## Mailboxes

| Inbox | Purpose |
|-------|---------|
| `chi@desertservices.net` | Your personal inbox |
| `contracts@desertservices.net` | Shared contracts inbox |
| `dustpermits@desertservices.net` | Shared dust permits inbox |
| `jared@desertservices.net` | Jared Aiken (estimator) |
| `internalcontracts@desertservices.net` | Internal notifications |

## Write Operations (Require Outlook MCP)

These actions need the Outlook MCP server configured:

- Archive email
- Move to folder
- Add category/label
- Mark as read/unread
- Delete

If Outlook MCP not configured, note the action needed and user can do manually.

## Output

After each email processed:

1. Action taken
2. Any logs updated
3. Next email preview

After full triage:

1. Summary stats
2. Pending items
3. Suggested next session focus
