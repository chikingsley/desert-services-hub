# Tech Stack

Systems we use, what they're for, and how data flows between them.

- --

## SYSTEMS

MONDAY

What it is:

- CRM / Estimating platform

What we use it for:

- Estimates (create, track, win/lose)
- Sales pipeline
- Account/contact management
- Estimate ID is our unique identifier (no separate project numbers)

Data that lives here:

- Estimates (line items, pricing, status)
- Accounts
- Contacts
- Win/loss tracking

Connections:

- Estimate ID links to Notion project record
- Estimate PDF saved to SharePoint

- --

NOTION

What it is:

- Project management / execution layer

What we use it for:

- Project records (single source of truth for PM)
- Tracking project lifecycle (kickoff → delivery → complete)
- Checklists and signoffs
- Team task management

Data that lives here:

- Project records (see project-record-schema.md)
- Linked databases (Accounts, Contracts, Dust Permits, SWPPP Plans)

Connections:

- Links to Monday estimate
- Links to SharePoint folders and documents
- Links to QuickBooks records

- --

QUICKBOOKS ENTERPRISE

What it is:

- Accounting system (database of truth for dollars)

What we use it for:

- GL (General Ledger) - master accounting record
- AP/AR (Accounts Payable / Receivable)
- Job costing (costs against jobs)
- Invoices and payment records
- Audit trail and evidence

Why Enterprise (not Online):

- Deep job costing (Job → Phase → Cost Code)
- Handles retainage natively
- Scales to 1M+ items, 40 users
- Desktop performance for bulk entry

NOT used for:

- Forecasting
- Operations tracking
- Project lifecycle
- Day-to-day PM work

Data that lives here:

- Estimates (for billing)
- Schedule of values
- Contracts (for billing)
- Invoices
- Payment records

Connections:

- Siteline syncs pay apps when finalized
- Project record tracks "in QuickBooks" checkboxes

- --

SITELINE

What it is:

- Billing workflow system (PM-facing tool for getting paid)

Key distinction:

- QuickBooks = Accounting system (records transactions)
- Siteline = Billing workflow (generates pay apps, submits to portals)

What we use it for:

- Pay app generation (G702/G703)
- Progress billing (% complete per line item)
- Submit to GC portals (Textura, Procore, GCPay)
- Change order tracking
- AR aging and collections visibility
- File uploads and backup docs

Current state:

- Barely used (mainly change orders)

Future state:

- PMs track project billing here (day-to-day)
- Syncs to QuickBooks when finalized
- Billing team just verifies sync and handles exceptions

Data that lives here:

- Contracts and SOV
- Pay apps (status: PROPOSED, SYNCED, PAID)
- Progress by line item
- Change orders
- Billing platform submissions

Connections:

- Syncs to QuickBooks (final accounting record)
- Integrates with GC billing platforms
- Has API (GraphQL) for pulling billing data

- --

CRO SOFTWARE

What it is:

- Dispatch / asset tracking for Porta-Johns and Roll-Offs

What we use it for:

- PJ/RO scheduling and dispatch
- Unit tracking (where are assets)
- Service history

Data that lives here:

- PJ/RO inventory
- Dispatch schedules
- Service records

Connections:

- Has API (can pull data for dashboards)
- Project record links to CRO for PJ/RO services

- --

SHAREPOINT

What it is:

- File storage (Microsoft 365)

What we use it for:

- All project documents
- Organized folder structure

Folder structure:
/Projects/[Account Name]/[Project Name]/

- Contracts/
- Estimates/
- Plans/
- Permits/
- Approvals/
- Work Completes/

Data that lives here:

- Contract PDFs
- Estimate PDFs
- Plans (grading, civil, SWPPP)
- Permits (dust permits, NOI)
- Email approvals (PDF prints)

Connections:

- Links from Notion project record
- Links from Monday estimate

- --

OUTLOOK

What it is:

- Email (Microsoft 365)

What we use it for:

- All external communication
- Email is the trigger for most workflows (contract received, dust permit request, etc.)
- Email approvals (billing protection)

Data that lives here:

- Communication history
- Approvals (until PDF'd to SharePoint)

Connections:

- Triggers n8n workflows
- PDF prints to SharePoint

- --

## DATA FLOW

How data moves between systems:

```markdown
INTAKE
Email (Outlook) → n8n workflow → creates records

ESTIMATING
Monday (estimate) → SharePoint (plans) → QuickBooks (estimate for billing)

CONTRACT
Email (DocuSign) → SharePoint (contract PDF) → Notion (project record) → QuickBooks (contract for billing)

BILLING
Notion (project data) → Siteline (pay apps) → QuickBooks (invoicing)

ASSETS
CRO (PJ/RO) → dashboard/reporting
SOV Excel → n8n scan → Notion (installed quantities)

```text

- --

## NOT IN DIGITAL SYSTEMS (yet)

Street Sweeping:

- Currently: paper / Excel
- Future: TBD (simple form or tracking)

Water Trucks:

- Currently: paper / Excel
- Future: TBD (simple form or tracking)

- --

## WHAT WE'RE TRACKING (High Level)

Business data that matters. Where it comes from, what we do with it.

MONEY

Billing / Revenue:

- Contract values (QuickBooks)
- Invoiced amounts (QuickBooks / Siteline)
- Paid vs unpaid (QuickBooks / Siteline)
- Aging (days since invoiced)
- Remaining on contract (contracted - billed)

Source: QuickBooks + Siteline
Used for: Cash flow, collections, project profitability

- --

SALES / ESTIMATING

Win/Loss:

- Estimates sent (Monday)
- Win rate by service line, GC, project size
- Time to decision (estimate sent → win/loss)
- 6-month SLA on resolution (no limbo)

Pipeline:

- Open estimates (Monday)
- Expected value (probability-weighted)
- Follow-up status (where in cadence)

Source: Monday
Used for: Forecasting, strategy (what to double down on)

- --

PROJECTS

Lifecycle:

- Status (kickoff → delivery → complete)
- Days in each stage
- Bottlenecks (where things get stuck)

Scope:

- Contracted quantities (from estimate/contract)
- Installed quantities (from SOV/delivery)
- Remaining work

Source: Notion + SOV Excel
Used for: Operations visibility, delivery planning

- --

ASSETS

Installed:

- What's in the ground (fence LF, BMPs, etc.)
- Where it is (project, location)
- When it was installed

Portable (PJ/RO):

- Where units are deployed
- Service schedule
- Inventory

Source: SOV Excel (installed), CRO (PJ/RO)
Used for: Forecasting, resource planning, inspections

- --

EMPLOYEES / COSTS

Hours:

- Time on site per project
- Certified payroll tracking

Costs (future):

- Labor cost per project
- Equipment/materials per project

Source: Timesheets, QuickBooks
Used for: Job costing, profitability

- --

NOT TRACKED (gaps)

Sales activity:

- Calls, emails, site visits not logged
- Account manager activities not captured
- Relationship data is in people's heads

Street sweeping / water trucks:

- Work done is paper/Excel
- No digital capture yet

- --

## DESIGN PRINCIPLES

HUNTER VS FARMER

Two sales motions, two different tool needs.

Hunter (1 person currently):

- Traditional sales funnel
- Cold outreach to new prospects
- Dust permit data = lead list
- Needs: pipeline stages, activity tracking, follow-up cadence
- This IS a CRM use case
- Lives in Monday (opportunities, accounts, contacts)

Farmers (Account Managers):

- Relationship maintenance
- Visit existing customers weekly
- Handle requests as they come
- Selling happens through proximity and trust over time
- Needs: maps, site visit calendar, contact lookup
- NOT a CRM use case (dispatch + lightweight relationship layer)
- Don't need: activity logging, pipeline stages, email tracking

Key insight: Account managers use maps and site visit calendars, not pipeline stages and activity logging. The relationship motion is relationship-based, not funnel-based.

- --

QUICKBOOKS VS SITELINE

QuickBooks Enterprise = Accounting system

- Records transactions
- Database of truth for dollars
- Used by: Billing team, accounting

Siteline = Billing workflow system

- Generates pay apps
- Submits to portals
- Tracks payment status
- Used by: PMs (future), billing team

They work together:

- Siteline handles the workflow to GET paid
- QuickBooks records the final accounting

- --

## VISUALIZATION

TODO: Create visual diagram of data flow between systems.

Options to explore:

- Supabase (create tables just for visualization)
- Miro / FigJam (manual diagram)
- Lucidchart / draw.io (manual diagram)
- Whimsical (manual diagram)

Goal: See the actual flow with lines showing which data moves where.

- --

Last Updated: December 2025
