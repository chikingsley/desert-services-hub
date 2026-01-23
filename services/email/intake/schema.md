# Project Intake Schema

Phased approach to project intake. Start with V0 for triage, expand as projects mature.

---

## V0: Minimum Intake (Triage Mode)

**Goal:** Capture enough to not lose the project. 80 emails behind = do this fast.

### Database Row (Properties)
- `Project name` - "{Project} - {Account}" format
- `Account` - GC/Contractor name
- `Status` - "Intake"
- `Source Signal` - How it came in (Subcontract, DocuSign, Estimate Request, Work Order, PO, Referral, Portal)
- `Dates` - Start date if known

### Page Content (Minimum)
```markdown
## Quick Context
**Source:** {how it came in + date}
**Contact:** {name} ({email})
**What we're waiting on:** {blockers}

## Email Trail
- [{date}] {subject} - {one-line summary} → [link]

## Next Actions
- [ ] {task with owner}
```

### Files
- Contract PDF attached to Notion (Files property)
- Or SharePoint link in page content

---

## V1: Contract Processing

**Goal:** Full reconciliation. After triage, when actually processing a contract.

### Additional Properties
- Contract Value
- Estimate Value
- Variance
- Reconcile Status (Pending, Reconciled, Needs Clarification)

### Page Content (Add to V0)
```markdown
## Contract Summary
**Contract Value:** $X
**Estimate Value:** $Y
**Variance:** $Z (X%)
**Retention:** X%
**Billing Platform:** {platform}
**Certified Payroll:** Yes/No

## Contacts
**PM:** {name} - {email} - {phone}
**Super:** {name} - {email} - {phone}
**Billing:** {name} - {email} - {phone}

## Reconciliation
**Outcome:** Match / Revised Estimate / Clarification Needed
**Items Removed:** {list}
**Items Added:** {list}
**Red Flags:** {list}

## Insurance Requirements
- GL: $X
- Auto: $X
- WC: Required/Not Required
- Umbrella: $X
- Additional Insured: {names}

## Payment Terms
- {key terms}
```

---

## V2: Operations Ready

**Goal:** Full handoff to operations. Everything needed to mobilize.

### Additional Properties
- SharePoint Link
- Monday Estimate Link
- Handoff Status
- Operations Signoff

### Page Content (Add to V1)
```markdown
## Site Info
**Address:** {full address}
**Cross Streets:** {streets}
**Access:** {instructions}
**Gate Code:** {code}
**Site Hours:** {hours}

## Safety Requirements
- OSHA 10/30: Required/Not Required
- Drug Testing: {policy}
- Badging: Required/Not Required
- Site-Specific Safety Plan: Required/Not Required

## Pre-Mobilization Checklist
- [ ] Grading done
- [ ] Temp fence installed
- [ ] Inlets installed
- [ ] Rock entrance prepped

## Permits
**Dust Permit:** {status} - [link]
**SWPPP:** {status} - [link]
**NOI:** {status} - [link]

## Billing Setup
**PO Number:** {number}
**Billing Platform:** {platform}
**Billing Window:** {window}
**Lien Waiver Type:** {type}

## Signoffs
- [ ] Operations Signoff - {date}
- [ ] PM Signoff - {date}
```

---

## Quick Reference

- **V0 (Triage)** - Don't lose it: name, source, contact, email trail
- **V1 (Processing)** - Reconcile: contract vs estimate, red flags, terms
- **V2 (Handoff)** - Mobilize: site info, safety, permits, billing

---

## Related Docs
- Full schema: `services/contract/notion-project-record-schema.md`
- Intake checklist: `services/contract/contract-intake-checklist.md`
- Reconciliation process: `services/contract/contract-intake-process.md`
- Reconciliation template: `services/contract/contract-reconciliation-template.md`
