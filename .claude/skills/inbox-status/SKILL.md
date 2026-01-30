---
description: Quick inbox status check - counts by classification, urgent items, pending contracts. Fast overview without full triage.
user_invocable: true
---

# Inbox Status Skill

Get a quick snapshot of what needs attention without full triage mode.

## When to Use

- User asks "what's going on" or "what's pending"
- User wants a quick status check before diving in
- Start of day overview
- User asks "any urgent emails" or "anything I need to handle"

## Quick Status Query

Run this against census DB:

```typescript
import Database from 'bun:sqlite';

const db = new Database('./services/contract/census/census.db');

// Emails to chi@ in last 14 days
const stats = db.query(`
  SELECT 
    e.classification,
    COUNT(*) as count,
    SUM(CASE WHEN e.received_at < datetime('now', '-7 days') THEN 1 ELSE 0 END) as overdue,
    SUM(CASE WHEN e.received_at BETWEEN datetime('now', '-7 days') AND datetime('now', '-3 days') THEN 1 ELSE 0 END) as attention,
    MIN(e.received_at) as oldest
  FROM emails e
  JOIN mailboxes m ON e.mailbox_id = m.id
  WHERE m.email = 'chi@desertservices.net'
  AND e.received_at > datetime('now', '-14 days')
  GROUP BY e.classification
  ORDER BY count DESC
`).all();

// Contracts specifically
const contracts = db.query(`
  SELECT e.subject, e.from_name, e.received_at, e.monday_estimate_id
  FROM emails e
  JOIN mailboxes m ON e.mailbox_id = m.id
  WHERE m.email IN ('chi@desertservices.net', 'contracts@desertservices.net')
  AND e.classification = 'CONTRACT'
  AND e.received_at > datetime('now', '-14 days')
  ORDER BY e.received_at DESC
  LIMIT 10
`).all();
```

## Output Format

Present a quick dashboard:

```markdown
## Inbox Status - {DATE}

### Overview (last 14 days)
| Type | Count | 🔴 Overdue | 🟡 Attention |
|------|-------|------------|--------------|
| CONTRACT | X | X | X |
| DUST_PERMIT | X | X | X |
| SWPPP | X | X | X |
| OTHER | X | X | X |

### Active Contracts
| Project | From | Age | Monday Match |
|---------|------|-----|--------------|
| ... | ... | Xd | ✓/#XXXXXXX |

### Quick Actions
- 🔴 **{X} items overdue** (>7 days) - run `/inbox-triage` to process
- 🟡 **{X} items need attention** (3-7 days)
- **{X} contracts** awaiting processing

### Suggested Next Step
{Based on what's most urgent}
```

## Flags

Check for specific conditions:

| Flag | Condition | Action |
|------|-----------|--------|
| 🚨 Contract deadline | Contract >5 days old | Surface immediately |
| ⚠️ Dust permit pending | Permit request >3 days | Check status |
| 📬 High volume | >20 unprocessed | Suggest batch triage |

## Quick Commands

After showing status, suggest:

- "Run `/inbox-triage` to process urgent items"
- "Run `/contracts` to see contract queue"
- "Run `/dust-permits` to check permit status"

## Census DB Quick Queries

### Count by mailbox

```sql
SELECT m.email, COUNT(*) 
FROM emails e 
JOIN mailboxes m ON e.mailbox_id = m.id 
WHERE e.received_at > datetime('now', '-14 days')
GROUP BY m.email
```

### Oldest unprocessed

```sql
SELECT subject, from_name, received_at, classification
FROM emails e
JOIN mailboxes m ON e.mailbox_id = m.id
WHERE m.email = 'chi@desertservices.net'
ORDER BY received_at ASC
LIMIT 5
```

### Contracts without Monday link

```sql
SELECT subject, from_name, received_at
FROM emails e
JOIN mailboxes m ON e.mailbox_id = m.id
WHERE m.email IN ('chi@desertservices.net', 'contracts@desertservices.net')
AND e.classification = 'CONTRACT'
AND e.monday_estimate_id IS NULL
AND e.received_at > datetime('now', '-30 days')
```

## Output

1. Quick stats table
2. Urgent items highlighted
3. Suggested next action
4. Option to go into full triage
