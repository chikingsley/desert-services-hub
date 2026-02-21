# Intent Routing + Vector Plan

Pragmatic implementation plan for email triage and action routing.
This is a build plan, not a north-star vision document.

## Current Baseline (Already Solid)

Today the pipeline already does useful work before any vector search:

1. Email ingestion + deterministic linking (`project`, `estimate`) via thread/pulse/estimate signals.
2. Account-first project candidate seeding (fallback to broader scope only when needed).
3. Project candidate rerank with Jina reranker v3 (project-only mode).
4. LLM triage with strict candidate IDs for project/estimate selection.
5. Action dispatch for permit/contract triggers.

This baseline should remain the default path.

## What Vectors Add (and What They Do Not)

Vectors are an enhancement layer for recall and cheap intent routing. They are not a replacement for deterministic linking or reranking.

Vectors help when:

1. Deterministic project candidates are weak/missing.
2. We need fast intent routing with low-cost models.
3. We want semantic retrieval over recent project/doc history.

Vectors do not remove the need for:

1. Deterministic business rules.
2. Rerank stage.
3. Final LLM judgment on ambiguous/actionable steps.

## SimSIMD vs pgvector

Use both, for different sizes:

1. **SimSIMD**: tiny candidate sets in memory (intent label/prototype scoring).
2. **pgvector**: large searchable corpora (emails/docs/project chunks) in Postgres.

Rule of thumb:

1. `<= 200` candidates per query: in-process similarity is enough.
2. `> 200` candidates or corpus search: pgvector index.

## Data Model (Vector Layer)

Store vectors, not tokens.

Suggested table (conceptual):

1. `semantic_embeddings`
   - `entity_type` (`email`, `document_chunk`, `project_profile`, `intent_prototype`)
   - `entity_id`
   - `account_id`
   - `project_id`
   - `model` (for example `jina-embeddings-v5-text-small`)
   - `embedding vector(1024)`
   - `text_hash`
   - `created_at`

Notes:

1. Tokenization is done by embedding model internals.
2. We control chunking boundaries only.
3. Re-embed only when `text_hash` changes.

## What Gets Embedded First

Start narrow:

1. `intent_prototype`: a few canonical examples per intent.
2. `email`: subject + normalized body (+ minimal metadata tags).
3. `project_profile`: project name/aliases/contractor/address/status rollup.
4. `document_chunk`: chunked contract/permit/estimate text for retrieval.

Do not start by embedding every field/table.

## Retention / Search Window

Hot semantic search window:

1. Default: last `270` days (about 8-9 months).
2. If no good hit: expand to `365` days.
3. If still weak: rely on deterministic + rerank + LLM fallback.

This keeps cost and query latency bounded.

## Routing State Machine (Practical)

Use explicit DB-backed states:

1. `ingested`
2. `linked_deterministic`
3. `intent_scored`
4. `routed`
5. `context_ready`
6. `draft_generated`
7. `awaiting_review`
8. `approved|rejected`
9. `sent|closed|failed`

Every transition should be logged with score/reason metadata.

## Decision Policy

Recommended gating:

1. Auto-route only if `top1_score >= threshold` and `top1-top2 >= margin`.
2. Otherwise escalate to LLM route decision.
3. For critical actions (permit filing/payment/contract response), keep human review before send.

Example starting thresholds (to tune by replay):

1. `threshold = 0.78`
2. `margin = 0.08`

## Rollout Plan

### Phase 1: Shadow Intent Scoring

1. Generate embeddings for inbound emails + intent prototypes.
2. Compute SimSIMD similarity in worker.
3. Log scores and predicted intent only (no behavior change).

### Phase 2: Gated Routing

1. Enable auto-route only for high-confidence intents.
2. Keep deterministic linker + rerank + LLM path unchanged for everything else.

### Phase 3: Vector Recall Expansion

1. Add pgvector search over `project_profile` + `document_chunk`.
2. Use only when deterministic candidate pool is weak.
3. Merge candidates -> rerank -> LLM final select.

## Evaluation Targets

Track before/after:

1. Intent precision@1.
2. Project match top1/top3.
3. Auto-route precision (must stay high).
4. False-auto rate (critical metric).
5. Draft acceptance/edit rate in review queue.

## Non-Goals

1. Replacing deterministic logic with embeddings.
2. Running full-corpus vector search on every email.
3. Fully autonomous sending without review gates.

## Relationship to Existing Docs

1. `docs/project-operations-dashboard.md`: this plan powers Phase 2/3 action layer and draft queue reliability.
2. `docs/contract-review-workspace.md`: contract flow becomes a specialized route in the same state machine.
3. `docs/reference/agent-automation-vision.md`: this is the implementation path toward that vision.
