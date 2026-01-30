# Urgency Rules

Configuration for email urgency scoring during inbox triage.

**Created:** 2026-01-28
**Updated:** 2026-01-28

---

## VIP Senders (always 🔴)

Emails from these addresses always surface for review:

### Internal

- <jayson@desertservices.net> (Owner)
- <jeff@desertservices.net> (GM)

### Key Contractors (add as relationships develop)
<!-- Example:
- john.smith@laytonconstruction.com (Layton - active contracts)
- sarah@catamountconstructors.com (Catamount)
-->

---

## Classification Urgency

| Classification | Base Urgency | Reason |
|----------------|--------------|--------|
| CONTRACT | 🟡 | Time-sensitive, deadlines |
| DUST_PERMIT | 🟡 | Permit deadlines |
| SWPPP | ⚪ | Usually scheduled |
| ESTIMATE_REQUEST | ⚪ | Incoming opportunity |
| INVOICE | ⚪ | Billing cycle |
| INSURANCE | 🟡 | Compliance deadlines |

---

## Keyword Triggers

### 🔴 Urgent Keywords (in subject)

- urgent
- ASAP
- EOD
- action required
- deadline
- immediate
- past due
- final notice
- time sensitive
- today

### 🟡 Attention Keywords (in subject)

- follow-up
- follow up
- reminder
- review needed
- please review
- update
- FYI
- response needed
- waiting on

### ⚪ Routine Keywords (in subject)

- newsletter
- digest
- automated
- no reply needed
- weekly update
- monthly report

---

## Age Rules

| Age in Inbox | Urgency | Reason |
|--------------|---------|--------|
| >7 days | 🔴 | Overdue attention |
| 3-7 days | 🟡 | Needs attention soon |
| <3 days | ⚪ | Fresh, can wait |

---

## Auto-Archive Rules

Emails matching these patterns can be auto-archived (after confirming):

| Pattern | Reason |
|---------|--------|
| "Out of Office" | Routine |
| "Automatic reply" | Routine |
| *@notifications.* | System noise |
| "Unsubscribe" in body | Marketing |
| "This is an automated message" | System generated |

---

## Auto-File Rules

Emails that should auto-file to specific classifications:

| Sender/Pattern | Classification | Notes |
|----------------|----------------|-------|
| *@docusign.com | CONTRACT | DocuSign notifications |
| *@textura.com | INVOICE | Textura payment platform |
| *@gcpay.com | INVOICE | GCPay platform |
| *@procore.com | VARIES | Could be any type |

---

## Contractor Priority Boost

Contractors with active contracts get +1 urgency:

<!-- Add contractors as you process contracts:
- Layton Construction (active: VT303)
- Property Reserve (active: Elanto at Prasada)
- Catamount Constructors (active: multiple)
-->

---

## Learned Adjustments

*Rules added during triage sessions:*

<!-- This section gets updated as you triage. Example:
- 2026-01-28: Emails from sarah@catamount always 🔴 (responsive, time-sensitive)
- 2026-01-28: Weekly digest from procore → auto-archive
-->
