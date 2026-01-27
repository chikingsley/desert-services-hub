# CONVERSATION: Tools & Workflow Problems - Deep Dive

* *Purpose:** Get on the same page before editing opportunities-backlog.md
* *Status:** Working document for Chi + Claude discussion
* *Date:** November 26, 2025

- --

## WHAT I FOUND IN THE SUMMARIES

I went through all 11 people summaries, the workflow maps, and your verbal feedback. The current "Root Cause 3: Tools Don't Support Workflow" is trying to hold too many different problems that aren't really the same thing.

Here's what I'm seeing as distinct problem clusters:

- --

## PROBLEM CLUSTER 1: WT/SWEEPING MANUAL PROCESS

* *Who's affected:** Water Trucks (Daniel), Street Sweeping (Kelly)

* Note: PJs/Roll-offs (Stephen, Wendy, Kerin) are separate - they use CRO. See Cluster 5.*

* *Water Trucks (Daniel):**

* Work intake from 4+ sources (customer calls, answering service, site managers, contracts)
* Daniel estimates, then gets formal estimate from Jared or Dawn
* Contract jobs: Added to "WT SW Master Excel" and "WT schedule October 2025"
* Call-in jobs: Text message to group chat with basic info
* Weekly schedule printed and handed out to drivers
* Drivers text/email timesheets and job details to Daniel
* Daniel documents in Notes app on phone (!!!)
* 2-5 day lag between work complete and sending to Dawn
* Dawn can't bill until 1-2 weeks later

* *Street Sweeping (Kelly):**

* Kelly works remotely (Dawn has seen him 3 times in 6 years)
* Maintains handwritten work complete sheet
* Takes picture and texts to Dawn
* Dawn has to text weekly: "Hey, need work completes for last week"
* All hits including scheduled and call-ins tracked on paper

* *The Pattern:**

* Hours of manual work doing what would take minutes in a proper system
* No real-time visibility into what's scheduled or completed
* Work complete data trapped in phones, notebooks, text messages
* Billing delayed 1-2 weeks because can't get work complete data
* "Crossword puzzle" to decipher what was done

* *The Manual Process Does Two Things:**

1. Timekeeping (when clocked in, when arrived)
2. Work completes (what projects they hit)

* *BusyBusy App:**

* Rolled out a week ago, top-down
* Nobody trained, no champion on site
* Nobody can answer basic questions about how it works
* Unknown: How do you even input jobs? Is there maps integration? Routing?

* *What's Needed:**

* Someone on site who can say "yes, this is how it works, come here, I'll show you"
* Proper training, not PowerPoints
* Understanding of whether BusyBusy can actually replace the manual process

- --

## PROBLEM CLUSTER 2: ESTIMATING DEPARTMENT BOTTLENECKS

* *Who's affected:** Jared, Rick, and everyone downstream

* *What's happening (from estimating process map and your verbal):**

* *Triage Step Problems:**

* Hard to get stuff from email/call/bid board into CRM
* Highly manual process
* Have to find the requisite PDFs (site drawings, SWPPP plans, etc.)
* Need some documents but not all - most aren't relevant
* Missing: address, start date, contact info, the basics

* *Shortcuts Being Taken:**

* Only putting in partial contact information
* Not attaching estimates always
* Address sometimes missing
* Data quality issues because they're trying to go too fast

* *Estimator Getting Distracted:**

* Called all day long asking "where's these files?"
* Emailed all day long asking status of estimates
* Doing firefighting that operations should be doing
* Estimator responsibilities need to be further defined

* *The Duplicate Problem You Mentioned:**

* Duplicating old estimates instead of creating from memoized lists
* You were working with estimating team on this - now using lists instead
* QuickBooks has a lot of clicks to create a new estimate

* *3,000+ Bids Sitting in SENT Status:**

* No systematic follow-up on all of them
* Rick focuses on high-dollar only
* No tracking of why bids lost
* Missing: who won, why we lost, what we can learn

- --

## PROBLEM CLUSTER 3: QUICKBOOKS SITUATION (Not What It Seems)

* *The Reality You Explained:**

* *Not a QuickBooks problem per se:**

* Company had a ransomware attack
* Lost data, had to go back weeks
* So they locked down QuickBooks hard

* *The Current Setup:**

* Remote workers have to log into a remote desktop
* Screen share a computer that's on site
* Causes "locks up" issues Kendra experiences
* This was a reactionary security decision

* *What QuickBooks DOESN'T Do Well:**

* No AIA billing
* No retainage tracking (so can't see what's outstanding vs. 10% held for 2 years)
* Not set up for how billing should work (accrue amounts, bill monthly, etc.)
* Being used for document storage when that's not its purpose

* *What You're Thinking:**

* Siteline as alternative for billing
* Has construction-specific features
* Has auditable records, locked months
* Conductor.is API could automate QuickBooks → estimate → PDF generation
* Could pull values from Excel attached to QuickBooks
* Could auto-generate schedule of values

* *The Real Problem:**

* It's not that QuickBooks is bad
* It's that (1) the security lockdown creates friction and (2) they're using it for things it's not designed for
* And there's no system for tracking outstanding payments properly

- --

## PROBLEM CLUSTER 4: EMAIL AS PROJECT MANAGEMENT (Billing Side)

* *Your Clarification:** This isn't about SWPPP or contract reconciliation (that's Root Cause 2). This is about the billing department side.

* *What's Happening:**

* Send invoice
* Need to track what's unpaid
* No place to easily see "what's outstanding"
* People remember things
* Mark emails as unread, flag them, create folders
* System works but it's not replicable
* If someone left, the knowledge goes with them

* *Who Should Own This:**

* Project manager or account manager is traditionally responsible
* They're the "ultimate responsible person" for making sure money gets paid
* Billing department sends invoices
* But account manager ensures collection

* *This Is Really About:**

* No visibility into AR at the project level
* No system for tracking "this invoice sent, this payment pending, this overdue"
* Everyone inventing their own email workarounds

- --

## PROBLEM CLUSTER 5: CRO UNDERUTILIZATION (PJ + Roll-off)

* *Who's affected:** PJs (Stephen), Roll-offs (Wendy/Kerin)

* *Key Difference from WT/Sweeping:** They HAVE a system (CRO). The problem is underutilization, not manual process.

* *CRO Issues (from Stephen/Wendy):**

* Route optimization workflow is backwards (only after assignment)
* Allows wrong can numbers (Roll-offs) - no validation
* Schedules sometimes don't populate
* Being misused, unknown causes
* Firefighting instead of solving root causes
* CRO has time tracking but they're not using it (not trained, just didn't set it up)

* *CRO Things That Could Be Fixed:**

* Roll-off number validation
* Porta-john asset tracking
* CRO billing integration (Kerin mentioned they could export to QuickBooks)
* Time tracking features already exist - just need setup/training

* *Vendor Relationship:**

* We have a rep
* They do training, willing to do as much as we want
* They're super open to helping
* **No ongoing issues list to work through with them**

* *The Solution:**

* Regular sit-downs with CRO vendor
* Create and maintain issues list
* Go through issues weekly with Stephen/Wendy/Kerin
* Ongoing process improvement, not one-time

* *Note:** Wendy retiring end of year - need to capture her issues/workarounds before she leaves.

- --

## PROBLEM CLUSTER 5B: NO CROSS-VISIBILITY ACROSS SERVICE LINES

* *The Reality:**

* Each service line runs separately
* Sweeping doesn't know if water trucks are there
* Sales visits site not knowing what services we provide there
* Looks unprofessional

* *Root Cause:** Three separate execution systems (CRO, Dawn's Excel, Kelly's paper) that don't talk to each other.

- --

## PROBLEM CLUSTER 6: FILES ARE EVERYWHERE

* *The Reality:**

* 15+ places to check
* SharePoint, email, QuickBooks (as document storage), local drives
* Constant "where's this file?" emails
* Estimator spends significant time being asked where files are

* *This Compounds Everything:**

* Can't find the PDFs needed for estimating
* Can't find contracts when reconciling
* Can't find documentation when billing
* Everyone has their own folder system

- --

## PROBLEM CLUSTER 7: NO AUDITABLE TRAIL (Certain Service Lines)

* *Which Services:**

* Water Trucks
* Sweeping
* Roll-offs
* Porta-Johns

* *The Problem:**

* Work done without signed confirmation
* Change orders discovered during billing
* "Proof of work" missing
* Customer can dispute
* Unbilled work

* *CRO Has This Partially:**

* CRO tracks orders and completion
* But the work-complete-to-billing flow still has gaps

- --

## FINAL ROOT CAUSE STRUCTURE

Based on our discussion, here's the agreed organization:

### ROOT CAUSE 1: No Systematic Follow-Up

* (stays as is in opportunities-backlog.md)*

### ROOT CAUSE 2: No Project Initiation Process

* (stays as is in opportunities-backlog.md)*

### ROOT CAUSE 3: WT/Sweeping Manual Process

* *The Problem:** Entirely manual - handwritten schedules, work completes, time cards, tickets. "Crossword puzzle" to decipher. 1-2 week billing lag.

* *What the Manual Process Does:**

1. Timekeeping (when clocked in, when arrived)
2. Work completes (what projects they hit)

* *BusyBusy Status:**

* Rolled out a week ago, top-down
* Nobody trained, no champion on site who can answer questions
* Unknown if it can actually replace the manual process

* *Systemic Issue:** This is a pattern - new systems rolled out without stakeholder buy-in, no training, no explanation of why/how.

### ROOT CAUSE 4: CRO Underutilization (PJ + Roll-off)

* *The Problem:** System exists but not used well. Route optimization backwards. Validation missing. Issues happening, nobody knows why. Firefighting instead of solving.

* *Key Difference:** They HAVE a system. Issue is training/process improvement, not the tool itself.

* *Vendor Status:**

* We have a rep
* They do training, willing to do as much as we want
* Super open to helping
* **Missing: Ongoing issues list to work through with them**

* *Note:** Wendy retiring end of year - capture her issues/workarounds before she leaves.

### ROOT CAUSE 5: Estimating Bottleneck

* *The Problem:** Triage step hard. Missing data. Shortcuts taken. Estimator distracted by firefighting. 3,000+ bids in SENT. Need 2-3 more estimators.

* *Already In Progress:**

* Chi working with them on memoized lists vs. duplicating estimates
* Hiring another estimator is on the docket
* Project initiation will reduce estimator distraction

### ROOT CAUSE 6: QuickBooks/Billing Process Limitations

* *The Problem:**

* Not QuickBooks being bad - it's process/policy
* Security lockdown from ransomware creates friction
* No AIA billing, no retainage tracking
* No integration with pay apps (GC Pay, Textura, Procore)
* Can't lock down past months, unclear on cybersecurity features

* *Pay Apps Used:**

* GC Pay
* Textura
* Procore
* Siteline
* Direct invoice (some)

* *Siteline Interest:**

* Supposedly has integrations with pay apps already
* Construction-specific features
* Needs deep dive research

### ROOT CAUSE 7: Files Everywhere

15+ places to check. Estimator spends time answering "where's this file?"

### ROOT CAUSE 8: No Oversight / Feedback Loops

* (stays as is in opportunities-backlog.md)*

- --

## SITELINE RESEARCH PROMPT

For Chi's deep dive research on Siteline:

* *Core Questions:**

1. **Integrations:** Does Siteline integrate with GC Pay, Textura, Procore? How deep is the integration - one-click submission or manual data entry?
2. **AIA Billing:** Full AIA billing support? Can generate AIA G702/G703 forms?
3. **Retainage Tracking:** Can track 10% retainage over 2+ years? Visibility into what's outstanding vs. held?
4. **QuickBooks Integration:** Does it integrate with QuickBooks? How - sync invoices? Sync payments?
5. **Cybersecurity:** Two-factor authentication? SOC 2 compliance? What security measures?
6. **Month Lockdown:** Can you lock down past months for investor/audit purposes?
7. **File Attachments:** Can attach documents to projects/invoices?
8. **Cost:** Pricing model? Per user? Per project? Implementation fees?
9. **Implementation:** Typical timeline? Complexity? Do they provide onboarding support?
10. **Construction-Specific:** Schedule of values management? Change order tracking? Lien waiver management?

- --

## ACTION ITEMS

### Tonight

* [ ] Update opportunities-backlog.md with new 8 root cause structure
* [ ] Create Street Sweeping (Kelly) process map *(reminder for Chi)*

### Chi Can Drive

* [ ] CRO: Start issues list, schedule regular vendor training sessions
* [ ] CRO: Capture Wendy's issues/workarounds before she retires (end of year)
* [ ] Conductor.is API research (Chi wants sooner)
* [ ] Siteline deep dive research (use prompt above)
* [ ] Advocate for proper BusyBusy rollout (training, champion on site)

### Needs Leadership/Others

* [ ] Estimating: Hire 2-3 more estimators (on docket)
* [ ] BusyBusy: Identify on-site champion who can train/answer questions
* [ ] Address systemic issue: New systems need stakeholder buy-in before rollout

- --

## NEXT STEPS

1. **Now:** Update opportunities-backlog.md with this structure
2. **Then:** Create any additional action item tracking if needed
3. **End of session:** Clean up files, make sure everything is organized
