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
```

**Key constraints:**
- Mail subscription max lifetime: **10,080 minutes (under 7 days)** ([source](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0))
- Rich notifications (with resource data): **1,440 minutes (under 1 day)**
- Max 1000 active subscriptions per mailbox
- Must proactively renew subscriptions before expiration

**WHAT NOT TO USE:**
- Pure polling: Causes throttling, wastes resources, not real-time
- Azure Event Grid: Overkill for single-mailbox monitoring; adds Azure infrastructure complexity
- Azure Event Hubs: Only needed for high-throughput multi-tenant scenarios

---

### PDF Text Extraction: pdfjs-dist (Already Installed)

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| pdfjs-dist | ^5.4.530 | PDF text extraction | HIGH |

**WHY keep pdfjs-dist:**
- Already installed and working in the codebase
- Battle-tested Mozilla library with excellent TypeScript support
- v5.4.530 is current (latest stable is v5.4.394 bundled in unpdf)
- Works for digital PDFs (most contracts are digital, not scanned)

**Alternative considered - unpdf v1.4.0:**
- Modern alternative to pdf-parse, serverless-optimized
- Uses pdfjs-dist v5.4.296 internally
- Simpler API but adds dependency for marginal benefit
- **Recommendation:** Skip unless needing serverless deployment

**WHAT NOT TO USE:**
- pdf-parse: Unmaintained, last meaningful update years ago
- pdf2json: Only needed if you need exact x,y coordinates
- Tesseract.js/OCR: Only for scanned documents (contracts typically digital)

---

### Contract Information Extraction: LLM-Based Parsing

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| Claude API (claude-3-5-sonnet or claude-3-haiku) | Latest | Structured data extraction from text | HIGH |
| Gemini API | gemini-2.5-flash | Cost-effective alternative/validator | MEDIUM |

**WHY LLM-based extraction over regex/templates:**
- Contracts have variable formats (different GCs, different templates)
- LLMs handle layout variations, synonyms, and context
- Chain-of-thought prompting improves accuracy for multi-step reasoning ([source](https://unstract.com/blog/comparing-approaches-for-using-llms-for-structured-data-extraction-from-pdfs/))
- Zod schema validation ensures structured output

**Implementation pattern:**
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
```

**Multi-LLM validation (optional, for high-value contracts):**
- Use Claude for extraction, Gemini for validation
- Only accept values both LLMs agree on
- Reduces hallucination risk ([source](https://unstract.com/blog/comparing-approaches-for-using-llms-for-structured-data-extraction-from-pdfs/))

**WHAT NOT TO USE:**
- Regex-based parsing: Brittle, breaks on format changes
- Template matching: Requires maintaining templates per contractor
- Document AI services (AWS Textract, Google Document AI): Overkill for text-based contracts, adds cloud vendor lock-in

---

### Monday.com Estimate Matching: Existing Client

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| Monday.com GraphQL API | 2024-01 | Match contracts to estimates | HIGH |
| Fuzzy matching (existing) | N/A | Handle name variations | HIGH |

**WHY use existing client:**
- `findBestMatches` already implements fuzzy matching
- `searchByColumn` enables fast lookups by estimate ID
- No new dependencies needed

**Matching strategy:**
1. If contract contains estimate ID reference, use `searchByColumn('ESTIMATING', 'ESTIMATE_ID', value)`
2. Otherwise, extract project name and use `findBestMatches('ESTIMATING', projectName)`
3. Validate match by comparing contractor name, project address

---

### Notion Task Creation: Direct API with Rate Limiting

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| Notion API | 2022-06-28 (current) | Task creation | HIGH |
| @notionhq/client | ^5.6.0 | Official SDK (optional upgrade) | MEDIUM |

**WHY direct API over SDK:**
- Existing `services/notion/client.ts` works well
- SDK v5.x requires API version 2025-09-03 (breaking changes)
- Direct fetch calls with current API version are stable

**Key constraint - No batch API:**
- Notion API does not support batch operations
- Must create pages one at a time with rate limiting
- Existing 350ms delay between requests is appropriate

**Task creation pattern for contract intake:**
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
```

**WHAT NOT TO USE:**
- @notionhq/client v5.x: Requires migration to API 2025-09-03, introduces breaking changes for multi-source databases
- Third-party Notion libraries: Less maintained than official API

---

## Architecture Decisions

### Webhook Endpoint Requirements

For Microsoft Graph webhooks, you need a publicly accessible HTTPS endpoint. Options:

| Option | Complexity | Cost | Recommendation |
|--------|------------|------|----------------|
| Next.js API route + ngrok (dev) | Low | Free | Development only |
| Vercel/Netlify serverless function | Low | Free tier | Good for low volume |
| Dedicated endpoint on existing server | Medium | Existing | Best for production |

**Webhook validation:**
Microsoft Graph sends a validation request when creating subscriptions. Your endpoint must:
1. Accept POST with `validationToken` query parameter
2. Return the token as plain text with 200 status
3. Respond within 10 seconds

### State Management

Track processed emails to avoid duplicates:

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
```

---

## What NOT to Use (and Why)

| Technology | Why Not |
|------------|---------|
| **Pure polling for email** | Causes throttling, wastes resources, not real-time |
| **Azure Event Grid** | Overkill for single-mailbox; adds Azure infrastructure |
| **pdf-parse npm package** | Unmaintained since 2019 |
| **Tesseract.js for all PDFs** | OCR is slow and unnecessary for digital contracts |
| **@notionhq/client v5.x** | Breaking API changes; existing direct API works fine |
| **Third-party contract parsing services** | Adds cost and vendor lock-in for solvable problem |
| **Notion batch API** | Doesn't exist; must use sequential calls |

---

## Installation

No new dependencies required. Existing stack covers all needs:

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
