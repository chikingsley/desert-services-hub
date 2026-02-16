# Domain Pitfalls: Email-Triggered Automation System

**Domain:** Email-triggered dust permit automation with Microsoft Graph webhooks
**Researched:** 2026-01-24
**Confidence:** MEDIUM-HIGH (verified against Microsoft Graph docs, community reports, existing codebase patterns)

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

---

### Pitfall 1: Microsoft Graph Webhook Subscription Expiration

**What goes wrong:** Subscriptions silently expire and notifications stop flowing. The system continues running but no longer receives email events. This can go undetected for hours or days.

**Why it happens:**
- Email webhook subscriptions with rich notifications expire in ~1 day (not the documented 4-7 days)
- Lifecycle notifications (`reauthorizationRequired`, `subscriptionRemoved`) may not be delivered reliably
- Token expiration can cause cascading reauthorization loops
- No proactive monitoring means silent failures

**Consequences:**
- Emails arrive but system doesn't process them
- Backlog builds up undetected
- Manual intervention required to restart processing
- Trust in automation erodes

**Warning signs:**
- Processing volume drops to zero with no errors logged
- Lifecycle notifications show `reauthorizationRequired` in a loop
- Subscription renewal API calls fail repeatedly with "validation request timed out"

**Prevention:**
1. Set subscription expiration close to maximum (~4,000 minutes)
2. Implement proactive renewal at 50% lifetime (not 90%)
3. Use `lifecycleNotificationUrl` for async lifecycle events
4. Add heartbeat monitoring: if no emails processed in X minutes, check subscription status
5. Combine webhooks with scheduled delta query fallback (hybrid approach)

```typescript
// Proactive renewal pattern
const RENEWAL_BUFFER_HOURS = 24; // Renew 24h before expiration

async function ensureSubscriptionActive(subscriptionId: string): Promise<void> {
  const sub = await getSubscription(subscriptionId);
  const expiresAt = new Date(sub.expirationDateTime);
  const renewalTime = new Date(expiresAt.getTime() - RENEWAL_BUFFER_HOURS * 60 * 60 * 1000);

  if (new Date() >= renewalTime) {
    await renewSubscription(subscriptionId);
  }
}
```

**Detection:** Log subscription status on every renewal. Alert if renewal fails twice consecutively. Monitor "last email processed" timestamp.

**Phase to address:** Phase 1 - Webhook Infrastructure. Critical foundation before any email processing logic.

**Sources:**
- [Microsoft Graph Lifecycle Events](https://learn.microsoft.com/en-us/graph/change-notifications-lifecycle-events)
- [Microsoft Q&A: Subscription Expiring in 1 Day](https://learn.microsoft.com/en-us/answers/questions/5525734/microsoft-graph-email-webhook-subscriptions-expiri)

---

### Pitfall 2: Duplicate Email Processing (At-Least-Once Delivery)

**What goes wrong:** The same email triggers multiple actions: permit created twice, renewal submitted twice, conflicting close requests. Duplicate processing corrupts state and wastes portal interactions.

**Why it happens:**
- Microsoft Graph provides at-least-once delivery (may send same notification multiple times)
- Network retries when webhook endpoint is slow to respond
- Subscription overlaps during renewal windows
- No idempotency enforcement at the handler level
- Email arrives in multiple monitored mailboxes (forwarded, CC'd)

**Consequences:**
- Duplicate permits created in portal
- Portal sessions conflict (one overwrites the other)
- Wasted API calls and browser automation
- Inconsistent state between email record and portal

**Warning signs:**
- Same email ID appears multiple times in processing logs
- Portal shows duplicate submissions
- Rate limiting kicks in unexpectedly

**Prevention:**
1. Store `messageId` in SQLite with UNIQUE constraint before processing
2. Use `INSERT OR IGNORE` pattern to skip duplicates atomically
3. Track `conversationId` to identify related emails across mailboxes
4. Implement distributed lock per `messageId` for parallel workers

```typescript
// Idempotency pattern for SQLite
const PROCESSED_EMAILS_TABLE = `
CREATE TABLE IF NOT EXISTS processed_emails (
  message_id TEXT PRIMARY KEY,
  conversation_id TEXT,
  processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  action TEXT,
  result TEXT
);
CREATE INDEX IF NOT EXISTS idx_conversation ON processed_emails(conversation_id);
`;

function isAlreadyProcessed(messageId: string): boolean {
  const stmt = db.prepare('INSERT OR IGNORE INTO processed_emails (message_id) VALUES (?)');
  const result = stmt.run(messageId);
  return result.changes === 0; // 0 means row already existed
}
```

**Detection:** Log duplicate attempts. Alert if same email processed more than once within 5 minutes.

**Phase to address:** Phase 2 - Email Processing Pipeline. Must be in place before any action handlers are connected.

**Sources:**
- [Hookdeck: Implement Webhook Idempotency](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency)
- [DEV: Webhooks at Scale](https://dev.to/art_light/webhooks-at-scale-designing-an-idempotent-replay-safe-and-observable-webhook-system-7lk)

---

### Pitfall 3: Race Conditions (Email Arrives During Action)

**What goes wrong:** New email arrives while previous action is still running. System either ignores the new signal (missing data) or attempts concurrent action (conflict). Common scenario: "renewal approved" email arrives while renewal automation is mid-flight.

**Why it happens:**
- Permit actions take 30-90 seconds (browser automation)
- Emails can arrive at any time
- No coordination between running actions and new email processing
- Project state changes mid-action but email processor reads stale state

**Consequences:**
- Action starts based on stale project state
- Conflicting portal sessions cause form errors
- "Double renewal" where system renews and then tries to renew again
- Lost email signals that should have modified behavior

**Warning signs:**
- Browser automation errors about "element not found" or "session conflict"
- Portal shows unexpected state after action completes
- Logs show two actions running for same project simultaneously

**Prevention:**
1. Implement per-project mutex/lock before starting any action
2. Queue incoming emails for project if action is in progress
3. Re-fetch project state immediately before action execution
4. Mark project as "action in progress" in database

```typescript
// Per-project locking pattern
interface ProjectLock {
  projectId: string;
  actionType: string;
  startedAt: Date;
  releaseAfterMs: number;
}

const PROJECT_LOCKS_TABLE = `
CREATE TABLE IF NOT EXISTS project_locks (
  project_id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
`;

async function withProjectLock<T>(
  projectId: string,
  actionType: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockAcquired = acquireLock(projectId, actionType);
  if (!lockAcquired) {
    throw new Error(`Project ${projectId} is currently locked for action`);
  }
  try {
    return await fn();
  } finally {
    releaseLock(projectId);
  }
}
```

**Detection:** Log lock acquisition/release. Alert on lock timeout (action took too long). Track queued emails per project.

**Phase to address:** Phase 3 - Action Execution. Required before connecting to existing handlers.

**Sources:**
- [Imperva: Race Condition Prevention](https://www.imperva.com/learn/application-security/race-condition/)
- [CodeCurated: Mastering Race Conditions](https://www.codecurated.com/blog/mastering-race-conditions-strategies-for-reliable-software-systems/)

---

### Pitfall 4: LLM Overconfidence in Action Classification

**What goes wrong:** AI classifier reports high confidence (0.9+) on ambiguous cases, triggering auto-execution of wrong actions. Creates permits that shouldn't exist, closes active projects, or renews already-expired permits.

**Why it happens:**
- LLMs are calibrated poorly - they express high confidence even when uncertain
- Email context is often insufficient (partial info, missing attachments)
- Edge cases not represented in training/prompting
- Confidence score reflects pattern match, not semantic understanding
- No feedback loop from execution outcomes to classifier

**Consequences:**
- Wrong action executed automatically
- Costly to reverse (portal doesn't have "undo")
- Client confusion when they receive unexpected notifications
- Trust in automation destroyed

**Warning signs:**
- Classification accuracy on held-out examples is lower than confidence suggests
- Classifier returns same high confidence for obviously ambiguous cases
- Edge cases always get medium confidence (threshold gaming)

**Prevention:**
1. **Conservative thresholds:** Start with 0.95+ for auto-execute, lower over time as you validate
2. **Calibration testing:** Run classifier on labeled holdout set, compare confidence to accuracy
3. **Explicit "uncertain" output:** Train classifier to say "I don't know" instead of guessing
4. **Multi-signal validation:** Require multiple indicators (subject + body + sender + project state) to agree
5. **Human feedback loop:** Track which auto-executions were correct, adjust thresholds

```typescript
// Conservative confidence handling
interface ClassificationResult {
  intent: EmailIntent;
  confidence: number;
  signals: {
    subjectMatch: boolean;
    bodyMatch: boolean;
    senderKnown: boolean;
    projectStateConsistent: boolean;
  };
}

const AUTO_EXECUTE_THRESHOLD = 0.95;
const QUEUE_FOR_REVIEW_THRESHOLD = 0.70;

function routeByConfidence(result: ClassificationResult): 'auto' | 'review' | 'ignore' {
  // Require multiple signals to agree for auto-execute
  const signalCount = Object.values(result.signals).filter(Boolean).length;

  if (result.confidence >= AUTO_EXECUTE_THRESHOLD && signalCount >= 3) {
    return 'auto';
  } else if (result.confidence >= QUEUE_FOR_REVIEW_THRESHOLD) {
    return 'review';
  }
  return 'ignore';
}
```

**Detection:** Log confidence scores for all classifications. Track auto-execute accuracy weekly. Flag sudden confidence distribution changes.

**Phase to address:** Phase 4 - Classification & Routing. Critical design decision before connecting to execution.

**Sources:**
- [arXiv: Agentic Confidence Calibration](https://arxiv.org/html/2601.15778)
- [GenAI E-Commerce: Confidence Calibration Pipelines](https://genai-ecommerce.github.io/assets/papers/GenAIECommerce2024/Genaiecom24_paper_17.pdf)
- [arXiv: Overconfidence in LLM-as-a-Judge](https://arxiv.org/html/2508.06225v2)

---

### Pitfall 5: Thread Message Confusion (Which Email is Actionable?)

**What goes wrong:** System processes old email in thread instead of newest. Or processes reply when original was the actionable one. Or processes forwarded email that was just FYI.

**Why it happens:**
- Email threads have multiple messages with same `conversationId`
- Webhook may fire for any message in thread (reply, forward)
- "Latest" by timestamp isn't always "most actionable"
- Forwarded emails contain original content but different intent
- Reply emails may just say "Thanks" with no action needed

**Consequences:**
- Action triggered on stale information
- Same request processed multiple times (once per reply)
- "Thanks for submitting" email triggers another submission
- Human review queue flooded with non-actionable replies

**Warning signs:**
- Multiple actions triggered for same thread
- Actions triggered on very short emails ("OK", "Thanks")
- System processes emails from internal staff as if external requests

**Prevention:**
1. Fetch full thread context before processing any single message
2. Identify "thread head" (original message) vs replies
3. Check if message body is substantial (not just acknowledgment)
4. Track processed `conversationId` to avoid re-processing threads
5. Special handling for forwarded emails (detect "FW:" prefix, different sender)

```typescript
// Thread-aware processing
async function processEmailWithContext(
  messageId: string,
  userId: string
): Promise<ProcessingResult> {
  // Get full thread
  const thread = await emailClient.getThreadByMessageId(messageId, userId);

  // Sort by date (oldest first for context)
  thread.sort((a, b) =>
    new Date(a.receivedDateTime).getTime() - new Date(b.receivedDateTime).getTime()
  );

  // Find the triggering message
  const triggerMessage = thread.find(m => m.id === messageId);

  // Is this just an acknowledgment?
  if (isAcknowledgmentOnly(triggerMessage)) {
    return { action: 'ignore', reason: 'acknowledgment-only' };
  }

  // Is this a forward for FYI?
  if (isForwardWithNoAction(triggerMessage)) {
    return { action: 'ignore', reason: 'fyi-forward' };
  }

  // Use full thread context for classification
  return classifyWithThreadContext(thread, triggerMessage);
}

function isAcknowledgmentOnly(email: EmailMessage): boolean {
  const bodyText = stripHtml(email.bodyContent).trim().toLowerCase();
  const ackPatterns = ['thanks', 'thank you', 'ok', 'sounds good', 'got it', 'received'];
  return ackPatterns.some(p => bodyText === p || bodyText.startsWith(p + '.'));
}
```

**Detection:** Log thread depth and position for each processed email. Alert if same conversationId triggers multiple actions.

**Phase to address:** Phase 2 - Email Processing Pipeline. Context gathering before classification.

**Sources:**
- [Gmelius: Email Thread Best Practices](https://gmelius.com/blog/email-thread-best-practices-gs)
- [ActiveCampaign: Email Threading in Automations](https://help.activecampaign.com/hc/en-us/articles/8727397234204-How-to-use-1-1-email-threading-in-Automations)

---

## Moderate Pitfalls

Mistakes that cause delays or technical debt.

---

### Pitfall 6: Webhook Endpoint Timeout (Blocking Response)

**What goes wrong:** Webhook endpoint does heavy processing before responding. Microsoft times out, retries, and eventually marks subscription as unhealthy.

**Why it happens:**
- Email classification takes 1-5 seconds (LLM call)
- Project lookup and state checks add latency
- Action execution can take 30+ seconds
- Processing done synchronously in webhook handler

**Prevention:**
1. Return 202 Accepted within 3 seconds
2. Queue message for async processing
3. Use database as queue (not in-memory)
4. Process queue in separate worker

```typescript
// Queue-first webhook pattern
app.post('/webhook/email', async (req, res) => {
  const notification = req.body;

  // Validate notification (must be fast)
  if (!isValidNotification(notification)) {
    return res.status(400).send('Invalid notification');
  }

  // Queue for async processing
  await queueEmailNotification(notification);

  // Respond immediately
  res.status(202).send('Accepted');
});

// Separate worker processes queue
async function processEmailQueue(): Promise<void> {
  while (true) {
    const notification = await dequeueNextNotification();
    if (notification) {
      await processEmailNotification(notification);
    } else {
      await sleep(1000); // No work, wait before polling again
    }
  }
}
```

**Phase to address:** Phase 1 - Webhook Infrastructure.

**Sources:**
- [Microsoft: Receive Change Notifications via Webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)

---

### Pitfall 7: No Graceful Degradation When Classifier Fails

**What goes wrong:** LLM API is down or slow. System either blocks entirely or skips all emails. No middle ground.

**Why it happens:**
- Single classifier endpoint with no fallback
- No circuit breaker pattern
- No rule-based fallback for obvious cases
- Timeout causes retry loop

**Prevention:**
1. Implement rule-based pre-filter for obvious cases (keyword matching)
2. Circuit breaker on LLM calls
3. Queue for later retry on transient failures
4. Alert on sustained classifier failures

```typescript
// Fallback classification chain
async function classifyWithFallback(email: EmailInput): Promise<ClassificationResult> {
  // Level 1: Rule-based pre-filter
  const ruleResult = classifyByRules(email);
  if (ruleResult.confidence > 0.9) {
    return ruleResult;
  }

  // Level 2: LLM classification with timeout
  try {
    return await withTimeout(
      classifyWithLLM(email),
      5000, // 5 second timeout
      { intent: 'unknown', confidence: 0 }
    );
  } catch (error) {
    // Level 3: Queue for manual review
    return {
      intent: 'unknown',
      confidence: 0,
      reason: 'classifier-unavailable'
    };
  }
}
```

**Phase to address:** Phase 4 - Classification & Routing.

---

### Pitfall 8: Missing Audit Trail for Automated Actions

**What goes wrong:** Can't trace back why an action was taken. When something goes wrong, impossible to debug. No evidence for compliance.

**Prevention:**
1. Log every decision point with inputs and outputs
2. Store full email content that triggered action
3. Record classifier confidence and all signals
4. Link action log to permit database record

**Phase to address:** Phase 3 - Action Execution.

---

### Pitfall 9: Human Review Queue Grows Unbounded

**What goes wrong:** Low-confidence emails pile up. Nobody reviews them. Queue becomes useless noise.

**Prevention:**
1. Set SLA for review (e.g., 24 hours)
2. Auto-escalate stale items
3. Periodic queue cleanup (archive old items)
4. Dashboard showing queue health metrics

**Phase to address:** Phase 5 - Human-in-the-Loop.

---

### Pitfall 10: Portal Session Conflicts with Concurrent Workers

**What goes wrong:** Multiple workers try to use portal simultaneously. Session cookies conflict. One action corrupts another.

**Why it happens:**
- Browser automation shares login state
- Portal doesn't support concurrent sessions
- Workers race to acquire portal access

**Prevention:**
1. Single portal session pool with mutex
2. Sequential action execution for same portal
3. Session health check before each action
4. Automatic re-login on session expiry

**Phase to address:** Phase 3 - Action Execution.

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable.

---

### Pitfall 11: Webhook Validation URL Not Accessible

**What goes wrong:** Subscription creation fails because Microsoft can't reach validation endpoint. Error: "Subscription validation request timed out."

**Prevention:**
- Use ngrok or similar for local development
- Ensure production endpoint is publicly accessible
- Implement `/webhook` endpoint that handles validation token response

**Phase to address:** Phase 1 - Webhook Infrastructure.

---

### Pitfall 12: Email Body HTML Parsing Issues

**What goes wrong:** Email body contains malformed HTML. Stripping HTML removes too much or too little. Classification gets corrupted input.

**Prevention:**
- Use robust HTML-to-text converter (turndown, htmlparser2)
- Handle encoding issues (UTF-8, quoted-printable)
- Truncate extremely long bodies before classification

**Phase to address:** Phase 2 - Email Processing Pipeline.

---

### Pitfall 13: Attachment Handling Complexity

**What goes wrong:** Important information is in attachment (PDF permit application). System only reads email body and misses context.

**Prevention:**
- Flag emails with attachments for special handling
- Extract text from PDF attachments for classification
- Surface attachment info in human review UI

**Phase to address:** Phase 4 - Classification & Routing (enhancement).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Webhook Infrastructure | Subscription expiration | Proactive renewal at 50% lifetime; hybrid webhook + polling |
| Webhook Infrastructure | Validation timeout | Return 202 within 3s; queue for async processing |
| Email Processing | Duplicate processing | UNIQUE constraint on messageId; INSERT OR IGNORE pattern |
| Email Processing | Thread confusion | Fetch full thread; identify actionable message |
| Action Execution | Race conditions | Per-project mutex; queue emails during active action |
| Action Execution | Portal session conflict | Single session pool; sequential execution |
| Classification | Overconfidence | Conservative thresholds (0.95+); multi-signal validation |
| Classification | Classifier downtime | Rule-based fallback; circuit breaker; queue for retry |
| Human-in-the-Loop | Unbounded queue | SLA enforcement; auto-escalation; cleanup policy |

## Summary

**Top 5 pitfalls to address first:**

1. **Webhook subscription expiration** - Silent failure mode; must have proactive renewal and monitoring
2. **Duplicate email processing** - At-least-once delivery requires idempotency at database level
3. **Race conditions** - Per-project locking prevents concurrent actions corrupting state
4. **LLM overconfidence** - Conservative thresholds prevent wrong auto-executions
5. **Thread message confusion** - Full thread context prevents processing wrong message

**Research confidence:**
- Microsoft Graph webhooks: HIGH (verified against official docs and community Q&A)
- Idempotency patterns: HIGH (well-established patterns in webhook literature)
- Race condition handling: MEDIUM (standard patterns apply, but portal-specific nuances need validation)
- LLM confidence calibration: MEDIUM (active research area, requires experimentation)
- Thread handling: MEDIUM (depends on specific email patterns in dust permit domain)

## Sources

### Microsoft Graph Documentation

- [Lifecycle Events for Subscriptions](https://learn.microsoft.com/en-us/graph/change-notifications-lifecycle-events)
- [Receive Change Notifications via Webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)
- [Subscription Resource Type](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0)
- [Microsoft Graph Known Issues](https://developer.microsoft.com/en-us/graph/known-issues)

### Microsoft Q&A (Real User Issues)

- [Subscription Expiring in 1 Day](https://learn.microsoft.com/en-us/answers/questions/5525734/microsoft-graph-email-webhook-subscriptions-expiri)
- [Reauthorization Loop Issues](https://learn.microsoft.com/en-us/answers/questions/5574982/graph-api-webhook-receiving-constant-reauthorizati)
- [Change Notifications Stop Being Delivered](https://learn.microsoft.com/en-us/answers/questions/2070499/microsoft-graph-change-notifications-not-working-w)
- [Subscription Validation Timeout](https://github.com/microsoftgraph/msgraph-sdk-dotnet/issues/2805)

### Webhook & Idempotency Patterns

- [Hookdeck: Implement Webhook Idempotency](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency)
- [DEV: Webhooks at Scale](https://dev.to/art_light/webhooks-at-scale-designing-an-idempotent-replay-safe-and-observable-webhook-system-7lk)
- [Hookdeck: Webhooks Best Practices](https://hookdeck.com/blog/webhooks-at-scale)

### LLM Confidence & Human-in-the-Loop

- [arXiv: Agentic Confidence Calibration](https://arxiv.org/html/2601.15778)
- [Permit.io: Human-in-the-Loop for AI Agents](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo)
- [Zapier: Human-in-the-Loop Patterns](https://zapier.com/blog/human-in-the-loop/)
- [arXiv: Overconfidence in LLM-as-a-Judge](https://arxiv.org/html/2508.06225v2)

### Race Conditions

- [Imperva: Race Condition Prevention](https://www.imperva.com/learn/application-security/race-condition/)
- [CodeCurated: Mastering Race Conditions](https://www.codecurated.com/blog/mastering-race-conditions-strategies-for-reliable-software-systems/)

### Project-Specific

- Existing email client: `/Users/chiejimofor/Documents/Github/auto-permit/src/email/client.ts`
- Existing classifier: `/Users/chiejimofor/Documents/Github/auto-permit/src/lib/email-classifier.ts`
- Existing handlers: `/Users/chiejimofor/Documents/Github/auto-permit/src/handlers/`
