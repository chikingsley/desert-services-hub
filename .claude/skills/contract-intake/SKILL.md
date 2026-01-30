---
description: Process contracts from email to Notion. Search email, find estimate in Monday, reconcile, create/update project.
user_invocable: true
---

# Contract Intake Skill

Process incoming contracts end-to-end: find in email, match to estimate, reconcile, create Notion project.

## When to Use

- User says "process this contract" or "do contract intake"
- User forwards a contract email and wants it processed
- User has a backlog of contracts to catch up on
- User says "reconcile {project name}"

## Workflow

### 1. Find the Contract

**If given a project/contractor name:**

```bash
Search email for: "{project name}" OR "{contractor name}" subcontract OR contract
Mailboxes: chi@, jared@, jayson@, jeff@, internalcontracts@
```csv
```typescript
// Use Monday MCP
mcp__desert-mondaycrm__find_best_matches({
  boardId: "ESTIMATING",
  name: "{project name or contractor}"
})
```csv
```text
Search Notion: "{project name}" OR "{contractor name}"
```markdown
```markdown
## Quick Context
**Source:** {Subcontract/DocuSign/etc} received {date}
**Contact:** {name} ({email})
**What we're waiting on:** {list blockers}

## Email Trail
- [{date}] {subject} → [email link]

## Contract Summary
**Contract Value:** ${value}
**Estimate Value:** ${value}
**Variance:** ${diff} ({%})
**Retention:** {%}

## Reconciliation
**Outcome:** {Match/Revised/Clarification}
**Red Flags:** {list}

## Next Actions
- [ ] {action item}
```css
```sql
Create task: "Contract Reconciliation - {project name}"
Link to project
Status: appropriate status
```

## Key Resources

- **Intake Schema:** `services/intake/schema.md` (V0/V1/V2 phases)
- **Full Schema:** `services/contract/notion-project-record-schema.md`
- **Reconciliation Template:** `services/contract/contract-reconciliation-template.md`
- **Intake Checklist:** `services/contract/contract-intake-checklist.md`

## Database IDs

- **Notion Projects:** `2e0c1835-5bb2-8197-b0f5-ff284f1d1f19`
- **Notion Projects Data Source:** `collection://2e0c1835-5bb2-815f-9077-000bf9e06287`
- **Notion Tasks Data Source:** `collection://2e0c1835-5bb2-81d0-a579-000be2bce0e9`
- **Monday ESTIMATING:** Use board name "ESTIMATING"

## Source Signal Options

- Subcontract
- DocuSign
- Estimate Request
- Work Order
- PO
- Referral
- Portal

## Output

After processing, report:

1. Project name and Notion link
2. Estimate found (yes/no + Monday link)
3. Reconciliation outcome
4. Tasks created
5. What's still needed / blockers
