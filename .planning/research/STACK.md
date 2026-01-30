# Technology Stack: Contract Intake System

**Project:** Desert Services Contract Intake
**Researched:** 2026-01-22
**Overall Confidence:** HIGH

## Executive Summary

This document provides prescriptive technology recommendations for building a contract intake system that monitors `contracts@desertservices.net`, extracts information from contract PDFs, matches to Monday.com estimates, and creates task workflows in Notion.

The existing stack (Bun, TypeScript, Microsoft Graph client, Monday.com client, Notion client, pdfjs-dist) provides a solid foundation. The primary decisions involve:

1. **Email monitoring**: Webhooks with polling fallback (not pure polling)
2. **PDF extraction**: LLM-based extraction using existing pdfjs-dist + Claude API
3. **Notion tasks**: Direct API calls with rate limiting (no batch API available)

---

## Recommended Stack

### Email Monitoring: Microsoft Graph Webhooks + Delta Query Fallback

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| Microsoft Graph Subscriptions API | v1.0 | Real-time email notifications | HIGH |
| Delta Query API | v1.0 | Fallback for missed notifications | HIGH |

**WHY webhooks over polling:**

- Polling 50+ mailboxes hits Azure rate limits immediately ([source](https://medium.com/@anantgna/scaling-microsoft-graph-api-centralized-monitoring-archiving-for-50-high-volume-mailboxes-1ddf329196bf))
- Webhooks provide near real-time notification (sub-minute latency)
- Microsoft explicitly recommends webhooks + delta query combination ([source](https://www.voitanos.io/blog/microsoft-graph-webhook-delta-query/))

**Implementation approach:**

```typescript
// 1. Create subscription for contracts@ mailbox
POST /subscriptions
{
  "changeType": "created",
  "notificationUrl": "https://your-server.com/api/graph-webhook",
  "lifecycleNotificationUrl": "https://your-server.com/api/graph-lifecycle",
  "resource": "/users/contracts@desertservices.net/messages",
  "expirationDateTime": "2026-01-29T00:00:00Z",  // Max 7 days for mail
  "clientState": "secretStateValue"
}

// 2. Implement lifecycle notification handler for renewal
// 3. Schedule backstop delta query every 4-6 hours
```csv
```typescript
import { z } from 'zod';

const ContractSchema = z.object({
  projectName: z.string(),
  projectAddress: z.string().optional(),
  contractor: z.object({
    name: z.string(),
    contactName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  contractAmount: z.number().optional(),
  estimateId: z.string().optional(),  // May reference our estimate number
});

// Extract text with pdfjs-dist
const text = await extractPdfText(pdfBuffer);

// Parse with LLM
const result = await claude.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [{
    role: 'user',
    content: `Extract contract information from this document:\n\n${text}\n\nReturn JSON matching this schema: ${JSON.stringify(ContractSchema.shape)}`
  }],
});
```csv
```typescript
const CONTRACT_INTAKE_TASKS = [
  { name: 'Verify contract matches estimate', assignee: 'contracts' },
  { name: 'Check insurance requirements', assignee: 'contracts' },
  { name: 'Verify bonding requirements', assignee: 'contracts' },
  { name: 'Review payment terms', assignee: 'contracts' },
  { name: 'Confirm start date', assignee: 'operations' },
  { name: 'Update Monday.com status', assignee: 'contracts' },
  { name: 'File executed contract', assignee: 'contracts' },
];

for (const task of CONTRACT_INTAKE_TASKS) {
  await createPage({
    databaseId: TASKS_DATABASE_ID,
    properties: {
      Name: { title: [{ text: { content: task.name } }] },
      Status: { status: { name: 'Not Started' } },
      'Related Contract': { relation: [{ id: contractPageId }] },
      // ... other properties
    },
  });
  await sleep(350);  // Rate limiting
}
```css
```typescript
// SQLite table for tracking processed contracts
CREATE TABLE processed_contracts (
  id INTEGER PRIMARY KEY,
  email_message_id TEXT UNIQUE NOT NULL,
  email_subject TEXT,
  contract_pdf_name TEXT,
  monday_estimate_id TEXT,
  notion_project_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME
);
```csv
```bash
# Already installed:
# - pdfjs-dist: PDF text extraction
# - @microsoft/microsoft-graph-client: Email API
# - zod: Schema validation for LLM output

# Optional upgrade (only if starting fresh):
bun add @notionhq/client@^5.6.0  # Requires API migration
```

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Email webhooks | HIGH | Official Microsoft documentation, production-proven pattern |
| PDF extraction | HIGH | pdfjs-dist already working, well-documented |
| LLM parsing | HIGH | Multiple sources confirm approach, Zod validation prevents hallucinations |
| Monday matching | HIGH | Existing client, proven fuzzy matching |
| Notion tasks | HIGH | Existing client works, no batch API is documented limitation |
| Subscription renewal | MEDIUM | Known 7-day limit, but lifecycle notification behavior varies |

---

## Sources

### Microsoft Graph

- [Microsoft Graph Webhooks Best Practices](https://www.voitanos.io/blog/microsoft-graph-webhook-delta-query/)
- [Change Notifications Overview](https://learn.microsoft.com/en-us/graph/change-notifications-overview)
- [Subscription Resource Type](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0)
- [Outlook Change Notifications](https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview)

### PDF Extraction

- [7 PDF Parsing Libraries for Node.js](https://strapi.io/blog/7-best-javascript-pdf-parsing-libraries-nodejs-2025)
- [unpdf GitHub](https://github.com/unjs/unpdf)

### LLM Document Extraction

- [LLMs for Structured Data Extraction from PDFs](https://unstract.com/blog/comparing-approaches-for-using-llms-for-structured-data-extraction-from-pdfs/)
- [Best LLM Models for Document Processing 2025](https://algodocs.com/best-llm-models-for-document-processing-in-2025/)

### Notion API

- [Notion SDK JS GitHub](https://github.com/makenotion/notion-sdk-js)
- [Notion API Best Practices](https://cursorrules.org/article/notion-api-cursor-mdc-file)
