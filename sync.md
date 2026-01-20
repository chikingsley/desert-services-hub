- Materialized views = precomputed query results stored as a table (speed up repeated joins/aggregations).
  - Good for dashboards/rollups: “last touched per project”, “open tasks count”, “permit status rollups”, etc.
  - Not a replacement for embeddings/RAG; it’s for relational + aggregation performance.

- Data quality reality (key concept):
  - You’re solving entity resolution, not “sync”.
  - Use a golden identity layer:
    - `canonical_account` / `canonical_contact` = the “master” records
    - `external_*` tables store raw records from Monday/QB/SharePoint/Email
    - link tables map `external` → `canonical` with confidence + evidence + status (proposed/confirmed/rejected)
  - Rule: never overwrite source data; only add links + confirmations.

- What the system needs (must-haves):
  - System-of-record DB (normalized entities + audit trail)
  - Blob store for attachments/PDFs/plans (checksums + lifecycle rules)
  - Two retrieval paths:
    - Exact/hybrid search: filters + full-text (IDs, addresses, names, job #s)
    - Semantic search: embeddings + rerank
  - Deterministic linking: email threading + idempotent ingestion (safe re-sync)
  - Human correction loop for ambiguous matches
  - Permissions (project-level access control)
  - Traceability: every AI action shows what it used + why

- Practical stack for your scale:
  - Postgres as system-of-record
  - Supabase (self-hosted) for Auth, API, and Realtime
  - Milvus for vector scaling
  - MinIO for S3-compatible storage

- Supabase (self-host) — keep:
  - Postgres (system-of-record)
  - Supabase Auth (GoTrue) (auth + JWT; enables clean RLS patterns)
  - PostgREST (REST API over your schema)
  - Realtime (websocket subscriptions for live UI)
  - Storage (file API + permissions layer; can use MinIO/S3 backend)
  - Supavisor (connection pooling)
  - Kong (API gateway / routing)
  - Studio + postgres-meta (admin UI + schema tools)

- Supabase — disable:
  - Analytics / Logflare / Vector (using Milvus instead)
  - Edge Functions (run your own workers/cron containers instead)

- Vector search:
  - Milvus (standalone via Docker Compose)
  - Optional UI: Attu (Milvus GUI) if you want it

- File storage:
  - Keep MinIO as the underlying S3 store
  - Configure Supabase Storage to use S3/MinIO backend (so no redundant object store)

- Realtime meaning:
  - UI gets push updates when rows change in Postgres (no polling)
  - Postgres remains the source of truth; realtime is just the live feed

- Where materialized views help you:
  - Project rollups: last email date, last activity, open tasks, permit status, next action
  - Email → project rollups: recent threads, participants, attachment inventory
  - Permit compliance rollups: inspection cadence, missed windows, upcoming deadlines
  - Quote builder shortcuts: customer history, common line items, typical scope templates

- Minimum viable data model:
  - account (customer/GC/partner)
  - contact (people, emails, phones)
  - project
  - email_message + email_thread
  - document (blob pointer + extracted text)
  - estimate + invoice (and line items if you want real automation)
  - permit + inspection
  - task
  - linking tables (many-to-many + confidence scores):
    - project_email_message, project_document, project_permit, etc.

- Ingestion pipeline requirements:
  - Idempotent sync using immutable IDs (Gmail/Graph ids, Monday item id, QuickBooks id, permit id)
  - Store source hash/checksum to skip unchanged records
  - Threading first (Message-ID/In-Reply-To/References + subject/participants), then classification
  - Two-tier extraction:
    - cheap parse always (headers, dates, IDs, address)
    - LLM extraction only when needed (new/ambiguous/quote-request cases)
  - Confidence scoring + review queue for low-confidence links

- Matching priorities (more deterministic than name fuzz):
  1) exact IDs (vendor/customer IDs, license/tax IDs)
  2) email domains (contacts → accounts)
  3) phone numbers (E.164)
  4) addresses (normalized)
  5) websites/URLs
  6) name similarity last

- Retrieval that feels right (for you + agents):
  - Always do hybrid:
    1) structured filters (account/project/date/participants/job #)
    2) full-text search
    3) vector search over chunks
    4) rerank top N with Jina
  - Embed per-chunk (not one vector per whole email/PDF)
  - Maintain a “project memory” summary object refreshed periodically with citations

- Hardware notes:
  - Your machine is plenty; biggest wins are ingestion quality + indexing + hybrid retrieval
  - Put Postgres on SSD
  - Put MinIO blobs on HDD if needed, but keep “hot” blobs on SSD

- Recommended build order:
  1) Postgres schema + MinIO + ingestion IDs/hashes
  2) canonical identity + linking tables + confidence scoring + review queue
  3) Email/Monday/QB sync end-to-end with idempotency + threading
  4) UI: project/account views show linked records + “needs review” queue
  5) FTS + filters
  6) embeddings + hybrid retrieval + rerank
  7) materialized views for rollups
  8) agents gated by permissions + approvals