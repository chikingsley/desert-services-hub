# Feature Landscape: Email-Triggered Dust Permit Automation

**Domain:** Email-to-action automation for dust permit processing
**Researched:** 2026-01-24
**Confidence:** MEDIUM (existing codebase provides HIGH context; industry patterns from WebSearch provide MEDIUM confidence)

## Context

This milestone adds email-triggered automation to an existing dust permit system. The system already has:
- Portal automation handlers (`close`, `renew`, `create`, `revise`, `delete`, `sync`)
- Microsoft Graph email integration with search and attachment handling
- Email classifier using local LLM for dust permit detection
- Permit database with project/status tracking
- Email census database with ~48k emails and project linking

**Core value:** When a dust permit email arrives, the right action happens automatically - or a human is prompted with full context to decide.

**Input patterns:**
- ~1,800 emails match "dust permit" keywords in existing corpus
- Emails arrive in threads - latest message is usually actionable
- Same project can have multiple actions across different threads
- Actions to trigger: create permit draft, renew permit, close permit, request missing documents

---

## Table Stakes

Features users expect. Missing = system is broken or feels incomplete.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Email arrival detection** | System must know when emails arrive, not poll periodically | Medium | Microsoft Graph webhooks | Webhook subscription with renewal handling |
| **Dust permit filtering** | Not all emails need processing - filter first | Low | Existing `mightBeDustPermit()` keyword filter | Pre-filter before expensive LLM classification |
| **Intent classification** | Must determine what action email requests | Low | Existing `classifyEmail()` LLM classifier | Already supports intake/renewal/revision/contact/notification/ignore |
| **Confidence scoring** | Need to know when to auto-execute vs route to human | Medium | LLM response parsing | Threshold-based routing (e.g., 80% auto, <80% review queue) |
| **Project linking** | Email must be matched to correct project/permit | Medium | Census DB fuzzy matching, permit DB lookup | Critical - action means nothing without knowing which permit |
| **Action execution** | High-confidence triggers must call existing handlers | Low | Existing handlers: `closePermit()`, `renewPermit()`, etc. | Handlers already exist, need orchestration layer |
| **Human review queue** | Low-confidence cases need manual review | Medium | Queue data structure, UI for review | Must include full context: email, project state, suggested action |
| **Processed email tracking** | Don't process same email twice | Low | SQLite with message IDs | Idempotency key per email |
| **Basic error handling** | Must not crash on malformed emails or API failures | Low | Try-catch, retry logic | Log errors, continue processing other emails |

### Table Stakes: Email Processing Fundamentals

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Webhook endpoint** | Microsoft Graph needs HTTPS endpoint to call | Low | Publicly accessible HTTPS URL | Validation token handshake required |
| **Subscription lifecycle** | Subscriptions expire, must auto-renew | Low | Background job or cron | Max 4320 minutes (3 days) for mail, must renew before expiry |
| **Multiple mailbox support** | Company may have multiple inboxes to monitor | Medium | Subscription per mailbox | 1000 subscription limit per mailbox |
| **Thread context** | Need to understand email is part of conversation | Low | `conversationId` field already in email types | Don't classify isolated reply without thread context |
| **Sender identification** | Know if sender is client, contractor, or county | Low | Domain/email matching | County emails (maricopa.gov) are notifications, not requests |

---

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Intelligent thread summarization** | Summarize entire thread for context, not just latest email | Medium | LLM, thread fetch | Helps human reviewer understand history quickly |
| **Project state awareness** | Classifier sees permit status (active, expired, none) to inform decision | Medium | Permit DB lookup before classification | "Close the permit" + "No active permit" = ERROR, not action |
| **Multi-signal confidence** | Combine LLM confidence + project state match + sender credibility | Medium | Weighted scoring | More signals = better routing decisions |
| **Proactive document request** | When docs missing for action, auto-draft request email | High | Template system, attachment detection | Identifies what's needed, drafts polite request |
| **Action preview** | Before executing, show human what will happen | Low | Dry-run mode in handlers | "Will close permit D0056240 for project XYZ" |
| **Audit trail** | Full log of why each decision was made | Low | Structured logging | Compliance, debugging, continuous improvement |
| **Real-time status updates** | Notify when action completes or fails | Medium | WebSocket or email notification | Human knows outcome without checking manually |
| **Automatic deadline detection** | Extract deadlines from email (renewal due dates, etc.) | Medium | Date parsing, NLP | Adds urgency context to review queue |
| **Attachment processing** | Extract permit numbers, APNs from attached PDFs | High | PDF extraction (already have for map feature) | Enriches classification with document context |
| **Learning from corrections** | When human overrides, capture feedback | Medium | Feedback loop storage | Future model improvement data |
| **Batch processing** | Process backlog of historical emails | Low | Paginated fetch, rate limiting | Useful for initial setup and catch-up |

### Differentiator Details

#### Project State Awareness (HIGH value)

**Problem:** Email says "Please close the permit" but:
- Which permit? Project may have multiple.
- Is it even active? May already be closed.
- Is the sender authorized to request this?

**Solution approach:**
1. After classification, fetch project state from permit DB
2. Inject state into classification prompt: "Project ABC has active permit D0056240 expiring 2026-03-15"
3. Classifier can now make informed decision
4. State mismatch (e.g., close request for non-existent permit) triggers review queue

**Complexity:** MEDIUM - requires permit DB lookup, prompt enhancement

#### Multi-Signal Confidence (HIGH value, MEDIUM complexity)

**Problem:** LLM confidence alone is insufficient. Edge cases:
- LLM is 90% confident, but sender is unknown
- LLM is 60% confident, but project state perfectly matches
- LLM is 95% confident, but permit is already in-progress for another action

**Solution approach:**
Weighted confidence score:
```
finalConfidence =
  (llmConfidence * 0.5) +
  (projectStateMatch * 0.25) +
  (senderCredibility * 0.15) +
  (noConflictingAction * 0.10)
```

**Complexity:** MEDIUM - need to define weights, test thresholds

#### Proactive Document Request (MEDIUM value, HIGH complexity)

**Problem:** Many permit actions require documents (site plan, grading plan, etc.). If missing, human must manually request.

**Solution approach:**
1. Detect action requires documents (renewal needs current plan, etc.)
2. Check if attachments present in email
3. If missing, generate draft email requesting specific documents
4. Queue for human approval before sending

**Complexity:** HIGH - document requirement matrix, template generation, send flow

---

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **100% autonomous execution** | Risk of wrong action is too high; permit errors costly | Always have confidence threshold; never auto-execute below it |
| **Real-time email parsing in webhook handler** | Webhook must respond quickly (3 seconds); heavy processing times out | Webhook queues message ID; background worker processes |
| **Custom email UI** | Reinventing Outlook; not our core value | Review queue shows context, links to original email |
| **Retry on classification failure** | LLM failures should escalate, not loop | Route to human review when LLM fails |
| **Auto-execute on thread emails** | Mid-thread replies often lack context | Only auto-execute on thread-initiating emails; replies go to review |
| **Generic email automation platform** | Scope creep; this is dust permits only | Architect for extensibility, but implement only dust permit actions |
| **Polling for new emails** | Wastes resources, adds latency | Use Microsoft Graph push notifications (webhooks) |
| **Complex approval workflows** | Over-engineering; single reviewer is sufficient | One-click approve/reject in review queue |
| **Sentiment analysis for priority** | Adds complexity without clear value | Prioritize by permit expiration date, not email tone |
| **Multiple LLM calls per email** | Expensive, slow, diminishing returns | Single classification call with project context |
| **Undo/rollback for executed actions** | Portal actions are difficult to reverse | Focus on high-confidence execution; review queue is the safety net |

### Anti-Feature Rationale: Why Not Auto-Execute Everything?

**The 80/20 rule applies:**
- ~80% of emails have clear intent and can be auto-executed
- ~20% are ambiguous, multi-step, or high-risk

**Cost of false positive:**
- Closing wrong permit: Re-open requires county contact, delays project
- Creating duplicate permit: Cancellation process, wasted fees
- Missing deadline: Penalty fees, project delays

**The goal:** Auto-execute the 80% confidently, surface the 20% efficiently.

---

## Feature Dependencies

```
[Microsoft Graph Webhook]
         |
         v
[Keyword Pre-Filter] -----> (skip non-dust emails)
         |
         v
[Project Linking] <-------- [Census DB fuzzy match]
         |
         v
[Permit State Lookup] <---- [Permit DB query]
         |
         v
[LLM Classification] ------> [Intent + Confidence]
         |
         |-----> (include project state in prompt)
         v
[Multi-Signal Scoring] ----> [Final Confidence]
         |
    +----+----+
    |         |
    v         v
 HIGH      LOW
confidence confidence
    |         |
    v         v
[Execute   [Review
 Handler]   Queue]
    |         |
    v         v
[Audit     [Human
 Log]      Decision]
              |
         +----+----+
         |         |
         v         v
      Approve    Reject
         |
         v
    [Execute
     Handler]
```

**Critical path:**
1. Webhook endpoint (entry point)
2. Project linking (context required)
3. Classification (decision engine)
4. Confidence-based routing (safety gate)
5. Handler execution (value delivery)

**Parallel work possible:**
- Webhook setup independent of classification tuning
- Review queue UI independent of handler integration
- Audit logging can be added incrementally

---

## MVP Recommendation

For MVP, prioritize:

### Phase 1: Webhook Infrastructure (Table Stakes)

1. **Microsoft Graph webhook endpoint** - Entry point for email events
2. **Subscription lifecycle management** - Auto-renew before expiry
3. **Message queue for processing** - Decouple webhook from classification
4. **Processed email tracking** - Idempotency via message ID

### Phase 2: Classification Pipeline (Table Stakes)

5. **Project linking** - Match email to project/permit via fuzzy search
6. **Permit state lookup** - Inject current permit status into context
7. **Enhanced classification** - Existing classifier with project state context
8. **Confidence threshold routing** - 80%+ auto-execute, <80% review queue

### Phase 3: Execution & Review (Table Stakes + Key Differentiator)

9. **Handler orchestration** - Call existing handlers based on intent
10. **Review queue** - Simple list with email context, project state, suggested action
11. **One-click approve/reject** - Human decision captured and executed
12. **Audit trail** - Log all decisions with reasoning

### Defer to post-MVP:

- **Thread summarization** - Nice to have, adds complexity
- **Proactive document request** - High complexity, manual works for now
- **Multi-signal confidence** - Start with LLM confidence alone, iterate
- **Automatic deadline detection** - Can be added incrementally
- **Attachment processing** - PDF extraction is complex, defer unless critical

---

## Complexity Assessment Summary

| Complexity | Features |
|------------|----------|
| **Low** | Keyword pre-filter, intent classification (existing), handler execution (existing), processed email tracking, basic error handling, audit trail, action preview, batch processing |
| **Medium** | Webhook endpoint, subscription lifecycle, project linking, confidence scoring, human review queue, thread context, sender identification, multi-signal confidence, thread summarization, real-time status updates, deadline detection, learning from corrections |
| **High** | Proactive document request, attachment processing (PDF extraction) |

---

## Implementation Risks

### Risk 1: Webhook Endpoint Hosting

**Risk:** System needs publicly accessible HTTPS endpoint for Microsoft Graph webhooks
**Mitigation:** Use existing infrastructure (Vercel, Cloudflare Workers) or expose via ngrok for development
**Impact if unmitigated:** Cannot receive push notifications, must fall back to polling

### Risk 2: Classification Accuracy

**Risk:** LLM misclassifies email intent, wrong action executed
**Mitigation:** Conservative confidence threshold (80%+), human review for edge cases, continuous monitoring
**Impact if unmitigated:** Permit errors, customer trust damage

### Risk 3: Project Linking Accuracy

**Risk:** Email matched to wrong project, action executed on wrong permit
**Mitigation:** Fuzzy matching with confidence score, require exact match for auto-execute
**Impact if unmitigated:** Most dangerous failure mode - action on wrong permit

### Risk 4: Rate Limiting

**Risk:** Microsoft Graph API throttling under high email volume
**Mitigation:** Queue-based processing with backoff, batch operations where possible
**Impact if unmitigated:** Delayed processing, missed emails during throttle period

---

## Sources

### Verified (HIGH confidence)

- Existing codebase: `/Users/chiejimofor/Documents/Github/auto-permit/src/lib/email-classifier.ts`
- Existing codebase: `/Users/chiejimofor/Documents/Github/auto-permit/src/handlers/*.ts`
- Existing codebase: `/Users/chiejimofor/Documents/Github/auto-permit/src/email/types.ts`
- [Microsoft Graph Webhook Documentation](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)
- [Microsoft Graph Outlook Change Notifications](https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview)

### WebSearch (MEDIUM confidence)

- [Zapier: Human-in-the-Loop Patterns](https://zapier.com/blog/human-in-the-loop/) - Confidence-based routing patterns
- [n8n: Human in the Loop Automation](https://blog.n8n.io/human-in-the-loop-automation/) - HITL workflow design
- [AWS: Amazon Connect Email Workflows](https://aws.amazon.com/blogs/contact-center/boost-customer-service-with-amazon-connect-ai-enhanced-email-workflows/) - Confidence scoring deductions
- [SCIMUS: AI-Powered Mail Classification](https://thescimus.com/blog/ai-powered-mail-classification-models/) - Classification confidence patterns
- [Temporal: Idempotency](https://temporal.io/blog/idempotency-and-durable-execution) - Idempotent operation patterns
- [Architecture Weekly: Deduplication](https://www.architecture-weekly.com/p/deduplication-in-distributed-systems) - Message deduplication strategies
- [Salesforce Ben: Email-to-Case Deduplication](https://www.salesforceben.com/salesforce-email-to-case-the-best-method-to-eliminate-duplicates/) - Email dedup patterns
- [LangChain: Thinking in LangGraph](https://docs.langchain.com/oss/python/langgraph/thinking-in-langgraph) - Workflow node design
- [FlowWright: Email Classification Automation](https://www.flowwright.com/email-classification-using-flowwright-ai) - Intent-based routing

### WebSearch (LOW confidence - need validation)

- Global email automation market $15B by 2026 - verify with market research
- Autonomous workflow agents reduce routine approvals by 65% (UiPath claim) - verify source
- AI email assistance cuts composition time by 50% - anecdotal, varies by use case

---

## Open Questions

1. **Confidence threshold calibration** - What threshold balances auto-execution rate vs error rate? Start at 80%, tune based on data.

2. **Project linking algorithm** - How to handle fuzzy matching when project names are similar? May need human disambiguation step.

3. **Handler error recovery** - What happens when handler partially succeeds (e.g., logged in but permit close failed)? Need idempotent handler design or rollback strategy.

4. **Subscription expiry monitoring** - How to detect when webhook subscription fails silently? Need health check mechanism.

5. **Review queue SLA** - How long can email sit in review queue before escalation? Business decision, not technical.

6. **Multi-mailbox priority** - If emails arrive simultaneously from multiple mailboxes, what order to process? FIFO or priority-based?
