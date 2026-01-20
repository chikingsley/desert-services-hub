# Dust Permit Intake Decision Tree

Quick reference for decision points in the intake process.

## Entry Point

```bash
User says: "dust permit for [X]"
                │
                ▼
┌───────────────────────────────┐
│  What is X?                   │
├───────────────────────────────┤
│ • Company name                │
│ • Project name                │
│ • Person name                 │
│ • Email reference             │
│ • Notion task reference       │
└───────────────────────────────┘
                │
                ▼
        START PROCESS
```

## Step 1: Find Context

```text
                ┌─────────────┐
                │ Search      │
                │ Notion      │
                └─────┬───────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
    ┌──────────┐           ┌──────────┐
    │ FOUND    │           │ NOT      │
    │ Project/ │           │ FOUND    │
    │ Task     │           └────┬─────┘
    └────┬─────┘                │
         │                      │
    ┌────┴────┐                 │
    ▼         ▼                 │
┌───────┐ ┌───────┐             │
│ Has   │ │ No    │             │
│Context│ │Context│             │
└───┬───┘ └───┬───┘             │
    │         │                 │
    │         └────────┬────────┘
    │                  │
    ▼                  ▼
┌─────────┐      ┌─────────────┐
│ Use     │      │ Search      │
│ existing│      │ Email       │
│ context │      │ (deep-search│
└─────────┘      └─────────────┘
```

## Step 2: Document Requirements

```text
┌─────────────────────────────────────────────────┐
│              REQUIRED DOCUMENTS                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────┐    OR    ┌─────────────┐      │
│  │    NOI      │          │    NVC      │      │
│  │ (Notice of  │          │ (Notice of  │      │
│  │  Intent)    │          │ Void/Cancel)│      │
│  └──────┬──────┘          └──────┬──────┘      │
│         │                        │              │
│         └───────────┬────────────┘              │
│                     ▼                           │
│         ┌─────────────────────┐                │
│         │ Contains:           │                │
│         │ • Site Contact      │                │
│         │ • Address           │                │
│         │ • Acreage           │                │
│         │ • Project Info      │                │
│         └─────────────────────┘                │
│                                                 │
│                    PLUS                         │
│                                                 │
│  ┌─────────────┐    OR    ┌─────────────┐      │
│  │  Drawings/  │          │   SWPPP     │      │
│  │  Grading    │          │   Plan      │      │
│  │  Plans      │          │             │      │
│  └─────────────┘          └─────────────┘      │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Step 3: Company Lookup

```bash
┌─────────────────────────────────────┐
│  Query SQLite: company-permits.db   │
│  SELECT * FROM companies            │
│  WHERE name LIKE '%[company]%'      │
└───────────────┬─────────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
┌───────────────┐ ┌───────────────┐
│   FOUND       │ │   NOT FOUND   │
│   (Existing)  │ │   (New)       │
└───────┬───────┘ └───────┬───────┘
        │                 │
        ▼                 ▼
┌───────────────┐ ┌───────────────┐
│ Use           │ │ Will need:    │
│ company_id    │ │ • Full address│
│               │ │ • Phone       │
│ Check for     │ │ • Email       │
│ active permits│ │ • Contact name│
└───────────────┘ └───────────────┘
```

## Step 4: Readiness Check

```sql
┌─────────────────────────────────────────────────┐
│              MINIMUM VIABLE PERMIT              │
├─────────────────────────────────────────────────┤
│                                                 │
│  REQUIRED (all must be present):                │
│  ┌─────────────────────────────────────────┐   │
│  │ □ Company Name                          │   │
│  │ □ Project Name                          │   │
│  │ □ Site Address                          │   │
│  │ □ Site Contact Name                     │   │
│  │ □ Site Contact Phone                    │   │
│  │ □ Site Contact Email                    │   │
│  │ □ Acreage (disturbed area)              │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  OPTIONAL (nice to have):                       │
│  ┌─────────────────────────────────────────┐   │
│  │ ○ Parcel Number                         │   │
│  │ ○ Project Timeline                      │   │
│  │ ○ NOI Document (PDF)                    │   │
│  │ ○ SWPPP Plan (PDF)                      │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘

           ALL REQUIRED?
                │
        ┌───────┴───────┐
        ▼               ▼
┌───────────────┐ ┌───────────────┐
│     YES       │ │      NO       │
│               │ │               │
│ → Submit      │ │ → Create draft│
│   permit      │ │ → Flag gaps   │
│               │ │ → Note what's │
│               │ │   missing     │
└───────────────┘ └───────────────┘
```

## Step 5: API Flow Selection

```bash
┌─────────────────────────────────────────────────┐
│           AUTO-PERMIT API FLOWS                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │  NEW COMPANY                            │   │
│  │  POST /api/applications/create          │   │
│  │  { flow: "new-company" }                │   │
│  │                                         │   │
│  │  Required:                              │   │
│  │  • All company details                  │   │
│  │  • All project details                  │   │
│  │  • Site contact info                    │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │  EXISTING COMPANY                       │   │
│  │  POST /api/applications/create          │   │
│  │  { flow: "existing-company" }           │   │
│  │                                         │   │
│  │  Required:                              │   │
│  │  • company_id (from SQLite)             │   │
│  │  • Project details                      │   │
│  │  • Site contact info                    │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │  RENEWAL                                │   │
│  │  POST /api/applications/create          │   │
│  │  { flow: "renew" }                      │   │
│  │                                         │   │
│  │  Required:                              │   │
│  │  • permit_id (existing permit)          │   │
│  │  • Updated contact info (if changed)    │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Common Scenarios

### Scenario A: Request email with NOI attached

```sql
1. Email has NOI PDF
2. Extract NOI → get all required fields
3. Check SQLite → company exists or not
4. Create Notion project/task
5. Submit to auto-permit API
6. Send confirmation
```

### Scenario B: Request email, no attachments

```bash
1. Email says "need dust permit for XYZ project"
2. Deep search for related emails
3. Find NOI/plans in thread or related emails
4. If not found → flag as incomplete
5. Create Notion task with what we have
6. Note: "Missing NOI, need to request"
```

### Scenario C: Verbal request (no email)

```bash
1. No email to reference
2. Search Notion for project name
3. Search email for any related correspondence
4. If found context → proceed
5. If no context → ask user for source
```

### Scenario D: Renewal request

```bash
1. Check SQLite for existing permit
2. Verify permit is active/expiring
3. Use "renew" flow
4. Reference original permit_id
5. Update Notion task
```
