# Deep Search Algorithm - Detailed Walkthrough

This document provides a detailed walkthrough of the CRAWL → COLLECT → READ → COMPILE algorithm with examples.

## Phase 1: CRAWL - Finding Related Emails

### Step 1.1: Entity Extraction from Seed

Given a seed email, extract all searchable entities:

**Example Seed Email:**

```bash
From: Salvador Beltran <sbeltran@sdbeng.com>
To: Chi <chi@desertservices.net>
Subject: Cradle to Crayons Drainage Improvements

Hi Chi,

Can you get me pricing for the below project?
- Site: 2929 N 24th St, Phoenix
- GC: Valley Rain Construction
- Start: Mid-Feb 2026
- Scope: Wattle, 250 LF silt fence, 1 porta john

Thanks,
Salvador
```

**Extracted Entities:**

| Type | Value | Confidence |
|------|-------|------------|
| person | <sbeltran@sdbeng.com> | 0.95 |
| person | <chi@desertservices.net> | 0.95 |
| company | SDB Engineering (from email domain) | 0.85 |
| company | Valley Rain Construction | 0.90 |
| project | Cradle to Crayons | 0.90 |
| project | Drainage Improvements | 0.70 |
| reference | 2929 N 24th St | 0.80 |

### Step 1.2: Initial Search Queries

Generate search queries from high-confidence entities:

```text
Query 1: "Cradle to Crayons"
Query 2: "Valley Rain Construction"
Query 3: "sbeltran@sdbeng.com"
Query 4: "2929 N 24th St"
```

### Step 1.3: Mailbox Selection

Determine which mailboxes to search based on context:

| Context | Mailboxes |
|---------|-----------|
| Estimating request | jared@ (primary estimator) |
| Contract/compliance | chi@, jayson@ |
| All communications | chi@ (coordinator) |
| Project history | Search all team leads |

### Step 1.4: Execute Searches

```bash
Search 1: chi@desertservices.net for "Cradle to Crayons"
  → 2 results

Search 2: chi@desertservices.net for "Valley Rain Construction"
  → 5 results (includes other projects)

Search 3: jared@desertservices.net for "Cradle to Crayons"
  → 0 results (no estimate sent)

Search 4: chi@desertservices.net for "SDB"
  → 8 results (multiple projects)
```

### Step 1.5: Entity Expansion

New entities discovered from search results:

```text
From Valley Rain results:
  - New project: "NW Durango" (same GC, same contact)
  - New person: kendra@valleyrainaz.com

From SDB results:
  - Pattern: SDB frequently requests through Salvador
  - Related projects list grows
```

### Step 1.6: Second-Pass Searches

```text
Search 5: "NW Durango" across chi@, jared@
  → 6 results with attachments

Search 6: "kendra@valleyrainaz.com"
  → 3 results (includes work order)
```

### Step 1.7: Termination Criteria

Stop CRAWL when:

- No new entities discovered in last iteration
- Max iterations reached (default: 5)
- All high-confidence entities have been searched

---

## Phase 2: COLLECT - Downloading Attachments

### Step 2.1: Identify Emails with Attachments

From CRAWL results, filter to emails with `hasAttachments: true`:

```text
Email 1: NW Durango - Estimate Request (Apr 23, 2025)
  → 0 attachments

Email 2: NW Durango - Estimate Sent (Apr 24, 2025)
  → 1 attachment: estimate.pdf

Email 3: NW Durango - Work Order (Apr 29, 2025)
  → 1 attachment: workorder.pdf

Email 4: Valley Rain - Contract Template (Jan 2025)
  → 1 attachment: contract-template.docx
```

### Step 2.2: Download Each Attachment

```typescript
// Get attachments list
const attachments = await mcp__desert-email__get_attachments({
  messageId: "AAMk...",
  userId: "chi@desertservices.net"
});

// Download each
for (const att of attachments) {
  const data = await mcp__desert-email__download_attachment({
    messageId: "AAMk...",
    attachmentId: att.id,
    userId: "chi@desertservices.net"
  });

  // Save locally
  await Bun.write(`downloads/${project}-${doctype}.pdf`, Buffer.from(data));
}
```

### Step 2.3: Organize by Type

Create descriptive filenames:

```text
downloads/
├── nw-durango-estimate-2025-04-24.pdf
├── nw-durango-workorder-2025-04-29.pdf
└── valley-rain-contract-template.docx
```

---

## Phase 3: READ - Extracting Data

### Step 3.1: Parse PDF Content

Use Claude's Read tool to extract text from PDFs:

```typescript
// Read the PDF
const content = await Read({ file_path: "downloads/nw-durango-estimate.pdf" });
```

### Step 3.2: Extract Structured Data

**For Estimates, extract:**

```text
Estimate Number: 04232507
Date: April 24, 2025
Project: NW Durango at Pinnacle Peak
Client: Valley Rain Construction

Line Items:
| Description | Qty | Unit | Price | Total |
|-------------|-----|------|-------|-------|
| Inlet Protection | 20 | EA | $145.00 | $2,900.00 |
| Dust Permit | 1 | LS | $1,560.00 | $1,560.00 |
| Temp Fence Install | 504 | LF | $1.25 | $630.00 |
| Sand Bags | 84 | EA | $7.50 | $630.00 |
| Fence Rental | 4 | MO | $176.40 | $705.60 |
| Trip Charges | 2 | EA | $255.00 | $510.00 |
| Porta John Rental | 2x4 | MO | $220.00 | $880.00 |
| Fuel Surcharge | 10% | | | $88.00 |
| Delivery | 1 | LS | $200.00 | $200.00 |

Subtotal: $8,103.60
Tax: $313.35
TOTAL: $8,416.95
```

**For Work Orders/POs, extract:**

```text
PO Number: 220060-010
Date: April 29, 2025
Project: NW Durango at Pinnacle Peak
Vendor: Desert Environmental Services

Scope Changes from Estimate:
- Porta toilets: 1 (was 2 on estimate)
- Sandbags: 1 per stand (was 2 on estimate)
- Fence: "as needed" (was 504 LF)

Total: $7,204.60 (vs $8,416.95 estimate)
Variance: -$1,212.35 (-14.4%)
```

### Step 3.3: Note Discrepancies

Flag differences between documents:

```text
DISCREPANCY FOUND:
- Estimate #04232507: $8,416.95
- Work Order #220060-010: $7,204.60
- Difference: $1,212.35

Scope Reductions:
- Porta johns reduced from 2 to 1
- Sandbags reduced from 2/stand to 1/stand
- Fence changed from fixed 504 LF to "as needed"
```

---

## Phase 4: COMPILE - Organizing Findings

### Step 4.1: Build Timeline

```markdown
## Timeline

**April 23, 2025** - Estimate Request
- Valley Rain (Kendra) requests quote for NW Durango at Pinnacle Peak
- Scope: SWPPP, dust permit, temp fence, porta johns

**April 24, 2025** - Estimate Sent
- Jared sends estimate #04232507
- Total: $8,416.95
- Includes: 20 inlet protection, 504 LF fence, 2 porta johns

**April 29, 2025** - Work Order Received
- Valley Rain issues PO #220060-010
- Total: $7,204.60 (reduced scope)
- Changes: 1 porta john, reduced sandbags, fence "as needed"

**January 9, 2026** - New Project Request
- Salvador (SDB) requests quote for Cradle to Crayons
- Same GC (Valley Rain), simpler scope
- No SWPPP required, 250 LF fence, 1 porta john
```

### Step 4.2: Document Summary

```markdown
## Documents Found

| Document | Date | Amount | Status |
|----------|------|--------|--------|
| NW Durango Estimate #04232507 | Apr 24, 2025 | $8,416.95 | Superseded by WO |
| NW Durango WO #220060-010 | Apr 29, 2025 | $7,204.60 | Active |
| Cradle to Crayons Estimate | - | - | NOT FOUND |
```

### Step 4.3: People Summary

```markdown
## People Involved

**Desert Services Team:**
- Chi (chi@desertservices.net) - Project Coordinator, primary contact
- Jared (jared@desertservices.net) - Estimator

**Client Side:**
- Kendra (kendra@valleyrainaz.com) - Valley Rain, issues POs
- Salvador Beltran (sbeltran@sdbeng.com) - SDB Engineering, requests quotes

**Relationship:** SDB provides engineering, Valley Rain is GC, Desert Services is subcontractor
```

### Step 4.4: Gap Analysis

```markdown
## Gaps / Unknown

1. **No estimate for Cradle to Crayons** - Searched Jared's mailbox, no results
2. **Contract status unclear** - No signed contract found in email
3. **Dust permit status** - Not mentioned in Cradle to Crayons request
4. **Payment history** - No invoices found in search results
```

### Step 4.5: Answer User Questions

If user asked specific questions, answer them directly:

```markdown
## Answers to Your Questions

**Q: Did we send an estimate for Cradle to Crayons?**
A: NO. Searched Jared's mailbox for "Cradle to Crayons estimate" - zero results.
   This is a new request that needs an estimate.

**Q: Is this related to previous work?**
A: YES, but it's a DIFFERENT PROJECT. Same GC (Valley Rain), same engineering
   contact (Salvador/SDB), but different site. NW Durango was in Scottsdale;
   Cradle to Crayons is in Phoenix.

**Q: What was on the prior estimate?**
A: NW Durango estimate #04232507 was $8,416.95 with detailed line items
   [see above]. Cradle to Crayons has simpler scope (no SWPPP, 250 LF fence
   vs 504 LF, 1 porta john vs 2).
```

---

## Phase 5: LOOP - Iterating if Needed

### When to Loop

Continue searching if:

- Key questions remain unanswered
- Important documents are referenced but not found
- New entities emerged that haven't been searched

### Loop Example

```bash
Gap identified: "Dust permit status unclear"

New search: "dust permit" + "Valley Rain" in chi@
  → Found: Dust permit application from March 2025
  → Download and read permit document
  → Update findings with permit details

Gap resolved: "Dust permit D0058923 issued March 15, 2025, expires March 2026"
```

### Termination

Stop looping when:

- All user questions answered with specifics
- No actionable gaps remain
- Max iterations (typically 3-5) reached
- Diminishing returns (same results repeated)
