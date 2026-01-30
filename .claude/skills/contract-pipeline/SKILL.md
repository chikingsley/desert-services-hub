---
description: Project-centric contract pipeline view. Shows all active contracts with full context - status, emails, documents, blockers, next actions.
user_invocable: true
---

# Contract Pipeline Skill

Show the full picture of active contracts - not emails, but **projects** with all their context.

## When to Use

- User asks "what's active" or "show me the pipeline"
- User asks "what contracts need attention"
- User wants to see project status across the board
- Start of day / week review

## Data Sources

| Source | What it tells us |
|--------|------------------|
| `estimates` table | Bid status, values, contractor, Monday link |
| `emails` table | Recent activity, who's involved, timeline |
| `ground-truth/` folders | Extraction status, notes, issues, blockers |
| `attachments` table | Contract PDFs available |

## Pipeline Query

```typescript
import Database from 'bun:sqlite';

const db = new Database('./services/contract/census/census.db');

// Active contracts = Won/Pending Won estimates OR recent CONTRACT emails
const activeEstimates = db.query(`
  SELECT 
    e.name,
    e.estimate_number,
    e.contractor,
    e.bid_status,
    e.bid_value,
    e.awarded_value,
    e.monday_url,
    e.monday_item_id
  FROM estimates e
  WHERE e.bid_status IN ('Won', 'Pending Won', 'Bid Sent')
  AND e.synced_at > datetime('now', '-60 days')
  ORDER BY e.synced_at DESC
`).all();

// Recent contract emails (last 30 days)
const contractEmails = db.query(`
  SELECT 
    e.project_name,
    e.subject,
    e.from_name,
    e.received_at,
    e.monday_estimate_id,
    e.has_attachments,
    m.email as mailbox
  FROM emails e
  JOIN mailboxes m ON e.mailbox_id = m.id
  WHERE e.classification = 'CONTRACT'
  AND e.received_at > datetime('now', '-30 days')
  ORDER BY e.received_at DESC
`).all();
```

## Pipeline Status Logic

For each project, determine status:

| Status | Criteria |
|--------|----------|
| `NEW` | Contract email received, no ground-truth folder |
| `INTAKE` | Ground-truth folder exists, notes.md incomplete |
| `EXTRACTED` | notes.md has Quick Reference filled |
| `RECONCILED` | Reconciliation section complete |
| `PENDING_SIGN` | Ready but waiting on signature/dates |
| `BLOCKED` | Has issues.md with unresolved blockers |
| `COMPLETE` | Contract signed, systems updated |

Check ground-truth folder:

```typescript
import { existsSync, readFileSync } from 'fs';

function getProjectStatus(projectSlug: string) {
  const gtPath = `./services/contract/ground-truth/${projectSlug}`;
  
  if (!existsSync(gtPath)) return 'NEW';
  
  const hasNotes = existsSync(`${gtPath}/notes.md`);
  const hasIssues = existsSync(`${gtPath}/issues.md`);
  const hasContract = existsSync(`${gtPath}/contract.pdf`) || 
                      existsSync(`${gtPath}/contract-*.pdf`);
  
  if (hasIssues) {
    const issues = readFileSync(`${gtPath}/issues.md`, 'utf8');
    if (issues.includes('[ ]')) return 'BLOCKED';
  }
  
  if (hasNotes) {
    const notes = readFileSync(`${gtPath}/notes.md`, 'utf8');
    if (notes.includes('Reconciliation') && !notes.includes('TBD')) {
      return 'RECONCILED';
    }
    if (notes.includes('Quick Reference')) return 'EXTRACTED';
    return 'INTAKE';
  }
  
  return 'NEW';
}
```

## Output Format

```markdown
## Contract Pipeline — {DATE}

### Needs Immediate Attention 🔴

#### Diamond View (Catamount)
**Status:** NEW — Contract received, needs intake
**Estimate:** #25206 - $XX,XXX - Won
**Last Activity:** DocuSign arrived 1/28
**Ground Truth:** Not started
**Next:** Run contract-intake to process

---

#### Edison Linear Parks (McCarthy)
**Status:** BLOCKED — Waiting on clarification
**Estimate:** #XXXXX - $XX,XXX - Won  
**Last Activity:** Reminder from Tyra 1/27
**Ground Truth:** ✓ notes.md, ✓ issues.md
**Blocker:** Need to clarify if one or two contracts
**Next:** Respond to Tyra, resolve structure question

---

### In Progress 🟡

#### Elanto at Prasada (Property Reserve)
**Status:** PENDING_SIGN — Ready except dates
**Estimate:** #01222609 - $4,940 - Bid Sent
**Last Activity:** Contract extracted 1/28
**Ground Truth:** ✓ Complete
**Blocker:** Section 7 completion dates blank
**Next:** Jared fills dates, then sign

---

### Recently Completed ✅

#### Legacy Sports Arena
**Status:** COMPLETE
**Contract Value:** $XX,XXX
**Signed:** 1/XX/26

---

### Summary

| Status | Count |
|--------|-------|
| NEW | 3 |
| INTAKE | 1 |
| BLOCKED | 2 |
| PENDING_SIGN | 1 |
| COMPLETE | 2 |

**Top Priority:** Diamond View — new contract needs processing
```

## Drill-Down

When user asks about specific project:

1. Read `ground-truth/{slug}/notes.md` for full context
2. Query emails for that project's timeline
3. Show estimate details from Monday
4. List all available documents

```markdown
## Diamond View — Full Context

### Quick Facts
- **GC:** Catamount Constructors
- **Address:** ...
- **Contract Value:** $XX,XXX
- **Estimate:** #25206

### Email Timeline
| Date | From | Subject | Mailbox |
|------|------|---------|---------|
| 1/28 | DocuSign | Contract signed | contracts@ |
| 1/27 | Jamie Osborne | RE: Diamond View | chi@ |
| 1/25 | ... | ... | ... |

### Documents
- [ ] Contract PDF — in DocuSign email
- [ ] Estimate PDF — in Monday
- [ ] Plans — ???

### Ground Truth Status
- notes.md: NOT CREATED
- issues.md: NOT CREATED
- Extraction: NOT DONE
- Reconciliation: NOT DONE

### Next Actions
1. Download contract from DocuSign email
2. Run contract-intake skill
3. Reconcile against estimate #25206
```

## Key Queries

### Projects without ground-truth

```sql
SELECT DISTINCT e.project_name, e.contractor_name, COUNT(*) as email_count
FROM emails e
WHERE e.classification = 'CONTRACT'
AND e.received_at > datetime('now', '-30 days')
AND e.project_name IS NOT NULL
GROUP BY e.project_name
ORDER BY MAX(e.received_at) DESC
```

### Ground-truth folders without recent emails

```bash
ls services/contract/ground-truth/*/notes.md
```

### Estimates marked Won but no contract emails

```sql
SELECT e.name, e.contractor, e.bid_status, e.awarded_value
FROM estimates e
WHERE e.bid_status = 'Won'
AND NOT EXISTS (
  SELECT 1 FROM emails em 
  WHERE em.monday_estimate_id = e.monday_item_id
  AND em.classification = 'CONTRACT'
)
```

## Integration Points

- **contract-intake skill**: Process new contracts
- **draft-email skill**: Respond to contractors
- **Monday MCP**: Update bid status, link contracts
- **Census DB**: Email history, attachments

## Output

1. Pipeline overview (all active projects by status)
2. Specific project deep-dive on request
3. Suggested next actions prioritized by urgency
