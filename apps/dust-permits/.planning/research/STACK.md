# Technology Stack: Email-Triggered Automation

**Project:** Auto-Permit Email Automation
**Researched:** 2026-01-24
**Research Type:** Stack dimension for email-triggered automation system
**Overall Confidence:** HIGH

---

## Executive Summary

This stack recommendation builds on the existing Bun + TypeScript foundation, adding Microsoft Graph webhook infrastructure, Claude-powered action classification with confidence scoring, and human-in-the-loop approval workflows. The key insight is that the project already has the hardest pieces (Microsoft Graph integration, browser automation handlers) - what's needed is the orchestration layer to connect email arrivals to action execution.

---

## Recommended Stack

### Core Runtime (Already Established)

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| **Bun** | 1.3.x | Runtime, HTTP server, native TypeScript | HIGH |
| **TypeScript** | 5.9.x | Type safety throughout | HIGH |

**Rationale:** Bun is production-ready in 2026. The Anthropic acquisition in December 2025 provides long-term stability. Bun 1.3 introduces `Bun.serve()` with routes, which is ideal for webhook endpoints. The project already uses Bun - no migration needed.

**Why not Node.js:** The project is already Bun-native. Bun's 8x faster startup and native TypeScript execution are critical for webhook responsiveness. The existing Microsoft Graph SDK works seamlessly with Bun.

### Webhook Infrastructure

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| **Bun.serve()** | built-in | Webhook endpoint server | HIGH |
| **@microsoft/microsoft-graph-client** | ^3.0.7 (existing) | Subscription management | HIGH |
| **Cloudflare Tunnel** | existing | Public HTTPS endpoint | HIGH |

**Rationale:**
- `Bun.serve()` can handle webhook validation and notification processing with zero framework overhead
- Microsoft Graph SDK already integrated - extend with subscription methods
- Cloudflare Tunnel already configured (`cloudflared tunnel run`) - no new infrastructure

**Critical Constraints (Microsoft Graph):**
- Mail subscriptions max expiration: **4230 minutes (~2.9 days)** - must implement renewal scheduler
- Max 1000 active subscriptions per mailbox per app
- Validation endpoint must respond within **10 seconds** with `text/plain` validation token
- Notifications must be acknowledged with `202 Accepted` within **10 seconds** or trigger retry

```typescript
// Example: Webhook validation in Bun.serve()
Bun.serve({
  routes: {
    "/webhooks/graph": {
      POST: async (req) => {
        const url = new URL(req.url);
        const validationToken = url.searchParams.get("validationToken");

        // Microsoft Graph validation request
        if (validationToken) {
          return new Response(decodeURIComponent(validationToken), {
            headers: { "Content-Type": "text/plain" }
          });
        }

        // Actual notification - acknowledge immediately, process async
        const notifications = await req.json();
        processNotificationsAsync(notifications); // Don't await
        return new Response(null, { status: 202 });
      }
    }
  }
});
```

### Action Classification

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| **@anthropic-ai/sdk** | latest (0.61.x+) | Claude API for classification | HIGH |
| **Claude Sonnet 4.5** | model | Fast, accurate classification | HIGH |
| **zod** | ^4.3.4 (existing) | Schema definition & runtime validation | HIGH |

**Rationale:**
- Claude's structured outputs (beta header: `structured-outputs-2025-11-13`) guarantee schema-compliant JSON
- `strict: true` tool use ensures classification results always match schema
- Zod v4 is 6.5x faster than v3 and natively supported by Claude SDK
- SDK provides `client.beta.messages.parse()` with automatic Zod schema transformation

**Why Claude over local LLM:**
- The project already has `email-classifier.ts` using a local LLM (Qwen/Llama via llama.cpp)
- For production confidence scoring, Claude's structured outputs guarantee valid JSON
- Local LLM remains useful for pre-filtering (keyword check) to reduce API costs
- Claude Sonnet 4.5 is fast enough for real-time classification (~1-2s)

**Classification Schema:**

```typescript
import { z } from "zod";

export const EmailClassificationSchema = z.object({
  action: z.enum([
    "create_permit",
    "renew_permit",
    "close_permit",
    "revise_permit",
    "update_contact",
    "county_notification",
    "requires_human",
    "ignore"
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  extracted_data: z.object({
    permit_id: z.string().optional(),
    project_name: z.string().optional(),
    company_name: z.string().optional(),
    requested_action: z.string().optional(),
  }),
  human_review_reason: z.string().optional(),
});
```

### Confidence-Gated Execution

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| **SQLite** | bun:sqlite (built-in) | Approval queue, audit log | HIGH |
| **Email notification** | existing GraphEmailClient | Human approval requests | HIGH |

**Rationale:**
- Human-in-the-loop is the 2026 standard for high-stakes automation
- Confidence thresholds route low-confidence items to human review
- SQLite already used in project (`company-permits.sqlite`, `marketing-permits.sqlite`)

**Confidence Threshold Strategy:**

| Confidence Level | Action |
|-----------------|--------|
| >= 0.90 | **Auto-execute** - Direct to handler |
| 0.70 - 0.89 | **Notify & execute** - Execute but send confirmation email |
| 0.50 - 0.69 | **Queue for approval** - Human must approve within SLA |
| < 0.50 | **Require human decision** - Cannot auto-execute |

```typescript
// Approval queue schema
const APPROVAL_QUEUE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS approval_queue (
    id INTEGER PRIMARY KEY,
    email_id TEXT NOT NULL,
    action TEXT NOT NULL,
    confidence REAL NOT NULL,
    classification_result TEXT NOT NULL, -- JSON
    status TEXT DEFAULT 'pending', -- pending, approved, rejected, expired
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT,
    resolved_by TEXT,
    UNIQUE(email_id)
  )
`;
```

### Supporting Infrastructure

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| **@sentry/bun** | ^10.32.1 (existing) | Error tracking & monitoring | HIGH |
| **citty** | ^0.1.6 (existing) | CLI commands for manual overrides | HIGH |

---

## What NOT to Use

| Technology | Reason |
|------------|--------|
| **Express/Fastify** | Bun.serve() is faster, zero-dependency, already idiomatic to project |
| **Redis/PostgreSQL** | SQLite is sufficient for queue state; adds operational complexity |
| **Azure Event Hubs/Grid** | Overkill for single-mailbox webhook use case; adds Azure dependency |
| **ngrok** | Cloudflare Tunnel already configured and free with no bandwidth limits |
| **Temporal/Inngest** | Workflow orchestration is overkill; simple state machine in SQLite is sufficient |
| **OpenAI for classification** | Claude structured outputs are more reliable; Anthropic ecosystem consistency |
| **LangChain** | Unnecessary abstraction; direct Claude SDK is simpler and more debuggable |
| **Separate queue service (SQS, RabbitMQ)** | In-process queue with SQLite persistence is sufficient for volume |

---

## Installation

```bash
# Already installed (verify)
bun install

# Add Anthropic SDK if not present (for classification)
bun add @anthropic-ai/sdk

# No other dependencies needed - existing stack covers requirements
```

---

## Architecture Overview

```
Email Arrives in M365
        |
        v
Microsoft Graph Webhook -----> Bun.serve() webhook endpoint
        |
        v
Pre-filter (existing keywords check)
        |
        v (if might be permit-related)
        |
Claude Classification (structured output)
        |
        +---> confidence >= 0.90: Execute immediately
        |
        +---> confidence 0.70-0.89: Execute + notify
        |
        +---> confidence 0.50-0.69: Queue for approval
        |
        +---> confidence < 0.50: Require human decision
        |
        v
Existing Handlers (create/renew/close/revise)
        |
        v
Audit Log (SQLite)
```

---

## Key Implementation Decisions

### 1. Subscription Lifecycle Management

**Decision:** Background scheduler renews subscriptions at 80% of max lifetime

```typescript
const MAX_SUBSCRIPTION_MINUTES = 4230; // Microsoft Graph limit
const RENEWAL_THRESHOLD = 0.8; // Renew at 80% of lifetime
const RENEWAL_CHECK_INTERVAL = 60 * 60 * 1000; // Check hourly

// Store subscription state in SQLite
const SUBSCRIPTION_SCHEMA = `
  CREATE TABLE IF NOT EXISTS graph_subscriptions (
    id TEXT PRIMARY KEY,
    resource TEXT NOT NULL,
    expiration TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`;
```

### 2. Notification Processing Pattern

**Decision:** Acknowledge immediately, process asynchronously

Webhook notifications must be acknowledged within 10 seconds. Process email classification and routing in background after acknowledgment.

### 3. Classification Model Selection

**Decision:** Claude Sonnet 4.5 with structured outputs

- Fast enough for real-time (~1-2s)
- Structured outputs eliminate JSON parsing errors
- Confidence scoring is reliable with proper prompting
- Cost-effective for classification volume

### 4. Approval Workflow

**Decision:** Email-based approval for simplicity

Send approval request email with approve/reject links. Links route to webhook endpoint that updates queue status. No separate UI needed initially.

---

## Sources

### Microsoft Graph Webhooks

- [Receive change notifications through webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks) - Official documentation, HIGH confidence
- [subscription resource type](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0) - Subscription limits and properties
- [Microsoft Graph Webhooks Best Practices](https://www.voitanos.io/blog/microsoft-graph-webhook-delta-query/) - Lifecycle management patterns

### Bun Runtime

- [Bun HTTP Server](https://bun.sh/docs/api/http) - Official Bun.serve() documentation
- [Is Bun Production-Ready in 2026?](https://dev.to/last9/is-bun-production-ready-in-2026-a-practical-assessment-181h) - Production assessment
- [Bun 1.3 Release](https://www.infoq.com/news/2026/01/bun-v3-1-release/) - Latest features including routes

### Claude Structured Outputs

- [Structured outputs - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) - Official documentation, HIGH confidence
- [Tool use with Claude](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview) - Tool use patterns
- [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk) - TypeScript SDK

### Human-in-the-Loop

- [Human-in-the-loop in AI workflows](https://zapier.com/blog/human-in-the-loop/) - Patterns and best practices
- [Human in the loop automation](https://blog.n8n.io/human-in-the-loop-automation/) - Confidence threshold strategies
- [HITL Guide 2026](https://parseur.com/blog/human-in-the-loop-ai) - Current best practices

### Zod

- [Zod v4 Release Notes](https://zod.dev/v4) - Performance improvements (6.5x faster)
- [zod-gpt](https://github.com/dzhng/zod-gpt) - Zod + LLM integration patterns

### Tunneling

- [Cloudflare Tunnel vs ngrok](https://dev.to/mechcloud_academy/cloudflare-tunnel-vs-ngrok-vs-tailscale-choosing-the-right-secure-tunneling-solution-4inm) - Comparison
- [Top 10 ngrok alternatives 2026](https://pinggy.io/blog/best_ngrok_alternatives/) - Options overview

---

## Confidence Assessment

| Component | Confidence | Rationale |
|-----------|------------|-----------|
| Bun.serve() for webhooks | HIGH | Official docs, proven in project |
| Microsoft Graph subscriptions | HIGH | Official docs, clear limits documented |
| Claude structured outputs | HIGH | Official docs with TypeScript examples |
| Zod v4 for schemas | HIGH | Already in project, native SDK support |
| Confidence thresholds | MEDIUM | Best practices documented, needs tuning |
| SQLite for queue | HIGH | Already used in project, sufficient scale |
| Email-based approvals | MEDIUM | Simple but may need UI upgrade later |

---

## Open Questions for Implementation

1. **Subscription scope:** Subscribe to single shared mailbox or multiple individual mailboxes?
2. **Approval SLA:** What's the timeout before queued items expire?
3. **Confidence calibration:** Initial thresholds may need adjustment based on real classification results
4. **Rate limiting:** Should implement backoff if handlers are slow?
