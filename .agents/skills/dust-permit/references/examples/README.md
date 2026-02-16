# Dust Permit Request Patterns

Summary of how dust permit requests come in via email. These examples inform the workflow automation.

## Folder Structure

```text
dust-permit-examples/
  new-permit/
    desert-sky-nrp-group.md         # Basic new permit request
    modera-pv-mill-creek.md         # Urgent/rush new permit request
  renewal/
    holder-north-parcel.md          # Proactive renewal with full info
    alta-goldwater-wood-partners.md # Renewal with existing relationship
  modification/
    banner-verrado-ryan.md          # Modification triggered by inspection
    67-flats-weis-contact-update.md # Contact update that became renewal
  county-notification/
    submission-confirmation.md           # Portal submission received
    payment-confirmation-pointandpay.md  # Payment processed
    permit-issued-sun-health.md          # County approval - Sun Health La Roma
    permit-issued-sun-health-la-loma.md  # County approval - Sun Health La Loma
    permit-issued-banner-verrado.md      # County approval - Ryan Companies
    permit-issued-67-flats.md            # County approval - Weis Builders (renewal)
    permit-issued-innovative-commercial.md # County approval - Bjerk Builders
    permit-revision-approved-estrella-spring.md # Revision approved - Weis
    permit-rejected-edgecor-north-parcel.md # County rejection - wrong app type
  closure/
    67-flats-phase1-weis.md              # Closure - Weis Builders
    juniper-square-weis.md               # Closure - Weis Builders
    levine-self-storage-abernethy.md     # Closure - Abernethy Holding
    estrella-spring-canyon-trails-weis.md # Closure - Weis Builders
  internal-handoff/
    jlb-lumberyard-bulleted-tasks.md  # Lacie's bulleted task assignment
    jlb-lumberyard-quote-handoff.md   # Sales-to-operations quote handoff
```json

## Request Types Found

### 1. NEW PERMIT REQUEST (2 examples)

**Example A:** Desert Sky - NRP Group (Jan 2026)
- **Source:** External contractor asks Rick, Rick forwards to Chi
- **Trigger:** Contractor needs hydrant meter, requires dust permit number
- **Info Provided:** Site address only
- **Subject Pattern:** "Fw: Desert Sky: Dust Control Permit"

**Example B:** Modera PV - Mill Creek Residential (Dec 2025 - Jan 2026)
- **Source:** External contractor emails team with HIGH priority
- **Trigger:** Urgent need before contract finalized
- **Info Provided:** Project name, attached NOI
- **Subject Pattern:** "Modera PV - Dust Permit Needed"
- **Special:** Rush request, willing to pay rush fees

### 2. RENEWAL REQUEST (2 examples)

**Example A:** Holder Construction - North Parcel (Dec 2025)
- **Source:** External contractor emails Lacie/Jared/Herve directly
- **Trigger:** Existing permit expiring (1/29/2026)
- **Info Provided:**
  - Site address: 9903 E. Elliott Rd MESA, AZ 85212
  - Parcel number: 304-31-002Q
  - Facility ID: F019198
  - Expiration date
- **Subject Pattern:** "Dust Control Renewal"

**Example B:** Alta Goldwater (5th & Goldwater) - Wood Partners (Jan 2026)
- **Source:** External contractor emails Jayson/Kendra
- **Trigger:** Existing permit expiring (1/15/2026)
- **Info Provided:**
  - Project alias (5th & Goldwater = Alta Goldwater)
  - Current permit attached
  - Reference to existing PO
- **Subject Pattern:** "5th & Goldwater: Dust Control Permit Renewal"

### 3. MODIFICATION REQUEST (1 example)

**Example:** Banner Verrado - Ryan Companies (Jan 2026)
- **Source:** External contractor (Darin Krier @ Ryan) via Lacie
- **Trigger:** County inspection violation + site changes
- **Info Provided:**
  - What to remove (paved parking lot)
  - What to add (dirt storage area)
  - Measurements (1300 ln ft x 650 ln ft)
  - BMP work needed (compost sock)
- **Subject Pattern:** "Dust control modification at [Project]"
- **Resolution:** 9.5 acres → 6.89 acres, no additional cost

### 4. CONTACT UPDATE REQUEST (1 example)

**Example:** 67 Flats - Weis Builders (May 2025 - Jan 2026)
- **Source:** External contractor emails Jared, Chi added
- **Trigger:** Staff change on project, evolved into renewal
- **Info Provided:**
  - New contact name: Art Maese (Superintendent)
  - New contact email: [artmaese@weisbuilders.com](mailto:artmaese@weisbuilders.com)
  - New contact phone: 4804907324
  - Company: WD Construction
- **Subject Pattern:** "[Project] - Dust Permit Contact"

### 5a. COUNTY NOTIFICATION - SUBMISSION CONFIRMATION

**Source:** [AQDIMPACT@maricopa.gov](mailto:AQDIMPACT@maricopa.gov)
**Subject:** "Dust and Miscellaneous Portal Submission Confirmation"

Sent immediately after submitting application through the county portal.
- Confirms receipt of application
- No Application ID yet (assigned after processing)
- Reminder that payment required before processing
- First step in permit lifecycle

### 5b. COUNTY NOTIFICATION - PAYMENT CONFIRMATION

**Source:** [noreply@pointandpay.com](mailto:noreply@pointandpay.com)
**Subject:** "Your Maricopa Air Quality payment has been approved"

Sent after successful payment through PointAndPay.
- Contains Confirmation ID and Invoice Number
- Payment amount and card last 4 digits
- Links to permit application via Invoice Number
- Second step in permit lifecycle

**Note:** Older payments may come from [donotreply@fisgov.com](mailto:donotreply@fisgov.com) with subject "Maricopa County- Air Quality - Payment Confirmation"

### 5c. COUNTY NOTIFICATION - PERMIT ISSUED (5 examples)

**Example A:** Sun Health La Roma Campus (Jan 14, 2026)
- **Application ID:** D0064026 | **Facility ID:** F039203
- **Address:** 14100 S DENNY WAY LITCHFIELD PARK, AZ 85340
- **Recipients:** chi@, DustPermits@

**Example B:** Sun Health La Loma Campus (Jan 12, 2026)
- **Application ID:** D0063234 | **Facility ID:** F039203
- **Address:** 14154 W DENNY BLVD LITCHFIELD PARK, AZ 85340
- **Recipients:** chi@, DustPermits@
- **Note:** Same Facility ID as La Roma - different campus location

**Example C:** Banner Verrado - Ryan Companies (Jan 14, 2026)
- **Application ID:** D0064052 | **Facility ID:** F044997
- **Address:** Section 6, 1N, 2W BUCKEYE, AZ 85001
- **Recipients:** jared@, DustPermits@

**Example D:** 67 Flats Phase 1 - Weis Builders (Jan 9, 2026)
- **Application ID:** D0063827 | **Facility ID:** F050044
- **Address:** 6548 N 67TH AVE MCR: 1773-42 GLENDALE, AZ 85303
- **Recipients:** DustPermits@, [aaronsmith@weisbuilders.com](mailto:aaronsmith@weisbuilders.com), jared@
- **Note:** RENEWAL - same Facility ID, new Application ID after previous closure

**Example E:** Innovative Commercial Building - Bjerk Builders (Jan 7, 2026)
- **Application ID:** D0063651 | **Facility ID:** F055956
- **Address:** 4121 W Innovative Dr MCR: 537-26 Phoenix, AZ 85086
- **Recipients:** chi@, DustPermits@, [scott@bjerkbuilders.com](mailto:scott@bjerkbuilders.com)

### County Notification Pattern (Issued)

- **Source:** Automated from [no-reply@maricopa.gov](mailto:no-reply@maricopa.gov)
- **Subject:** "Dust Permit Issued"
- **NOT a request** - triggers internal workflow to notify contractor
- Contains: Application ID, Facility ID, Address, Compliance requirements
- Contractor contacts often copied directly

### 5d. COUNTY NOTIFICATION - REVISION APPROVED (1 example)

**Example:** Estrella Spring at Canyon Trails - Weis Builders (Aug 8, 2023)
- **Application ID:** D0045802 | **Facility ID:** F048564
- **Address:** Section 12, 1N, 2W GOODYEAR, AZ 85338
- **Recipients:** Mike@, [aaronsmith@weisbuilders.com](mailto:aaronsmith@weisbuilders.com)

### County Notification Pattern (Revision)

- **Source:** Automated from [no-reply@maricopa.gov](mailto:no-reply@maricopa.gov)
- **Subject:** "[Contractor] - [Project Name] Revision"
- Body content identical to permit issued notification
- Same Facility ID retained, new Application ID
- Triggered by: acreage changes, site modifications, BMP updates

### 5e. COUNTY NOTIFICATION - PERMIT REJECTED (1 example)

**Example:** Edgecor-North Parcel (Dec 18, 2025)
- **Application ID:** D0063187
- **Project Name:** Edgecor-North Parcel
- **Rejection Reason:** "A revision application can not renew a permit. A new application and fee must be submitted."
- **Recipients:** DustPermits@, jared@

### County Notification Pattern (Rejected)

- **Source:** Automated from [no-reply@maricopa.gov](mailto:no-reply@maricopa.gov)
- **Subject:** "Air Quality Dust Permit Rejected"
- **REQUIRES ACTION** - triggers resubmission workflow
- Contains: Application ID, Project Name, Rejection Reason
- No Facility ID (rejected before assignment)

### 6. INQUIRY (not a request)

**Example:** Pavilion at Camelback - Catamount (Jan 2026)
- **Source:** GC asking all subs for registration numbers
- **Not an action item** - just providing registration info
- **Subject Pattern:** "Maricopa County Dust Control Permit-Subcontractor Registration Number"

### 7. PERMIT CLOSURE (4 examples)

**Example A:** 67 Flats Phase 1 - Weis Builders (Jan 9, 2026)
- **Application ID:** D0058823 | **Facility ID:** F050044
- **Facility Name:** 67 Flats - Phase 1
- **Recipients:** DustPermits@, [aaronsmith@weisbuilders.com](mailto:aaronsmith@weisbuilders.com), jared@
- **Note:** Later renewed - see county-notification/permit-issued-67-flats.md

**Example B:** Juniper Square - Weis Builders (Jan 9, 2026)
- **Application ID:** D0055863 | **Facility ID:** F050045
- **Facility Name:** Juniper Square
- **Recipients:** DustPermits@, [aaronsmith@weisbuilders.com](mailto:aaronsmith@weisbuilders.com), jared@
- **Note:** Sequential Facility ID to 67 Flats - same contractor, concurrent projects

**Example C:** Levine Self Storage - Abernethy Holding (Jan 5, 2026)
- **Application ID:** D0056240 | **Facility ID:** F047429
- **Facility Name:** Levine Self Storage
- **Recipients:** DustPermits@, [JM@abernatheyholdingco.com](mailto:JM@abernatheyholdingco.com), jared@

**Example D:** Estrella Spring at Canyon Trails - Weis Builders (Dec 19, 2025)
- **Application ID:** D0059884 | **Facility ID:** F048564
- **Facility Name:** Estrella Spring at Canyon Trails
- **Recipients:** DustPermits@, [aaronsmith@weisbuilders.com](mailto:aaronsmith@weisbuilders.com), jared@

### Permit Closure Pattern

- **Source:** Automated from [no-reply@maricopa.gov](mailto:no-reply@maricopa.gov)
- **Subject:** "Air Quality Dust Permit Closed"
- **NOT a request** - triggers internal workflow to close out project
- Contains: Application ID, Facility ID, Re-application instructions
- Shorter than issuance notifications - no compliance requirements

### 8. INTERNAL HANDOFF (2 examples)

These are **internal workflow patterns** - not external requests. They show how work gets delegated within Desert Services after sales or external requests come in.

**Example A:** JLB Lumberyard - Bulleted Task Assignment (Jan 2026)
- **Source:** Lacie forwards external approval to ops team
- **Type:** Task delegation with specific action items
- **Format:** Brief bulleted list at top, full thread below
- **Lacie's message:**
  > HI Team,
  > - We need to order the signs below, and get the swppp narrative started
  > - One restroom with 1x weekly service for one month
  > - One handwash station with 1x weekly service for one month
  > Delivered 1/29.
- **Subject Pattern:** "FW: [Project Name]"
- **Key insight:** Dust permit often mentioned as attachment, not primary request

**Example B:** JLB Lumberyard - Quote Handoff (Jan 2026)
- **Source:** Lacie forwards Rick's sales thread to ops team
- **Type:** Sales-to-operations handoff
- **Format:** One-liner context, full sales thread below
- **Lacie's message:**
  > Here are the quotes. I will keep you all updated on when they are ready for the fence and swppp
- **Subject Pattern:** "FW: [Person Name]" (original sales contact)
- **Key insight:** Subject may be person name, not project name

### Internal Handoff Characteristics

- **Sender:** Usually Lacie (Operations Manager)
- **Recipients:** Jayson, Kendra, Kerin, Chi (processing team)
- **Trigger words:** "We need to...", "Here are the quotes", "when they are ready"
- **Staged execution:** Work often waits for contractor "ready" signal
- **Dust permit context:** Often embedded in larger SWPPP/site services requests

## Entry Points

Requests come in through:
1. **Rick** - forwards external requests for new permits (business dev)
2. **Lacie** - receives renewals and modifications from field
3. **Jared** - receives direct requests from existing clients
4. **Kendra** - routes requests and coordinates
5. **Kerin** - internal checks and verifications
6. **Chi** - gets added for permit processing
7. **[DustPermits@desertservices.net](mailto:DustPermits@desertservices.net)** - receives county notifications

## Key Data Points for Automation

For any dust permit request, extract:
- Request type (new, renewal, modification, contact update, closure)
- Project name (and aliases)
- Site address
- Contractor/Account name
- Contact info (name, email, phone)
- For renewals: Facility ID, expiration date, parcel number
- For modifications: What's changing, measurements, acreage
- For new permits: NOI attachment, rush/urgency level

## Subject Line Patterns

**External Requests:**
- New permit: "Dust Control Permit", "Dust Permit Needed"
- Renewal: "Dust Control Renewal", "Permit Renewal"
- Modification: "Dust control modification at..."
- Contact update: "Dust Permit Contact"

**County Notifications:**
- Submission received: "Dust and Miscellaneous Portal Submission Confirmation"
- Payment approved: "Your Maricopa Air Quality payment has been approved"
- Permit issued: "Dust Permit Issued"
- Revision approved: "[Contractor] - [Project Name] Revision"
- Permit rejected: "Air Quality Dust Permit Rejected"
- Permit closed: "Air Quality Dust Permit Closed"

**Internal Handoffs:**
- Task assignment: "FW: [Project Name]"
- Quote handoff: "FW: [Person Name]" or "FW: [Project Name]"

**Ignore:**
- Inquiry: "Subcontractor Registration Number"
