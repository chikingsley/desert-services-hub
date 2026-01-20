# Siteline Research Summary & Analysis

* *Date:** November 26, 2025
* *Prepared by:** Claude (synthesizing Chi's research)
* *Purpose:** Evaluate Siteline for Desert Services billing workflow

- --

## EXECUTIVE SUMMARY

* *Bottom Line:** Siteline is a strong fit for Desert Services' GC portal integration problem, but has notable gaps in security documentation and doesn't fully replace QuickBooks. Worth pursuing a demo with specific questions.

| Aspect | Rating | Notes |
|--------|--------|-------|
| GC Pay / Textura integration | Excellent | One-click submission, exactly what you need |
| Procore integration | Problematic | User complaints, requires workarounds |
| QuickBooks compatibility | Compatible | Desktop Enterprise only, file-based (not live sync) |
| AIA billing | Excellent | G702/G703 + 15,000+ custom forms |
| Retainage tracking | Good | Flexible but no dedicated "outstanding vs held" dashboard |
| Lien waivers | Excellent | Standout feature, 6x faster collection |
| Security (2FA, SOC 2) | Unknown | NOT publicly documented - must verify |
| Month lockdown | Unknown | NOT documented - must verify |
| Implementation | Fast | 2 weeks typical |
| Pricing | Custom | No per-user fees, unlimited seats |

- --

## SOURCE DOCUMENTS ANALYZED

### Document 1: "siteline construciton eval - claude.md"

- **Source:** Appears to be Claude-generated research
- **Tone:** Cautious, highlights gaps
- **Strengths:** Clear structure, honest about what's NOT documented
- **Key finding:** QuickBooks Online NOT supported, only Desktop Enterprise

### Document 2: "Siteline_ Deep Dive into Features for Subcontractor Billing.pdf"

- **Source:** ChatGPT-generated research
- **Tone:** More optimistic/sales-oriented
- **Strengths:** Good alternatives comparison, detailed feature descriptions
- **Concern:** Contradicts Document 1 on QuickBooks Online ("can likely integrate" vs "not supported")

### Web Search (November 2025)

- Confirmed QuickBooks is file-based transfer (IIF files)
- User reviews confirm Procore integration issues
- No SOC 2 certification found publicly
- Users report getting paid 3 weeks faster on average

- --

## DETAILED ANALYSIS

### 1. GC Portal Integrations (Your Main Pain Point)

* *This is where Siteline shines for Desert Services.**

| Portal | Integration Quality | How It Works |
|--------|---------------------|--------------|
| GC Pay | Excellent | True one-click submission, bi-directional sync |
| Textura | Excellent | One-click + automatic payment status sync |
| Procore | Problematic | Requires GC to install Agave API, must sign in Procore to submit |

* *Your situation:** You use GC Pay, Textura, and Procore. Two out of three would work well. For Procore jobs, there would still be friction.

* *Verdict:** This solves the core problem of manual double-entry into pay apps.

- --

### 2. QuickBooks Integration (Critical Question Resolved)

* *IMPORTANT:**Both documents confirm Siteline integrates with**QuickBooks Enterprise Desktop (Contractor Edition)** - which is what Desert Services uses.

* *How it works:**

1. Import SOV via CSV spreadsheet template into Siteline
2. Do all billing/pay app work in Siteline
3. Export invoice as IIF file from Siteline
4. Manually import IIF file into QuickBooks

* *What this means:**

- NOT a live, real-time sync
- Still requires manual import/export steps
- But eliminates re-typing (data flows via file)
- QuickBooks remains your system of record for A/R, GL, job costing

* *QuickBooks Online:** NOT supported per Document 1 (Document 2's claim that it "can likely integrate" appears incorrect based on Siteline's own documentation).

* *Verdict:** Compatible with your current setup. The file-based workflow is clunky but workable.

- --

### 3. AIA Billing (G702/G703)

* *Comprehensive support:**

- Generates AIA G702 (Application for Payment) and G703 (Continuation Sheet)
- Database of 15,000+ GC forms including custom variations
- Auto-calculates taxes, retainage, carry-over
- Digital signatures supported
- 50% drop in pay app revisions reported by users

* *Licensing note:** Siteline is NOT affiliated with AIA. If your GCs require officially licensed AIA forms, you may need to secure those separately.

* *Verdict:** Excellent - this directly solves your AIA billing pain.

- --

### 4. Retainage Tracking

* *What Siteline does:**

- Flexible configuration (overall rate or per-line-item)
- Time-based rules (e.g., 10% first 3 periods, then 5%)
- Automatic calculation and carry-forward
- Billing reports show billed-to-date, balance to finish, retention held

* *What's missing:**

- No explicit "outstanding vs held" dedicated view
- Retainage visibility is within billing reports, not a standalone module
- Document 1 says this feature is "not found in documentation"
- Document 2 is more optimistic ("can generate unbilled retainage report")

* *Your need:** You wanted to see 10% held for 2+ years vs. actually outstanding. This may require asking Siteline directly how their reporting handles this.

* *Verdict:** Good but verify - ask for a demo of retainage reporting specifically.

- --

### 5. Security (CRITICAL GAP)

* *This is concerning given your ransomware history.**

| Security Feature | Status |
|-----------------|--------|
| Two-Factor Authentication (2FA) | NOT publicly documented |
| SOC 2 certification | NOT found in public sources |
| Encryption at rest | Not specified |
| Encryption in transit | Assumed HTTPS but not stated |
| Access controls (RBAC) | Limited documentation |

* *Document 1's assessment:** "Contact Siteline directly at  to request a security questionnaire, SOC 2 report (if available), or Master Service Agreement with security details."

* *Document 2's assessment:** More optimistic ("very likely" they have 2FA, "presumably" enterprise-grade security) but this is speculation, not confirmed.

* *My take:**The CEO's background (former Stripe product lead) suggests reasonable security practices*may* exist but simply aren't publicly documented. This is common for younger SaaS companies. However, given your ransomware attack, you should NOT proceed without:

1. Written confirmation of 2FA availability
2. SOC 2 report or equivalent security audit
3. Clear data backup and recovery policies

* *Verdict:** MUST verify before proceeding. Red flag if they can't provide documentation.

- --

### 6. Month Lockdown (For Audits/Investors)

* *Status:** NOT documented in either source.

* *Document 1:** "No period closing or month lockdown feature... was found in any Siteline documentation."

* *Document 2:** More nuanced - says Siteline treats submitted pay apps as "final" and changes go through a revision workflow with audit trail. But acknowledges the actual "month close" happens in QuickBooks.

* *What this means:** Siteline likely relies on your accounting system (QuickBooks) to do the formal period close. Siteline provides an audit trail of what was submitted and any revisions.

* *Verdict:** Verify directly with Siteline. If you need strict period lockdown for investors, this might be a gap.

- --

### 7. File Attachments

* *Confirmed supported:**

- Backup documentation (timesheets, material invoices, photos)
- Compliance documents (Certificates of Insurance, certified payroll)
- Change order backup
- Lien waivers

* *Not documented:** File size limits, storage limits, supported file types (though standard construction docs like PDFs and images are clearly supported).

* *Verdict:** Good - consolidates your billing documentation in one place.

- --

### 8. Lien Waiver Management (Standout Feature)

* *This is one of Siteline's strongest features:**

- Generates all 4 standard waiver types (Conditional/Unconditional Progress/Final)
- Auto-generates unconditional waivers when invoices marked paid
- Lien Waiver Tracker shows real-time status
- Lower-tier vendors can sign without creating account
- Automated reminder emails
- Users report collecting waivers "6x faster"

* *User quote:** "Their form fill process is second to none. It transformed the way my company processed billings, tracked cash flow, handled contract compliance, and managed our lien waivers."

* *Verdict:** Excellent - if lien waivers are a pain point, this is a major win.

- --

### 9. Change Order Tracking

* *What Siteline does:**

- Centralized change order log with status tracking
- Pre-filled CO request forms per GC requirements
- Built-in rate tables for pricing
- Integration with billing (approved COs flow to SOV)
- Permission controls prevent billing unapproved COs

* *Case study:** VanKirk Electric saves 16 hours/month managing 60+ change orders.

* *Verdict:** Good - addresses your change order discovery problem (RC2).

- --

### 10. Pricing & Implementation

* *Pricing:**

- Custom quote based on usage, billing volume, integrations
- NO per-user fees (unlimited seats)
- No setup/implementation fees reported
- No free trial
- Users describe as "accessible price point"

* *Implementation:**

- Most customers operational within 2 weeks
- Dedicated onboarding manager for first 6 months
- Siteline handles bulk import of existing projects
- ~10 minutes for PMs to learn basic billing
- 98% customer retention rate

* *Verdict:** Fast implementation is attractive. Custom pricing means you need to engage sales.

- --

## COMPARISON: SITELINE VS. ALTERNATIVES

* *From Document 2's analysis:**

| Option | Pros | Cons |
|--------|------|------|
| **Keep QuickBooks + Excel** | Familiar, cheap | No AIA billing, no portal integration, manual everything |
| **Construction ERP (Sage, Foundation, Viewpoint)** | Full-featured | Expensive, complex, still no GC portal integration |
| **Siteline + QuickBooks** | Best of both worlds | File-based sync is clunky |
| **Knowify** | Works with QBO | No GC portal integration, no custom forms |

* *Document 2's recommendation:** "Retain QuickBooks Enterprise for core accounting and implement Siteline to handle the construction-specific billing tasks."

- --

## FIT FOR DESERT SERVICES

### What Siteline SOLVES

| Your Problem | How Siteline Helps |
|--------------|-------------------|
| Manual entry into GC Pay, Textura | One-click submission |
| No AIA billing in QuickBooks | Full G702/G703 support |
| Retainage invisible | Tracking + reporting (verify exact views) |
| Lien waiver chaos | Automated generation + tracking |
| Change orders discovered at billing | Centralized CO log, flows to SOV |
| Double data entry | Data flows between systems |

### What Siteline DOESN'T SOLVE

| Your Problem | Why Not |
|--------------|---------|
| QuickBooks security lockdown | Siteline is separate system, doesn't change QB setup |
| Procore integration issues | Known problems with Procore specifically |
| Month lockdown for audits | Not documented, may rely on QuickBooks |
| WT/Sweeping manual scheduling | Siteline is billing only, not scheduling |
| CRO underutilization | Different system entirely |

- --

## RECOMMENDED NEXT STEPS

### Before Demo

1. **Confirm QuickBooks version** - Verify you're on Enterprise Desktop (Contractor Edition)
2. **List your GCs by portal** - How many use GC Pay vs Textura vs Procore vs other?
3. **Identify pilot projects** - Which projects would you test first?

### Questions for Siteline Demo

* *Security (CRITICAL):**

- [ ] Do you offer 2FA? Is it required or optional?
- [ ] Do you have SOC 2 Type I or Type II certification?
- [ ] What encryption standards do you use (at rest and in transit)?
- [ ] What are your backup and disaster recovery procedures?
- [ ] Can you provide a security questionnaire or MSA with security details?

* *Retainage:**

- [ ] Show me how to see retainage held vs. outstanding across all projects
- [ ] Can I see retainage aging (how long it's been held)?
- [ ] How does retainage release work when project closes out?

* *Month Lockdown:**

- [ ] Can I lock/close billing periods to prevent changes?
- [ ] What audit trail exists for changes to submitted pay apps?
- [ ] How does this work with QuickBooks period close?

* *Procore:**

- [ ] What are the known limitations with Procore integration?
- [ ] How many of your customers use Procore successfully?

* *Pricing:**

- [ ] What's the typical pricing range for a company our size (~7 service lines)?
- [ ] What's included in the base subscription vs. add-ons?

- --

## MY TAKE

* *Siteline is worth pursuing, but with eyes open.**

* *Strengths for Desert Services:**

1. Directly solves your #1 billing pain (GC portal integration)
2. Compatible with your QuickBooks Enterprise Desktop
3. Fast implementation (2 weeks vs. months for ERP)
4. Strong lien waiver automation
5. No per-user fees means whole team can use it
6. 98% retention suggests users are happy

* *Concerns for Desert Services:**

1. Security documentation gaps - given your ransomware history, this is a red flag until verified
2. Procore integration problems - if many of your GCs use Procore, this matters
3. File-based QuickBooks sync - not elegant, but workable
4. Month lockdown unclear - verify if you need this for investors
5. Doesn't solve your operational problems (scheduling, CRO, etc.) - billing only

* *Recommendation:** Schedule a demo. Go in with the security questions first. If they can't provide adequate security documentation, walk away. If security checks out, do a pilot on 2-3 projects.

- --

## ADDITIONAL FINDINGS (November 26, 2025)

### Siteline Has an Open API

* *Confirmed:** Siteline has an open API for integration with other systems.

* *What this means for Desert Services:**

- Conductor.is integration is possible
- Can build automation: Siteline → QuickBooks sync
- Don't have to rely on file-based IIF import/export
- Could push final invoice data to QuickBooks programmatically

* *Sources:**

- [Siteline Integrations](https://www.siteline.com/integrations) - "Open API to connect with other construction software"
- [hh2 iPaaS Integration](https://www.hh2.com/siteline) - Shows API integration patterns

### Why Desert Services Got Siteline

* *Background:** Before Siteline, billing team was using QuickBooks incorrectly:

- Open invoice → save → add line items throughout the month
- Change orders added to same open invoice
- At month end, send the invoice

* *The problem:** QuickBooks expects invoices created and sent as discrete events. Using it as a "running tally" corrupts the data integrity.

* *Current state:** Siteline is already in use for change orders, but not fully utilized.

### What Full Siteline Utilization Would Look Like

If Desert Services fully utilized Siteline (which they already pay for):

| Function | Current State | Full Utilization |
|----------|--------------|------------------|
| Pay app creation | Mixed (some QuickBooks, some Siteline) | All in Siteline |
| GC portal submission | Manual entry into each portal | One-click via Siteline (GC Pay, Textura) |
| Change orders | In Siteline | Same - already working |
| Lien waivers | Manual | Automated via Siteline (6x faster) |
| Retainage tracking | Not visible | Tracked in Siteline |
| QuickBooks | Used for everything | Final AR/GL only |

* *The Architecture:**

```text
SITELINE                          QUICKBOOKS
────────                          ──────────
• Pay apps                        • Final AR
• SOV management                  • General Ledger
• GC portal submission            • Financial reporting
• Change orders                   • System of record
• Lien waivers
• Retainage
        │                                ▲
        │                                │
        └────── API/Conductor.is ────────┘
                (push final invoices)

```text

__QuickBooks remains "God"__ - the source of truth for financials. Siteline handles all the construction-specific billing workflow, then pushes clean, final data to QuickBooks.

### Is Full Utilization Worth It?

__Yes, because:__

1. Already paying for it - sunk cost
2. Solves the "running tally" problem properly
3. GC Pay + Textura one-click submission saves hours
4. Lien waiver automation is a major win
5. API means QuickBooks sync can be automated (not manual IIF files)
6. Training investment is one-time; benefits compound

__Caveats:__

1. Need to verify security (2FA, SOC 2) first
2. Procore integration is problematic - may still have friction there
3. Requires training/process change for billing team
4. Need buy-in from Kendra and billing staff

### Next Steps for Siteline

1. __Verify security__ - SOC 2, 2FA (don't proceed without this)
2. __Explore Conductor.is + Siteline API__ - Can Chi build the sync?
3. __Document current Siteline usage__ - What's being used vs. not?
4. __Identify training gaps__ - Who needs to learn what?
5. __Pilot full utilization__ on 2-3 projects before company-wide rollout

- --

## SOURCES

__Research Documents:__

- siteline construciton eval - claude.md (in this folder)
- Siteline_ Deep Dive into Features for Subcontractor Billing.pdf (in this folder)

__Web Sources:__

- [Siteline 2025 Pricing, Features, Reviews | GetApp](https://www.getapp.com/construction-software/a/siteline-1/)
- [Siteline Software Reviews, Demo & Pricing - 2025](https://www.softwareadvice.com/product/393521-Siteline/)
- [QuickBooks Enterprise Contractor Integration | Siteline](https://www.siteline.com/integrations/quickbooks-enterprise-contractor)
- [Siteline Pricing, Alternatives & More 2025 | Capterra](https://www.capterra.com/p/252004/Siteline/)
