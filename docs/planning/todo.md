# Future Work

Prioritized list of implementation tasks.

- --

## HIGH PRIORITY

### Notion Setup

- [ ] Create Projects database per services/contract/notion-project-record-schema.md
- [ ] Create Accounts database (shared across all projects)
- [ ] Create Contracts database (chain of custody: LOI → Subcontract → Amendments)
- [ ] Create Dust Permits database (lifecycle with renewals/expirations)
- [ ] Create SWPPP Plans database (engineering deliverable tracking)
- [ ] Set up relations between databases
- [ ] Test with 2-3 real projects

### Inspection Workflow (from James Neal interview)

- [ ] Inspector notification system - "Nobody tells us when we're getting a new project"
- [ ] Inspector assignment by territory/workload (not random/ad-hoc)
- [ ] Deficiency alerting to Operations for proactive follow-up
- [ ] Rain event detection and triggered inspections
- [ ] Evaluate Compliance Go integration for digital inspections

### Core Automations (n8n)

- [ ] Find Estimate + Create Project workflow
- [ ] Contract Reconciliation workflow (PDF → extract → compare)
- [ ] SharePoint filing automation
- [ ] Email-to-project routing

- --

## MEDIUM PRIORITY

### Integrations

- [ ] Monday ↔ Notion sync for estimates
- [ ] QuickBooks integration for contract/estimate values
- [ ] SharePoint folder creation automation
- [ ] Siteline API exploration (GraphQL) for billing workflow

### Additional User Stories

- [ ] Change Orders database and workflow
- [ ] Line Items / SOV tracking (if needed for installation status per item)

### Document Other Interview Insights

Review remaining interview summaries for additional workflows:

- [ ] Daniel Vargas - Site cleaning operations
- [ ] Dawn Wagner - Billing workflows
- [ ] Kendra Ash - Contract budget tracking, pre-qual
- [ ] Jayson Roti - Delivery/operations
- [ ] Kerin Reissig - Sign ordering, admin
- [ ] Rick Haitaian - Field operations
- [ ] Sales Team - Hunter/Farmer distinction, site visits

### Process Documentation

- [ ] Scanning and filing SOP (from James Neal workflow)
- [ ] New project setup SOP
- [ ] Project closeout SOP
- [ ] Daily schedule review SOP

- --

## LOWER PRIORITY

### Future State Items

- [ ] Customer portal for service requests
- [ ] Real-time scheduling updates to customers
- [ ] Dashboard views per role (PM, Billing, Delivery, Estimating)
- [ ] Automatic escalation for overdue items
- [ ] Capacity planning for seasonal demand

### Technical Improvements

- [ ] Migrate mail merge printing to digital format
- [ ] Mobile inspection app (or Compliance Go)
- [ ] Dual monitor workflow optimization for home offices

- --

## COMPLETED

- [x] Document Project Record Schema (services/contract/notion-project-record-schema.md)
- [x] Document User Stories (user-stories.md)
- [x] Consolidate SLAs (sla.md)
- [x] Document Tech Stack (tech-stack.md)
- [x] Create Inspection user stories from James Neal interview
- [x] Document Sign Ordering process (signage/sign-ordering-reference.md)
- [x] Clean up signage folder

- --

## NOTES

### Key Insights from James Neal Interview

1. **Notification gap** - Inspectors don't get told about new projects, must self-monitor
2. **Paper workflow** - Print → handwrite → scan → file → email is time-consuming
3. **Ethical boundaries** - Inspectors can't sell corrective services, GC must request via email
4. **Upsell opportunity** - Final inspections are ideal touchpoint for site cleaning/sweeping
5. **Rain events** - Significant impact on scheduling, triggers additional inspections
6. **Dual monitor critical** - Single laptop makes workflow much slower

### Design Principles (from tech-stack.md)

- Hunter vs Farmer: One person does traditional sales funnel, others do relationship maintenance
- QuickBooks = truth for dollars, NOT for forecasting
- Siteline = billing workflow system, PM-facing tool for getting paid
- Email approval required for everything (billing protection)

- --

Last Updated: December 2025
