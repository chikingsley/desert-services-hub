# [Project Name] - Ground Truth Notes

<!--
This template aligns with:
- .planning/PROJECT.md workflow stages (0-4)
- Phase 3 extraction agents (contract-info, billing, contacts, sov, insurance, site-info, red-flags)
- Census DB email tracking (mailbox_id identifies inbox)
-->

## Quick Reference

| Field | Value | Source |
|-------|-------|--------|
| **Project Name** | | page X |
| **Project Number** | | page X |
| **Address** | | page X |
| **GC** | | page X |
| **Owner** | | page X |
| **Contract Type** | [LOI / Subcontract / Work Order / PO / Amendment] | page X |
| **Contract Value** | $ | page X |
| **Contract Date** | | page X |
| **Contract Status** | [Pending / Signed / Active / Suspended / Complete] | |
| **Monday Estimate** | #XXXXXXXX - $ - [Status] | |

---

## Workflow Status

Per PROJECT.md stages:

| Stage | Status | Completed | Notes |
|-------|--------|-----------|-------|
| 0. Intake/Documentation | [ ] | | Docs gathered, Monday updated |
| 1. Reconciliation | [ ] | | Extraction + reconcile complete |
| 2. Customer Response | [ ] | | Good to sign or issues sent |
| 3. Internal Notification | [ ] | | internalcontracts@ notified |
| 4. System Updates | [ ] | | QB, SharePoint setup |

---

## Contacts

Per extraction agent: `contacts`

| Role | Name | Phone | Email | Source |
|------|------|-------|-------|--------|
| PM | | | | page X |
| Super | | | | page X |
| Site Contact | | | | page X |
| Billing | | | | page X |
| Coordinator | | | | page X |

---

## Billing Terms

Per extraction agent: `billing`

| Field | Value | Source |
|-------|-------|--------|
| Retention | % | page X |
| Billing Platform | [Textura / Procore / GCPay / Premier / Email] | page X |
| Billing Window | | page X |
| Invoice To | | page X |
| Payment Terms | | page X |
| Certified Payroll | [Yes / No] - [Davis-Bacon / HUD / State / None] | page X |

---

## Insurance Requirements

Per extraction agent: `insurance`

| Type | Contract Requires | Our Limits | Status |
|------|-------------------|------------|--------|
| GL (per occ) | $ | $1,000,000 | [Met / Gap] |
| GL (aggregate) | $ | $2,000,000 | |
| Auto | $ | $1,000,000 | |
| WC / Employers | $ | $1,000,000 | |
| Umbrella | $ | $5,000,000 | |

**Endorsements:**

| Requirement | Required | Source |
|-------------|----------|--------|
| Additional Insured | [Yes / No] - names: | page X |
| Waiver of Subrogation | [Yes / No] | page X |
| Primary & Non-Contributory | [Yes / No] | page X |
| COI Required | [Yes / No] | page X |

**Bonding:**

- Performance Bond: [Yes / No] - $
- Payment Bond: [Yes / No] - $

**Insurance Status:** [Verified / Pending Dawn / Exceeds Coverage - Contact WTW]

---

## Site Info

Per extraction agent: `site-info`

| Field | Value | Source |
|-------|-------|--------|
| Site Address | | page X |
| Site Hours | | page X |
| Access Instructions | | page X |
| Safety Requirements | | page X |

---

## Schedule of Values (SOV)

Per extraction agent: `sov`

SOV Included: [Yes / No]

| # | Description | Qty | Unit | Amount | Source |
|---|-------------|-----|------|--------|--------|
| 1 | | | | $ | page X |
| 2 | | | | $ | page X |
| 3 | | | | $ | page X |

**Scope Summary:**

1.
2.
3.

---

## Reconciliation

Per PROJECT.md Stage 1

| | Amount |
|---|--------|
| Estimate Total | $ |
| Contract Total | $ |
| Variance | $ |

**Line Item Reconciliation:**

| Status | Item | Estimate | Contract | Delta |
|--------|------|----------|----------|-------|
| KEPT | | $ | $ | |
| REMOVED | | $ | - | -$ |
| ADDED | | - | $ | +$ |

**Math Check:** `Estimate - Removed + Added = Contract`

$_____ - $_____ + $_____ = $_____ → [RECONCILES / MISMATCH]

---

## Red Flags / Notable Terms

Per extraction agent: `red-flags`

| Flag | Severity | Description | Source | Action |
|------|----------|-------------|--------|--------|
| | [High/Med/Low] | | page X | [Strike / Accept / Clarify] |

**Missing Information:**

- [ ]
- [ ]

**Overall Risk Level:** [Low / Medium / High]

---

## Email History

From census DB - `mailbox_id` identifies inbox

**Inbox Codes:**

- `chi` = <chi@desertservices.net> (your personal inbox)
- `contracts` = <contracts@desertservices.net> (shared)
- `dustpermits` = <dustpermits@desertservices.net> (shared)

| Date | Inbox | From | Subject | Action/Notes |
|------|-------|------|---------|--------------|
| | chi | | | You received directly |
| | contracts | | | Shared inbox |
| | dustpermits | | | Shared inbox |

---

## Documents

| Document | Status | Location/Notes |
|----------|--------|----------------|
| Contract PDF | [Have / Missing] | |
| Estimate PDF | [Have / Missing] | Monday #XXXXXXXX |
| COI | [Sent / Pending] | |
| Signed Contract | [Have / Pending / N/A] | |
| SWPPP Plans | [Have / Missing / N/A] | |
| NOI | [Have / Missing / N/A] | |
| Dust Permit | [Have / Missing / N/A] | |

---

## Follow-up Actions

### Stage 0: Intake (SLA: 4 hours)

- [ ] Retrieve contract documents
- [ ] Place in SharePoint folder
- [ ] Find Monday estimate
- [ ] Mark estimate "Won"
- [ ] Mark competing estimates "GC Not Awarded"
- [ ] Send initial touchpoint to contractor

### Stage 1: Reconciliation (SLA: 1 business day)

- [ ] Extract contract data (this notes file)
- [ ] Verify insurance against our limits
- [ ] Reconcile estimate vs contract
- [ ] Determine: GOOD TO SIGN or HAS ISSUES

### Stage 2: Customer Response (SLA: 4 hours)

- [ ] If good: Send "ready to sign" confirmation
- [ ] If issues: Send clarification email with list

### Stage 3: Internal Notification (SLA: 4 hours)

- [ ] Send to internalcontracts@ using handoff template

### Stage 4: System Updates (SLA: same day)

- [ ] Update QuickBooks estimate
- [ ] Create QuickBooks job number
- [ ] Set up SharePoint folder structure

---

## Open Questions

- [ ]

---

## Notes

-
