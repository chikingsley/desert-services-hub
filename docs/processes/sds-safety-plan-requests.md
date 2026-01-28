# Standard Process: SDS & Safety Plan Requests

Last Updated: January 28, 2026  
Owner: Contract Billing Team  
Status: Active

---

## Overview

This document outlines the standard process for handling requests for Safety Data Sheets (SDS) and Safety Plans that are contract-required items. These requests typically come from General Contractors (GCs) or Project Coordinators as part of contract compliance requirements.

---

## Who Handles This?

Primary Handler: Contract Billing Team (initially focused on billing, but will handle document distribution)

Backup/Support:

- Operations Team (for project-specific safety plans)
- Management (for escalated issues)

Note: Previously handled by Kendra. Transitioning to Contract Billing Team as primary handler.

---

## Common Request Types

Based on email analysis, requests typically fall into these categories:

1. Safety Data Sheets (SDS) - Required for chemicals/materials used on site
2. Safety Plans - Project-specific or general company safety management plans
3. Subcontractor Safety Management Plans - Required by some GCs
4. Site-Specific Safety Plans (SSSP) - For particular projects (e.g., "MT Builders SSSP.pdf" for Magnolia Indian School project)

---

## Document Storage Locations

### Standard Company Documents (Reusable)

ACTUAL DOCUMENTS FOUND IN EMAIL HISTORY:

Based on analysis of sent emails, these are the actual documents that have been sent:

Most Frequently Sent Documents:

1. Desert Services - Safety Manual.pdf (sent 6+ times)
2. Safety - Desert Services Heat Illness Program.pdf (sent 7 times)
3. Safety - Desert Services HASP 4_2025.pdf (sent 6 times)
4. Desert Services, LLC - Workplace Safety and Risk Management (USNI).pdf (sent 6 times)
5. Safety - Desert_Services_Emergency_Contact_List_Final.pdf (sent 5 times)
6. Safety - Desert Services SDS List.pdf (sent 5 times)
7. Subcontractor Safety Management Plan October 26.pdf (sent by Kendra)
8. Chemical List & SDS.pdf (sent 2 times)

Storage Locations:

Reference Documents (Copied to Processes Folder):

- All documents have been copied to: `docs/processes/safety-documents/`
- These are the actual PDFs that have been sent to contractors
- Use these as reference when responding to requests

Current Storage (from email attachments):

- Files are stored in MinIO: `email-attachments/{emailId}/{attachmentId}/{filename}`
- These are copies of sent attachments

Where Source Documents Should Be:

- Recommended: SharePoint `/Shared Documents/Company Documents/Safety/`
- Check: `/Prequals/` folders (may contain safety documentation)
- Check: `/Insurance Certs/` (sometimes safety docs stored here)
- Project-specific: `/Projects/[Status]/[Project Name]/Safety/` (if project-specific)

Available Reference Documents:

- `safety-documents/Desert_Services_-_Safety_Manual.pdf` (most common)
- `safety-documents/Safety_-_Desert_Services_HASP_4_2025.pdf`
- `safety-documents/Safety_-_Desert_Services_Heat_Illness_Program.pdf`
- `safety-documents/Safety_-_Desert_Services_SDS_List.pdf`
- `safety-documents/Subcontractor_Safety_Management_Plan_October_26.pdf`
- `safety-documents/Chemical_List___SDS.pdf`
- And 9 more documents (see `safety-documents/` folder)

### Project-Specific Documents

For project-specific safety plans or site-specific requirements:

Location: SharePoint

- `/Projects/[Status]/[Project Name - Contractor]/Safety/`
- Or: `/Projects/[Status]/[Project Name - Contractor]/Contract Documents/`

---

## Process Workflow

### Step 1: Receive Request

Common Request Patterns:

- Email subject: "Safety Plan & SDS sheet for [Project Name]"
- Email body: "Can you please provide Safety Plan & SDS sheet for [Project]"
- May come through:
  - Direct email to billing team
  - Forwarded from operations
  - Through contractor portals (Procore, Levelset, etc.)

Action Items:

- [ ] Identify project name from request
- [ ] Identify contractor/GC from sender email domain
- [ ] Note any specific requirements or deadlines mentioned
- [ ] Check if this is a new request or follow-up

### Step 2: Locate Documents

Checklist:

- [ ] Search SharePoint for project-specific safety plan
- [ ] Check if project folder exists: `/Projects/[Status]/[Project Name]/`
- [ ] Locate standard company safety plan (if no project-specific exists)
- [ ] Gather relevant SDS sheets for materials used on that project
- [ ] Verify document versions are current

Where to Look:

1. Reference Documents (Quick Access):
   - `docs/processes/safety-documents/` - All standard documents copied here
   - Use these PDFs directly when responding to requests

2. Project Folder (if exists):
   - `/Projects/01-Active/[Project Name]/Safety/`
   - `/Projects/01-Active/[Project Name]/Contract Documents/`
   - Check for site-specific safety plans (SSSP) in project folders

3. Company Standard Documents:
   - `/Shared Documents/Company Documents/Safety/`
   - `/Prequals/` (check contractor-specific folders)

4. Email History:
   - Search sent emails for previous safety plan sends to same contractor
   - Check if documents were sent before for similar projects
   - Look for site-specific plans (SSSP) in project-related emails

### Step 3: Prepare Response

Documents to Include (Based on Actual Usage):

- [ ] Desert Services - Safety Manual.pdf (most common - sent 6+ times)
- [ ] Safety - Desert Services HASP 4_2025.pdf (if HASP required)
- [ ] Safety - Desert Services Heat Illness Program.pdf (often included)
- [ ] Safety - Desert Services SDS List.pdf (for SDS requests)
- [ ] Subcontractor Safety Management Plan October 26.pdf (if subcontractor plan needed)
- [ ] Chemical List & SDS.pdf (if specific chemicals mentioned)
- [ ] Safety - Desert_Services_Emergency_Contact_List_Final.pdf (sometimes included)
- [ ] Project-specific safety plan (if exists for that project)

Email Preparation:

- [ ] Attach all required documents
- [ ] Use professional email template (see below)
- [ ] Include project name in subject line
- [ ] CC appropriate team members if needed

### Step 4: Send Response

Email Template:

```text
Subject: Safety Plan & SDS Sheets - [Project Name]

Hi [Recipient Name],

Please find attached the requested Safety Plan and SDS sheets for [Project Name].

Attached Documents:
- [Document Name 1]
- [Document Name 2]
- [etc.]

If you need any additional documentation or have questions, please let me know.

Best regards,
[Your Name]
Desert Services
[Your Email]
[Your Phone]
```

Send Checklist:

- [ ] All attachments included
- [ ] Project name correct in subject and body
- [ ] Recipient email address verified
- [ ] CC appropriate internal team members (if needed)
- [ ] Professional tone and formatting

### Step 5: Document & Track

After Sending:

- [ ] Save sent email to project folder in SharePoint (if project exists)
- [ ] Note in project tracking system (Monday.com/Notion) that safety docs were sent
- [ ] Update any internal tracking spreadsheet/log
- [ ] File copy of sent documents to project folder for future reference

---

## Email Templates

### Template 1: Standard Safety Plan & SDS Request Response

ACTUAL EMAIL EXAMPLES FROM DAWN:

Example 1 (Simple):

```text
Subject: RE: Homestead at Lehi Crossing - Contract 4321 - Desert Services

Please see attached. Logan will be dropping the manual off.

Thank you
Dawn Wagner
480-513-8986
P.O. Box 236
Scottsdale, AZ 85252
800 N Mary Street
Tempe, AZ 85288
```

Example 2 (Even Simpler):

```text
Subject: RE: Prequalification Renewal Required

Please see attached

Thank you
Dawn Wagner
480-513-8986
P.O. Box 236
Scottsdale, AZ 85252
800 N Mary Street
Tempe, AZ 85288
```

Template (Based on Actual Usage):
Subject: `RE: [Original Subject]` or `Safety Plan & SDS Sheets - [Project Name]`

Body:

```text
Please see attached.

Thank you
[Your Name]
Desert Services
[Your Phone]
[Your Address]
```

Note: Dawn's responses are very brief - just "Please see attached" with signature. No need for lengthy explanations.

### Template 2: Kendra's Style (When Sending Subcontractor Plan)

ACTUAL EMAIL FROM KENDRA:

- Subject: `Subcontract 3870-004 Hayden & 101 Ph 1 Waterline, Desert Services`
- Body: (empty - just attachment)
- Attachment: `Subcontractor Safety Management Plan October 26.pdf`

Template:
Subject: `[Project Name] - Desert Services` or `[Original Subject]`

Body:

```text
[Can be empty - just attach the document]
```

Note: Kendra sometimes sent documents with no body text, just the attachment.

---

## Common Scenarios & Solutions

### Scenario 1: Request for Non-Existent Project

Problem: Request mentions a project name that doesn't exist in our system.

Solution:

1. Check if project name is slightly different (typos, abbreviations)
2. Search by contractor name instead
3. If truly new project, send standard company safety plan from `safety-documents/` folder
4. Note that project may need to be set up in system

### Scenario 1b: Request for Site-Specific Safety Plan (SSSP)

Problem: Contractor requests a site-specific safety plan for a particular project.

Solution:

1. Check project folder in SharePoint: `/Projects/[Status]/[Project Name]/Safety/`
2. Look for files named "SSSP" or "Site Specific Safety Plan"
3. If project-specific plan exists, send that
4. If not, check if standard company safety plan is acceptable (most contractors accept standard)
5. Some contractors provide their own SSSP template - fill it out if provided
6. Example found: "MT Builders SSSP.pdf" for Magnolia Indian School project

### Scenario 2: Multiple Requests for Same Project

Problem: Same contractor requests safety docs multiple times.

Solution:

1. Check email history - may have been sent before
2. Resend if needed, but note in response: "As previously provided..."
3. Consider if there's a better way to share (portal, folder link)

### Scenario 3: Urgent/Deadline Request

Problem: Request has tight deadline (e.g., "Due by 10/15/2025").

Solution:

1. Prioritize immediately
2. If documents aren't readily available, send what you have
3. Follow up with additional docs if needed
4. Communicate timeline if delay is expected

### Scenario 4: Portal/System Request

Problem: Request comes through contractor portal (Procore, Levelset, etc.).

Solution:

1. Download request details
2. Process same as email request
3. Upload to portal if required, or send via email with portal reference
4. Confirm receipt in portal if possible

---

## Quick Reference Checklist

For Each Request:

- [ ] Identify project and contractor
- [ ] Locate appropriate documents
- [ ] Prepare email with attachments
- [ ] Send response within 24 hours (or by deadline if specified)
- [ ] Document in project folder/system
- [ ] Track for future reference

---

## Document Maintenance

### Regular Updates Needed

- Company Safety Plan: Update annually or when policies change
- SDS Sheets: Update when new materials/products are added
- Project Safety Plans: Update per project requirements

### Storage Best Practices

- Keep master copies in centralized location
- Version control (date in filename or folder)
- Archive old versions but keep accessible
- Regular review to ensure current documents are being sent

---

## Escalation Path

If you encounter:

- Missing documents: Contact Operations or Management
- Unclear requirements: Ask requester for clarification
- Legal/compliance questions: Escalate to Management
- Technical issues (SharePoint/email): Contact IT support

---

## Training & Resources

New Team Members Should:

1. Review this document
2. Locate standard safety documents in SharePoint
3. Practice sending a test email with attachments
4. Review recent examples of sent safety plan emails
5. Understand project folder structure

Resources:

- SharePoint folder structure: `/docs/planning/sharepoint-project-structure-v2.md`
- Email templates: `/services/email/email-templates/`
- Project tracking: Monday.com / Notion

---

## Notes & Observations

From Email Analysis (Jan 2026):

Actual Documents Sent:

- Desert Services - Safety Manual.pdf - Most common (6+ times)
- Safety - Desert Services Heat Illness Program.pdf - Sent 7 times
- Safety - Desert Services HASP 4_2025.pdf - Sent 6 times  
- Desert Services, LLC - Workplace Safety and Risk Management (USNI).pdf - Sent 6 times
- Safety - Desert_Services_Emergency_Contact_List_Final.pdf - Sent 5 times
- Safety - Desert Services SDS List.pdf - Sent 5 times
- Subcontractor Safety Management Plan October 26.pdf - Sent by Kendra
- Chemical List & SDS.pdf - Sent 2 times

Who Sends These:

- Dawn Wagner (`dawn@desertservices.net`) - Sends most frequently
- Kendra Ash (`kendra@desertservices.net`) - Sent subcontractor plans

Email Response Style:

- Dawn uses very brief responses: "Please see attached" with signature
- Kendra sometimes sends with no body text, just attachment
- Both include full contact info in signature

Request Sources:

- Most requests come from GC Project Coordinators
- Common domains: `lgedesignbuild.com`, `willmeng.com`, `texturacorp.com`, `arco1.com`
- Requests often include project name in subject
- Some contractors request via portals (Procore, Levelset)
- Internal team members sometimes forward requests

Common Request Phrases:

- "Can you please provide Safety Plan & SDS sheet"
- "Please send me the safety plan"
- "Need safety documentation for [project]"
- "Request for Safety Data Sheets"

Storage:

- Documents are stored in MinIO as email attachments: `email-attachments/{emailId}/{attachmentId}/{filename}`
- NEED TO FIND: Source location of these documents in SharePoint or file system for reuse

---

## Future Improvements

Consider:

1. Automated Response System: Template-based email automation
2. Document Portal: Self-service access for contractors
3. Tracking Database: Log all requests and responses
4. Standardized Storage: Clear, consistent folder structure
5. Email Templates: Add to email template system for easy access

---

## Questions or Updates?

If you have questions about this process or suggestions for improvement, please update this document or contact the team lead.
