# SDS & Safety Plan Requests - ACTUAL FINDINGS

Date: January 28, 2026  
Analysis Method: Direct SQL queries on census database

---

## ✅ What We Actually Found

### Actual Documents That Were Sent

Based on email attachment analysis, these are the REAL documents that have been sent to contractors:

| Document Name | Times Sent | Sent By |
|--------------|------------|---------|
| Desert Services - Safety Manual.pdf | 6+ | Dawn Wagner |
| Safety - Desert Services Heat Illness Program.pdf | 7 | Dawn Wagner |
| Safety - Desert Services HASP 4_2025.pdf | 6 | Dawn Wagner |
| Desert Services, LLC - Workplace Safety and Risk Management (USNI).pdf | 6 | Dawn Wagner |
| Safety - Desert_Services_Emergency_Contact_List_Final.pdf | 5 | Dawn Wagner |
| Safety - Desert Services SDS List.pdf | 5 | Dawn Wagner |
| Subcontractor Safety Management Plan October 26.pdf | 1 | Kendra Ash |
| Chemical List & SDS.pdf | 2 | Dawn Wagner |

---

## 📧 Actual Email Responses

### Dawn Wagner's Style (Most Common)

Example 1:

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

Example 2:

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

Key Points:

- Very brief - just "Please see attached"
- Includes full contact info
- Sometimes mentions if physical copy will be delivered

### Kendra's Style

Example:

```text
Subject: Subcontract 3870-004 Hayden & 101 Ph 1 Waterline, Desert Services

[Empty body - just attachment]

Attachment: Subcontractor Safety Management Plan October 26.pdf
```

Key Points:

- Sometimes sends with NO body text
- Just the attachment
- Subject line includes project name

---

## 📁 Storage Locations

### Where Documents Are Currently Stored

MinIO Storage (Email Attachments):

- Path: `email-attachments/{emailId}/{attachmentId}/{filename}`
- These are COPIES of sent attachments
- NOT the source documents

Example Paths Found:

- `email-attachments/70408/AAMkADMxZmNlMzJjLTI3OTQtNGU2OC1iZjYxLTlmMWM3ZDE0MDk2MgBGAAAAAAChNrovTK5cS6ycU3S62FDoBwBZsp1gJsWQQ4gIbhBqJosMAAAAAAEMAABZsp1gJsWQQ4gIbhBqJosMAABLsNQcAAABEgAQAMrN71uYPHxOjGVeOr2OJ8c=/Subcontractor Safety Management Plan October 26.pdf`

### Where Source Documents SHOULD Be

Need to Locate:

- SharePoint: `/Shared Documents/Company Documents/Safety/` (recommended)
- SharePoint: `/Prequals/` folders (check contractor-specific folders)
- SharePoint: `/Insurance Certs/` (sometimes safety docs stored here)
- File system: Check shared drives or local storage

ACTION ITEM: Find the actual source files for these 8 documents so they can be reused.

---

## 🔍 What Was Actually Requested

### Common Request Patterns

From Email Analysis:

- "Can you please provide Safety Plan & SDS sheet for [Project]"
- "Please send me the safety plan"
- "Request for Safety Data Sheets (SDS) – Due by [date]"
- "Need safety documentation for [project]"

### Top Requesters

Domains that request most frequently:

1. `desertservices.net` (internal forwards)
2. `texturacorp.com` (15 requests)
3. `lgedesignbuild.com` (like today's Skyport request)
4. `willmeng.com`
5. `arco1.com`
6. `msconstruction.com`

---

## 📊 Summary

### What We Know

✅ 8 specific documents that are actually sent  
✅ Email response style - brief, professional  
✅ Who sends them - Dawn (most), Kendra (some)  
✅ Storage in MinIO - copies of sent attachments  

### What We Need

❌ Source file locations - where are the originals stored?  
❌ SharePoint structure - are they organized somewhere?  
❌ File system location - check shared drives  

---

## 🎯 Next Steps

1. Locate source documents - Find where these 8 PDFs are actually stored
2. Organize in SharePoint - Set up `/Company Documents/Safety/` folder
3. Create quick access - Make documents easily accessible to billing team
4. Test process - Use actual documents for next request (Skyport)

---

## SQL Queries Used

```sql
-- Find actual documents sent
SELECT DISTINCT a.name, COUNT(*) as count 
FROM attachments a 
JOIN emails e ON a.email_id = e.id 
WHERE (e.from_email LIKE '%kendra@desertservices.net%' 
   OR e.from_email LIKE '%dawn@desertservices.net%') 
AND (a.name LIKE '%safety%' OR a.name LIKE '%SDS%' OR a.name LIKE '%HASP%') 
AND a.storage_path IS NOT NULL 
GROUP BY a.name 
ORDER BY count DESC;

-- Find email responses with attachments
SELECT e.id, e.subject, e.from_email, e.to_emails, 
       substr(e.body_preview, 1, 500) as body_sample, a.name 
FROM emails e 
JOIN attachments a ON e.id = a.email_id 
WHERE (e.from_email LIKE '%dawn@desertservices.net%') 
AND a.name LIKE '%Safety%' 
AND a.storage_path IS NOT NULL 
ORDER BY e.received_at DESC 
LIMIT 10;
```
