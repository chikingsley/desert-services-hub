# SharePoint Project Folder Structure - Proposal v2

**Last Updated:** December 2025
**Status:** Draft for Review

---

## Executive Summary

This document proposes a new folder structure for Desert Services projects in SharePoint, balancing:

- **Usability** - People can find things intuitively
- **Searchability** - Metadata enables filtering without deep navigation
- **Automation** - Consistent structure enables n8n/API workflows
- **Lifecycle Management** - Clear flow from bid → active → closed

---

## Key Decisions

### Why NOT organize by Year or Contractor at top level?

| Approach | Pros | Cons |
|----------|------|------|
| **By Year** | Easy to archive old years | Which year? Bid year? Start year? End year? Projects span years. |
| **By Contractor** | Groups related work | 200+ contractors = 200+ folders to navigate. GC names vary. |
| **By Status** | Matches workflow | Projects change status; requires moving folders. |
| **Flat + Metadata** | Maximum flexibility | Requires discipline in tagging; can feel unorganized. |

### Recommendation: Hybrid Status-Based + Metadata

Use **status folders** at top level (matches your workflow), with **metadata** for searchability:

```text
Projects/
├── 00-Bidding/          ← Estimates submitted, waiting on award
├── 01-Active/           ← Contract signed, work in progress
├── 02-Completed/        ← Work done, closeout complete
└── 03-Lost/             ← Didn't win, but keep for reference
```markdown

**Why this works:**

1. Matches your actual workflow (bid → win/lose → complete)
2. Only 4 top-level folders to navigate
3. Status changes are infrequent (move folder when status changes)
4. Metadata handles the heavy lifting for search/filter

---

## Folder Structure

### Top Level

```text
/Shared Documents/Projects/
├── 00-Bidding/
│   └── [Project Name - Contractor]/
├── 01-Active/
│   └── [Project Name - Contractor]/
├── 02-Completed/
│   └── [Project Name - Contractor]/
└── 03-Lost/
    └── [Project Name - Contractor]/
```css

### Project Folder Naming

**Format:** `[Project Name] - [Contractor Name]`

Examples:

- `Kiwanis Playground - Caliente Construction`
- `PV Redevelopment Phase 5 - BPR Companies`
- `Ak Chin Medical Suites - AR Mays Construction`

**Why project name first?**

- You usually know the project name before the contractor
- Alphabetizes by project (easier to find)
- Contractor name is backup identifier for duplicates

### Inside Each Project Folder

```text
[Project Name - Contractor]/
├── 01-Estimates/
│   ├── Estimate-2025-12-15-SWPPP-v1.pdf
│   ├── Estimate-2025-12-18-SWPPP-DustPermit-v2.pdf
│   └── Plans-2025-12-15-Civil.pdf        ← Drawing used for estimate
│
├── 02-Contracts/
│   ├── Contract-Signed-2025-12-16.pdf
│   ├── PO-12345.pdf
│   ├── Insurance-COI-2025-12-16.pdf
│   └── ScheduleOfValues-2025-12-20.xlsx
│
├── 03-Permits/
│   ├── NOI-AZC110437-2025-08-12.pdf
│   ├── NDC-113801-2025-12-08.pdf
│   ├── DustPermit-F051905-2025-12-17.pdf
│   └── DustApplication-D0062940-2025-12-08.pdf
│
├── 04-SWPPP/
│   ├── SWPPP-Plan-2025-12-15.pdf
│   ├── Narrative-2025-12-18.pdf
│   └── SitePlan-2025-12-15.pdf
│
├── 05-Inspections/
│   ├── 2025-07-22.pdf
│   ├── 2025-08-05.pdf
│   ├── 2025-09-28-Rain.pdf
│   └── Photos/
│       ├── 2025-07-22/
│       └── 2025-08-05/
│
├── 06-Billing/
│   ├── Invoice-IV086336-2025-12-08.pdf
│   ├── ChangeOrder-01-2025-12-15.pdf
│   └── Lien-Waiver-Progress-2025-12-20.pdf
│
└── 07-Closeout/
    ├── FinalInspection-2025-12-30.pdf
    ├── Lien-Waiver-Final-2025-12-30.pdf
    └── CloseoutLetter-2025-12-31.pdf
```css

---

## File Naming Convention

### General Format

```text
[DocumentType]-[Identifier]-[Date]-[Modifier].ext
```css

- **DocumentType**: What kind of document (Estimate, Contract, Invoice, etc.)
- **Identifier**: Reference number, version, or descriptor
- **Date**: `YYYY-MM-DD` format (sorts chronologically)
- **Modifier**: Optional (Rain, Final, v2, etc.)

### Examples by Document Type

| Document Type | Example Filename |
|--------------|------------------|
| Estimate | `Estimate-2025-12-15-SWPPP-v1.pdf` |
| Estimate (revised) | `Estimate-2025-12-18-SWPPP-v2.pdf` |
| Plans (for estimate) | `Plans-2025-12-15-Civil.pdf` |
| Signed Contract | `Contract-Signed-2025-12-16.pdf` |
| Purchase Order | `PO-12345-2025-12-16.pdf` |
| Insurance COI | `Insurance-COI-2025-12-16.pdf` |
| Schedule of Values | `ScheduleOfValues-2025-12-20.xlsx` |
| NOI | `NOI-AZC110437-2025-08-12.pdf` |
| NDC | `NDC-113801-2025-12-08.pdf` |
| Dust Permit | `DustPermit-F051905-2025-12-17.pdf` |
| Dust Application | `DustApplication-D0062940-2025-12-08.pdf` |
| SWPPP Plan | `SWPPP-Plan-2025-12-15.pdf` |
| Narrative | `Narrative-2025-12-18.pdf` |
| Inspection | `2025-07-22.pdf` |
| Inspection (rain) | `2025-07-22-Rain.pdf` |
| Invoice | `Invoice-IV086336-2025-12-08.pdf` |
| Change Order | `ChangeOrder-01-2025-12-15.pdf` |
| Lien Waiver | `Lien-Waiver-Progress-2025-12-20.pdf` |

### Why Dashes, Not Underscores?

- Dashes are easier to read
- Dashes work better in URLs
- Underscores can look like spaces in some fonts
- You mentioned people find underscores confusing

---

## Metadata Strategy

### Recommended Columns (SharePoint)

Set these on the **Projects** library or use **Column Default Values** per folder:

| Column | Type | Purpose | Set At |
|--------|------|---------|--------|
| **ProjectName** | Single line text | Quick filter/search | Folder |
| **Contractor** | Choice or Lookup | Filter by GC | Folder |
| **Status** | Choice | Bidding/Active/Completed/Lost | Folder |
| **Address** | Single line text | Site location | Folder |
| **ServiceTypes** | Multi-choice | SWPPP, Dust Permit, Inspections, etc. | Folder |
| **NOINumber** | Single line text | AZC______ | Folder (if applicable) |
| **DustPermitNumber** | Single line text | F______ or D______ | Folder (if applicable) |
| **StartDate** | Date | Project start | Folder |
| **EndDate** | Date | Project end | Folder |

### How Column Default Values Work

When you set a Column Default Value on a folder, **all files uploaded to that folder automatically inherit that value**. This means:

1. Create project folder: `Kiwanis Playground - Caliente Construction`
2. Set folder's default values:
   - ProjectName = "Kiwanis Playground"
   - Contractor = "Caliente Construction"
   - Address = "123 Main St, Phoenix, AZ"
   - Status = "Active"
3. Every file uploaded to that folder (or subfolders) gets those values automatically

**This solves your "redundant metadata" concern** - you only enter it once at the folder level.

### What NOT to Put in Metadata

- **Don't duplicate folder structure** - If you have `05-Inspections/`, you don't need a "DocumentType" column
- **Don't over-tag** - Stick to 6-8 useful columns max
- **Don't require everything** - Make columns optional except the critical ones

---

## Lifecycle Flow

### 1. New Estimate Submitted

```text
Projects/00-Bidding/
└── Kiwanis Playground - Caliente Construction/
     └── 01-Estimates/
         ├── Estimate-2025-12-08-SWPPP-v1.pdf
         └── Plans-2025-12-08-Civil.pdf
```css

**Metadata:** Status = "Bidding", ServiceTypes = "SWPPP"

### 2. Contract Signed (Won)

Move folder from `00-Bidding/` to `01-Active/`:

```text
Projects/01-Active/
└── Kiwanis Playground - Caliente Construction/
     ├── 01-Estimates/
     │   └── [previous files]
     ├── 02-Contracts/
     │   └── Contract-Signed-2025-12-16.pdf
     └── [other folders created as needed]
```css

**Metadata:** Status = "Active", StartDate = "2025-12-16"

### 3. Project Completed

Move folder from `01-Active/` to `02-Completed/`:

```text
Projects/02-Completed/
└── Kiwanis Playground - Caliente Construction/
     └── [all project files]
```css

**Metadata:** Status = "Completed", EndDate = "2025-12-31"

### 4. Lost Bid

Move folder from `00-Bidding/` to `03-Lost/`:

```text
Projects/03-Lost/
└── Some Other Project - Builder XYZ/
     └── 01-Estimates/
         └── [estimate files kept for reference]
```css

**Metadata:** Status = "Lost"

---

## Automation Opportunities

With this structure, you can automate:

| Trigger | Action |
|---------|--------|
| New estimate created in QuickBooks | Create project folder in `00-Bidding/`, upload estimate PDF |
| Contract signed (Monday status change) | Move folder to `01-Active/`, update metadata |
| Dust permit issued (email received) | Upload permit to `03-Permits/`, update DustPermitNumber |
| Inspection completed | Upload report to `05-Inspections/` |
| Invoice created | Upload to `06-Billing/` |
| Project closed (Monday status) | Move folder to `02-Completed/` |

---

## Migration Strategy

### For New Projects (Starting Now)

Use new structure immediately in a new location:

```text
/Shared Documents/Projects/
├── 00-Bidding/
│   └── [Project Name - Contractor]/
├── 01-Active/
│   └── [Project Name - Contractor]/
├── 02-Completed/
│   └── [Project Name - Contractor]/
└── 03-Lost/
    └── [Project Name - Contractor]/
```

### For Existing Projects

Don't migrate everything - it's not worth the effort for 2000+ completed projects.

**Option A: Leave Old Structure Intact**

- Old projects stay in `SWPPP/INSPECTIONS/PROJECTS/` and `SWPPP/SWPPP Book/`
- New projects go in `Projects/`
- Create a cross-reference spreadsheet if needed

**Option B: Migrate Active Only**

- Only migrate currently active projects (~59 from "Waiting for NOI" + active inspections)
- Completed projects stay where they are

### Cross-Reference Index

Create a SharePoint list or Excel file:

| Project Name | Contractor | Status | New Location | Old Location |
|--------------|------------|--------|--------------|--------------|
| Kiwanis Playground | Caliente | Active | Projects/01-Active/... | SWPPP/INSPECTIONS/PROJECTS/... |

---

## Comparison: Old vs New

| Aspect | Old Structure | New Structure |
|--------|---------------|---------------|
| Top-level organization | By document type (SWPPP, AIA JOBS) | By status (Bidding, Active, Completed) |
| Project naming | `Contractor (Project)` | `Project - Contractor` |
| Folder depth | 4-5 levels | 3 levels max |
| Metadata | None | Contractor, Address, Status, Dates, Permit #s |
| Searchability | Navigate folders | Filter by any metadata column |
| Automation-ready | Hard (inconsistent) | Easy (predictable paths) |

---

## Open Questions

1. **Signs** - Where do sign designs/files go? New folder `08-Signs/` or under `04-SWPPP/`?

2. **Correspondence** - Do you want a folder for emails, letters, RFIs? Could add `09-Correspondence/`

3. **Photos** - Under `05-Inspections/Photos/` or separate `08-Photos/` folder?

4. **Contractor list** - Should we create a SharePoint list of canonical contractor names to use as a lookup column?

5. **Archive timing** - When should `02-Completed/` projects move to cold storage (if ever)?

---

## Next Steps

1. [ ] Review this proposal and provide feedback
2. [ ] Finalize folder structure and naming conventions
3. [ ] Set up SharePoint metadata columns
4. [ ] Create project folder template
5. [ ] Build automation for folder creation + file uploads
6. [ ] Document process for team

---

## Sources

- [SharePoint Folder Structure Best Practices](https://www.spguides.com/sharepoint-folder-structure/)
- [Folders vs Metadata in SharePoint](https://enterprise-knowledge.com/folders-v-metadata-sharepoint-document-libraries/)
- [SharePoint Document Library Best Practices 2025](https://techlasi.com/savvy/best-practices-for-sharepoint-document-libraries/)
- [Combining Metadata with Folders](https://andrewwarland.wordpress.com/2021/09/11/combining-metadata-with-folders-in-sharepoint/)
