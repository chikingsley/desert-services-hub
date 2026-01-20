# Contracts Database Schema (Notion)

**Purpose:** Track all contracts from award through completion, linking to estimates, projects, and required documents.

---

## DATABASE: Contracts

### Core Properties

| Property | Type | Description |
|----------|------|-------------|
| **Name** | Title | Contract display name (e.g., "CFA #5729 Peoria - Subcontract") |
| **Project** | Relation | Links to Projects database |
| **Estimate** | Relation | Links to Monday Estimates (or Estimates database) |
| **GC/Customer** | Relation | Links to Customers/Contractors database |
| **Contract Type** | Select | `Subcontract` / `LOI` / `SOW` / `Work Order` / `Change Order` / `Master Agreement` |
| **Status** | Select | `Draft` / `Sent` / `Pending Signature` / `Executed` / `Active` / `Complete` / `Cancelled` |

### Financials

| Property | Type | Description |
|----------|------|-------------|
| **Contract Value** | Number (Currency) | Total contract amount |
| **Estimate Value** | Rollup/Number | Original estimate amount (from Estimate relation) |
| **Variance** | Formula | `Contract Value - Estimate Value` |
| **Retention %** | Number (Percent) | 5%, 7.5%, 10%, etc. |
| **Retention Amount** | Formula | `Contract Value * Retention %` |
| **Billed to Date** | Number (Currency) | Total invoiced |
| **Paid to Date** | Number (Currency) | Total received |
| **Balance Due** | Formula | `Billed to Date - Paid to Date` |

### Dates

| Property | Type | Description |
|----------|------|-------------|
| **Contract Sent** | Date | When we sent for signature |
| **Contract Signed** | Date | Execution date |
| **Start Date** | Date | Project start |
| **End Date** | Date | Project completion |
| **Days to Sign** | Formula | `Contract Signed - Contract Sent` |

### Contacts

| Property | Type | Description |
|----------|------|-------------|
| **GC PM** | Text | Project Manager name |
| **GC PM Email** | Email | PM email |
| **GC PM Phone** | Phone | PM phone |
| **Site Super** | Text | Superintendent name |
| **Site Super Phone** | Phone | Super phone |
| **Billing Contact** | Text | AP contact name |
| **Billing Email** | Email | Where to send invoices |

### Compliance Checklist (Checkboxes)

| Property | Type | Description |
|----------|------|-------------|
| **COI Sent** | Checkbox | Insurance certificate submitted |
| **COI Approved** | Checkbox | GC confirmed acceptance |
| **W-9 Sent** | Checkbox | Tax form submitted |
| **Contract Signed** | Checkbox | Fully executed |
| **NOI Verified** | Checkbox | Notice of Intent confirmed |
| **Dust Permit Verified** | Checkbox | Permit active |
| **Site Orientation Complete** | Checkbox | Safety training done |
| **Badge Obtained** | Checkbox | Site access credentials |

### Billing Setup

| Property | Type | Description |
|----------|------|-------------|
| **PO Number** | Text | Purchase order number |
| **Billing Platform** | Select | `Textura` / `Procore` / `GC Pay` / `Premier` / `Email` / `Other` |
| **Billing Window** | Text | e.g., "20th-25th of month" |
| **Certified Payroll Required** | Checkbox | Davis-Bacon / prevailing wage |
| **Lien Waiver Type** | Select | `Conditional` / `Unconditional` / `Both` |

### Documents & Links

| Property | Type | Description |
|----------|------|-------------|
| **Monday Link** | URL | Link to Monday estimate |
| **SharePoint Folder** | URL | Link to project folder |
| **Contract PDF** | Files | Uploaded contract document |
| **Plans** | Files | SWPPP/site plans |
| **DocuSign Link** | URL | Link to signing envelope |

### Metadata

| Property | Type | Description |
|----------|------|-------------|
| **Created** | Created time | Auto |
| **Last Modified** | Last edited time | Auto |
| **Owner** | Person | Who's managing this contract |
| **Notes** | Text | Free-form notes |

---

## VIEWS

### 1. Active Contracts (Board View)

Group by: **Status**

- Columns: Draft | Sent | Pending Signature | Executed | Active | Complete

### 2. Pending Signatures (Table View)

Filter: Status = "Sent" OR "Pending Signature"
Sort: Contract Sent (oldest first)
Show: Name, GC/Customer, Contract Value, Days to Sign, DocuSign Link

### 3. Onboarding Incomplete (Table View)

Filter: Status = "Executed" AND (COI Approved = false OR Site Orientation = false OR Badge Obtained = false)
Show: Name, Compliance checkboxes, Start Date

### 4. By Customer (Board View)

Group by: **GC/Customer**
Show: Name, Contract Value, Status

### 5. Financial Summary (Table View)

Show: Name, Contract Value, Billed to Date, Paid to Date, Balance Due
Sum: All currency columns

---

## RELATED DATABASES

### Projects Database (Link)

- One Project can have many Contracts
- Roll up total contract value to Project

### Customers/GCs Database (Link)

- Track all contracts per customer
- Roll up total business value

### Monday Estimates (Sync or Manual Link)

- Link contract to original estimate
- Compare estimate vs contract value

---

## AUTOMATIONS (Notion or n8n)

1. **Contract Sent** - When status changes to "Sent", start timer for follow-up
2. **Signed Alert** - When Contract Signed checkbox = true, notify operations
3. **Onboarding Incomplete** - 3 days before Start Date, if checklist incomplete, alert
4. **Billing Reminder** - Monthly reminder based on Billing Window

---

## SAMPLE FORMULAS

### Days to Sign

```notion
dateBetween(prop("Contract Signed"), prop("Contract Sent"), "days")
```

### Variance

```notion
prop("Contract Value") - prop("Estimate Value")
```

### Balance Due

```notion
prop("Billed to Date") - prop("Paid to Date")
```

### Retention Amount

```notion
prop("Contract Value") * prop("Retention %")
```

### Onboarding Complete (Boolean)

```notion
prop("COI Approved") and prop("Contract Signed") and prop("NOI Verified") and prop("Site Orientation Complete")
```

---

## QUICK SETUP STEPS

1. Create "Contracts" database in Notion
2. Add all properties above
3. Create relation to existing Projects database (if exists)
4. Create relation to Customers/GCs database (if exists)
5. Set up the 5 views
6. Import the 9 current open contracts
7. Fill in Monday links and compliance status

---

**Schema Version:** 1.0
**Last Updated:** December 2025
