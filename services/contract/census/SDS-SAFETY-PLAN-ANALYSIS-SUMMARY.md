# SDS & Safety Plan Email Analysis Summary

**Date:** January 28, 2026  
**Analysis Period:** Historical emails from census database  
**Purpose:** Understand patterns to create standard process

---

## Key Findings

### Email Volume

- **6 emails FROM <kendra@desertservices.net>** (sent by Kendra)
- **100 emails TO <kendra@desertservices.net>** (requests received)
- **Total:** 106 emails related to SDS/Safety Plans

### Request Patterns

**Common Request Phrases:**

- "provide" - 2 emails
- "send" - 10 emails  
- "need" - 63 emails
- "request" - 44 emails
- "please" - 40 emails

**Top Sender Domains (Requesters):**

1. `desertservices.net` - 60 emails (internal forwards)
2. `texturacorp.com` - 15 emails
3. `inbox.levelset.com` - 3 emails
4. `Weisbuilders.com` - 2 emails
5. `msconstruction.com` - 2 emails
6. `upwindcompanies.com` - 2 emails
7. `embrey.com` - 2 emails

**Top Recipient Domains (When Kendra Sent):**

1. `willmeng.com` - 2 emails
2. `desertservices.net` - 2 emails (internal)
3. `concordinc.com` - 1 email
4. `lgedesignbuild.com` - 1 email

### Sample Requests Found

1. **From A.R. Mays Construction (Oct 2025):**
   - Subject: "Request for Safety Data Sheets (SDS) – Due by 10/15/2025"
   - Project: Estrella Self Storage
   - Requested via Procore portal

2. **From Willmeng Construction (Dec 2024):**
   - Subject: "RE: Palm Valley B and C subcontract"
   - Request: "Please send me the safety plan for signature"
   - Kendra sent: "Subcontractor Safety Management Plan October 26.pdf"

3. **From Willmeng Construction (Oct 2024):**
   - Subject: "RE: Formation Park 10 Safety Docs"
   - Request: "send over the project contact list and site specific safety plan"
   - Also requested SDS sheets

4. **From LGE Design Build (Jan 2026 - Today):**
   - Subject: "Skyport at Redfield Hangars - Desert Services"
   - Request: "Can you please provide Safety Plan & SDS sheet for Skyport"
   - From: Alisia Benavidez <abenavidez@lgedesignbuild.com>

### Document Types Sent

From the emails analyzed, Kendra sent:

- Subcontractor Safety Management Plans (PDF)
- Safety Plans (general and project-specific)
- SDS Sheets (referenced but not always attached in email body)

### Observations

1. **Request Frequency:** High volume (100+ requests), indicating this is a common contract requirement

2. **Request Sources:**
   - Direct emails from GC Project Coordinators
   - Contractor portals (Procore, Levelset)
   - Internal team forwards

3. **Response Pattern:**
   - Kendra typically responded with PDF attachments
   - Some emails forwarded internally for document location
   - Standard documents reused across projects

4. **Project Linking:**
   - Most emails in database don't have project_name populated
   - Suggests need for better project identification in requests

5. **Document Storage:**
   - References to "data drive" and SharePoint
   - Some documents may have been lost in migration ("was it not moved over?")

---

## Recommendations

### Immediate Actions

1. ✅ **Create standard process document** (completed)
2. ✅ **Document storage locations** (identified)
3. ⚠️ **Audit current document storage** - verify all safety plans are accessible
4. ⚠️ **Set up centralized location** - `/Company Documents/Safety/` in SharePoint

### Process Improvements

1. **Email Templates:** Create reusable templates for common responses
2. **Tracking:** Log all requests/responses for future reference
3. **Documentation:** Ensure project folders have Safety subfolder
4. **Training:** Onboard billing team on process and document locations

### System Improvements

1. **Project Identification:** Better linking of emails to projects in census DB
2. **Document Index:** Create index of where standard documents are stored
3. **Automation:** Consider automated response for standard requests
4. **Portal Integration:** Streamline portal request handling

---

## Files Created

1. **Full Process Document:** `/docs/processes/sds-safety-plan-requests.md`
2. **Quick Reference:** `/docs/processes/sds-safety-plan-quick-reference.md`
3. **Analysis Data:** `/services/contract/census/sds-safety-plan-analysis.json`
4. **Search Script:** `/services/contract/census/search-sds-safety-plans.ts`

---

## Next Steps

1. Review process documents with billing team
2. Audit SharePoint for safety document locations
3. Set up centralized storage if needed
4. Create email templates in template system
5. Test process with next request
6. Refine based on feedback

---

## Questions for Team

1. Where are the current standard safety plans stored?
2. Are there project-specific safety plans that need to be catalogued?
3. Who should have access to the centralized safety document folder?
4. Should we create a tracking spreadsheet/log for requests?
5. Do we need different templates for different types of requests?
