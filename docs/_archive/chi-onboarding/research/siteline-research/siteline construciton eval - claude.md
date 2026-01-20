# Siteline Construction Billing Software: Complete Evaluation

Siteline is purpose-built billing software for trade contractors that delivers strong core functionality with notable gaps in security documentation and QuickBooks Online support. The platform excels at GC portal integrations and lien waiver management, with rapid implementation timelines of under 2 weeks, but prospective buyers should verify security certifications and period lockdown features directly with the vendor.

- --

## 1. GC portal integrations range from excellent to problematic

* *GC Pay and Textura deliver the deepest integrations** with true one-click submission. Project information, schedules of values, and change orders flow automatically from these portals into Siteline, while completed pay applications with compliance documents and lien waivers submit directly back—no manual export/import required. Textura additionally syncs payment status automatically when invoices are marked paid.

* *Procore integration exists but has friction.** It requires general contractors to install the Agave API app from the Procore Marketplace, and critically, users must return to Procore to sign and submit the final pay application. One verified user on Capterra reported the "Procore integration doesn't work well, and you can't import projects for 'quick bill.'" Siteline acknowledged they're "actively working on improving this aspect."

| Integration | Submission Type | Data Sync | User Feedback |
|-------------|-----------------|-----------|---------------|
| GC Pay | One-click direct | Automatic bi-directional | Positive |
| Textura | One-click direct | Automatic + payment status | "Game changer" |
| Procore | Semi-direct (sign in Procore) | Automatic data, manual submit | Issues reported |

- --

## 2. AIA billing support is comprehensive with a licensing caveat

Siteline generates **AIA G702 (Application and Certificate for Payment) and G703 (Continuation Sheet) forms**natively with automatic calculations for taxes, retainage, and carry-over from previous billing periods. The system maintains a database of**15,000+ pay app forms from 10,000+ GCs**, including custom variations of standard AIA documents.

* *Important licensing note:** Siteline explicitly states they are "not affiliated with The American Institute of Architects" and users "must have or secure the AIA® forms" separately if GCs require officially licensed documents. Siteline helps fill out forms but doesn't provide the licensed forms themselves—this matters for organizations required to use branded AIA documents.

- --

## 3. Retainage tracking is flexible but lacks dedicated outstanding-vs-held views

The platform supports **multiple retainage calculation methods**: overall pay app rates, per-line-item rates (e.g., 0% on equipment rentals, 10% on labor), and time-based configurations (e.g., 10% for first three billing periods, then 5% after 50% completion). Calculations are automatic.

For visibility, billing reports display billed-to-date versus contract, balance to finish, and retention held per job. Overview reports show total retention held across all projects. However, **no explicit "outstanding vs. held" retainage tracking as a dedicated view** was found in documentation—retainage visibility is integrated within billing reports rather than a standalone retainage management module. For multi-year commercial construction projects, the system handles ongoing progress billing with closeout documentation tracking.

- --

## 4. QuickBooks integration is limited to Desktop only

* *Siteline integrates only with QuickBooks Enterprise Contractor (Desktop)—not QuickBooks Online.** The integration uses manual file-based transfers:

- **Inbound:** Upload SOVs via CSV spreadsheet templates
- **Outbound:** Download invoice information as IIF files, then manually import into QuickBooks

There is **no real-time or scheduled automatic sync**. Per Siteline's documentation, "QuickBooks Enterprise is primarily a desktop application, so Siteline's integration relies on file-based transfers." This is the shallowest integration among Siteline's accounting connections. Organizations using QuickBooks Online would need to evaluate alternative workflows or consider the deeper integrations available with Sage 300CRE, Viewpoint Vista/Spectrum, Foundation, or CMiC.

- --

## 5. Security documentation is notably absent from public sources

* *Two-factor authentication (2FA) is not publicly documented.** No information about availability, requirements, or supported methods appears on Siteline's website, FAQ, privacy policy, or third-party review sites.

* *SOC 2 compliance status is unknown.** No certification (Type I or Type II) was found in public documentation, trust centers, or compliance databases. Siteline's privacy policy mentions "a variety of industry-standard security technologies and procedures" but provides no specifics on encryption standards, key management, or backup procedures.

| Security Feature | Status |
|-----------------|--------|
| 2FA | Not publicly documented |
| SOC 2 certification | None publicly found |
| Encryption at rest | Not specified |
| Encryption in transit | Not specified |
| Access controls (RBAC) | Limited documentation |

* *Recommendation:** Contact Siteline directly at  to request a security questionnaire, SOC 2 report (if available), or Master Service Agreement with security details. The CEO's background as a former Stripe product lead suggests reasonable security practices may exist but simply aren't publicly documented—common for younger SaaS companies serving the construction industry.

- --

## 6. Month lockdown functionality is not documented

* *No period closing or month lockdown feature** for investor reporting or audit purposes was found in any Siteline documentation, FAQ, or feature pages. The platform handles monthly billing workflows and tracks billing by periods for progress billing, but no explicit "lock" or "close period" functionality is publicly documented.

Organizations requiring immutable historical records for audits should verify this capability directly with Siteline during the sales process, as this is a common requirement for construction companies with external investors or regulatory audit requirements.

- --

## 7. File attachments are supported with unspecified limits

Siteline confirms users can **"attach any necessary backup documentation"** to pay applications. The platform supports compliance document uploads including Certificates of Insurance, certified payroll, contracts, and bond requirements. Vendors can upload documents without creating a Siteline account.

* *Not documented publicly:** Specific supported file types, file size limits, storage limits, and the full range of attachment points (projects, invoices, line items). Based on use cases described, common construction documents (PDFs, images) are supported, but specifications should be confirmed during evaluation.

- --

## 8. Pricing is custom-quoted with no setup fees

Siteline uses a **subscription-based pricing model with custom quotes** based on three factors: product usage, billing volume, and integration needs. No pricing is published on their website.

| Pricing Element | Details |
|----------------|---------|
| Model | Custom quote required |
| Setup/implementation fees | None reported |
| Free trial | Not offered |
| Freemium | Not offered |
| Per-user pricing | Not confirmed (pricing customized) |

User reviews describe Siteline as having an "accessible economic price point" that works "for smaller clients as well as the big fish." One reviewer compared alternatives as "too complex and too expensive," suggesting competitive positioning. Siteline does not charge per user, "which means your entire team can collaborate without limits."

- --

## 9. Implementation is rapid with dedicated onboarding support

Siteline emphasizes fast deployment with **most customers operational within 2 weeks**:

| Implementation Phase | Timeline |
|---------------------|----------|
| Account configuration | Under 2 hours |
| First pay app synced | As fast as 3 days |
| Fully operational | Within 2 weeks |
| Full onboarding complete | Within 2 billing cycles |
| Handoff to Customer Success | By month 6 |

* *Onboarding support includes:**

- **Dedicated Onboarding Manager** for the first 6 months
- Bulk import of existing projects (handled by Siteline)
- Live online training sessions, video tutorials, webinars, and documentation
- Training time: approximately 10 minutes for PMs to learn basic billing, under 2 hours total for power users
- Customer Success handoff with ongoing support (phone, chat, email)

User reviews universally praise implementation: "The implementation was great and went very smoothly with Siteline's assistance." The Washington Iron Works case study reports syncing their first pay app within 3 business days with less than 2 hours of training. **98% customer retention rate** suggests strong post-implementation satisfaction.

- --

## 10. Construction-specific features are comprehensive across SOV, change orders, and lien waivers

* *Schedule of Values management** integrates with the billing workflow. Users can update SOVs in Siteline, and approved change orders can be easily applied to corresponding SOVs. The system is optimized for managing and updating existing SOVs rather than detailed SOV creation from scratch—it's primarily a billing tool, not a full estimating system.

* *Change order tracking is comprehensive:**

- Pre-filled change order request forms generated according to GC requirements
- Centralized change order log showing status (draft, submitted, requires revisions, rejected)
- Built-in rate tables for pricing consistency
- Real-time visibility into pending approvals
- Integration with billing to automatically incorporate approved changes
- Permission controls prevent adding unapproved change orders to SOV

One case study reports VanKirk Electric saves 16 hours per month managing 60+ change orders—reduced from 15 minutes per change order to under 1 minute.

* *Lien waiver management supports all four standard types:**

- Conditional Progress and Conditional Final
- Unconditional Progress and Unconditional Final

The system auto-generates unconditional waivers when invoices are marked paid and includes a **Lien Waiver Tracker** showing real-time status across lower-tier contractors. Automated workflows generate, send, collect signatures, and send reminders—no account required for lower-tier signing. Users report collecting "waivers 6x faster" with Siteline. One reviewer stated: "Their form fill process is second to none. It transformed the way my company processed billings, tracked cash flow, handled contract compliance, and managed our lien waivers."

- --

## Key evaluation considerations

* *Strengths for construction services companies:**

- Deep GC Pay and Textura integrations with one-click submission
- Comprehensive lien waiver management (highly praised in reviews)
- Rapid 2-week implementation with dedicated support
- 15,000+ pre-loaded GC forms
- Strong change order tracking
- 98% customer retention suggests high satisfaction

* *Areas requiring verification or caution:**

- QuickBooks Online is not supported—only Desktop Enterprise
- Security certifications and 2FA must be verified directly
- Procore integration has reported issues
- Month lockdown for audits not documented
- Custom pricing requires sales engagement

* *Bottom line:** Siteline is well-suited for trade contractors seeking to streamline billing to major GC portals (especially Textura and GC Pay) with strong lien waiver automation. Organizations using QuickBooks Online, requiring documented SOC 2 compliance, or needing period lockdown for investor reporting should confirm these capabilities before proceeding.
