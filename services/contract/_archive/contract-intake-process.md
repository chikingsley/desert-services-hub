# Contract Intake and Reconciliation Process

## Purpose

Provide a repeatable, end-to-end workflow for handling contracts received via email, matching them to estimates, reconciling scope and price, and producing the required outputs (Notion updates, revised estimates, and draft emails).

- --

## Trigger

- Contract arrives via email, DocuSign, or portal.

- --

## Inputs

- Contract PDF (from email)
- Estimate in Monday and/or QuickBooks
- SharePoint project folder

- --

## Required Outputs

- Notion project record updated (status, key fields, links)
- Reconciled outcome (match, revised estimate, or clarification needed)
- Updated estimate version (if contract differs)
- Draft internal contracts email
- Draft client clarification email (when needed)
- Checklist completion status

- --

## End-to-End Workflow

### 1. Capture and File

- Save the email and attachments to SharePoint.
- Create or open the Notion Project record.
- Attach the contract PDF in Notion (Contract Files).
- Set Intake Status = Received.

### 2. Find the Estimate in Monday

Search the estimating board using:

- Project name (fuzzy match)
- Contractor / account name (minimum match)
- Address

If found:

- Download estimate PDF and attach to Notion (Estimate Files).
- Add the Monday estimate link and ID to Notion.
- Set Estimate Located = Yes.

If not found:

- Set Intake Status = Missing Estimate.
- Add a note about what you searched.

### 3. Extract Key Contract Data

Capture the following in Notion:

- Contract value
- Contract type (LOI, Subcontract, Work Order)
- Contract date and retention percent
- Billing platform and billing window
- Certified payroll requirement (Davis-Bacon, HUD, etc)
- Site contacts (PM, superintendent, billing)
- Schedule of values present or missing

### 4. Reconcile Contract vs Estimate

Use the reconciliation template to:

- Compare totals
- Compare line items
- Identify removals and additions
- Calculate net change
- Flag scope red flags

### 5. Decide the Outcome

- Match: Totals and scope align. Mark Reconciled.
- Revised Estimate: Contract differs but can be reconciled. Create a new estimate version that matches the contract. Do not overwrite the original estimate.
- Clarification Needed: Scope or totals do not reconcile. Draft client questions before making changes.

### 6. Produce Outputs

- Update Notion with the reconciliation summary and decision.
- Draft internal contracts email (summary, missing info, red flags).
- Draft client clarification email when needed.
- Attach the revised estimate PDF to Monday and Notion.

### 7. Handoff Readiness

When the checklist is complete:

- Set project Status = Ready for Handoff.
- Notify operations or contract owner.

- --

## Checklist and Agent Inputs

Use `services/contract/contract-intake-checklist.md` for the combined human checklist and agent output list.

If using a chat-based agent locally, provide:

- Notion Project link
- Contract PDF
- Estimate PDF (if found)
- Monday estimate link

Require the agent to include page/section citations for every extracted fact or requirement.
