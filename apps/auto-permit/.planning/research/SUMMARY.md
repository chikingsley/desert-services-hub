# Project Research Summary

**Project:** Auto-Permit Email Automation
**Domain:** Email-triggered automation for dust permit processing
**Researched:** 2026-01-24
**Confidence:** HIGH

## Executive Summary

This milestone transforms the existing auto-permit system from manual CLI-triggered actions to fully automated email-driven workflows. The core insight: the project already has 90% of what's needed - Microsoft Graph integration, browser automation handlers, LLM classification, and permit databases. What's missing is the orchestration layer that connects email arrivals to action execution.

The recommended approach follows a **pipeline architecture** with confidence-gated execution: emails arrive via Microsoft Graph webhooks, get classified by Claude (with existing local LLM pre-filtering), linked to project state, and routed through confidence thresholds. High-confidence actions (0.85+) auto-execute via existing handlers; low-confidence items queue for human review. This preserves the human-in-the-loop pattern that prevents costly errors while automating the 80% of obvious cases.

Key risks center on Microsoft Graph webhook reliability (subscriptions expire silently), duplicate processing (at-least-once delivery), and LLM overconfidence in classification. Mitigation strategies are well-documented: proactive subscription renewal at 50% lifetime, SQLite UNIQUE constraints for idempotency, conservative confidence thresholds with multi-signal validation, and per-project locking to prevent race conditions.

## Key Findings

### Recommended Stack

The existing Bun + TypeScript foundation is production-ready and requires minimal additions. The critical enhancement is switching from the existing local LLM classifier to Claude Sonnet 4.5 with structured outputs for production confidence scoring, while keeping the local LLM for pre-filtering to reduce API costs.

**Core technologies:**
- **Bun.serve() routes** — handles Microsoft Graph webhook endpoints with zero framework overhead; built-in, no new dependency
- **Claude Sonnet 4.5 (structured outputs)** — classification with guaranteed schema-compliant JSON and confidence scoring; replaces local LLM for production
- **SQLite (bun:sqlite)** — approval queue, audit log, processed email tracking; already used in project
- **@microsoft/microsoft-graph-client** — webhook subscription lifecycle management; extend existing integration
- **Cloudflare Tunnel** — public HTTPS endpoint for webhooks; already configured (`cloudflared tunnel run`)

**Critical constraints:**
- Microsoft Graph mail subscriptions expire in ~2.9 days (4230 minutes max) — requires background renewal scheduler
- Webhook endpoints must respond within 3 seconds or notifications retry — queue processing asynchronously
- At-least-once delivery guarantees — idempotency required at database level (UNIQUE constraints on message IDs)

**What to avoid:**
- Express/Fastify — Bun.serve() is faster and already project-standard
- Redis/PostgreSQL — SQLite is sufficient for queue state at this scale
- OpenAI for classification — Claude structured outputs more reliable; ecosystem consistency
- LangChain — unnecessary abstraction; direct Claude SDK simpler and debuggable

### Expected Features

**Must have (table stakes):**
- **Webhook infrastructure** — Microsoft Graph push notifications with subscription lifecycle management
- **Dust permit filtering** — keyword pre-filter (`mightBeDustPermit()`) before expensive LLM calls
- **Intent classification** — determine create/renew/close/revise actions with confidence scoring
- **Project linking** — match email to correct project/permit via census DB fuzzy matching
- **Action execution** — orchestrate calls to existing handlers (create.ts, renew.ts, close.ts)
- **Human review queue** — low-confidence cases route to manual review with full context
- **Processed email tracking** — idempotency via SQLite (message IDs as UNIQUE keys)
- **Basic error handling** — try-catch, retry logic, logging without crashing

**Should have (competitive):**
- **Project state awareness** — inject permit status (Active/Expiring/Expired/None) into classification prompt for informed decisions
- **Multi-signal confidence** — combine LLM confidence + project state match + sender credibility for better routing
- **Action preview** — dry-run mode showing "Will close permit D0056240 for project XYZ" before execution
- **Audit trail** — structured logging of all decision points with inputs/outputs for compliance and debugging
- **Automatic deadline detection** — extract renewal due dates from email for urgency context

**Defer (v2+):**
- **Intelligent thread summarization** — summarize entire email thread for context (medium complexity, not critical)
- **Proactive document request** — auto-draft missing document requests (high complexity, manual works initially)
- **Attachment processing** — extract permit numbers from PDFs (high complexity, defer unless critical)
- **Learning from corrections** — capture human override feedback for model improvement

### Architecture Approach

The system follows a **pipeline architecture** with clear separation between ingestion (webhook), classification (LLM), linking (project matching), decision-making (confidence gate), and execution (handlers). The key pattern: emails are signals on projects, not standalone events — always link to project state before resolving actions.

**Major components:**

1. **Webhook Receiver** — accepts Microsoft Graph notifications, validates clientState, responds 202 within 3s, queues for async processing
2. **Email Processor** — orchestrates fetch → classify → link → resolve → route pipeline
3. **Classifier** — keyword pre-filter + Claude structured outputs for intent detection
4. **Project Linker** — fuzzy match email to project/permit, lookup current permit state (Active/Expiring/Expired/None)
5. **Action Resolver** — intent + state matrix determines specific action (e.g., renewal intent + Active state = RENEW action)
6. **Confidence Gate** — threshold-based routing: ≥0.85 auto-execute, 0.70-0.84 quick review, <0.70 full review
7. **Handler Bridge** — maps ActionDecision to existing handler inputs (create.ts, renew.ts, close.ts, revise.ts)
8. **Human Review Queue** — SQLite-backed queue with full context display and approve/reject/edit actions

**Critical patterns to follow:**
- **Acknowledge webhooks immediately** — return 202 within 3s, process async
- **Idempotent processing** — UNIQUE constraint on messageId, INSERT OR IGNORE pattern
- **Project-centric state machine** — treat project as entity, email as signal triggering state transitions
- **Confidence-gated execution** — tiered thresholds prevent both over-automation and under-automation

**Integrates with existing code:**
- Reuses `GraphEmailClient` for email fetching
- Extends `classifyEmail()` in email-classifier.ts
- Calls `createPermit()`, `renewPermit()`, `closePermit()`, `revisePermit()` handlers
- Uses existing SQLite databases (census.db, company-permits.sqlite)

### Critical Pitfalls

1. **Microsoft Graph subscription expiration (CRITICAL)** — Subscriptions expire in ~2.9 days and stop delivering notifications silently. Implement proactive renewal at 50% lifetime (~1.5 days), monitor "last email processed" timestamp, use lifecycleNotificationUrl for reauthorization events. Address in Phase 1 — Webhook Infrastructure.

2. **Duplicate email processing (CRITICAL)** — At-least-once delivery means same email may arrive multiple times. Create `processed_emails` table with UNIQUE constraint on `message_id`, use INSERT OR IGNORE pattern to skip duplicates atomically. Address in Phase 2 — Email Processing Pipeline.

3. **Race conditions during action execution (CRITICAL)** — Email arrives while previous action still running (handlers take 30-90s). Implement per-project mutex in SQLite `project_locks` table, queue new emails for same project during active action. Address in Phase 3 — Action Execution.

4. **LLM overconfidence in classification (CRITICAL)** — AI reports high confidence (0.9+) on ambiguous cases, triggering wrong auto-executions. Use conservative thresholds (0.85-0.95+ for auto), require multiple signals to agree (subject + body + sender + state), implement calibration testing on labeled holdout set. Address in Phase 4 — Classification & Routing.

5. **Thread message confusion (HIGH)** — Webhook fires for reply emails ("Thanks!") or forwards instead of actionable original. Fetch full thread context before processing, identify thread head vs replies, skip acknowledgment-only messages, track `conversationId` to avoid re-processing threads. Address in Phase 2 — Email Processing Pipeline.

## Implications for Roadmap

Based on research, suggested phase structure aligns with dependency chain and pitfall mitigation:

### Phase 1: Webhook Infrastructure
**Rationale:** Everything depends on receiving email events reliably. Microsoft Graph webhooks are the entry point and have the most critical pitfall (silent subscription expiration). Must build foundation correctly before any downstream processing.

**Delivers:**
- Microsoft Graph webhook endpoint in Bun.serve() at `/api/webhook/email`
- Subscription creation, renewal, and lifecycle management
- Validation token handling and clientState verification
- Event queueing for async processing (SQLite-backed queue)
- Subscription health monitoring and proactive renewal

**Addresses pitfalls:**
- Subscription expiration (proactive renewal at 50% lifetime)
- Webhook timeout (respond 202 within 3s, queue for async)
- Validation endpoint accessibility (public HTTPS via Cloudflare Tunnel)

**Stack decisions:** Bun.serve() routes, SQLite queue table, Microsoft Graph subscription API

**Research flag:** No deep research needed — Microsoft Graph webhook patterns well-documented

---

### Phase 2: Email Processing Pipeline
**Rationale:** After webhook delivers events, need to fetch full email and determine what it's about. Classification requires project context, so this phase combines fetching, classification, and linking. Idempotency and thread handling are critical here.

**Delivers:**
- Fetch full email via Microsoft Graph API (reuse GraphEmailClient)
- Keyword pre-filter integration (`mightBeDustPermit()`)
- Claude classification with structured outputs (intent + confidence)
- Project linking via census DB fuzzy matching
- Permit state lookup (Active/Expiring/Expired/None)
- Processed email tracking (SQLite UNIQUE constraint on message_id)
- Thread context handling (fetch full thread, identify actionable message)

**Addresses pitfalls:**
- Duplicate processing (INSERT OR IGNORE pattern)
- Thread message confusion (full thread context before classification)
- Email body HTML parsing issues (robust HTML-to-text conversion)

**Stack decisions:** Claude Sonnet 4.5 structured outputs, Zod v4 schemas, existing census DB

**Research flag:** May need phase-specific research on classification prompt engineering for dust permit domain

---

### Phase 3: Action Resolution & Execution
**Rationale:** With classified and linked emails, need to map intent + project state to specific actions and execute safely. Race condition prevention is critical here — portal sessions can't handle concurrent actions on same project.

**Delivers:**
- Action resolution matrix (intent + permit state → CREATE/RENEW/CLOSE/REVISE/QUEUE)
- Combined confidence calculation (LLM + project state match)
- Per-project locking (SQLite mutex before handler execution)
- Handler bridge (ActionDecision → existing handler inputs)
- Execution with error handling and retry logic
- Audit trail logging (all decision points with reasoning)

**Addresses pitfalls:**
- Race conditions (per-project mutex, queue emails during active action)
- Portal session conflicts (sequential execution via lock)
- Missing audit trail (structured logging of inputs/outputs)

**Stack decisions:** SQLite project_locks table, existing handlers (create.ts, renew.ts, close.ts)

**Research flag:** No deep research needed — standard locking patterns apply

---

### Phase 4: Confidence Gate & Routing
**Rationale:** With action resolution complete, need to decide which actions auto-execute vs require human review. Conservative thresholds prevent costly errors while maintaining automation value.

**Delivers:**
- Confidence threshold definitions (0.85+ auto, 0.70-0.84 quick review, <0.70 full review)
- Multi-signal validation (require subject + body + sender + state agreement for auto-execute)
- Routing logic (auto-execute high confidence, queue low confidence)
- Classification fallback chain (LLM → rule-based → queue for manual)

**Addresses pitfalls:**
- LLM overconfidence (conservative thresholds, multi-signal requirement)
- Classifier downtime (circuit breaker, rule-based fallback)

**Stack decisions:** Threshold constants, fallback classification chain

**Research flag:** May need phase-specific research on confidence calibration and threshold tuning

---

### Phase 5: Human Review Queue
**Rationale:** After routing decisions made, need UI for humans to review and approve low-confidence items. This is last because only needed when automation defers — not on critical path for high-confidence auto-execution.

**Delivers:**
- Review queue listing endpoint (pending items sorted by priority)
- Full context display (email content, project state, suggested action, confidence scores)
- Approve/reject/edit actions (one-click approval, edit params before execution)
- Queue health monitoring (SLA enforcement, auto-escalation, cleanup policy)

**Addresses pitfalls:**
- Unbounded queue growth (SLA enforcement, periodic cleanup)
- Missing context for decisions (full email + project state + audit trail)

**Stack decisions:** SQLite approval_queue table, Bun.serve() API routes

**Research flag:** No deep research needed — standard queue UI patterns

---

### Phase Ordering Rationale

**Dependency chain:**
1. Webhook Infrastructure → Email Processing → Action Execution → Confidence Gate → Human Review
2. Can't classify emails without receiving them (Webhook first)
3. Can't execute actions without classifying and linking (Processing before Execution)
4. Can't route decisions without resolved actions (Resolution before Gate)
5. Can't review low-confidence items without routing logic (Gate before Review)

**Pitfall mitigation order:**
- Phase 1 addresses subscription expiration (silent failure mode)
- Phase 2 addresses duplicate processing (corruption prevention)
- Phase 3 addresses race conditions (state consistency)
- Phase 4 addresses overconfidence (wrong action prevention)
- Phase 5 addresses queue management (operational health)

**Parallel work opportunities:**
- Webhook infrastructure independent of classification tuning
- Review queue UI can be built alongside execution (not on critical path)
- Audit logging can be added incrementally across phases

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 2 (Email Processing):** Classification prompt engineering for dust permit domain — need to validate that existing `classifyEmail()` intents map correctly to portal actions
- **Phase 4 (Confidence Gate):** Threshold calibration — initial thresholds (0.85, 0.70) may need adjustment based on real classification results; consider running calibration study on labeled email corpus

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Webhook Infrastructure):** Microsoft Graph webhook patterns well-documented in official docs
- **Phase 3 (Action Execution):** Locking and handler bridge patterns are standard software engineering
- **Phase 5 (Human Review Queue):** Standard queue UI patterns, no novel research needed

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Bun.serve() proven in project, Claude structured outputs documented, existing Microsoft Graph integration works |
| Features | MEDIUM-HIGH | Existing codebase validates table stakes; differentiator features from industry best practices |
| Architecture | HIGH | Pipeline pattern well-established for email automation; verified against Microsoft Graph docs and webhook architecture guides |
| Pitfalls | HIGH | Microsoft Graph subscription issues documented in Q&A forums; idempotency patterns verified; LLM confidence calibration from recent research |

**Overall confidence:** HIGH

The research is grounded in official Microsoft documentation, existing codebase analysis, and established webhook architecture patterns. The main uncertainty is in classification confidence calibration, which is expected to require tuning based on real email corpus performance.

### Gaps to Address

**Classification confidence calibration:** Initial thresholds (0.85 for auto-execute, 0.70 for quick review) are educated guesses from industry patterns. Recommend:
- Run classifier on labeled holdout set from existing 1,800 dust permit emails
- Measure precision/recall at different thresholds
- Adjust thresholds based on cost of false positives vs false negatives

**Multi-mailbox priority strategy:** If emails arrive simultaneously from multiple mailboxes, processing order is undefined. Recommend:
- Start with FIFO (first in, first out) for simplicity
- Monitor for backlog issues
- Consider priority-based routing if needed (e.g., expiring permits first)

**Handler error recovery:** When handler partially succeeds (logged in but action failed), unclear if should retry or require manual intervention. Recommend:
- Design handlers to be idempotent where possible
- Track handler execution state in SQLite
- Implement retry with exponential backoff, dead-letter queue for persistent failures

**Subscription health check mechanism:** Need proactive detection of silently failed subscriptions. Recommend:
- Heartbeat monitoring: alert if no emails processed in X minutes AND subscription shows as active
- Hybrid webhook + scheduled delta query fallback for resilience

## Sources

### Primary (HIGH confidence)

**Microsoft Graph Documentation:**
- [Receive change notifications through webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks) — Official webhook patterns
- [Lifecycle Events for Subscriptions](https://learn.microsoft.com/en-us/graph/change-notifications-lifecycle-events) — Expiration and renewal patterns
- [Subscription Resource Type](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0) — Limits and properties

**Bun Documentation:**
- [Bun HTTP Server](https://bun.sh/docs/api/http) — Official Bun.serve() docs
- [Bun 1.3 Release](https://www.infoq.com/news/2026/01/bun-v3-1-release/) — Routes feature

**Claude Documentation:**
- [Structured outputs - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — Official structured outputs guide
- [Tool use with Claude](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview) — Confidence patterns

**Existing Codebase:**
- `/Users/chiejimofor/Documents/Github/auto-permit/src/lib/email-classifier.ts` — Current LLM classification
- `/Users/chiejimofor/Documents/Github/auto-permit/src/handlers/*.ts` — Existing permit handlers
- `/Users/chiejimofor/Documents/Github/auto-permit/src/email/client.ts` — GraphEmailClient integration

### Secondary (MEDIUM confidence)

**Webhook Architecture:**
- [Webhook Design Patterns](https://dave.dev/blog/2022/11/01-11-2022-webhook-architecture/) — Core patterns
- [System Design Handbook: Webhook System](https://www.systemdesignhandbook.com/guides/design-a-webhook-system/) — Design guide
- [Hookdeck: Implement Webhook Idempotency](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency) — Idempotency patterns

**Human-in-the-Loop:**
- [Human in the Loop Automation](https://blog.n8n.io/human-in-the-loop-automation/) — Confidence threshold strategies
- [Zapier: Human-in-the-Loop Patterns](https://zapier.com/blog/human-in-the-loop/) — Best practices

**LLM Confidence:**
- [arXiv: Agentic Confidence Calibration](https://arxiv.org/html/2601.15778) — Calibration techniques
- [arXiv: Overconfidence in LLM-as-a-Judge](https://arxiv.org/html/2508.06225v2) — Overconfidence patterns

### Tertiary (LOW confidence - community reports)

**Microsoft Q&A Forums:**
- [Subscription Expiring in 1 Day](https://learn.microsoft.com/en-us/answers/questions/5525734/microsoft-graph-email-webhook-subscriptions-expiri) — Real user issue reports
- [Reauthorization Loop Issues](https://learn.microsoft.com/en-us/answers/questions/5574982/graph-api-webhook-receiving-constant-reauthorizati) — Lifecycle notification problems

---

*Research completed: 2026-01-24*
*Ready for roadmap: yes*
