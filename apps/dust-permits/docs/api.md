# API Reference

Base URL: `http://localhost:47822`

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/permits` | List all permits |
| `GET` | `/api/permits/:id` | Get permit by ID |
| `DELETE` | `/api/permits/:id` | Delete draft permit |
| `DELETE` | `/api/permits/drafts` | Delete all draft permits |
| `POST` | `/api/permits/create` | Create permit from FormData |
| `POST` | `/api/permits/extract` | Extract FormData from PDFs |
| `POST` | `/api/permits/:id/renew` | Renew existing permit |
| `POST` | `/api/permits/:id/close` | Close active permit |
| `POST` | `/api/permits/:id/revise` | Revise permit |
| `GET` | `/api/browser/status` | Check browser session status |
| `POST` | `/api/browser/start` | Start browser session |
| `POST` | `/api/browser/stop` | Stop browser session |
| `GET` | `/api/email/templates` | List email templates |
| `POST` | `/api/email/send` | Send email |
| `POST` | `/swppp-plan-notifications` | Send SWPPP notification email |

---

## Permits API

### GET /api/permits

List all permits from the database.

**Response:**
```json
[
  {
    "id": "P0012345",
    "projectName": "Downtown Tower",
    "status": "Active",
    "expirationDate": "2025-12-31"
  }
]
```

### GET /api/permits/:id

Get a specific permit by ID.

**Response (200):**
```json
{
  "id": "P0012345",
  "projectName": "Downtown Tower",
  "status": "Active"
}
```

**Response (404):**
```json
{
  "error": "Permit not found"
}
```

### DELETE /api/permits/:id

Delete a draft permit. Requires browser session.

### DELETE /api/permits/drafts

Delete all draft permits. Requires browser session.

---

### POST /api/permits/create

Create a dust permit application using FormData.

**Request Body:**
```typescript
{
  flow: "new-company" | "existing-company";
  companyName?: string;           // Required for existing-company
  copyFromApp?: string;           // Optional source permit/app to copy from
  formDataPath?: string;          // Path inside permit-worker container
}
```

**Flows:**

| Flow | Description |
|------|-------------|
| `new-company` | Create app with new company (must fill applicant info) |
| `existing-company` | Create app under existing company (company data pre-filled) |

**Example (existing-company):**
```json
{
  "flow": "existing-company",
  "companyName": "Sundt Construction",
  "formDataPath": "/app/data/overrides/downtown-tower.json"
}
```

**Response:**
```json
{
  "success": true,
  "applicationId": "D0063827",
  "flow": "existing-company",
  "reachedPage5": true
}
```

---

### POST /api/permits/extract

Extract structured FormData from PDF files (NOI, SWPPP Plan).

**Request Body:**
```typescript
{
  projectName: string;
  accountName?: string;
  noi: ProjectFile[];       // Required, at least one
  swpppPlan?: ProjectFile[];
}

interface ProjectFile {
  name: string;
  url: string;
}
```

**Example:**
```json
{
  "projectName": "Downtown Tower",
  "accountName": "Sundt Construction",
  "noi": [
    { "name": "NOI-2025-001.pdf", "url": "https://example.com/noi.pdf" }
  ],
  "swpppPlan": [
    { "name": "SWPPP-Plan.pdf", "url": "https://example.com/swppp.pdf" }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "formData": { /* extracted FormData */ }
}
```

---

### POST /api/permits/:id/renew

Renew an existing permit by creating a new application that copies all data.

**Request Body:**
```typescript
{
  companyName: string;  // Required - name of existing company
}
```

**Example:**
```json
{
  "companyName": "Weis Builders Inc"
}
```

**Response:**
```json
{
  "success": true,
  "applicationId": "D0063827",
  "timestamp": "2025-01-05T12:00:00.000Z"
}
```

**Behavior:**
1. Navigates to My Dust Apps
2. Creates new application copying from permit `:id`
3. Selects the company by `companyName`
4. Advances through pages 1-5 (data is pre-filled)
5. Returns new application ID when ready for submission

---

### POST /api/permits/:id/close

Close an active permit permanently.

**Request Body:**
```typescript
{
  reason?: string;  // Optional - default: "Permit no longer needed"
}
```

**Example:**
```json
{
  "reason": "Project completed successfully"
}
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2025-01-05T12:00:00.000Z"
}
```

**Warning:** This action is permanent and cannot be undone.

---

### POST /api/permits/:id/revise

Revise an existing permit.

**Request Body:**
```typescript
{
  revisionType: string;   // e.g. "contact", "acreage", "boundary"
  notes?: string;
}
```

---

## Browser API

The API maintains a singleton browser session for portal automation.

### GET /api/browser/status

**Response:**
```json
{
  "active": true,
  "isLoggedIn": true,
  "timestamp": "2025-01-05T12:00:00.000Z"
}
```

### POST /api/browser/start

Start browser and log into Maricopa portal.

**Response:**
```json
{
  "success": true
}
```

### POST /api/browser/stop

Stop browser session.

**Response:**
```json
{
  "success": true
}
```

---

## Email API

### GET /api/email/templates

List available email templates.

**Response:**
```json
{
  "templates": [
    "dust-permit-issued",
    "dust-permit-renewal",
    "swppp-notification"
  ]
}
```

Templates are `.hbs` files in `src/email/templates/`.

---

### POST /api/email/send

Send an email using Graph API.

**Request Body:**
```typescript
{
  to: string | Recipient[];           // Required
  cc?: string | Recipient[];
  subject?: string;                   // Default: "New Message" or "Update: {templateName}"
  templateName?: string;              // Use a .hbs template
  templateVars?: Record<string, string>;  // Variables for template
  body?: string;                      // OR raw body (html/text)
  bodyType?: "html" | "text";         // Default: "html"
  includeLogo?: boolean;              // Default: true
  attachments?: Attachment[];
}

interface Recipient {
  email: string;
  name?: string;
}

interface Attachment {
  name: string;
  contentType: string;
  contentBytes: string;  // Base64 encoded
}
```

**Requires:** Either `templateName` OR `body` (not both empty)

**Example (with template):**
```json
{
  "to": "client@example.com",
  "subject": "Your Dust Permit Has Been Issued",
  "templateName": "dust-permit-issued",
  "templateVars": {
    "recipientName": "John Smith",
    "projectName": "Downtown Tower",
    "permitNumber": "P0012345",
    "issueDate": "01/15/2025",
    "expirationDate": "01/15/2026"
  }
}
```

**Example (raw body):**
```json
{
  "to": [
    { "email": "client@example.com", "name": "John Smith" }
  ],
  "cc": "manager@example.com",
  "subject": "Quick Update",
  "body": "<p>Your permit is ready for pickup.</p>",
  "bodyType": "html"
}
```

**Response (success):**
```json
{
  "success": true,
  "status": "sent",
  "recipient": "client@example.com",
  "subject": "Your Dust Permit Has Been Issued"
}
```

**Response (error):**
```json
{
  "success": false,
  "error": "Graph API authentication failed"
}
```

---

### POST /swppp-plan-notifications

Specialized endpoint for SWPPP notification emails with pre-mapped permit variables.

**Request Body:**
```typescript
{
  recipientEmail: string;           // Required
  ccEmail?: string;
  recipientName?: string;
  templateName?: string;            // e.g. "dust-permit-issued"
  subject?: string;                 // Default: "SWPPP Notification: {projectName}"

  // Permit variables (all optional, passed to template)
  accountName?: string;
  projectName?: string;
  siteAddress?: string;
  applicationNumber?: string;
  permitNumber?: string;
  acreage?: string | number;
  issueDate?: string;
  expirationDate?: string;
  actionStatus?: string;
  permitStatus?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  permitCost?: string;
  scheduleValue?: string;
  swpppNoi?: string;
  inspectionFrequency?: string;
  stabilizationMeasures?: string;
  messageBody?: string;
  bodyContent?: string;
}
```

**Example:**
```json
{
  "recipientEmail": "client@example.com",
  "recipientName": "John Smith",
  "templateName": "dust-permit-issued",
  "projectName": "Downtown Tower",
  "permitNumber": "P0012345",
  "siteAddress": "123 Main St, Phoenix, AZ",
  "issueDate": "01/15/2025",
  "expirationDate": "01/15/2026"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email queued successfully",
  "details": {
    "success": true,
    "status": "sent",
    "recipient": "client@example.com",
    "subject": "SWPPP Notification: Downtown Tower"
  }
}
```

---

## Entity Types

For `formData.applicant.entityType`:

| Value | Type |
|-------|------|
| "1" | Sole Proprietorship |
| "2" | Corporation |
| "3" | Partnership |
| "4" | Joint Venture |
| "5" | Government Agency |
| "6" | Limited Liability Company |
| "7" | Trust |
| "8" | Other |

---

## Error Responses

All endpoints return consistent error format:

```json
{
  "success": false,
  "error": "Description of what went wrong"
}
```

| Status | Description |
|--------|-------------|
| `200` | Success |
| `400` | Bad request (validation error, missing required fields) |
| `404` | Resource not found |
| `500` | Internal error (browser error, Graph API failure, etc.) |

---

## Integration Notes

### Webhook Sources

Any webhook source can trigger permit automation by posting to `/api/permits/extract` then `/api/permits/create`, or use the email endpoints for notifications.

**Supported sources:**
- Notion webhooks
- Monday.com webhooks
- Custom dashboards
- Direct API calls

### Browser Session

- Most permit operations require an active browser session
- Call `/api/browser/start` before running permit operations
- Session persists across requests for performance
- E2E tests use isolated browser instances (see `tests/e2e/`)

### Email Authentication

Email endpoints require Azure AD credentials in environment:
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

Uses Microsoft Graph API to send emails.
