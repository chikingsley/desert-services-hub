# Accounts Cross-Reference Database

## Database: `contractors.db`

Single SQLite database containing contractor data from SharePoint, QuickBooks, and Monday.

## Tables

### `contractors` (372 rows)
SharePoint SWPPP contractor folders.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| name | TEXT | Folder name (e.g., "AR MAYS") |
| source | TEXT | Always "sharepoint" |
| folder | TEXT | "PROJECTS A-M" or "PROJECTS N-Z" |
| sharepoint_folder_id | TEXT | Graph API ID for n8n |
| sharepoint_folder_url | TEXT | Full SharePoint URL |

### `quickbooks_companies` (2,532 rows)
QuickBooks customer data.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| customer_id | TEXT | QB customer ID |
| company_name | TEXT | Company name |
| active_status | TEXT | Active/Inactive |
| balance | REAL | Current balance |
| balance_total | REAL | Total balance |
| main_email | TEXT | Primary email |
| main_phone | TEXT | Primary phone |
| bill_to_1, bill_to_2 | TEXT | Billing address |
| terms | TEXT | Payment terms |
| rep | TEXT | Sales rep |
| account_no | TEXT | Account number |

### `contractor_matches` (234 rows)
Links SharePoint contractors to QuickBooks companies.

| Column | Type | Description |
|--------|------|-------------|
| sharepoint_id | INTEGER | FK to contractors.id |
| quickbooks_id | INTEGER | FK to quickbooks_companies.id |
| match_score | REAL | 0-100 similarity score |
| match_status | TEXT | APPROVED/PENDING |
| notes | TEXT | Match explanation |

### `monday_contractors` (1,167 rows)
Monday.com Contractors board (Active group).

| Column | Type | Description |
|--------|------|-------------|
| monday_id | TEXT | Monday item ID |
| name | TEXT | Contractor name |
| group_title | TEXT | Monday group |
| domain | TEXT | Company website |
| sharepoint_contractor_id | INTEGER | FK to contractors.id (217 linked) |

## Views

### `contractor_spelling_compare`
Compare Monday vs SharePoint naming for matched contractors.

```sql
SELECT monday_name, sharepoint_name, spelling_status
FROM contractor_spelling_compare;
-- spelling_status: EXACT, CASE_DIFF, or DIFFERENT
```

## Common Queries

```sql
-- Monday contractors with SharePoint links
SELECT m.name AS monday, c.name AS sharepoint, c.sharepoint_folder_url
FROM monday_contractors m
JOIN contractors c ON m.sharepoint_contractor_id = c.id;

-- Unlinked Monday contractors
SELECT name FROM monday_contractors
WHERE sharepoint_contractor_id IS NULL;

-- SharePoint contractors with QuickBooks match
SELECT c.name AS sharepoint, q.company_name AS quickbooks, q.main_email
FROM contractors c
JOIN contractor_matches cm ON c.id = cm.sharepoint_id
JOIN quickbooks_companies qb ON cm.quickbooks_id = qb.id;

-- Full cross-reference (all 3 systems)
SELECT
  m.name AS monday,
  c.name AS sharepoint,
  qb.company_name AS quickbooks,
  c.sharepoint_folder_url
FROM monday_contractors m
JOIN contractors c ON m.sharepoint_contractor_id = c.id
LEFT JOIN contractor_matches cm ON c.id = cm.sharepoint_id
LEFT JOIN quickbooks_companies qb ON cm.quickbooks_id = qb.id;
```

## Stats

| Metric | Count |
|--------|-------|
| SharePoint folders | 372 |
| QuickBooks companies | 2,532 |
| Monday contractors (Active) | 1,167 |
| Monday ↔ SharePoint linked | 217 |
| SharePoint ↔ QuickBooks matched | 234 |
