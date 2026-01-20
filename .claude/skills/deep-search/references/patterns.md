# Deep Search Patterns

Common patterns for different types of research tasks.

## Pattern: Project History Research

**Trigger:** "What do we know about [project]?" or "Find everything on [project]"

**Search Strategy:**
1. Search project name across all team mailboxes
2. Search client/GC name
3. Search site address
4. Look for: estimates, POs, contracts, permits, change orders

**Key Documents:**
- Estimate (original pricing)
- Work Order / PO (approved scope)
- Contract (terms, insurance requirements)
- Permits (dust, SWPPP, others)
- Change orders (scope modifications)
- Invoices (billing history)

**Output Focus:**
- Timeline of project communications
- Document comparison (estimate vs PO)
- Scope summary
- Open items / next steps

---

## Pattern: Estimate Research

**Trigger:** "Did we send an estimate?" or "What was on the estimate?"

**Search Strategy:**
1. Search estimator mailbox (jared@) for project name
2. Search "estimate" + project name
3. Search "quote" + project name
4. Check sent folder specifically

**Key Data to Extract:**
- Estimate number
- Date sent
- Line items with quantities and prices
- Total amount
- Terms and conditions
- Expiration date

**Common Issues:**
- Estimate sent but not titled with project name
- Multiple versions (check dates)
- Estimate vs work order discrepancy

---

## Pattern: Contract/Compliance Research

**Trigger:** "Do we have a contract?" or "What are the compliance requirements?"

**Search Strategy:**
1. Search "contract" + client name
2. Search "agreement" + client name
3. Search "insurance" + project name
4. Check coordinator mailboxes (chi@, jayson@)

**Key Documents:**
- Master Service Agreement (MSA)
- Subcontract Agreement
- Certificate of Insurance (COI)
- W-9
- Compliance checklists

**Key Data to Extract:**
- Contract parties
- Effective date and term
- Payment terms
- Insurance requirements
- Indemnification clauses
- Change order process

---

## Pattern: Permit Research

**Trigger:** "What permits do we have?" or "Is there a dust permit?"

**Search Strategy:**
1. Search "permit" + project name
2. Search "dust" + project name
3. Search "SWPPP" + project name
4. Search application/permit numbers if known

**Key Documents:**
- Permit applications
- Issued permits
- Inspection reports
- NOI (Notice of Intent)
- NOT (Notice of Termination)

**Key Data to Extract:**
- Permit number
- Issue date
- Expiration date
- Conditions/requirements
- Inspection schedule
- Responsible parties

---

## Pattern: Payment/Invoice Research

**Trigger:** "Have we been paid?" or "What's the billing status?"

**Search Strategy:**
1. Search "invoice" + project name
2. Search "payment" + project name
3. Search "AR" or "accounts receivable" + client
4. Check finance/accounting mailboxes

**Key Documents:**
- Invoices sent
- Payment confirmations
- Lien releases
- Aging reports

**Key Data to Extract:**
- Invoice numbers and dates
- Amounts billed
- Amounts paid
- Outstanding balance
- Payment terms/due dates

---

## Pattern: Person/Company Research

**Trigger:** "Who is [person]?" or "What's our history with [company]?"

**Search Strategy:**
1. Search email address directly
2. Search company name
3. Search person's name in quotes
4. Look at all projects involving them

**Output Focus:**
- Role/title
- Projects worked together
- Communication patterns
- Key contacts at company
- Any issues or notes

---

## Entity Extraction Patterns

### People

```bash
Patterns:
- Email addresses: [\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}
- Names after "From:", "To:", "Cc:"
- Names after signatures
- Names mentioned in body with titles
```

### Companies

```text
Patterns:
- Email domain (infer company from @company.com)
- Text followed by Inc, LLC, Corp, Company, Co
- Explicit mentions: "GC:", "Client:", "Contractor:"
```

### Projects

```text
Patterns:
- Text after "Project:", "Job:", "Site:"
- Capitalized multi-word phrases
- Addresses (street + city)
- Project numbers/codes
```

### References

```text
Patterns:
- Numbers after "Estimate #", "Quote #"
- Numbers after "PO#", "Work Order #"
- Numbers after "Permit #", "Application #"
- Numbers after "Invoice #"
```

---

## Mailbox Selection Guide

| Research Type | Primary Mailbox | Secondary Mailboxes |
|---------------|-----------------|---------------------|
| Estimates | jared@ | chi@ |
| Contracts | chi@, jayson@ | - |
| Field operations | jayson@ | chi@ |
| Permits | chi@ | jayson@ |
| Client communication | chi@ | all team |
| Vendor communication | chi@ | jayson@ |
| General project | chi@ | jared@, jayson@ |

---

## Search Query Optimization

### Good Queries

```text
"Valley Rain Construction"     # Exact company name
"NW Durango"                   # Project name
sbeltran@sdbeng.com           # Exact email
"estimate" "Valley Rain"      # Multiple terms
```

### Avoid

```text
"estimate"                    # Too broad
construction                  # Too common
"Phoenix project"             # Too vague
```

### Query Variations

When initial search yields few results, try variations:

```text
Original: "Cradle to Crayons"
Variations:
- "Cradle Crayons"
- "C2C" (acronym)
- "2929 N 24th" (address)
- "Phoenix drainage"
```

---

## Attachment Handling by Type

### PDFs

- Read directly with Claude's Read tool
- Extract tables, line items, totals
- Note form fields and signatures

### Excel/Spreadsheets

- Look for pricing tables
- Check multiple sheets
- Extract formulas if relevant

### Word Documents

- Contract templates
- Change order forms
- Look for track changes

### Images

- Site photos
- Permit stamps
- Signed documents (as scans)

---

## Common Edge Cases

### Multiple Projects, Same Name

Different sites with similar names:
- Include address in searches
- Check dates carefully
- Verify GC/client matches

### Email Thread Fragmentation

Conversation split across multiple threads:
- Search by original sender
- Search by date range
- Use thread tools when available

### Forwarded Attachments

Original attachment lost in forward chain:
- Search for original email
- Check parent thread
- Search by attachment filename

### Partial Information

Only some details known:
- Start with what you have
- Let entity expansion fill gaps
- Document what remains unknown
