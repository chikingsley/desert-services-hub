# Folder & Filing Rules

Configuration for email organization during inbox triage.

**Created:** 2026-01-28
**Updated:** 2026-01-28

---

## Folder Structure (Outlook)

```text
📁 Contracts/
   📁 Active/          (contracts being processed)
   📁 Signed/          (completed contracts)
   📁 Pending/         (waiting on info)

📁 Dust Permits/
   📁 Active/          (permits in progress)
   📁 Complete/        (issued permits)

📁 SWPPP/
   📁 Active/
   📁 Archive/

📁 Estimates/
   📁 Pending/         (quotes being prepared)
   📁 Sent/            (awaiting response)
   📁 Won/             (awarded)
   📁 Lost/            (not awarded)

📁 Invoicing/
   📁 Textura/
   📁 GCPay/
   📁 Direct/

📁 Insurance/
   📁 COIs/
   📁 Renewals/

📁 Contractors/
   (subfolders by GC name)

📁 Archive/
   (truly done, reference only)
```

---

## Classification → Folder Mapping

| Classification | Default Folder | Notes |
|----------------|----------------|-------|
| CONTRACT | Contracts/Active/ | Move to Signed/ when executed |
| DUST_PERMIT | Dust Permits/Active/ | Move to Complete/ when issued |
| SWPPP | SWPPP/Active/ | |
| ESTIMATE_REQUEST | Estimates/Pending/ | |
| INVOICE | Invoicing/{platform}/ | |
| INSURANCE | Insurance/COIs/ | |
| GENERAL | (keep in inbox or contractor folder) | |

---

## Sender → Folder Rules

### By Domain

| Domain | Folder | Notes |
|--------|--------|-------|
| @docusign.com | Contracts/Active/ | DocuSign envelopes |
| @textura.com | Invoicing/Textura/ | |
| @gcpay.com | Invoicing/GCPay/ | |
| @procore.com | (by content) | Multi-purpose |

### By Contractor (add as you go)

<!-- Example:
| laytonconstruction.com | Contractors/Layton/ | |
| catamountconstructors.com | Contractors/Catamount/ | |
| propertyreserve.org | Contractors/Property Reserve/ | |
-->

---

## SharePoint Mirroring

When filing emails, also note SharePoint location:

| Email Folder | SharePoint Path |
|--------------|-----------------|
| Contracts/Signed/{project} | Customer Projects/Active/{letter}/{GC}/{project}/02-Contracts/ |
| Dust Permits/Complete/{project} | Customer Projects/Active/{letter}/{GC}/{project}/05-Permits/ |
| Insurance/COIs/ | Corporate/Insurance/ |

---

## Archive Criteria

Move to Archive when ALL of these are true:

- Contract is fully signed OR project is complete
- All payments received (if applicable)
- No pending follow-ups
- >30 days since last action

---

## Categories/Labels (Outlook)

| Category | Color | Use For |
|----------|-------|---------|
| Needs Response | Red | Requires your reply |
| Waiting | Yellow | Waiting on someone else |
| FYI | Blue | Informational only |
| Done | Green | Processed, ready to file |
| Urgent | Orange | Time-sensitive |

---

## Filing Workflow

1. **Triage** → Classify and score urgency
2. **Process** → Take action (respond, delegate, etc.)
3. **Categorize** → Add appropriate category
4. **File** → Move to correct folder
5. **Archive** → When criteria met

---

## Learned Patterns

*Filing patterns learned during triage:*

<!-- This section gets updated as you triage. Example:
- 2026-01-28: Emails from noreply@maricopa.gov → Dust Permits/Active/
- 2026-01-28: Subject contains "COI Request" → Insurance/COIs/
-->
