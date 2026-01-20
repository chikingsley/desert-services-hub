# User Stories

- --

## Dust Permits

STORY: DUST PERMIT - NEW

Trigger:

- Email "we need a dust permit for [project]"
- Or: User attaches NOI + Plans to item and changes status

Steps:

1. Find estimate + create project (use Find Estimate story)
2. Verify grading/civil plan is attached
3. If no plan: request from customer
4. Determine county (Maricopa or Pima)
5. Fill out permit application
6. Map step (human adds map, target <5 min)
7. Submit payment
8. Update credit card tracker with receipt
9. Receive permit number
10. Save permit to SharePoint
11. Order dust sign (trigger Sign Ordering story)
12. Email permit to customer
13. Notify billing and delivery team

Acceptance Criteria:

- Given dust permit request, project record is created
- Given missing plan, customer is notified
- Given map completed, permit is finalized within 5 minutes
- Given permit issued, dust sign is ordered
- Given permit issued, billing and delivery are notified

- --

STORY: DUST PERMIT - RENEWAL

Trigger:

- Email "renew dust permit for [project]"
- Or: Permit approaching expiration

Steps:

1. Find existing permit and project
2. Verify permit number and current info
3. Submit renewal application
4. Map step if needed (can reference old permit, has APN)
5. Submit payment
6. Update credit card tracker
7. Receive renewed permit
8. Save to SharePoint
9. Update dust sign if info changed
10. Email renewed permit to customer

Acceptance Criteria:

- Given renewal request, existing permit is found
- Given renewal submitted, new permit is received
- Given permit renewed, SharePoint is updated
- Given info changed, sign is updated

- --

STORY: DUST PERMIT - REVISION

Trigger:

- Email requesting changes to existing permit
- Scope change (acreage, contact, etc.)

Steps:

1. Find existing permit and project
2. Identify what needs revised (acreage, contact, responsible party)
3. If adding acreage: map step needed
4. Submit revision to county
5. Receive updated permit
6. Save to SharePoint
7. Update sign if contact/responsible party changed
8. Notify customer of revision complete

Acceptance Criteria:

- Given revision request, existing permit is found
- Given acreage change, map step is triggered
- Given revision complete, permit is updated in SharePoint
- Given contact change, sign update is ordered

- --

STORY: DUST PERMIT - CLOSEOUT

Trigger:

- Email "close out dust permit for [project]"
- Project complete, permit no longer needed

Steps:

1. Find existing permit and project
2. Submit closeout to county
3. Receive confirmation
4. Update permit status in project record
5. Notify customer of closeout

Acceptance Criteria:

- Given closeout request, permit is found
- Given closeout submitted, confirmation is received
- Given closeout complete, project record is updated

- --

## Estimating

STORY: ESTIMATE INTAKE

Trigger:

- RFP received via email
- RFP received via bid board (Plan Hub, Building Connected, etc.)

Steps:

1. Extract project info from RFP (name, address, contact, due date)
2. Look up account by company/domain
3. If no account: create new account, add domain, add contact
4. Download plan files
5. Classify/sort files (identify grading plans, civil, specs)
6. Create estimate item in Monday with:

    - Item name: {PREFIX}: {Project Name}
    - Estimator assigned
    - Contact linked
    - Contractor linked
    - Due date
    - Location
    - Bid source
    - Plans attached
    - Service lines
7. Save plans to SharePoint

Acceptance Criteria:

- Given RFP received, estimate is created in Monday
- Given new account, account is created per sla.md
- Given plans received, files are classified and attached
- Given estimate created, all required fields are populated

- --

STORY: ESTIMATE TAKEOFF + QUOTE

Trigger:

- Open estimate assigned to estimator
- Plans attached and ready

Steps:

1. Open plan in takeoff tool (Bluebeam or web-based)
2. Perform measurements
3. Create quote in QuickBooks with:

    - Line items from measurements
    - Customer info
    - Service lines
4. Generate estimate PDF
5. Save estimate PDF to SharePoint
6. Update Monday with estimate ID and bid value

Acceptance Criteria:

- Given plans available, takeoff is completed
- Given takeoff complete, quote is created in QuickBooks
- Given quote created, estimate PDF is generated
- Given estimate complete, Monday is updated with bid value

- --

STORY: ESTIMATE SEND

Trigger:

- Estimate complete and ready to send
- Customer contact info available

Steps:

1. Download estimate PDF from QuickBooks
2. Send via appropriate channel:

    - Email to customer contact
    - Or: Upload to bid board portal
3. Update Monday status to "Bid Sent"
4. Set submitted date
5. Trigger follow-up cadence (see Estimate Follow-Up story)

Acceptance Criteria:

- Given estimate ready, PDF is sent to customer
- Given bid board project, estimate is uploaded to portal
- Given estimate sent, Monday status is "Bid Sent"
- Given estimate sent, follow-up cadence starts

- --

STORY: ESTIMATE FOLLOW-UP

Trigger:

- Estimate sent (status = Bid Sent)
- Automated cadence based on submitted date

Cadence:

- Day 1: "Did you receive? Any questions?"
- Day 5: Follow up if no response
- Day 30: Check in
- Day 60: Check in
- Day 90: Check in
- 6 months: Final push (call + email from estimator)

Steps:

1. Track days since estimate sent
2. Send automated follow-up at each interval
3. Log responses in project record
4. If customer responds: update status, pause cadence
5. At 6 months: escalate to estimator for final push
6. If no response after final push: mark as Lost

SLA: 6 month resolution on every estimate (win or loss, no limbo)

Acceptance Criteria:

- Given estimate sent, follow-up emails are sent at each interval
- Given customer response, cadence is paused
- Given 6 months passed, estimate is closed (win or loss)
- Given no response after final push, status is set to Lost

- --

## Project Management

See project-management.md for detailed flow and stages.

- --

STORY: FIND ESTIMATE + CREATE PROJECT

Foundation story. All entry points use this.

Trigger:

- Email received (DocuSign, dust permit request, plan request, install request)

Steps:

1. Search Monday by project name
2. If no match, search by account name
3. If no match, search by address
4. Fuzzy match if needed
5. Create project record in Notion
6. Link to estimate
7. PDF print of email → SharePoint (folder: /Projects/[Account]/[Project Name]/)
8. Create in QuickBooks

Acceptance Criteria:

- Given an email with project name, when searched, estimate is found within 3 attempts
- Given estimate found, project record is created with all core fields populated
- Given project created, email PDF is saved to correct SharePoint folder
- Given project created, estimate is linked in QuickBooks

- --

STORY: CONTRACT RECONCILIATION

Trigger:

- DocuSign or contract PDF received

Steps:

1. Download contract PDF
2. Find matching estimate (use Find Estimate story)
3. Extract: total value, line items, retention %, scope language
4. Compare to estimate
5. If match: mark reconciled
6. If discrepancy: flag with summary of differences
7. Human reviews flagged items
8. Update QuickBooks with final values
9. If reconciled: trigger Contract Kickoff story

Acceptance Criteria:

- Given contract PDF, agent extracts total value correctly
- Given contract and estimate, variance is calculated
- Given matching totals, auto-marked as reconciled
- Given discrepancy, PM is notified with diff summary
- Given reconciled contract, QuickBooks is updated
- Given reconciled contract, kickoff is triggered

- --

STORY: CONTRACT KICKOFF

Trigger:

- Contract reconciliation complete

Steps:

1. Review contract for additional info (site contacts, billing platform, site access, etc.)
2. Extract what we can from contract
3. Identify missing information
4. Contact customer to get missing info or clarification
5. Update project record with all collected info
6. Mark kickoff complete

Acceptance Criteria:

- Given reconciled contract, agent extracts contacts, billing info, site info
- Given missing information, PM is notified with list of what's needed
- Given customer contacted, responses are logged
- Given all info collected, project record is updated
- Given kickoff complete, project is ready for billing setup

- --

STORY: SWPPP PLAN REQUEST

Trigger:

- Email "we need a SWPPP plan for [project]"

Steps:

1. Find estimate + create project (use Find Estimate story)
2. Verify we have civil/grading drawings
3. If no drawings: request from customer
4. Send to engineering firm with drawings
5. Track engineering progress
6. Receive completed plan
7. Save plan to SharePoint
8. Update project record
9. If NOI received: order SWPPP sign (trigger Sign Ordering story)
10. Notify customer plan is ready

Acceptance Criteria:

- Given SWPPP plan request, project record is created
- Given missing drawings, customer is notified
- Given drawings present, engineering firm is notified with files
- Given plan received, plan is saved to SharePoint
- Given plan saved, project record is updated with link
- Given NOI received, SWPPP sign is ordered
- Given plan complete, customer is notified

- --

STORY: SIGN ORDERING

Trigger:

- Dust permit issued → dust sign needed
- NOI received → SWPPP sign needed
- Contract specifies fire access → fire access sign needed
- Superintendent or responsible party changes → update signs

Dependencies:

- Dust sign: need dust permit number, contact name/phone
- SWPPP sign: need NOI/AZC number
- Fire access sign: need site address, contact name/phone

Steps:

1. Collect required info per sign type
2. Email order to Sandstorm Signs (use template in signage/sign-ordering-reference.md)
3. Log order in Sign Log
4. Coordinate delivery with install date
5. Install sign on site
6. Bill customer for signs

Acceptance Criteria:

- Given dust permit issued, dust sign is ordered within 1 day
- Given NOI received, SWPPP sign is ordered
- Given sign ordered, order is logged
- Given sign installed, customer is billed
- Given superintendent change, existing signs are updated

- --

STORY: SHAREPOINT FILING

Trigger:

- Any document received for a project

Folder Structure:
/Projects/[Account Name]/[Project Name]/

- Contracts/
- Estimates/
- Plans/
- Permits/
- Approvals/
- Work Completes/

Naming Convention:

- [Date]-[DocType]-[Description].pdf
- Example: 2025-01-15-Contract-Subcontract.pdf
- Example: 2025-01-15-Permit-DustPermit-D0062940.pdf

Acceptance Criteria:

- Given new project, folder structure is created automatically
- Given document received, it is filed in correct subfolder
- Given document filed, link is added to project record

STORY: BMP INSTALLATION REQUEST

Trigger:

- Email "ready to install" or "mobilize for [project]"

Steps:

1. Find estimate + create project (use Find Estimate story)
2. PDF print of request email → SharePoint
3. Verify project has required data:

    - Contract reconciled (or email approval for pre-contract work)
    - Billing setup complete (PO, platform)
    - Site access confirmed (badges, gate codes, hours)
    - Start date confirmed in writing
4. If missing data: contact customer, update project record
5. Run pre-mobilization checklist:

    - SWPPP-specific (if not our scope): grading done, temp fence, inlets, rock entrance
6. Get signoffs (Operations + PM)
7. Handoff to delivery
8. Delivery acknowledges
9. Project moves to "In Production"

Acceptance Criteria:

- Given install request, project record exists or is created
- Given request email, PDF is saved to SharePoint
- Given missing pre-conditions, PM is notified with list
- Given all pre-conditions met, handoff is triggered
- Given handoff complete, delivery is notified
- Given delivery acknowledged, project status is "In Production"

- --

STORY: ASSET TRACKING (Delivery)

Trigger:

- Project moves to "In Production"
- SOV Excel updated with installed quantities

Steps:

1. Scan SOV Excel on schedule (hourly or daily)
2. Extract installed quantities (fence LF, BMPs, etc.)
3. Compare to previous scan
4. If new work detected:

    - Update project record with installed quantities
    - Update asset database (what's installed, where)
    - Trigger inspection if threshold met
5. Track cumulative installed vs contracted quantities

Acceptance Criteria:

- Given SOV Excel updated, scan detects new quantities within 1 hour
- Given new fence installed, asset record is created with location
- Given installation complete, inspection is triggered
- Given quantities tracked, project record shows installed vs contracted

- --

STORY: WORK COMPLETE

Trigger:

- Field marks work as done
- Final quantities entered

Steps:

1. Capture final quantities (measurements)
2. Capture time on site (start/end)
3. Capture date(s) of service
4. Capture photos (required for deficiencies)
5. Mark certified payroll (if applicable)
6. Update project record
7. Notify billing: ready to invoice

Acceptance Criteria:

- Given work complete, all quantities are captured
- Given deficiencies, photos are attached
- Given certified payroll project, payroll is marked
- Given work complete, billing is notified
- Given work complete, project is ready for invoicing

- --

STORY: BILLING

Trigger:

- Work complete notification
- Billing window opens (monthly)

Steps:

1. Pull work complete data from project record
2. Verify email approvals exist for all work
3. Generate invoice or pay app
4. Submit via billing platform (Textura, Procore, GC Pay, etc.)
5. Track submission status
6. When paid: update project record
7. Track aging (days since submitted)

Acceptance Criteria:

- Given work complete, invoice can be generated
- Given missing email approval, billing is blocked with notification
- Given invoice submitted, status is tracked
- Given payment received, project record is updated
- Given overdue invoice, aging alert is triggered

- --

## Inspections

STORY: INSPECTION - START

Trigger:

- BMP installation complete (project moves to "In Production")
- NOI received and active
- New project appears on SWPPP schedule without inspector assigned

Steps:

1. Detect new project needs inspections (NOI active, BMPs installed)
2. Assign inspector based on territory/workload
3. Notify inspector of new assignment
4. Inspector adds project to master schedule
5. Set inspection cycle (14-day standard, 7-day high-risk, monthly low-risk)
6. Generate first inspection date

Acceptance Criteria:

Workflow:

- Given BMP installation complete, inspector is notified within 1 day
- Given NOI active, project is flagged for inspection start
- Given inspector assigned, inspector acknowledges assignment
- Given first inspection scheduled, it appears on daily schedule

Visibility:

- [TBD] How do we see which projects need inspectors assigned?
- [TBD] How do we see inspector workload across territories?

Escalation:

- [TBD] What happens if inspector not assigned after X days?
- [TBD] What happens if inspector doesn't acknowledge?

Verification:

- [TBD] How do we confirm inspector received and accepted assignment?

- --

STORY: INSPECTION - CONDUCT

Trigger:

- Inspection due per schedule (Next Inspection date)
- Rain event (2+ inches triggers additional inspection)

Steps:

1. Review daily schedule email evening before
2. Conduct site visit (use Compliance Go app or paper form)
3. Document site conditions with photos
4. If deficiency found: measure, photograph, get super approval on-site
5. Complete inspection report
6. Upload to SharePoint: /Projects/[Company]/[Project]/
7. Email report to GC (superintendent/PM)
8. Update master schedule (Last Inspection date)

Acceptance Criteria:

Workflow:

- Given inspection due, it appears on daily schedule email
- Given inspection complete, report is uploaded same day
- Given report filed, email is sent to GC
- Given deficiency found, measurement is captured (e.g., "600 LF sock on north side")
- Given deficiency found, photos are attached to report
- Given deficiency measured and photographed, super approval is obtained before leaving site
- Given super approval obtained, email is sent to Operations with quantity, photos, and approval
- Given deficiency documented, 7-day corrective action deadline is set
- Given rain event (2+ inches), additional inspection is triggered

Visibility:

- [TBD] How do we see all inspections due today/this week?
- [TBD] How do we see deficiencies across all projects?

Escalation:

- [TBD] What happens if inspection not completed by end of day?
- [TBD] What happens if deficiency not resolved within 7 days?

Verification:

- [TBD] How do we confirm inspection was actually conducted?
- [TBD] How do we confirm GC received report?

- --

STORY: INSPECTION - FINAL

Trigger:

- GC requests final inspection
- Project reaching completion

Steps:

1. Check remaining contract budget with Kendra
2. Conduct final site inspection
3. Document final conditions with photos
4. If remaining deficiencies: document with measurements and photos
5. Email final inspection report to GC with:

    - "Place in section E of your SWPPP book"
    - Upsell language: "We also offer site cleaning and street sweeping"
6. CC: Don (billing), Kendra (contracts), Daniel (site cleaning), Kelly (site cleaning)
7. If budget remains: call GC about available services
8. Move project from active to completed in master schedule
9. Update project record

Acceptance Criteria:

Workflow:

- Given final inspection request, final is conducted
- Given final complete, report includes photos of final conditions
- Given final complete, report includes upsell language
- Given final emailed, cleaning team is CC'd
- Given remaining contract budget, upsell opportunity is flagged
- Given remaining budget and upsell opportunity, GC is called
- Given project complete, it moves to completed status
- Given final sent, billing is notified for final invoice

Visibility:

- [TBD] How do we see projects approaching final inspection?
- [TBD] How do we see remaining contract budget before final?

Escalation:

- [TBD] What happens if final requested but not conducted within X days?
- [TBD] What happens if upsell opportunity not followed up?

Verification:

- [TBD] How do we confirm final report was sent to GC?
- [TBD] How do we confirm project moved to completed status?

- --

STORY: INSPECTION - RAIN EVENT

Trigger:

- Significant rain (2+ inches)
- Weather service alert

Steps:

1. Detect rain event in service area
2. Identify all active SWPPP projects in affected area
3. Schedule rain inspections within required timeframe
4. Prioritize sites based on risk
5. Conduct rain inspections with photos
6. Document any rain-related deficiencies with measurements
7. Notify GCs of any urgent corrective actions needed

Acceptance Criteria:

Workflow:

- Given rain event (2+ inches), all affected projects are flagged
- Given flagged projects, rain inspections are scheduled within required timeframe
- Given rain inspection complete, report documents rain impact with photos
- Given rain-related deficiency, measurements are captured
- Given urgent deficiency, GC is notified immediately

Visibility:

- [TBD] How do we see which projects are affected by rain event?
- [TBD] How do we see rain inspection completion status?

Escalation:

- [TBD] What happens if rain inspection not completed within required timeframe?
- [TBD] What happens if urgent deficiency not acknowledged by GC?

Verification:

- [TBD] How do we confirm rain inspections were scheduled?
- [TBD] How do we confirm all affected projects were inspected?

- --

## Sales

STORY: BID FOLLOW-UP

Trigger:

- Estimate sent to GC

Steps:

1. Track days since estimate sent
2. Follow-up via email and phone to confirm receipt
3. Attach cut sheets and supporting documentation
4. Log activity in Monday.com (Last Activity Column)
5. If GC won overall project: ask if we won SWPPP portion
6. If we won: get PM name, contact, address, start date
7. If we lost: categorize reason (GC lost overall bid vs. lost to competitor)

Acceptance Criteria:

Workflow:

- Given estimate sent, follow-up is made within 24-48 hours
- Given GC confirms receipt, activity is logged
- Given GC won project, we determine if we won subcontract
- Given we won, PM name, address, and start date are collected
- Given we lost, loss reason is categorized

Visibility:

- [TBD] How do we see all estimates pending follow-up?
- [TBD] How do we see follow-up status by estimator/salesperson?

Escalation:

- [TBD] What happens if no follow-up after X days?
- [TBD] What happens if estimate marked "pending" for too long?

Verification:

- [TBD] How do we confirm follow-up was made?
- [TBD] How do we confirm loss reasons are being captured?

- --

STORY: PROJECT WIN NOTIFICATION

Trigger:

- Bid confirmed won (GC won project AND we won subcontract)

Steps:

1. Collect required information: PM name, contact, address, start date
2. Update CRM with complete project info
3. Notify: Sales (assigned), Jared, Jayson, Kendra
4. Assign to appropriate salesperson based on GC account
5. Salesperson acknowledges and contacts PM within 24 hours

Acceptance Criteria:

Workflow:

- Given bid won, PM name, address, and start date are collected
- Given info collected, CRM is updated with complete project info
- Given CRM updated, notification is sent to Sales, Jared, Jayson, Kendra
- Given notification sent, salesperson is assigned based on GC account
- Given assignment, salesperson contacts PM within 24 hours

Visibility:

- [TBD] How do we see all recently won projects?
- [TBD] How do we see which won projects are missing required info?

Escalation:

- [TBD] What happens if required info not collected within X days?
- [TBD] What happens if salesperson doesn't acknowledge?

Verification:

- [TBD] How do we confirm salesperson contacted PM?
- [TBD] How do we confirm all required info was collected?

- --

STORY: UPSELL AT PROJECT START

Trigger:

- Project won, salesperson notified
- PM contact information available
- Before ground breaks on site

Steps:

1. Salesperson calls PM to introduce self as single point of contact
2. Ask about other service needs (PJs, fence, roll-offs, sweeping, water trucks)
3. Get full project timeline
4. Update CRM with upsell opportunities
5. If additional services needed: Jared generates updated estimate
6. If estimate accepted: add services to contract
7. Notify appropriate division directors

Acceptance Criteria:

Workflow:

- Given project won, salesperson contacts PM before ground breaks
- Given PM contact made, other service needs are discussed
- Given upsell opportunity identified, it is logged in CRM
- Given additional services needed, estimate is generated
- Given estimate accepted, services are added to contract
- Given services added, division directors are notified

Visibility:

- [TBD] How do we see upsell opportunities across all projects?
- [TBD] How do we see which projects had PM contact before ground broke?

Escalation:

- [TBD] What happens if PM not contacted before ground breaks?
- [TBD] What happens if upsell opportunity not followed up?

Verification:

- [TBD] How do we confirm PM was contacted?
- [TBD] How do we confirm upsell opportunities were captured?

- --

STORY: ACCOUNT SITE VISIT (Farmer)

Trigger:

- Monthly cadence for Top 80 accounts
- Opportunistic visit when in area

Steps:

1. Review daily schedule and plan site visits
2. Visit assigned GC sites
3. Document what services are in use (ours and competitors)
4. Check service quality (PJ cleanliness, roll-off fill levels, etc.)
5. Build relationship with superintendent and PM
6. Identify additional service opportunities
7. Log visit and notes in Monday.com

Acceptance Criteria:

Workflow:

- Given Top 80 account, site is visited minimum once per month
- Given site visit, services in use are documented
- Given site visit, service quality is inspected
- Given opportunity identified, it is logged in CRM
- Given visit complete, notes are logged in Monday.com

Visibility:

- [TBD] How do we see which accounts are due for a visit?
- [TBD] How do we see what services we provide at each site?

Escalation:

- [TBD] What happens if account not visited in 30+ days?
- [TBD] What happens if service quality issue found?

Verification:

- [TBD] How do we confirm visit happened?
- [TBD] How do we confirm notes were logged?

- --

STORY: DUST PERMIT LEADS (Hunter)

Trigger:

- New dust permit filed in Maricopa County (scraped data)

Steps:

1. Extract dust permit data (project, address, company, contacts, acreage, etc.)
2. Look up account by company/domain
3. If account exists: attach to existing account
4. If no account: create new account, add domain, add contact
5. Create new opportunity in Monday (this is always a new job we're not on)
6. Hunter follows sales cadence:

    - Initial outreach (call/email)
    - Follow-up touches
    - Site visit when project is active
7. Based on site visit and follow-up: continue pursuit or close out

Acceptance Criteria:

Workflow:

- Given new dust permit, opportunity is created in Monday
- Given existing account, opportunity is linked to that account
- Given new account, account is created per sla.md
- Given hunter outreach, activity is logged against opportunity
- Given site visit complete, opportunity is updated with result
- Given pursuit ended, opportunity is marked win/loss

Visibility:

- [TBD] How do we see new dust permits scraped today/this week?
- [TBD] How do we see hunter pipeline by stage?

Escalation:

- [TBD] What happens if dust permit not followed up within X days?
- [TBD] What happens if opportunity stale for too long?

Verification:

- [TBD] How do we confirm opportunity was created from permit?
- [TBD] How do we confirm outreach was made?

- --

## Billing

STORY: WORK COMPLETE → INVOICE

Trigger:

- Work completed in field
- Director submits work complete (email, CRO, or handwritten photo)

Steps:

1. Director marks work complete with details (hours, quantities, materials)
2. Billing coordinator receives work complete
3. Match work complete to schedule/contract
4. Verify PO number if required
5. Determine billing type: invoice vs. contract billing
6. If invoice: create invoice in QuickBooks, send to customer
7. If contract billing: create invoice, notify Kendra for platform submission
8. Track accounts receivable

Acceptance Criteria:

Workflow:

- Given work complete received, invoice is created within X days
- Given PO-required customer, PO number is included on invoice
- Given contract billing job, Kendra is notified with invoice ready
- Given invoice sent, AR tracking begins

Visibility:

- [TBD] How do we see work completes waiting to be invoiced?
- [TBD] How do we see billing lag (days between work complete and invoice)?

Escalation:

- [TBD] What happens if work complete not received within X days of scheduled work?
- [TBD] What happens if invoice unpaid after X days?

Verification:

- [TBD] How do we confirm invoice was sent?
- [TBD] How do we confirm payment was received?

- --

STORY: CONTRACT BILLING (Platform Submission)

Trigger:

- Invoice created for contract billing job (blue-coded)
- Billing window opens (typically 20th-25th of month)

Steps:

1. Billing coordinator creates invoice in QuickBooks
2. Billing coordinator notifies Kendra: "Invoice ready for [Customer/Project]"
3. Kendra verifies customer has set up Desert Services in platform
4. If not set up: email customer requesting platform access
5. Kendra submits pay app through platform (Textura, Procore, GC Pay, Premier)
6. Update QuickBooks memo with submission date and platform
7. If rejected: fix issues and resubmit
8. If approved: wait for payment (typically 60 days)
9. Apply payment when received

Acceptance Criteria:

Workflow:

- Given billing window open, pay app is submitted within window
- Given platform access missing, customer is notified immediately
- Given pay app rejected, issues are fixed and resubmitted within 48 hours
- Given payment received, payment is applied to invoice

Visibility:

- [TBD] How do we see all contract jobs pending platform submission?
- [TBD] How do we see which customers haven't set up platform access?

Escalation:

- [TBD] What happens if platform access not granted after X days?
- [TBD] What happens if pay app rejected multiple times?

Verification:

- [TBD] How do we confirm pay app was submitted?
- [TBD] How do we confirm payment was applied?

- --

STORY: SCHEDULE OF VALUES SETUP

Trigger:

- New contract received for contract billing job
- Customer sets up Desert Services in billing platform

Steps:

1. Review contract line items
2. Review estimate quantities and prices
3. Create schedule of values matching contract
4. Input into platform (Textura, Procore, GC Pay, Premier)
5. Submit to customer for approval
6. Customer approves schedule
7. Mark project ready for monthly billing

Acceptance Criteria:

Workflow:

- Given new contract billing job, schedule of values is created within X days
- Given schedule created, it is submitted for customer approval
- Given schedule approved, project is marked ready for billing
- Given schedule rejected, corrections are made and resubmitted

Visibility:

- [TBD] How do we see which contracts need schedule of values setup?
- [TBD] How do we see schedule of values approval status?

Escalation:

- [TBD] What happens if schedule not created within X days of contract?
- [TBD] What happens if customer doesn't approve schedule?

Verification:

- [TBD] How do we confirm schedule was created?
- [TBD] How do we confirm customer approved?

- --

STORY: CHANGE ORDER REQUEST

Trigger:

- Work performed exceeds contract scope (discovered during billing)
- Work performed not on contract at all
- Contract items not completed

Steps:

1. Billing coordinator identifies discrepancy during billing
2. Document discrepancy: what was done vs. what's on contract
3. Request change order from customer
4. Follow up on outstanding change orders (monthly)
5. If approved: update contract, update schedule of values
6. If rejected: escalate to PM or write off
7. Resume billing for approved work

Acceptance Criteria:

Workflow:

- Given work exceeds contract, change order is requested immediately
- Given change order requested, follow-up is made monthly
- Given change order approved, contract and SOV are updated
- Given change order rejected, issue is escalated

Visibility:

- [TBD] How do we see all outstanding change order requests?
- [TBD] How do we see how long change orders have been pending?

Escalation:

- [TBD] What happens if change order pending for 30+ days?
- [TBD] What happens if customer ignores change order requests?

Verification:

- [TBD] How do we confirm change order was requested?
- [TBD] How do we confirm contract was updated after approval?

- --

STORY: RETENTION RELEASE

Trigger:

- Project complete
- Retention held on contract (typically 10%)

Steps:

1. Confirm all work complete on project
2. Confirm all change orders resolved
3. Request retention release from customer
4. Submit final pay app with retention amount
5. Track retention payment separately
6. Apply payment when received

Acceptance Criteria:

Workflow:

- Given project complete, retention release is requested
- Given retention requested, final pay app is submitted
- Given retention paid, payment is applied

Visibility:

- [TBD] How do we see all projects with outstanding retention?
- [TBD] How do we see total retention value outstanding?

Escalation:

- [TBD] What happens if retention not released within X days of project completion?
- [TBD] What happens if customer disputes retention?

Verification:

- [TBD] How do we confirm retention was requested?
- [TBD] How do we confirm retention was received?

- --

## Benchmarks

Dust permits:

- 2 touch points max (initial + map)
- Map step: <5 minutes

Estimating:

- TBD
