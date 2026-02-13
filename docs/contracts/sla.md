# SLA

Data standards and lifecycle requirements.

- --

## DATA STANDARDS

CONTACT

- Name - Title Case, not "New contact" or "TBD"
- Email
- Phone
- Title
- Company - Linked to Contractor

- --

CONTRACTOR

- Name - Title Case, normalized
- Domain

- --

ESTIMATE

- Item Name - Format: `{PREFIX}: {Project Name}`
- Estimator - Owner field
- Contact - Linked, complete
- Contractor - Linked, complete
- Due Date
- Location
- Bid Source
- Bid Status - New / Yet to Bid / Bid Sent / Pending Won / Won / Lost / GC Not Awarded
- Plans - At least 1 PDF
- Service Lines
- Estimate ID - Format: YYMMDD## (auto from Estimate File name)
- Estimate File
- Bid Value
- Submitted Date - Auto when moved to Bid Sent

- --

PREFIXES

```text
TF = Temp Fence
PJ = Portable Toilets
SW = SWPPP
DC = Dust Control
SS = Street Sweeping
WT = Water Truck
RO = Roll-Off Dumpsters

```text

- --

REVISIONS

Format: YYMMDD##R# (no dashes before R)

Example: 25122301R0 (original) → 25122301R1 (first revision)

All estimates start at R0. When re-bidding:

1. Duplicate the estimate
2. Update revision: `TF: Project Name` stays same, file gets R1
3. Update Estimate ID from R0 to R1
4. Update file and bid value

- --

SYNC STATUS

Add to Estimating board:

- Ready - Will sync
- Missing Info - Needs attention
- Synced

Items in Missing Info go to Needs Attention view. SLA: no item > 7 days.

- --

## LIFECYCLE STAGES

### 1. ESTIMATING

Required:

- Account name
- Project name
- Project address (cross-streets + coordinates)
- Site contact (PM/Super) - name, phone, email
- Estimated start date
- Plans (upload to SharePoint)
- Dust permit requirements
- Special site requirements (OSHA, PPE, access hours, badging)

Output:

- Estimate in QuickBooks
- Plans in SharePoint
- Item in Monday (Estimating board)

- --

### 2. CONTRACT AWARD

Trigger: Contract received (DocuSign, email, portal)

Required:

- Contract matches estimate (dollar amounts, line items verified)
- NOI with ADEQ number (if SWPPP)
- Dust permit status (us or them)
- Site contact confirmed
- Start date and timeline
- Email approval to proceed

Output:

- Reconciled contract
- Project record created
- Contract in QuickBooks

- --

### 3. KICKOFF

Trigger: Contract reconciled

Required:

- All contacts collected (PM, Super, Billing)
- Site access confirmed (badges, gate codes, hours)
- Pre-qualification complete (COI, W-9, etc.)
- Billing setup complete (PO, platform, window)
- Schedule of values in QuickBooks
- All documents in SharePoint

Output:

- Pre-qualified project
- Ready for handoff

- --

### 4. HANDOFF TO DELIVERY

Trigger: Kickoff complete, all signoffs done

Required:

- Operations signoff
- PM signoff
- Start date confirmed in writing
- Delivery acknowledged

SWPPP-specific (if not our scope):

- Grading done
- Temp fence installed
- Inlets installed
- Rock entrance prepped

Output:

- Project in production

- --

### 5. SERVICE DELIVERY

Common to all services:

- Email approval (required for billing protection)
- PO number
- Start date
- Expected duration
- Placement location

SWPPP:

- NOI and dust permit status
- Temp fence status
- Inlets status
- Rock entrance status
- SWPPP plans in SharePoint

Water Trucks:

- Water source confirmed
- Equipment access verified
- Hours estimate

Roll-Offs:

- Size (10, 20, 30, 40 yard)
- Type (Exchange, Delivery, Termination)
- Expected duration

Porta-Johns:

- Unit count
- Service frequency
- Service days
- Hand sanitizer requirements

- --

### 6. WORK COMPLETE

Required:

- Quantities installed/delivered (measurements)
- Time on site (start/end)
- Date(s) of service
- Photos (for deficiencies)
- Certified payroll marked (if applicable)

Output:

- Ready for billing

- --

### 7. CHANGE ORDERS

Trigger: Scope changes discovered

Required:

- Description of additional work
- Quantities
- Pricing/cost impact
- Email approval from customer
- Signed change order

Rule: Identify BEFORE work performed, not during billing

- --

### 8. BILLING / COLLECTIONS

Required:

- Email approval for all work
- PO number
- Work complete documentation
- Lien waivers signed
- Insurance certificates current

Contract billing:

- Schedule of values
- Retention percentage
- Billing platform access
- Billing window dates
- Submission tracked

- --

## DATA CHAIN

How data flows between Monday boards:

```text
Estimate (Estimating Board)
    ↓ link to Projects
Project (Projects Board)
    ├── Account (from Contractor)
    ├── Contact
    ├── Location
    ├── Service Lines
    ├── Start/End Dates
    ├── Bid Value
    └── Estimate File
    ↓
Inspection Reports
    ├── Project link
    ├── Account (mirror)
    ├── Location (mirror)
    └── Contact (direct relation for superintendent)

Dust Permits
    ├── Project link
    ├── Account (mirror)
    ├── Contact (direct relation)
    ├── Location (mirror)
    └── Plans (mirror)

SWPPP Plans
    ├── Project link
    └── Plans (mirror)

```text

- --

## KEY PRINCIPLES

1. Email approval required for everything (billing protection)
2. Contract must match estimate BEFORE operations receives it
3. Complete information packet on handoff (no hunting)
4. Photos mandatory for deficiencies
5. Site contact collected at bid stage
6. PO numbers always requested

- --

Last Updated: December 2025
