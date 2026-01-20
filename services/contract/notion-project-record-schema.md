# Project Record Schema

The project record is the single source of truth. Everything lives here or links from here.

- --

## COLUMNS (List/Table View)

What you see when looking at all projects. Keep it minimal.

- Name
- Address (text)
- Account
- Service Lines (multi-select or rollup from line items)
- Status
- Intake Status
- Reconcile Status
- Contract Value
- Estimate Value
- Variance
- Certified Payroll Required
- Owner
- SharePoint Link
- Monday Estimate Link
- Contract PDF Link
- Notes (for quick visibility into persistent info)

- --

## PAGE LAYOUT

When you open a project, this is what you see. Organized by category.

Status is in the page header (not its own section).

- --

SUMMARY CHECKS

Quick status indicators at the top of the page.

- Contract Received (checkbox)
- Estimate Located (checkbox)
- Reconciled (checkbox)
- Clarification Needed (checkbox)
- Revised Estimate Created (checkbox)
- Documents Complete (checkbox)
- Start Date Confirmed (checkbox)
- Materials Ready (checkbox)

- --

INTAKE

- Intake Status (Received, Missing Estimate, Ready to Reconcile, Reconciled, Needs Clarification, Ready for Handoff)
- Contract Source (Email, DocuSign, Portal)
- Date Received
- Contract Files (file upload)
- Estimate Files (file upload)
- Supporting Docs (SOV, plans, specs)
- Monday Estimate Link
- SharePoint Folder Link
- Intake Notes

- --

CORE INFO

- Project Name
- Project Address
- Cross Streets
- Coordinates (lat/long)
- Account (relation to Accounts database)
- Service Lines (multi-select or rollup)

Dates:

- Estimated Start Date
- Estimated End Date
- Estimated Install Date (when our scope of work begins)

- --

CONTACTS

Just fields, not a separate database.

PM:

- Name
- Email
- Phone

Superintendent:

- Name
- Email
- Phone

Billing Contact:

- Name
- Email
- Phone

Other Contact:

- Name
- Email
- Phone

- --

SITE INFO

Access:

- Site Access Instructions
- Gate Code
- Entry Point Instructions
- Site Hours (start, end, days)
- Parking Instructions

Water:

- Water Source (Hydrant, Meter, Backflow, Tower)
- Water Availability
- What are they doing for dust control / water trucks?

Special Requirements (document what's needed):

- Badging
- Safety Orientation
- PPE
- OSHA Training
- Other Requirements (text)

- --

SAFETY

Separate section for safety-specific items.

- Safety Program Required (checkbox)
- Drug Testing Policy
- OSHA 10/30 Required (checkbox)
- Site-Specific Safety Plan Required (checkbox)
- Silica Exposure Plan (if applicable)

- --

ESTIMATE

One winning estimate. Tracked in Monday, just linked here.

- Contract Estimate (link to Monday item or SharePoint)
- Estimate Value
- Estimate Version
- Estimator
- Estimate PDF Link

QuickBooks:

- Estimate in QuickBooks (checkbox)

Change orders tracked separately (future: Change Orders database).

- --

SCHEDULE OF VALUES

- Schedule of Values Received (checkbox)
- Schedule of Values Link (SharePoint - Excel version)
- SOV in QuickBooks (checkbox)

- --

CONTRACT

Relation to Contracts database. Shows active contract info.

From active contract:

- Contract Status (Draft, Active, Superseded)
- Contract Type (LOI, Subcontract, Work Order)
- Contract Value
- Contract Date
- Retention %
- Contract PDF Link
- Recon Complete (checkbox)
- Recon Notes
- Scope Flags

QuickBooks:

- Contract in QuickBooks (checkbox)

See Contracts database for full history/chain of custody.

- --

RECONCILIATION

- Reconcile Status (Pending, Reconciled, Needs Clarification)
- Reconcile Outcome (Match, Revised Estimate, Clarification Needed)
- Variance (Contract - Estimate)
- Items Removed (summary)
- Items Added (summary)
- Net Change
- Red Flags (multi-select)
- Certified Payroll Required (checkbox)
- Certified Payroll Platform
- Reconcile Notes
- Reconcile Date

- --

COMMUNICATIONS

- Internal Contracts Email Draft
- Client Clarification Email Draft
- Questions Outstanding
- Next Action / Owner

- --

PRE-QUALIFICATION / COMPLIANCE

Insurance:

- Certificate of Insurance (COI) Sent (checkbox)
- Certificate of Insurance (COI) Approved (checkbox)
- CCIP/OCIP (Contractor/Owner Controlled Insurance Program) - if applicable
- W-9 Sent (checkbox)

Other:

- Contractor License Sent (checkbox)
- EMR Letter Sent (checkbox)
- Bonding Required (checkbox)
- Bonding Submitted (checkbox)

- --

BILLING SETUP

Billing Contact (duplicate from Contacts for quick reference):

- Name
- Email
- Phone

Setup:

- PO Number
- Billing Platform (Textura, Procore, GC Pay, Premier, Email)
- Billing Window (e.g., "20th-25th")
- Certified Payroll Required (checkbox)
- Certified Payroll Platform
- Lien Waiver Type (Conditional, Unconditional, Both)

- --

WORK APPROVALS

For billing protection - track email approvals for any work done.

- Email Approvals (text field - list what's approved with SharePoint links)
- Pre-Contract Work Approved (checkbox)
- Pre-Contract Work in QuickBooks (checkbox)

- --

PERMITS AND DOCUMENTS

Grading / Civil:

- Grading Plan Received (checkbox)
- Civil Plan Received (checkbox)
- Construction Documents Received (checkbox)

Dust Permit:

- Responsibility (select: Desert Services / GC / Other)
- Received (checkbox)
- Link (URL)
- Relation to Dust Permits database

SWPPP Plan:

- Responsibility (select: Desert Services / GC / Other)
- Received (checkbox)
- Link (URL)
- Relation to SWPPP Plans database

NOI:

- NOI Received (checkbox)
- NOI Link (URL)

Site Plans:

- Site Plans Received (checkbox)
- Site Plans Link (URL)

Other Documents:

- Contract PDF Link
- Estimate PDF Link
- SharePoint Folder Link

- --

PRE-MOBILIZATION (SWPPP-specific)

Only show if Service Lines includes SWPPP.

These are conditional - only ask if NOT on our scope:

- Grading Done (checkbox)
- Temp Fence Installed (checkbox)
- Inlets Installed (checkbox)
- Rock Entrance Prepped (checkbox)

- --

HANDOFF

- Handoff Date
- Delivery Acknowledged (checkbox)

- --

SIGNOFFS

Just two.

- Operations Signoff (checkbox)
- Operations Signoff Date
- PM Signoff (checkbox)
- PM Signoff Date

- --

SERVICE-SPECIFIC REQUIREMENTS

Drop-down sections for line-specific info. Usually passed to the person doing the work, not filled by PM.

Water Trucks:

- Water Source details
- Hours estimate

Roll-Offs:

- Size (10, 20, 30, 40 yard)
- Type (Exchange, Delivery, Termination)
- Expected duration

Porta-Johns:

- Unit count
- Service frequency
- Specific service days
- Hand sanitizer requirements

Street Sweeping:

- TBD

- --

NOTES

Persistent info (use comments for back-and-forth updates).

- Notes (free text field)

- --

## LINKED DATABASES

ACCOUNTS

- Shared across all projects
- Company name, domain, contacts, total business
- Relation from Project

CONTRACTS

- Chain of custody (LOI -> Subcontract -> Amendments)
- Each row: Type, Value, Date, Status (Draft/Active/Superseded), PDF, Recon notes
- Project shows "active" contract info
- Relation from Project (one-to-many)

DUST PERMITS

- Own lifecycle with renewals/expirations
- Relation from Project

SWPPP PLANS

- Own lifecycle (engineering deliverable)
- Tracks responsibility (us vs GC vs engineering firm)
- Relation from Project

ESTIMATES

- Tracked in Monday
- Just link the winning estimate from Project
- No separate Notion database needed

CHANGE ORDERS (future)

- Additional scope after contract signed
- Relation from Project

LINE ITEMS / SOV (maybe, future)

- Only if we want to track installation status per item
- Would roll up service lines to Project

- --

## WHAT THIS REPLACES

- contracts-database-schema.md -> Consolidated into this schema and Contracts database
- contract-onboarding-checklist.md -> Contract Intake Checklist (see services/contract/contract-intake-checklist.md)
- data-needed.md -> Consolidated into sla.md
- contract-reconciliation-template.md -> Process doc (stays separate)
