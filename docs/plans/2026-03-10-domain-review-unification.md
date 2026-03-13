# Domain Review Unification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `sender-review` the single fast operator queue for email/domain triage, remove the separate relevance lane from the active workflow, and add auditable LLM provenance for each domain verdict.

**Architecture:** Keep the existing materialized-view-based sender queue as the primary workflow. Extract domain-classification rule mapping and audit metadata into focused helpers, persist domain LLM provenance on `domain_classifications`, and expose an on-demand sender audit detail view instead of maintaining a second `email-relevance` operator surface.

**Tech Stack:** Bun, TypeScript, React, SWR, Postgres/Supabase migrations, FastAPI pdf-analysis service, pytest, bun test

---

## Chunk 1: Domain Rule Semantics + Prompt Helpers

### Task 1: Add failing tests for domain triage helpers

**Files:**
- Create: `tests/apps/web/api/emails/sender-review-llm.test.ts`
- Create: `apps/web/api/emails/sender-review-llm.ts`

- [ ] **Step 1: Write the failing test**

Write tests for:
- prompt builder includes domain, email count, and bounded sample payload
- domain verdict mapping returns `{ classification: null, isExcluded: true }` for non-spam, non-work domains
- domain verdict mapping returns `SPAM` only for spam verdicts

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/apps/web/api/emails/sender-review-llm.test.ts`
Expected: FAIL because helper module does not exist yet

- [ ] **Step 3: Write minimal implementation**

Add `sender-review-llm.ts` with:
- prompt version constant
- prompt builder
- prompt input serializer
- rule-mapping helper
- token/usage extraction helper from `metadata`

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/apps/web/api/emails/sender-review-llm.test.ts`
Expected: PASS

## Chunk 2: Persist and Expose Domain Audit Metadata

### Task 2: Add failing tests for sender-review audit shape

**Files:**
- Create: `tests/apps/web/api/emails/sender-review-audit.test.ts`
- Modify: `apps/web/api/emails/sender-review.ts`
- Modify: `packages/documents/intake/src/pdf-analysis.ts`
- Modify: `packages/documents/intake/src/pdf_analysis/providers/openrouter.py`
- Modify: `packages/documents/intake/src/pdf_analysis/providers/local.py`
- Create: `tests/packages/documents/pdf-analysis-py/tests/test_openrouter_provider.py`
- Create: `supabase/migrations/20260310120000_domain_classification_audit.sql`

- [ ] **Step 1: Write the failing tests**

Write tests for:
- sender audit response includes provider, model, prompt version, prompt text, sample input, and token usage fields
- OpenRouter provider preserves `usage` in `metadata`

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/apps/web/api/emails/sender-review-audit.test.ts`
Expected: FAIL because audit endpoint/shape does not exist

Run: `pytest tests/packages/documents/pdf-analysis-py/tests/test_openrouter_provider.py -q`
Expected: FAIL because usage metadata is not preserved

- [ ] **Step 3: Write minimal implementation**

Implement:
- additive migration for audit columns on `domain_classifications`
- persist prompt/audit fields during domain classification
- add sender-review audit endpoint
- return metadata from shared `chat()` client
- capture `usage` in OpenRouter metadata

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/apps/web/api/emails/sender-review-audit.test.ts`
Run: `pytest tests/packages/documents/pdf-analysis-py/tests/test_openrouter_provider.py -q`
Expected: PASS

## Chunk 3: Collapse the Active UI to One Lane

### Task 3: Add failing tests for user-facing workflow helpers

**Files:**
- Modify: `apps/web/frontend/pages/sender-review.tsx`
- Modify: `apps/web/frontend/components/app-sidebar.tsx`
- Modify: `apps/web/frontend/app.tsx`
- Modify: `apps/web/server.ts`

- [ ] **Step 1: Write the failing test**

Add or extend a frontend/API test that proves:
- sender-review can render audit metadata for a selected domain
- the sidebar no longer exposes `Email Relevance`
- `/email-relevance` redirects to `/senders`

- [ ] **Step 2: Run test to verify it fails**

Run the targeted bun test file(s)
Expected: FAIL because the old workflow is still exposed

- [ ] **Step 3: Write minimal implementation**

Implement:
- audit section in sender review detail pane
- remove `Email Relevance` from active navigation
- redirect `email-relevance` route to `senders`
- keep backend relevance code dormant for now, not primary

- [ ] **Step 4: Run tests to verify it passes**

Run the targeted bun test file(s)
Expected: PASS

## Chunk 4: Verification

### Task 4: Verify end-to-end behavior

**Files:**
- Modify: `apps/web/api/emails/sender-review.ts`
- Modify: `apps/web/frontend/pages/sender-review.tsx`

- [ ] **Step 1: Run targeted TypeScript tests**

Run: `bun test tests/apps/web/api/emails/sender-review-llm.test.ts tests/apps/web/api/emails/sender-review-audit.test.ts`

- [ ] **Step 2: Run targeted Python tests**

Run: `pytest tests/packages/documents/pdf-analysis-py/tests/test_openrouter_provider.py -q`

- [ ] **Step 3: Run typecheck/lints for changed files**

Run: `bun run typecheck:root`
Run: `bunx ultracite check apps/web/api/emails/sender-review.ts apps/web/frontend/pages/sender-review.tsx apps/web/frontend/components/app-sidebar.tsx packages/documents/intake/src/pdf-analysis.ts`

- [ ] **Step 4: Commit**

Only if requested by the user.
