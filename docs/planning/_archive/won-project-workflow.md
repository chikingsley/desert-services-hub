# Won Project Workflow

The contracts process when we win work.

---

## Trigger

Contract or LOI arrives - usually to <contracts@desertservices.com> email.

---

## Step 1: Research the Project

Before anything else, gather context on this project:

- Find all emails related to this project
- When was it bid?
- What's the history?
- Get background info

This research also helps locate the estimate in Monday.

---

## Step 2: Find the Estimate in Monday

Search Monday ESTIMATING board for the corresponding estimate line item.

Need to match on: project name, GC, address, or estimate number.

---

## Step 3: Create Notion Project + Contract Task

Create a project record in Notion so we have a place to track everything.

Create a contract task so we can track progress and follow-ups.

---

## Step 4: Mark as Won in Monday

Update the estimate status to "Won" in Monday.

---

## Step 5: Mark Competing Bids as Lost

Find other estimates with the same project/estimate name but different builders.

Mark those as "GC Not Awarded".

---

## Step 6: Find the Actual Estimate Document

Need the estimate PDF for reconciliation.

**If attached to Monday item:** Use that.

**If not attached, two options:**

1. Search email for the estimate
2. Go to QuickBooks → find by estimate number → print PDF → save to OneDrive → attach to Monday

---

## Step 7: Reconciliation

Compare contract scope to estimate scope.

**If it matches:** Continue to next step.

**If scope changed:** Need a new estimate.

- Update existing estimate in QuickBooks with R1 suffix (or whatever naming)
- Or create a new estimate entirely

---

## Step 8: Update Monday with Awarded Value

Once reconciliation is done and we know the actual contract amount, update the Awarded Value column in Monday.

---

## Step 9: QuickBooks Updates

All the QB stuff:

- Update to correct GC
- Verify/update address
- Create new job if needed
- Move estimate to correct job
- Attach contract PDF
- Attach estimate PDF
- True up estimate if scope changed

(Manual - no API)

---

## Step 10: SharePoint

- Ensure GC folder exists
- Ensure project folder exists with standard subfolders
- Store contract
- Store estimate

---

## Step 11: Notion Updates

Update the project record with:

- Contract value
- Estimate value
- Contacts (PM, Super, Billing)
- Links to Monday, SharePoint
- Any notes from reconciliation

---

## Step 12: Send Internal Email

Send to internal team with:

- Project info summary
- Contract details
- Key contacts
- Signal that it's ready to sign

This email is the cue for the person to go sign.

---

## Step 13: Handle Open Items

**If scope is off or needs clarification:**

- Send clarification email to client
- Track in Notion as open item for daily follow-up

Notion is where we track open items that need daily follow-up.

---

## What We Can Automate

| Step | Can Automate? | How |
|------|---------------|-----|
| 1. Research project | Yes | Email search + Monday search |
| 2. Find estimate in Monday | Yes | MCP fuzzy search |
| 3. Create Notion project/task | Yes | Notion API |
| 4. Mark as Won | Yes | Monday API |
| 5. Mark competing as Lost | Yes | Monday API (need logic to find them) |
| 6. Find estimate doc | Partial | Can search email/Monday, QB is manual |
| 7. Reconciliation | Yes | Contract extraction + compare logic exists |
| 8. Update Awarded Value | Yes | Monday API |
| 9. QuickBooks | No | Manual, no API |
| 10. SharePoint | Yes | SharePoint API |
| 11. Notion updates | Yes | Notion API |
| 12. Internal email | Yes | Email API + template |
| 13. Track open items | Yes | Notion tasks |

---

## Reference

**Estimate Revision Naming** (from sla.md):
- Format: `YYMMDD##R#` (no dashes before R)
- Example: `25122301R0` (original) → `25122301R1` (first revision)
- All estimates start at R0

**Internal Email Template**: `services/contract/internalcontracts-email-sample.md`
- Project info + links (Notion, SharePoint, Monday)
- Contract details (type, value, retention, certified payroll, billing platform)
- Estimate details (value, version, variance)
- Contacts (PM, Super, Billing)
- Scope summary, red flags, missing info, next actions

**Competing Bids**: Match on same project/estimate name + different GC
