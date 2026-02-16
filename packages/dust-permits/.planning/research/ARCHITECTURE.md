# Architecture Patterns: Email-Triggered Automation System

**Domain:** Email-to-action automation for dust permits
**Researched:** 2026-01-24
**Overall Confidence:** HIGH (well-established patterns; Microsoft Graph webhooks documented; existing codebase provides integration points)

## Recommended Architecture

Email-triggered automation systems follow a **pipeline architecture** with clear separation between ingestion, classification, decision-making, and execution. The key insight: emails are signals on projects, not standalone events.

```
                            EMAIL-TRIGGERED AUTOMATION PIPELINE

    +----------------+     +------------------+     +------------------+
    |   INGESTION    |---->|   CLASSIFIER     |---->|   LINKER         |
    |   (Webhook)    |     |   (Intent)       |     |   (Project)      |
    +----------------+     +------------------+     +------------------+
          |                        |                        |
    - Graph webhook          - Keyword filter         - Fuzzy match
    - Validation             - LLM intent             - Census lookup
    - Dedup                  - Confidence score       - Permit state
                                                             |
                                                             v
    +------------------+     +------------------+     +------------------+
    |  HUMAN QUEUE     |<----|   CONFIDENCE     |<----|   ACTION         |
    |  (Review UI)     |     |   GATE           |     |   RESOLVER       |
    +------------------+     +------------------+     +------------------+
          |                        |                        |
    - Full context           - Threshold check         - Intent + state
    - Decision buttons       - Auto vs queue           - -> Specific action
    - Audit trail            - Escalation rules        - Missing doc check
          |
          v
    +------------------+
    |   EXECUTOR       |
    |   (Handlers)     |
    +------------------+
          |
    - create.ts
    - renew.ts
    - close.ts
```

## Component Boundaries

| Component | Responsibility | Inputs | Outputs | Communicates With |
|-----------|---------------|--------|---------|-------------------|
| **Webhook Receiver** | Accept Microsoft Graph push notifications | HTTP POST with notification payload | Validated email event | Queue/Classifier |
| **Classifier** | Determine if email is dust-permit-related and intent type | Email subject, from, body | ClassificationResult (is_dust_permit, intent, confidence) | Linker |
| **Linker** | Connect email to project/permit in database | Email content, classification | LinkedEmail (projectId, permitId, permitState) | Action Resolver |
| **Action Resolver** | Map intent + state to specific action | LinkedEmail, ClassificationResult | ActionDecision (action, params, confidence) | Confidence Gate |
| **Confidence Gate** | Route based on confidence threshold | ActionDecision | Auto-execute or Queue | Executor or Human Queue |
| **Executor** | Call existing handlers | Action type, params | Execution result | Handlers (create.ts, renew.ts, close.ts) |
| **Human Queue** | Display low-confidence items for review | ActionDecision + full context | Human decision | Executor (after approval) |

## Data Flow

### Stage 1: Ingestion (Webhook to Email Event)

```
Microsoft Graph Push Notification
    |
    v
[Webhook Receiver at /api/webhook/email]
    |-- Validate clientState token
    |-- Respond 202 immediately (3-second rule)
    |-- Extract notification data
    |
    v
EmailEvent {
  subscriptionId: "abc123"
  changeType: "created"
  resourceId: "AAMkAGI2..."  // Message ID
  tenantId: "..."
  mailbox: "contracts@desertservices.net"
}
    |
    v
[Fetch Full Email via Graph API]
    |-- GET /users/{mailbox}/messages/{resourceId}
    |-- Include: subject, from, body, attachments, receivedDateTime
    |
    v
Email {
  id: "AAMkAGI2..."
  subject: "Re: Dust Permit Renewal - Sun City West Project"
  from: "contractor@example.com"
  body: "Please renew the permit, it expires next week..."
  attachments: [{name: "renewal_form.pdf", ...}]
}
```

**Key Implementation:**

```typescript
// src/api/webhook.ts

export async function handleWebhook(req: Request): Promise<Response> {
  // 1. Handle validation request (Microsoft verifies endpoint)
  const validationToken = new URL(req.url).searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      headers: { "Content-Type": "text/plain" }
    });
  }

  // 2. Validate request (verify it's from Microsoft)
  const clientState = req.headers.get("ClientState");
  if (clientState !== process.env.GRAPH_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 3. Acknowledge immediately (Graph requires <3 seconds)
  const body = await req.json();

  // 4. Queue for async processing (don't block the response)
  queueEmailEvent(body.value);

  return new Response(null, { status: 202 });
}
```

### Stage 2: Classification (Email to Intent)

```
Email {subject, from, body}
    |
    v
[Keyword Pre-Filter]
    |-- Quick check for "dust", "permit", "renewal", etc.
    |-- Skip if no keywords (saves LLM calls)
    |
    v
[LLM Classifier]  // Existing: src/lib/email-classifier.ts
    |-- Sends to local LLM (Qwen/Llama via llama.cpp)
    |-- Prompt: "Classify this email. Is it about a dust permit action?"
    |
    v
ClassificationResult {
  is_dust_permit: true,
  intent: "renewal",  // intake | renewal | revision | contact | notification | ignore
  confidence: 0.92
}
```

**Existing Implementation:** `src/lib/email-classifier.ts` already provides:
- `classifyEmail(email: EmailInput)` - LLM-based classification
- `mightBeDustPermit(email)` - Keyword pre-filter
- Defined intents: intake, renewal, revision, contact, notification, ignore

### Stage 3: Linking (Email to Project)

```
Email + ClassificationResult
    |
    v
[Project Linker]
    |-- Extract project identifiers from email:
    |     - Permit ID (D0056240)
    |     - Project name ("Sun Health La Loma")
    |     - Address ("10601 W Thunderbird Blvd")
    |     - Contractor name
    |
    v
[Multi-Source Matching]
    |-- Query desert-services-hub/census.db (48k emails, 101 projects)
    |-- Query auto-permit/company-permits.sqlite (permit records)
    |-- Fuzzy match on project name, address, contractor
    |
    v
LinkedEmail {
  email: Email,
  classification: ClassificationResult,
  projectId: "proj_123",
  projectName: "Sun Health La Loma Campus",
  permitId: "D0056240",
  permitState: "Active",  // Active | Expiring | Expired | None | Pending
  matchConfidence: 0.87
}
```

**State Lookup Pattern:**

```typescript
type PermitState =
  | "Active"      // Permit exists and is valid
  | "Expiring"    // Permit expires within 30 days
  | "Expired"     // Permit has expired
  | "None"        // No permit found for this project
  | "Pending";    // Application in progress (draft)

async function getProjectPermitState(projectId: string): Promise<PermitState> {
  const permit = await db.query(
    `SELECT permit_id, status, expiration_date
     FROM permits
     WHERE project_id = ?
     ORDER BY expiration_date DESC
     LIMIT 1`,
    [projectId]
  );

  if (!permit) return "None";
  if (permit.status === "Draft") return "Pending";

  const daysUntilExpiry = daysBetween(new Date(), permit.expiration_date);
  if (daysUntilExpiry < 0) return "Expired";
  if (daysUntilExpiry < 30) return "Expiring";
  return "Active";
}
```

### Stage 4: Action Resolution (Intent + State to Action)

```
LinkedEmail {intent, permitState}
    |
    v
[Action Resolution Matrix]
    |
    v
ActionDecision {
  action: "renew",
  permitId: "D0056240",
  params: { reason: "Permit expires in 7 days" },
  confidence: 0.85,  // Combined classification + linking confidence
  context: LinkedEmail
}
```

**Action Resolution Matrix:**

| Intent | Permit State | Action | Notes |
|--------|--------------|--------|-------|
| intake | None | CREATE | New permit application |
| intake | Active/Expiring | QUEUE | Already has permit, needs review |
| intake | Pending | QUEUE | Duplicate application check |
| renewal | Active/Expiring | RENEW | Standard renewal |
| renewal | None | QUEUE | No permit to renew |
| renewal | Expired | CREATE or QUEUE | Depends on expiry duration |
| revision | Active | REVISE | Modify existing permit |
| revision | None/Expired | QUEUE | No active permit |
| contact | Any | QUEUE | Contact updates need verification |
| notification | Any | LOG | County notifications are informational |
| ignore | Any | SKIP | Not dust permit related |

```typescript
function resolveAction(
  intent: EmailIntent,
  state: PermitState,
  confidence: number
): ActionDecision {
  const matrix: Record<EmailIntent, Record<PermitState, Action>> = {
    intake: {
      None: "CREATE",
      Active: "QUEUE",
      Expiring: "QUEUE",
      Expired: "CREATE",
      Pending: "QUEUE"
    },
    renewal: {
      None: "QUEUE",
      Active: "RENEW",
      Expiring: "RENEW",
      Expired: "QUEUE",
      Pending: "QUEUE"
    },
    revision: {
      None: "QUEUE",
      Active: "REVISE",
      Expiring: "REVISE",
      Expired: "QUEUE",
      Pending: "QUEUE"
    },
    contact: { /* all QUEUE */ },
    notification: { /* all LOG */ },
    ignore: { /* all SKIP */ }
  };

  const action = matrix[intent]?.[state] ?? "QUEUE";
  return { action, confidence };
}
```

### Stage 5: Confidence Gate (Decision Point)

```
ActionDecision {action, confidence}
    |
    v
[Threshold Check]
    |
    |-- confidence >= 0.85 AND action !== "QUEUE"?
    |      YES --> Auto-execute
    |      NO  --> Add to human queue
    |
    v
Either:
  - Auto-Execute: Call handler, log result, notify if needed
  - Human Queue: Store with full context for review
```

**Tiered Confidence Thresholds:**

| Confidence | Queue | Behavior |
|------------|-------|----------|
| >= 95% | Auto-approve | Execute immediately, log result |
| 70-95% | Quick review | Single-click approve/deny |
| < 70% | Full review | Requires detailed examination |

```typescript
const THRESHOLDS = {
  AUTO_EXECUTE: 0.85,
  QUICK_REVIEW: 0.70
} as const;

function routeAction(decision: ActionDecision): Route {
  if (decision.action === "QUEUE" || decision.action === "SKIP") {
    return { type: "queue", reason: "action_requires_review" };
  }

  if (decision.confidence >= THRESHOLDS.AUTO_EXECUTE) {
    return { type: "auto", handler: decision.action.toLowerCase() };
  }

  if (decision.confidence >= THRESHOLDS.QUICK_REVIEW) {
    return { type: "queue", tier: "quick_review" };
  }

  return { type: "queue", tier: "full_review" };
}
```

### Stage 6: Execution (Action to Result)

```
Auto-Execute Route
    |
    v
[Handler Bridge]
    |-- Map action to existing handler:
    |     CREATE --> createPermit(input)
    |     RENEW  --> renewPermit(input)
    |     CLOSE  --> closePermit(input)
    |     REVISE --> revisePermit(input)
    |
    v
[Execute with Retry]
    |-- withBrowser wraps all handlers
    |-- Portal automation runs
    |-- Result captured
    |
    v
ExecutionResult {
  success: boolean,
  action: "renew",
  permitId: "D0056240",
  error?: string,
  duration: 45000  // ms
}
```

**Handler Bridge:**

```typescript
// src/handlers/bridge.ts

async function executeAction(decision: ActionDecision): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    switch (decision.action) {
      case "CREATE":
        const createResult = await createPermit({
          flow: "existing-company",
          companyName: decision.context.projectName,
          headless: true
        });
        return {
          success: createResult.success,
          action: "create",
          applicationId: createResult.applicationId,
          duration: Date.now() - startTime
        };

      case "RENEW":
        const renewResult = await renewPermit({
          permitId: decision.permitId,
          headless: true
        });
        return {
          success: renewResult.success,
          action: "renew",
          permitId: decision.permitId,
          duration: Date.now() - startTime
        };

      case "CLOSE":
        const closeResult = await closePermit({
          permitId: decision.permitId,
          reason: decision.params?.reason,
          headless: true
        });
        return {
          success: closeResult.success,
          action: "close",
          permitId: decision.permitId,
          duration: Date.now() - startTime
        };

      default:
        return { success: false, error: `Unknown action: ${decision.action}` };
    }
  } catch (error) {
    return {
      success: false,
      action: decision.action.toLowerCase(),
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    };
  }
}
```

## Component Interaction Diagram

```
                                    SYSTEM OVERVIEW

+------------------------------------------+
|          MICROSOFT GRAPH                 |
|  (Push notifications via webhook)        |
+------------------------------------------+
                    |
                    v
+------------------------------------------+
|          WEBHOOK RECEIVER                |
|  POST /api/webhook/email                 |
|  - Validate clientState                  |
|  - Respond 202 immediately               |
|  - Queue for processing                  |
+------------------------------------------+
                    |
                    v
+------------------------------------------+
|          EMAIL PROCESSOR                 |
|  (Async worker)                          |
|                                          |
|  +------------------------------------+  |
|  | 1. FETCH: Graph API get message   |  |
|  +------------------------------------+  |
|                    |                     |
|                    v                     |
|  +------------------------------------+  |
|  | 2. CLASSIFY: LLM intent detection |  |
|  +------------------------------------+  |
|                    |                     |
|                    v                     |
|  +------------------------------------+  |
|  | 3. LINK: Project/permit matching  |  |
|  +------------------------------------+  |
|                    |                     |
|                    v                     |
|  +------------------------------------+  |
|  | 4. RESOLVE: Intent + state matrix |  |
|  +------------------------------------+  |
|                    |                     |
|                    v                     |
|  +------------------------------------+  |
|  | 5. GATE: Confidence routing       |  |
|  +------------------------------------+  |
|                    |                     |
+------------------------------------------+
           |                    |
           v                    v
+------------------+  +------------------+
|   AUTO-EXECUTE   |  |   HUMAN QUEUE    |
|   (High conf)    |  |   (Low conf)     |
+------------------+  +------------------+
           |                    |
           v                    v
+------------------+  +------------------+
|   HANDLERS       |  |   REVIEW UI      |
| - create.ts      |  | - Full context   |
| - renew.ts       |  | - Approve/Reject |
| - close.ts       |  | - Edit action    |
+------------------+  +------------------+
           |                    |
           v                    v
+------------------------------------------+
|          PORTAL AUTOMATION               |
|  (Playwright browser automation)         |
+------------------------------------------+
                    |
                    v
+------------------------------------------+
|          MARICOPA COUNTY PORTAL          |
+------------------------------------------+
```

## Patterns to Follow

### Pattern 1: Webhook Acknowledgment Within 3 Seconds

**What:** Microsoft Graph webhooks require a response within 3 seconds or the notification is retried.

**When:** Always, for every webhook notification.

**Why:** Microsoft's architecture assumes fast acknowledgment. Long-running processing blocks the response and causes duplicate deliveries.

**Example:**
```typescript
export async function handleWebhook(req: Request): Promise<Response> {
  // Validate and acknowledge IMMEDIATELY
  const body = await req.json();

  // Queue for async processing - DO NOT await
  queueEmailEvent(body.value).catch(console.error);

  // Return 202 within 3 seconds
  return new Response(null, { status: 202 });
}
```

### Pattern 2: Idempotent Processing

**What:** Process each email event exactly once, even if delivered multiple times.

**When:** All webhook handlers.

**Why:** Microsoft Graph may retry notifications. Processing the same email twice could create duplicate permits.

**Example:**
```typescript
const processedEvents = new Map<string, Date>();

async function processEmailEvent(event: EmailEvent): Promise<void> {
  const eventKey = `${event.mailbox}:${event.resourceId}`;

  if (processedEvents.has(eventKey)) {
    console.log(`Skipping duplicate event: ${eventKey}`);
    return;
  }

  processedEvents.set(eventKey, new Date());

  // Process the event...

  // Cleanup old entries periodically
  const oneHourAgo = Date.now() - 3600000;
  for (const [key, date] of processedEvents) {
    if (date.getTime() < oneHourAgo) {
      processedEvents.delete(key);
    }
  }
}
```

### Pattern 3: Project-Centric State Machine

**What:** Treat the project (not the email) as the primary entity. Emails are signals that trigger state transitions.

**When:** Designing the linking and action resolution stages.

**Why:** An email saying "close the permit" means nothing without knowing which permit and its current status.

**Example:**
```typescript
type ProjectState = {
  projectId: string;
  name: string;
  permits: Permit[];
  currentPermit: Permit | null;
  pendingActions: PendingAction[];
};

function applyEmailSignal(state: ProjectState, email: ClassifiedEmail): ProjectState {
  // Email triggers a state transition, not a standalone action
  switch (email.intent) {
    case "renewal":
      if (state.currentPermit?.status === "Active") {
        return {
          ...state,
          pendingActions: [...state.pendingActions, { type: "renew", permitId: state.currentPermit.id }]
        };
      }
      break;
    // ... other cases
  }
  return state;
}
```

### Pattern 4: Confidence-Gated Execution

**What:** Use confidence thresholds to determine automatic execution vs human review.

**When:** After action resolution, before execution.

**Why:** Some cases are obvious (high confidence), others need human judgment. Binary automation fails both.

**Example:**
```typescript
const THRESHOLDS = {
  AUTO_EXECUTE: 0.85,  // Above this: execute automatically
  QUICK_REVIEW: 0.70,  // Above this: single-click approve
  FULL_REVIEW: 0.00    // Below quick_review: detailed review
} as const;

function calculateConfidence(
  classificationConfidence: number,
  linkingConfidence: number,
  actionClarity: number  // 1.0 for matrix match, 0.5 for edge cases
): number {
  // Geometric mean prevents one low score from being hidden
  return Math.pow(
    classificationConfidence * linkingConfidence * actionClarity,
    1/3
  );
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Blocking Webhook Response

**What:** Performing classification, linking, or execution synchronously in the webhook handler.

**Why bad:** Microsoft Graph requires response within 3 seconds. Any non-trivial processing exceeds this.

**Instead:** Acknowledge immediately (202), queue for async processing.

### Anti-Pattern 2: Email-Centric Actions

**What:** Treating each email as an independent action without project context.

**Why bad:** "Close the permit" email is meaningless without knowing which project, which permit, and current state.

**Instead:** Always link email to project first, then resolve action based on project state.

### Anti-Pattern 3: Binary Confidence (All or Nothing)

**What:** Either fully automate (100% confidence) or always queue (0% confidence).

**Why bad:** Leaves value on the table. Many cases are 80-90% confident and safe to automate.

**Instead:** Tiered thresholds with different review levels.

### Anti-Pattern 4: Single Retry Forever

**What:** Retrying failed executions indefinitely.

**Why bad:** Creates thundering herds, wastes resources, may hit rate limits.

**Instead:** Exponential backoff with max retries. Dead-letter queue for persistent failures.

### Anti-Pattern 5: Ignoring Duplicate Notifications

**What:** Not tracking processed events, leading to duplicate actions.

**Why bad:** Could create two permits for the same request, or renew a permit twice.

**Instead:** Track processed event IDs (resource ID + mailbox), skip duplicates.

## Integration with Existing Codebase

### Fits Into Existing Architecture

```
auto-permit/
├── src/
│   ├── api/
│   │   ├── webhook.ts        # NEW: Webhook receiver
│   │   ├── email.ts          # EXISTING: Email templates
│   │   └── permits.ts        # EXISTING: Permit API
│   │
│   ├── handlers/
│   │   ├── create.ts         # EXISTING: Permit creation
│   │   ├── renew.ts          # EXISTING: Permit renewal
│   │   ├── close.ts          # EXISTING: Permit closing
│   │   └── bridge.ts         # NEW: Handler bridge for email trigger
│   │
│   ├── lib/
│   │   ├── email-classifier.ts  # EXISTING: LLM classification
│   │   └── project-linker.ts    # NEW: Email-to-project linking
│   │
│   ├── email/
│   │   ├── client.ts         # EXISTING: GraphEmailClient
│   │   └── subscription.ts   # NEW: Webhook subscription management
│   │
│   └── trigger/              # NEW: Email trigger orchestration
│       ├── processor.ts      # Async email processing
│       ├── resolver.ts       # Action resolution matrix
│       ├── gate.ts           # Confidence routing
│       └── queue.ts          # Human review queue
```

### Reuses Existing Components

| Existing Component | Reused By |
|-------------------|-----------|
| `GraphEmailClient` in client.ts | Webhook processor (fetch email) |
| `classifyEmail()` in email-classifier.ts | Classification stage |
| `createPermit()` in create.ts | Execution stage |
| `renewPermit()` in renew.ts | Execution stage |
| `closePermit()` in close.ts | Execution stage |
| `revisePermit()` in revise.ts | Execution stage |
| `withBrowser()` in browser.ts | All handlers |
| SQLite databases | Linking stage |

### New Entry Points

```typescript
// src/api/webhook.ts - New route in Bun.serve
"/api/webhook/email": {
  async POST(req) {
    return handleWebhook(req);
  }
}

// src/trigger/processor.ts - Orchestration
export async function processIncomingEmail(event: EmailEvent): Promise<ProcessingResult> {
  // 1. Fetch email
  const email = await fetchEmail(event);

  // 2. Classify
  if (!mightBeDustPermit(email)) {
    return { status: "skipped", reason: "not_dust_permit" };
  }
  const classification = await classifyEmail(email);

  // 3. Link to project
  const linked = await linkToProject(email, classification);

  // 4. Resolve action
  const decision = resolveAction(linked);

  // 5. Route through confidence gate
  const route = routeAction(decision);

  // 6. Execute or queue
  if (route.type === "auto") {
    return await executeAction(decision);
  }

  await addToReviewQueue(decision, route.tier);
  return { status: "queued", tier: route.tier };
}
```

## Suggested Build Order

Based on dependencies between components:

### Phase 1: Webhook Infrastructure (Foundation)

**Build first because:** Everything depends on receiving email events.

**Components:**
1. Webhook endpoint in Bun.serve
2. Validation token handling
3. ClientState verification
4. Event queueing
5. Microsoft Graph subscription management

**Dependencies:** None (greenfield)

**Test:** Can Microsoft Graph successfully deliver notifications to our endpoint?

### Phase 2: Email Fetching + Classification

**Build second because:** Need to understand what each email is about.

**Components:**
1. Fetch full email via Graph API
2. Integrate with existing email-classifier.ts
3. Add confidence scoring

**Dependencies:** Webhook infrastructure, existing GraphEmailClient, existing classifyEmail

**Test:** Given an email event, can we fetch and classify it correctly?

### Phase 3: Project Linking

**Build third because:** Actions require project context.

**Components:**
1. Project identifier extraction (permit ID, name, address)
2. Fuzzy matching against census.db
3. Permit state lookup from company-permits.sqlite
4. Match confidence scoring

**Dependencies:** Classification (provides intent), existing databases

**Test:** Given a classified email, can we find the correct project and permit state?

### Phase 4: Action Resolution + Confidence Gate

**Build fourth because:** Connects understanding to action.

**Components:**
1. Action resolution matrix implementation
2. Combined confidence calculation
3. Threshold-based routing logic
4. Queue storage for low-confidence items

**Dependencies:** Linking (provides project state), Classification (provides intent)

**Test:** Given intent + state, do we route to correct action or queue?

### Phase 5: Handler Bridge + Execution

**Build fifth because:** Actually performs the work.

**Components:**
1. Bridge from ActionDecision to handler input
2. Execution wrapper with error handling
3. Result logging and notification
4. Retry logic for transient failures

**Dependencies:** All above, existing handlers (create.ts, renew.ts, close.ts)

**Test:** Given an action decision, does the correct handler execute successfully?

### Phase 6: Human Review Queue UI

**Build last because:** Only needed when automation defers.

**Components:**
1. Queue listing endpoint
2. Full context display
3. Approve/reject/edit actions
4. Audit trail

**Dependencies:** All above (provides items for review)

**Test:** Can a human review a queued item and trigger execution?

## Sources

### Microsoft Graph Webhooks

- [Change Notifications via Webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks) - Official Microsoft documentation on receiving push notifications
- [Outlook Change Notifications Overview](https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview) - Email-specific subscription patterns
- [Create Subscription API](https://learn.microsoft.com/en-us/graph/api/subscription-post-subscriptions) - Creating webhook subscriptions
- [Microsoft Graph Webhooks Best Practices](https://www.voitanos.io/blog/microsoft-graph-webhook-delta-query/) - Production patterns

### Webhook Architecture

- [Webhook Design Patterns](https://dave.dev/blog/2022/11/01-11-2022-webhook-architecture/) - Core architectural patterns
- [Webhook Architecture Real-Time Integrations](https://technori.com/news/webhook-architecture-real-time-integrations/) - Real-time integration patterns
- [System Design Handbook: Webhook System](https://www.systemdesignhandbook.com/guides/design-a-webhook-system/) - Step-by-step design guide
- [Webhook Deep Dive](https://ably.com/topic/webhooks) - Conceptual deep dive

### Human-in-the-Loop Automation

- [Human in the Loop Automation](https://blog.n8n.io/human-in-the-loop-automation/) - Building AI workflows with human control
- [Human-in-the-Loop Patterns](https://zapier.com/blog/human-in-the-loop/) - Patterns for human oversight
- [Guide to Human-in-the-Loop Automation](https://matterway.io/blogs/guide-human-in-the-loop-automation) - Ultimate guide
- [Confidence Thresholds and Escalation](https://galileo.ai/blog/human-in-the-loop-agent-oversight) - Building agent oversight systems

### Intent Classification

- [Intent Classification Pipeline](https://langfuse.com/guides/cookbook/example_intent_classification_pipeline) - Building classification pipelines
- [Email Intent Classification](https://medium.com/@ashwithashettyyy/from-inbox-chaos-to-order-creating-an-nlp-model-to-classify-email-intent-3f6bcbd3d5cd) - NLP model for email classification
- [Intent Classification Techniques](https://labelyourdata.com/articles/machine-learning/intent-classification) - 2025 techniques for NLP models

### Existing Codebase

- `/Users/chiejimofor/Documents/Github/auto-permit/src/lib/email-classifier.ts` - Existing LLM classification
- `/Users/chiejimofor/Documents/Github/auto-permit/src/email/client.ts` - Existing GraphEmailClient
- `/Users/chiejimofor/Documents/Github/auto-permit/src/handlers/*.ts` - Existing permit handlers
