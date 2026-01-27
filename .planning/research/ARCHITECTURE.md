# Architecture Patterns: Contract Intake System

**Domain:** Contract intake and task management for construction services
**Researched:** 2026-01-22
**Confidence:** HIGH (builds on existing proven patterns in codebase)

## Executive Summary

The contract intake system should follow the existing service-oriented patterns already established in the codebase. The key insight is that Desert Services Hub already has mature implementations of all the building blocks needed: email client, contract parsing, Monday.com integration, and Notion client. The architecture should be a **pipeline coordinator** that orchestrates these existing services rather than reimplementing functionality.

## Recommended Architecture

```
                                   CONTRACT INTAKE PIPELINE
                                   ========================

    [Email Monitor]          [Classifier]           [Parser]            [Context]            [Task Creator]
          |                       |                     |                    |                      |
          v                       v                     v                    v                      v
    +-----------+           +-----------+         +-----------+        +-----------+         +-----------+
    |  Poll     |  email    | Pattern + | doc     | Contract  | parsed | Monday    | context |  Notion   |
    |  Contracts| --------> | LLM       | ------> | Client    | -----> | + Email   | ------> | Client    |
    |  Mailbox  |  message  | Classify  | type    | Extract   | data   | Gather    | bundle  | Create    |
    +-----------+           +-----------+         +-----------+        +-----------+         +-----------+
          |                       |                     |                    |                      |
          |                  uses census/              uses contract/       uses monday/           uses notion/
          |                  classify.ts               client.ts            client.ts              client.ts
          |
    uses email/client.ts
```

### Component Boundaries

| Component | Responsibility | Inputs | Outputs | Dependencies |
|-----------|---------------|--------|---------|--------------|
| **Email Monitor** | Poll contracts mailbox for new emails | None (scheduled) | Raw email messages | `services/email/client.ts` |
| **Contract Classifier** | Detect contract-related emails vs other | Email message | Classification + confidence | `services/email/census/classify.ts` (adapt patterns) |
| **Document Parser** | Extract structured data from contract PDFs | PDF attachment buffer | `ContractPackage` | `services/contract/client.ts` |
| **Context Assembler** | Gather related estimate, contacts, project info | Parsed contract data | Enriched context bundle | `services/monday/client.ts`, `services/email/client.ts` |
| **Task Creator** | Create Notion task with full context | Context bundle | Notion page ID | `services/notion/client.ts` |
| **Status Tracker** | Update Monday item status, track processing | Item ID, status | Updated Monday item | `services/monday/client.ts` |

### Data Flow (Contract Email -> Tasks in Notion)

**Phase 1: Email Detection**

```
contracts@desertservices.net inbox
    -> GraphEmailClient.filterEmails({ filter: 'hasAttachments eq true' })
    -> Raw EmailMessage[]
```

**Phase 2: Classification**

```
EmailMessage
    -> classifyByPattern(email) // Fast, free - 88.5% accurate from census data
    -> If classification === 'CONTRACT' && confidence >= 0.8
        -> PROCEED
    -> Else if confidence < 0.8
        -> classifyByLLM(email) // Gemini fallback
    -> Classification result
```

**Phase 3: Attachment Download & Parsing**

```
EmailMessage (classified as CONTRACT)
    -> GraphEmailClient.downloadAllAttachments(messageId, userId)
    -> For each PDF attachment:
        -> Write to temp file
        -> extractContractDetails(tempPath)
        -> Aggregate into ContractPackage
    -> ContractPackage with parsed details
```

**Phase 4: Context Assembly**

```
ContractPackage { contractor, project, amounts }
    -> Search Monday ESTIMATING board for matching estimate:
        -> findBestMatches('ESTIMATING', project.name)
        -> Or searchByColumnValue for ESTIMATE_ID if found in contract
    -> Search email threads for related correspondence
    -> Search Monday CONTACTS for contractor contact
    -> Bundle into IntakeContext:
        {
            contract: ContractPackage,
            estimate: MondayItem | null,
            relatedEmails: EmailMessage[],
            contractor: Contact | null,
            discrepancies: string[]  // If estimate total != contract total
        }
```

**Phase 5: Task Creation**

```
IntakeContext
    -> Create Notion page in Tasks database:
        {
            Name: "Review Contract: {project.name}",
            Status: "Not Started",
            "Next Steps": "WAITING ON REVIEW - Contract received {date}",
            Priority: "High" if discrepancies.length > 0,
            Properties: {
                "Project Name": contract.project.name,
                "Contractor": contract.contractor.name,
                "Contract Amount": contract.amounts.originalAmount,
                "Estimate Link": estimate?.url,
                "Source Email": email.id,
            }
        }
    -> If significant discrepancies:
        -> Flag for immediate review
        -> Include reconciliation summary
```

**Phase 6: Status Tracking**

```
IntakeContext
    -> Update Monday ESTIMATING item (if found):
        -> BID_STATUS: { label: 'Won' }
        -> CONTRACT_RECEIVED_DATE: new Date().toISOString()
        -> NOTION_TASK_LINK: notionTaskUrl
    -> Archive processed email to "Processed" folder
    -> Log to processing history (SQLite)
```

## Patterns to Follow

### Pattern 1: Tiered Classification (Pattern then LLM)

**What:** Use fast pattern matching first, only fall back to LLM for uncertain cases
**When:** Any classification task where speed and cost matter
**Why:** Pattern matching is free and fast (88.5% accuracy proven in email census). LLM fallback handles edge cases.

```typescript
// From services/email/census/classify.ts
export async function classifyEmail(
  email: Email,
  options: ClassifyOptions = {}
): Promise<ClassificationResult> {
  const { llmThreshold = 0.6, patternOnly = false } = options;

  // First try pattern matching
  const patternResult = classifyByPattern(email);

  // If pattern confidence is high enough, use it
  if (patternResult.confidence >= llmThreshold || patternOnly) {
    return patternResult;
  }

  // Otherwise, try LLM classification
  try {
    const llmResult = await classifyByLLM(email);
    return llmResult;
  } catch (error) {
    // If LLM fails, fall back to pattern result
    return patternResult;
  }
}
```

### Pattern 2: Fuzzy Matching for Record Lookup

**What:** Use similarity scoring to find records even with name variations
**When:** Matching contracts to estimates, contacts to companies
**Why:** Contract names often differ slightly from estimate names

```typescript
// From services/monday/client.ts
export async function findBestMatches(
  boardId: string,
  name: string,
  limit = 5
): Promise<ScoredItem[]> {
  const items = await getItems(boardId);

  return items
    .map((item) => ({ ...item, score: calculateSimilarity(name, item.name) }))
    .filter((item) => item.score > MIN_SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
```

### Pattern 3: Find-or-Create for Deduplication

**What:** Check for existing record before creating new one
**When:** Creating Notion tasks, contacts, or any entity that should be unique
**Why:** Prevents duplicate tasks for the same contract

```typescript
// From services/notion/client.ts
export async function findOrCreateByTitle(options: {
  databaseId: string;
  titleProperty: string;
  titleValue: string;
  properties: Record<string, unknown>;
}): Promise<FindOrCreateResult> {
  // Check for existing
  const existingId = await findPageByTitle({
    databaseId: options.databaseId,
    property: options.titleProperty,
    value: options.titleValue,
  });

  if (existingId) {
    return { id: existingId, created: false };
  }

  // Create new
  const newId = await createPage({
    databaseId: options.databaseId,
    properties: options.properties,
  });

  return { id: newId, created: true };
}
```

### Pattern 4: Dual Auth for Read vs Write

**What:** Use app auth for reads, user auth for writes
**When:** Email operations where you need both org-wide search and user-attributed sends
**Why:** Security - write operations should be attributed to a user, not a service account

```typescript
// From services/email/mcp-server.ts
function getAppClient(): GraphEmailClient {
  if (appClient) return appClient;
  appClient = new GraphEmailClient(emailConfig);
  appClient.initAppAuth();  // Org-wide read access
  return appClient;
}

async function getUserClient(): Promise<GraphEmailClient> {
  if (userClient) return userClient;
  userClient = new GraphEmailClient(emailConfig);
  await userClient.initUserAuth();  // Writes attributed to user
  return userClient;
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Polling Too Frequently

**What:** Checking email inbox every few seconds
**Why bad:** Rate limits, unnecessary API calls, cost
**Instead:** Poll every 5-15 minutes, or use webhooks if available

### Anti-Pattern 2: Processing in MCP Server

**What:** Putting complex business logic directly in MCP server tool handlers
**Why bad:** MCP servers should be thin wrappers; logic becomes untestable
**Instead:** Keep MCP servers as thin adapters calling into service modules

### Anti-Pattern 3: Synchronous Pipeline with No Retry

**What:** Running the entire intake pipeline in one go without checkpoints
**Why bad:** If Notion is down, you lose work; can't resume from failure
**Instead:** Track processing state in SQLite, support resume from any step

### Anti-Pattern 4: Hard-coding Email Patterns

**What:** Putting all classification patterns directly in code
**Why bad:** Can't adjust without code changes; can't learn from mistakes
**Instead:** Store patterns in config/database; log classifications for review

## Suggested Build Order

Based on dependencies between components:

### Phase 1: Email Detection (Foundation)

**Why first:** Everything depends on detecting contract emails
**Components:**

- Contract classifier (adapt `services/email/census/classify.ts` patterns)
- Email polling logic for contracts mailbox
- SQLite table for tracking processed emails

**Dependencies:** None (uses existing email client)
**Outputs:** Filtered stream of contract-classified emails

### Phase 2: Document Parsing (Core Processing)

**Why second:** Need structured contract data before context assembly
**Components:**

- Integration with existing `services/contract/client.ts`
- Temp file handling for PDF attachments
- Error handling for parse failures

**Dependencies:** Phase 1 (needs classified emails)
**Outputs:** `ContractPackage` with parsed contract details

### Phase 3: Context Assembly (Enrichment)

**Why third:** Lookup operations require parsed data
**Components:**

- Estimate lookup in Monday.com (fuzzy match)
- Email thread gathering (related correspondence)
- Reconciliation check (estimate vs contract amounts)

**Dependencies:** Phase 2 (needs parsed contract data)
**Outputs:** Enriched `IntakeContext` bundle

### Phase 4: Task Creation (Output)

**Why fourth:** Creates the final deliverable
**Components:**

- Notion task creation with full context
- Dedupe check (find existing task first)
- Priority assignment based on discrepancies

**Dependencies:** Phase 3 (needs context bundle)
**Outputs:** Notion task page ID

### Phase 5: Status Tracking (Feedback Loop)

**Why fifth:** Updates source systems after successful processing
**Components:**

- Monday.com status updates
- Email archiving/flagging
- Processing history logging

**Dependencies:** Phase 4 (needs successful task creation)
**Outputs:** Updated Monday items, archived emails

### Phase 6: Orchestrator & Scheduler

**Why last:** Ties everything together
**Components:**

- Pipeline coordinator that chains phases
- Scheduler for periodic polling
- Error handling and retry logic
- MCP server for manual triggering

**Dependencies:** All previous phases
**Outputs:** Running automated intake system

## Directory Structure Recommendation

```
services/
  contract-intake/                    # New service module
    index.ts                          # Main exports
    classifier.ts                     # Contract email classification
    pipeline.ts                       # Pipeline orchestrator
    context-assembler.ts              # Context gathering logic
    task-creator.ts                   # Notion task creation
    status-tracker.ts                 # Monday status updates
    scheduler.ts                      # Polling scheduler
    types.ts                          # Shared types
    db.ts                             # SQLite for processing state
    mcp-server.ts                     # MCP interface for manual ops

    __tests__/
      classifier.unit.test.ts
      pipeline.integration.test.ts
      context-assembler.unit.test.ts
```

## Scalability Considerations

| Concern | Current Scale | 10x Scale | Mitigation |
|---------|---------------|-----------|------------|
| Email polling | 5-10 contracts/day | 50-100/day | Webhook subscription instead of polling |
| Monday API calls | Low volume | Rate limited | Batch lookups, cache estimate data |
| Notion API calls | Low volume | 350ms rate limit | Queue with backoff |
| PDF parsing | Gemini API calls | Cost grows | Cache parsed results, skip reprocessing |
| Processing state | SQLite sufficient | SQLite sufficient | SQLite handles millions of rows |

## Key Integration Points

### Existing Services to Leverage

1. **services/email/client.ts** - All email operations already implemented
2. **services/contract/client.ts** - PDF extraction with Jina + Gemini
3. **services/contract/reconcile.ts** - Line item comparison logic
4. **services/monday/client.ts** - All Monday.com operations
5. **services/notion/client.ts** - All Notion operations with dedupe helpers
6. **services/email/census/classify.ts** - Classification patterns (adapt for contracts)

### Data Stores

1. **Monday.com ESTIMATING board** - Source of estimates, update with contract status
2. **Monday.com CONTACTS board** - Contractor contact info
3. **Notion Tasks database** - Destination for intake tasks
4. **SQLite (local)** - Processing state, email tracking, cache

### External APIs

1. **Microsoft Graph** - Email access
2. **Monday.com API** - CRM data
3. **Notion API** - Task management
4. **Jina AI** - PDF text extraction
5. **Gemini** - Classification fallback, contract parsing

## Sources

- Codebase analysis: `services/email/client.ts` - Comprehensive email operations
- Codebase analysis: `services/contract/client.ts` - Contract PDF extraction patterns
- Codebase analysis: `services/email/census/classify.ts` - Classification with LLM fallback
- Codebase analysis: `services/notion/client.ts` - Dedupe helpers
- Codebase analysis: `services/monday/client.ts` - Fuzzy matching for lookups
- Codebase analysis: `services/inbox/deep-search.ts` - Iterative search pattern
