# Contracts Process - Master Checklist

One doc. Go through step by step. Each step has required info, actions, and fallbacks.

---

## Current Status

**Where I'm stuck:** Reconciliation step - getting output from Gemini but not doing anything with it. Not doing the 12 other steps.

**What's working:** Using Gemini 3 website to compare contract vs estimate.

**What's not working:** Everything before and after reconciliation.

---

## Trigger

Contract or LOI arrives at <contracts@desertservices.com>

---

## Step 1: Research the Project

**Goal:** Get background on this project before doing anything else.

**Required Info:**

- [ ] When was this bid?
- [ ] Who bid it?
- [ ] What emails exist about this project?
- [ ] Any history or context?

**Actions:**

1. Search email for project name
2. Search email for GC name
3. Search Monday ESTIMATING for the estimate

**If missing:** Keep searching. Try address, variations of name, GC variations.

**Output:** Notes on project history, links to relevant emails.

**Automation:** V1 - Agent can do email search + Monday search

---

## Step 2: Find the Estimate in Monday

**Goal:** Find the matching estimate line item in Monday.

**Required Info:**

- [ ] Monday item ID
- [ ] Estimate number (e.g., 25010301R0)
- [ ] Estimate value
- [ ] GC/Account name
- [ ] Project name
- [ ] Address

**Actions:**

1. Search Monday ESTIMATING by project name
2. If not found, search by GC name
3. If not found, search by address
4. Verify it's the right one (check value, scope)

**If not found:**

- Flag as "Missing Estimate"
- Search email for estimate
- Check QuickBooks directly

**Output:** Monday item link, estimate number, estimate value.

**Automation:** V0 - MCP fuzzy search exists

---

## Step 3: Create Notion Project + Task

**Goal:** Have a place to track this contract.

**Required Info:**

- [ ] Project name
- [ ] GC/Account
- [ ] Address (if known)

**Actions:**

1. Create project in Notion Projects database
2. Set Intake Status = "Received"
3. Create a contract task in Tasks database
4. Link Monday estimate to project
5. Add any notes from Step 1

**If already exists:** Open existing project, update status.

**Output:** Notion project link, task created.

**Automation:** V0 - Notion API exists, just need to call it

---

## Step 4: Mark as Won in Monday

**Goal:** Update Monday so data is accurate.

**Required Info:**

- [ ] Monday item ID (from Step 2)

**Actions:**

1. Set BID_STATUS = "Won"
2. Confirm CONTRACTOR is correct

**Output:** Monday item updated.

**Automation:** V0 - Monday API exists

---

## Step 5: Mark Competing Bids as Lost

**Goal:** Clean up Monday - mark other bids for same project as lost.

**Required Info:**

- [ ] Project name
- [ ] List of other estimates for same project

**Actions:**

1. Search Monday for same project name, different GC
2. For each competing bid: set BID_STATUS = "GC Not Awarded"

**If none found:** Skip this step.

**Output:** Competing bids marked as lost.

**Automation:** V1 - Need logic to find competing bids

---

## Step 6: Get the Estimate Document

**Goal:** Have the actual estimate PDF for reconciliation.

**Required Info:**

- [ ] Estimate PDF file

**Actions:**

1. Check Monday item - is estimate attached?
2. If yes, download it
3. If no, search email for estimate
4. If not in email, go to QuickBooks, find by estimate number, print PDF

**If can't find:**

- Flag project as "Missing Estimate Document"
- Reach out to estimator

**Output:** Estimate PDF saved, attached to Monday + Notion.

**Automation:**

- V0: Can check Monday attachment
- V1: Can search email
- Manual: QuickBooks lookup

---

## Step 7: Get the Contract Document

**Goal:** Have the contract PDF for reconciliation.

**Required Info:**

- [ ] Contract PDF file

**Actions:**

1. Save contract from email to SharePoint
2. Attach to Notion project (Contract Files)
3. Attach to Monday item (CONTRACTS column)

**Output:** Contract PDF in SharePoint, linked in Notion + Monday.

**Automation:** V0 - Just file operations

---

## Step 8: Extract Contract Data

**Goal:** Pull key info from contract.

**Required Info:**

- [ ] Contract value
- [ ] Contract type (LOI, Subcontract, Work Order)
- [ ] Contract date
- [ ] Retention %
- [ ] Billing platform + window
- [ ] Certified payroll required? (Davis-Bacon, HUD)
- [ ] Schedule of Values included?
- [ ] Contacts: PM name, phone, email
- [ ] Contacts: Superintendent name, phone, email
- [ ] Contacts: Billing contact name, phone, email

**Actions:**

1. Read through contract
2. Extract each field above
3. Note page numbers / citations for each

**If missing:**

- PM contact: Flag as "Missing PM Contact"
- SOV: Flag as "Missing SOV"
- Billing info: Flag as "Missing Billing Info"

**Output:** Contract data captured in Notion.

**Automation:** V1 - Agent can extract with Gemini/Claude, need structured output

**Template:** See `templates/01-contract-extraction.md`

---

## Step 9: Reconciliation

**Goal:** Compare contract to estimate - do they match?

**Required Info:**

- [ ] Contract value
- [ ] Contract line items / scope
- [ ] Estimate value
- [ ] Estimate line items / scope

**Actions:**

1. Compare totals: Contract vs Estimate
2. List items REMOVED (in estimate, not in contract)
3. List items ADDED (in contract, not in estimate)
4. Calculate: Estimate - Removed + Added = should equal Contract
5. Note any red flags (scope ambiguity, missing items, unusual terms)

**Outcomes:**

- **Match:** Totals align, scope aligns. Continue.
- **Revised Estimate Needed:** Contract differs but makes sense. Create new estimate version.
- **Clarification Needed:** Doesn't add up. Need to ask client.

**Output:** Reconciliation summary, outcome decision, variance amount.

**Automation:** V1 - Agent can do comparison, need structured output

**Template:** See `templates/02-reconciliation.md`

---

## Step 10: Update Monday with Awarded Value

**Goal:** Capture actual contract amount in Monday.

**Required Info:**

- [ ] Contract value (from Step 8)
- [ ] Monday item ID (from Step 2)

**Actions:**

1. Update AWARDED_VALUE column with contract value

**Output:** Monday updated.

**Automation:** V0 - Monday API exists

---

## Step 11: QuickBooks Updates (MANUAL)

**Goal:** Keep QB accurate.

**Required Info:**

- [ ] Estimate number
- [ ] Correct GC name
- [ ] Correct project address
- [ ] Contract PDF
- [ ] Estimate PDF (revised if needed)

**Actions:**

1. Find estimate in QuickBooks
2. Verify GC name is correct - update if needed
3. Verify address is correct - update if needed
4. If scope changed: create new estimate version (R1)
5. Create new job if needed
6. Attach contract PDF to job
7. Attach estimate PDF to job

**If scope changed:**

- Duplicate estimate
- Update revision: R0 → R1
- Update line items to match contract
- Export new PDF
- Attach to Monday + Notion + QB

**Output:** QB updated, revised estimate if needed.

**Automation:** None - no QB API

---

## Step 12: SharePoint Setup

**Goal:** Project folder exists with all docs.

**Required Info:**

- [ ] GC name
- [ ] Project name
- [ ] Contract PDF
- [ ] Estimate PDF

**Actions:**

1. Check if GC folder exists: `Projects/01-Active/{GC}/`
2. If not, create it
3. Check if project folder exists: `Projects/01-Active/{GC}/{Project}/`
4. If not, create with standard subfolders:
   - 01-Estimates/
   - 02-Contracts/
   - 03-Permits/
   - 04-SWPPP/
   - 05-Inspections/
   - 06-Billing/
   - 07-Closeout/
5. Save contract to 02-Contracts/
6. Save estimate to 01-Estimates/

**Output:** SharePoint folder created, docs saved.

**Automation:** V0 - SharePoint API exists

---

## Step 13: Update Notion Project

**Goal:** Project record is complete.

**Required Info:**

- [ ] All contract data (from Step 8)
- [ ] Reconciliation outcome (from Step 9)
- [ ] Monday link (from Step 2)
- [ ] SharePoint link (from Step 12)

**Actions:**

1. Update all fields in Notion project:
   - Contract value
   - Estimate value
   - Variance
   - Contacts (PM, Super, Billing)
   - Reconcile Status
   - Reconcile Outcome
   - Red flags
   - Certified payroll status
2. Add Monday estimate link
3. Add SharePoint folder link
4. Set Status appropriately

**Output:** Notion project fully updated.

**Automation:** V0 - Notion API exists

---

## Step 14: Send Internal Email

**Goal:** Notify team, signal ready for signature.

**Required Info:**

- [ ] All project info from previous steps
- [ ] Any missing info / red flags
- [ ] Next actions needed

**Actions:**

1. Draft email using template
2. Include: project name, GC, contract value, key contacts, scope summary
3. Include: any red flags, missing info, clarification needed
4. Include: next actions (e.g., "ready to sign", "need SOV")
5. Send to internalcontracts@ (and relevant people)

**Output:** Internal email sent.

**Automation:** V1 - Email API exists, need to automate template fill

**Template:** See `templates/03-internal-contracts-email.md`

---

## Step 15: Handle Open Items

**Goal:** Track anything that needs follow-up.

**Required Info:**

- [ ] List of missing info
- [ ] List of clarifications needed
- [ ] List of action items

**Actions:**

1. For each open item, create/update task in Notion
2. Set due dates
3. If clarification needed from client:
   - Draft clarification email
   - Send to client
   - Track in Notion

**Output:** Open items tracked in Notion for daily follow-up.

**Automation:** V1 - Notion tasks, email

**Template:** See `templates/04-client-clarification-email.md`

---

## Templates

Located in `services/contract/templates/`:

- `01-contract-extraction.md` - What to extract from contracts
- `02-reconciliation.md` - How to compare contract vs estimate
- `03-internal-contracts-email.md` - Internal notification email
- `04-client-clarification-email.md` - Email to client for missing info

---

## Automation Summary

| Step | V0 (Ready) | V1 (Agent) | Manual |
|------|------------|------------|--------|
| 1. Research | | Email + Monday search | |
| 2. Find estimate | Monday MCP | | |
| 3. Create Notion | Notion API | | |
| 4. Mark Won | Monday API | | |
| 5. Mark Lost | | Find competing logic | |
| 6. Get estimate doc | Check Monday | Search email | QB lookup |
| 7. Get contract doc | File save | | |
| 8. Extract data | | Gemini/Claude | |
| 9. Reconciliation | | Gemini/Claude | |
| 10. Awarded value | Monday API | | |
| 11. QuickBooks | | | All manual |
| 12. SharePoint | SharePoint API | | |
| 13. Update Notion | Notion API | | |
| 14. Internal email | | Template fill | |
| 15. Open items | Notion tasks | | |

---

## What's Blocked

**Right now:** Stuck at reconciliation. Getting output from Gemini but:

1. Output not structured for next steps
2. Not doing anything with the output
3. Not doing Steps 1-8 or 10-15

**To unblock:**

1. Define exact output format from reconciliation
2. Build checklist runner that goes step by step
3. For each step, either do it manually or trigger automation

---

## Next Actions

1. [ ] Define reconciliation output format (what fields, what structure)
2. [ ] Create templates folder with scoped templates
3. [ ] Test going through this checklist manually on one project
4. [ ] Mark which steps I actually did vs skipped
5. [ ] Build V0 automations for ready steps
