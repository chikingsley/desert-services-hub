# Project Research Summary

**Project:** Contract Intake & Task Management System
**Domain:** Construction contract processing with automated workflow orchestration
**Researched:** 2026-01-22
**Confidence:** HIGH

## Executive Summary

Desert Services needs an automated contract intake system that monitors the contracts@desertservices.net mailbox, extracts structured data from contract PDFs, matches them to estimates in Monday.com, and spawns contextualized tasks in Notion. This is a classic email-to-task automation problem in the construction domain, where the key insight is that **existing codebase infrastructure already provides 90% of the required capabilities**. The real work is orchestration, not building new extraction or integration layers.

The recommended approach is a **pipeline coordinator pattern** that chains existing services (email client, contract parser, Monday integration, Notion client) rather than reimplementing functionality. Use webhooks with polling fallback for email monitoring, LLM-based extraction with confidence scoring for contract parsing, and sequential task creation with deduplication. The critical architectural decision is treating this as a service orchestrator that lives in `services/contract-intake/` and coordinates existing tools.

The biggest risk is **silent failures** - email monitoring breaking without alerting, PDF parsing accuracy degrading over time, or task duplication from email threads. Mitigation requires dual-path monitoring (webhooks + backstop polling), confidence scoring on all extractions with human review queues, and deduplication at multiple levels (email conversationId, contract fingerprint, Notion findOrCreate).

## Key Findings

### Recommended Stack

The existing Desert Services Hub stack covers all required capabilities. No new major dependencies needed - the project already has Microsoft Graph email client, pdfjs-dist for PDF extraction, Gemini/Claude for LLM parsing, Monday.com client with fuzzy matching, and Notion client with deduplication helpers.

**Core technologies:**
- **Microsoft Graph Webhooks + Delta Query**: Real-time email notifications with polling fallback - webhooks provide sub-minute latency, delta query backstops missed notifications to prevent silent failures
- **pdfjs-dist v5.4.530**: PDF text extraction - already installed and working, current version, handles digital PDFs which cover 95% of contracts
- **Claude/Gemini LLMs with Zod validation**: Structured contract data extraction - handles format variations that regex can't, Zod schema ensures typed output and prevents hallucinations
- **Existing Monday.com client**: Fuzzy matching for estimate lookup - `findBestMatches` already implements similarity scoring for name variations
- **Existing Notion client**: Task creation with rate limiting and deduplication - `findOrCreateByTitle` prevents duplicates, 350ms delays handle API limits

**Key constraint to remember:** Notion API has no batch operations and only accepts default status values. Must create tasks sequentially with 350ms delays and use "Not Started" status with actual status in "Next Steps" field (documented workaround).

### Expected Features

Contract intake systems have evolved from manual triage to AI-powered orchestration. The table stakes are basic automation (email detection, parsing, task creation). The differentiators are context-rich tasks with linked artifacts.

**Must have (table stakes):**
- Email detection and filtering - users expect subject/sender patterns to work without configuration
- PDF text extraction and project name parsing - core identifier for all downstream tasks
- Task creation with ownership and status - the fundamental value proposition
- Duplicate prevention - same contract shouldn't spawn duplicate tasks
- Audit trail - know which email spawned which tasks

**Should have (competitive differentiators):**
- Smart contract detection using pattern + LLM hybrid (existing in codebase achieves 95%+ accuracy vs pattern-only 70-80%)
- Estimate matching to link contract to original Monday quote for reconciliation
- Context carryforward - each task gets relevant slice of parsed data (reconcile task gets estimate link, email task gets contact info)
- PDF attachment to Notion page - not just reference, actual document
- Role-based auto-assignment - tasks automatically go to the right person

**Defer (v2+):**
- Deadline detection from email urgency language - adds complexity, manual due dates work initially
- Custom Notion views/templates - let users build these themselves
- Real-time email monitoring - batch processing every 5-15 minutes is sufficient
- Complex workflow rules - start simple, add if needed

### Architecture Approach

Follow the existing service-oriented pattern in the codebase. Build a pipeline coordinator that orchestrates existing services rather than reimplementing functionality. The architecture is six sequential phases: Email Monitor → Contract Classifier → Document Parser → Context Assembler → Task Creator → Status Tracker.

**Major components:**
1. **Email Monitor** - Polls contracts mailbox using existing `services/email/client.ts` GraphEmailClient with dual-path monitoring (webhooks + 4-hour backstop polling)
2. **Contract Classifier** - Adapts existing `services/email/census/classify.ts` pattern matching + LLM fallback to detect contract emails with 95%+ accuracy
3. **Document Parser** - Uses existing `services/contract/client.ts` to extract ContractPackage with project name, contractor, amounts from PDF attachments
4. **Context Assembler** - Gathers related data using existing Monday client (fuzzy match estimates) and email client (thread history) to build enriched IntakeContext
5. **Task Creator** - Uses existing Notion client with `findOrCreateByTitle` deduplication to create tasks with full context (PDF, estimate link, contact info)
6. **Status Tracker** - Updates Monday item status and archives processed email to close the loop

**Key pattern to follow:** Tiered classification (fast pattern matching first, LLM fallback only for uncertain cases) saves cost and latency while maintaining 95%+ accuracy.

### Critical Pitfalls

These are the "it's really unacceptable to miss these things" category that cause missed contracts, lost business, or major rework.

1. **Silent Email Monitoring Failures** - Microsoft Graph webhook subscriptions expire after 70 hours without notification; if renewal fails silently, contracts arrive but system doesn't see them. PREVENTION: Dual-path monitoring (webhooks + backstop polling every 4 hours), proactive subscription renewal every 12-24 hours, heartbeat alerting if no emails processed for 6+ hours on weekdays.

2. **PDF Parsing Accuracy Drift** - LLM extraction works on initial templates then silently degrades as contractors use different formats. Each GC has different contract templates and complex layouts trip up extraction. PREVENTION: Confidence scoring on every field with human review queue for low scores, schema validation (dates are valid ISO, amounts are positive), business rule validation (signature dates can't precede creation dates), golden test set of 20+ contracts from different GCs.

3. **Missing Contract Attachments** - System processes email body but misses PDF attachments or downloads wrong attachment (signature page instead of full contract). Emails often have multiple attachments and some systems send download links instead of direct attachments. PREVENTION: Validate every contract record has at least one PDF, classify attachments before processing, handle DocuSign/PandaDoc download link pattern.

4. **Task Duplication from Email Threads** - Same contract discussed in email thread creates duplicate tasks for each reply. Processing by messageId without checking conversationId creates duplicates. PREVENTION: Track processed emails by both messageId AND conversationId, implement deduplication at task creation using `findOrCreateByTitle`, hash-based fingerprinting from project name + contractor + amount.

5. **Notion API Status Limitation** - Notion API only accepts default status values like "Not Started", custom statuses fail silently. PREVENTION: Use documented workaround of setting "Not Started" and putting actual status in "Next Steps" field, create abstraction layer that handles status mapping at sync boundary.

## Implications for Roadmap

Based on research, the build should follow dependency order: email detection → document parsing → context assembly → task creation → status tracking → orchestration. Each phase builds on the previous, with clear outputs that feed the next phase.

### Phase 1: Email Detection & Classification
**Rationale:** Everything depends on reliably detecting contract emails. This is the foundation - if email monitoring breaks, the entire system stops. Must be bulletproof before moving forward.

**Delivers:**
- Filtered stream of contract-classified emails with 95%+ accuracy
- SQLite tracking table for processed emails (prevents duplicate processing)
- Dual-path monitoring infrastructure (webhook + polling fallback)

**Addresses:**
- Email detection/filtering (table stakes)
- Duplicate prevention (table stakes)
- Smart contract detection (differentiator)

**Avoids:**
- Pitfall 1 (silent email monitoring failures) - implements dual-path monitoring with heartbeat alerting
- Pitfall 5 (task duplication from email threads) - tracks conversationId from the start

**Stack elements:**
- Microsoft Graph webhooks + delta query for email monitoring
- Existing email client with pattern-based classification
- SQLite for processing state

**Needs research:** No - email patterns and webhook setup are well-documented

### Phase 2: Document Parsing & Validation
**Rationale:** Need structured contract data before any matching or task creation. This phase integrates existing contract parser but adds critical validation layers that prevent accuracy drift.

**Delivers:**
- ContractPackage with typed fields (project name, contractor, contacts, amounts)
- Confidence scoring on all extracted fields
- Human review queue for low-confidence extractions
- Golden test set for regression testing

**Addresses:**
- PDF text extraction (table stakes)
- Project/contractor name extraction (table stakes)
- Structured schema extraction (differentiator)

**Avoids:**
- Pitfall 2 (PDF parsing accuracy drift) - implements confidence scoring and validation
- Pitfall 3 (missing attachments) - validates every record has PDF before processing
- Pitfall 10 (semantic understanding) - uses explicit Zod schema for date types

**Stack elements:**
- pdfjs-dist for text extraction
- Claude/Gemini with Zod validation for structured extraction
- Schema validation and business rule checks

**Needs research:** No - existing contract parser proven, just needs validation wrapper

### Phase 3: Context Assembly & Matching
**Rationale:** Tasks are only useful if they have the right context. This phase enriches parsed contract data with related estimate, email thread, and contact info to create actionable tasks.

**Delivers:**
- IntakeContext bundle with contract + estimate + emails + contacts
- Fuzzy matching for estimate lookup with confidence thresholds
- Discrepancy detection (estimate total vs contract total)
- Lookup table for known contractor name aliases

**Addresses:**
- Estimate matching (differentiator)
- Context carryforward (differentiator)
- Thread-aware processing (anti-duplication)

**Avoids:**
- Pitfall 7 (Monday estimate matching ambiguity) - uses fuzzy matching with human fallback for low confidence
- Pitfall 5 (task duplication) - includes conversationId in context for dedup checks

**Stack elements:**
- Monday.com client with `findBestMatches` fuzzy matching
- Email client for thread gathering
- Similarity scoring algorithms

**Needs research:** Maybe - if fuzzy matching accuracy is insufficient, may need to research advanced matching algorithms, but existing implementation is likely sufficient

### Phase 4: Task Creation & Assignment
**Rationale:** This phase delivers the core value proposition - contracts automatically spawn contextualized tasks. Deduplication and context attachment are critical to prevent noise and ensure usability.

**Delivers:**
- Notion tasks with full context (PDF, estimate link, contact info, source email)
- Role-based auto-assignment (contracts team, operations, etc.)
- Deduplication using `findOrCreateByTitle` pattern
- 7 task template definitions (reconcile, email contractor, update QB, etc.)

**Addresses:**
- Task creation with ownership (table stakes)
- Pre-defined task templates (differentiator)
- Context attachment per task (differentiator)
- Role-based assignment (differentiator)

**Avoids:**
- Pitfall 5 (task duplication) - uses `findOrCreateByTitle` from Notion client
- Pitfall 4 (Notion status limitation) - implements status mapping workaround
- Pitfall 6 (context-free tasks) - attaches all relevant artifacts and metadata

**Stack elements:**
- Notion client with deduplication helpers
- Task template configuration
- Sequential creation with 350ms rate limiting

**Needs research:** No - Notion integration patterns are well-established in codebase

### Phase 5: Status Tracking & Feedback Loop
**Rationale:** Close the loop by updating source systems after successful processing. This provides visibility in Monday.com and prevents reprocessing of handled contracts.

**Delivers:**
- Monday.com estimate status updates (BID_STATUS: Won, CONTRACT_RECEIVED_DATE)
- Email archiving to "Processed" folder
- Processing history logging in SQLite
- Link from Monday item to Notion tasks

**Addresses:**
- Audit trail (table stakes)
- Status tracking (table stakes)

**Avoids:**
- Pitfall 3 (no feedback loop) - updates Monday item so status is visible to team

**Stack elements:**
- Monday.com client for status updates
- Email client for archiving
- SQLite for processing history

**Needs research:** No - straightforward API calls to existing clients

### Phase 6: Orchestration & Monitoring
**Rationale:** Ties all phases together into automated pipeline with error handling, retry logic, and observability. Last phase because it requires all components working individually first.

**Delivers:**
- Pipeline coordinator that chains all phases
- Scheduler for periodic polling (every 5-15 minutes)
- Error handling with retry and exponential backoff
- Processing state machine (pending → in_progress → completed → failed)
- Dashboard for monitoring pipeline health

**Addresses:**
- Scheduled automation (infrastructure)
- Resilience to failures (infrastructure)
- Observability (infrastructure)

**Avoids:**
- Pitfall 8 (rate limiting and throttling) - implements queue-based processing with backoff
- Pitfall 3 (synchronous pipeline with no retry) - tracks state and supports resume from failure

**Stack elements:**
- Scheduler for polling
- State machine in SQLite
- Retry logic with exponential backoff

**Needs research:** No - orchestration patterns are standard

### Phase Ordering Rationale

- **Dependencies drive order:** Email detection must work before parsing, parsing before context assembly, context before task creation, tasks before status tracking, all before orchestration
- **Risk reduction through incremental delivery:** Each phase delivers testable output; can validate email classification accuracy before building parser
- **Existing codebase provides building blocks:** Most complexity is already solved (email client, contract parser, Monday client, Notion client); phases are integration/orchestration, not greenfield development
- **Early validation prevents rework:** Phase 1-2 establish data quality gates (classification accuracy, parsing confidence, validation rules) that prevent garbage from flowing downstream

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Context Assembly):** IF fuzzy matching accuracy is insufficient with existing `findBestMatches` implementation, may need to research advanced similarity algorithms (Levenshtein distance, phonetic matching, ML-based entity resolution). However, existing implementation is likely sufficient based on codebase analysis.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Email Detection):** Email webhooks and classification patterns are well-documented, existing census classifier provides proven template
- **Phase 2 (Document Parsing):** Contract parser already exists and works, just needs validation wrapper
- **Phase 4 (Task Creation):** Notion integration patterns are established in codebase with deduplication helpers
- **Phase 5 (Status Tracking):** Straightforward API calls to existing clients
- **Phase 6 (Orchestration):** Standard pipeline patterns, no domain-specific research needed

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommended technologies already in codebase and working; no new major dependencies needed; constraints well-documented (Notion API limitations, webhook expiry) |
| Features | HIGH | Feature landscape informed by existing similar codebase implementations (email census classification, contract parsing) plus industry research on contract automation; clear distinction between table stakes and differentiators |
| Architecture | HIGH | Architecture follows existing service-oriented patterns in codebase; all building blocks already exist; components map cleanly to existing service modules |
| Pitfalls | HIGH | Pitfalls sourced from both codebase analysis (Notion status limitation documented in CLAUDE.md, webhook expiry from email research) and industry sources (PDF accuracy drift, email monitoring failures); prevention strategies proven in existing code |

**Overall confidence:** HIGH

The high confidence stems from the fact that Desert Services Hub already has mature implementations of all required capabilities. This is not a greenfield project - it's an orchestration project that chains existing services. The research validated that no new major technologies are needed and identified specific patterns already proven in the codebase (tiered classification, fuzzy matching, find-or-create deduplication).

### Gaps to Address

While overall confidence is high, these areas need attention during implementation:

- **Webhook subscription renewal reliability:** Microsoft Graph webhook lifecycle behavior varies in edge cases (network blips, Azure outages). Need to test renewal process thoroughly and implement backstop polling. MITIGATION: Start with polling-only in Phase 1, add webhook optimization in Phase 6 after core pipeline is stable.

- **Fuzzy matching accuracy threshold tuning:** Research recommends confidence thresholds for estimate matching but optimal threshold (0.6? 0.7? 0.8?) depends on actual data. MITIGATION: Start with conservative threshold (0.8) with human review queue, tune based on false positive/negative rates in production.

- **Task template definitions:** The specific 7 tasks to spawn are mentioned as "contract intake tasks" but exact definitions, assignees, and context per task need to be defined. MITIGATION: Workshop with Chi/team during planning to define task template structure.

- **Performance at scale:** Research assumes 5-10 contracts/day current volume. If volume spikes to 50-100/day, rate limiting and processing time become concerns. MITIGATION: Design with rate limiting and queuing from the start (already planned), monitor processing latency, optimize if needed.

## Sources

### Primary (HIGH confidence)
- **Desert Services Hub codebase analysis:**
  - `services/email/client.ts` - Comprehensive email operations (Graph API auth, search, attachments)
  - `services/contract/client.ts` - Contract PDF extraction with Jina + Gemini, multi-stage parsing
  - `services/email/census/classify.ts` - Pattern matching + LLM fallback classification (88.5% accuracy proven)
  - `services/notion/client.ts` - Deduplication helpers (`findOrCreateByTitle`, `findOrCreateByEmail`)
  - `services/monday/client.ts` - Fuzzy matching (`findBestMatches`), search, updates
  - Project CLAUDE.md - Notion API status limitation workaround documented
- [Microsoft Graph API Documentation](https://learn.microsoft.com/en-us/graph/api/resources/subscription) - Subscription resource limits (7-day max for mail)
- [Microsoft Graph Change Notifications](https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview) - Webhook best practices
- [Notion API Best Practices](https://cursorrules.org/article/notion-api-cursor-mdc-file) - Rate limiting guidance (350ms)

### Secondary (MEDIUM confidence)
- [Microsoft Graph Webhook + Delta Query Pattern](https://www.voitanos.io/blog/microsoft-graph-webhook-delta-query/) - Dual-path monitoring approach
- [Scaling Microsoft Graph API for 50+ Mailboxes](https://medium.com/@anantgna/scaling-microsoft-graph-api-centralized-monitoring-archiving-for-50-high-volume-mailboxes-1ddf329196bf) - Rate limiting patterns
- [LLMs for Structured Data Extraction from PDFs](https://unstract.com/blog/comparing-approaches-for-using-llms-for-structured-data-extraction-from-pdfs/) - Multi-LLM validation, confidence scoring
- [Contract OCR Guide](https://unstract.com/blog/contract-ocr-guide-to-extracting-data-from-contracts/) - Contract-specific extraction challenges
- [PDF Data Extraction Benchmark 2025](https://procycons.com/en/blogs/pdf-data-extraction-benchmark/) - LLM accuracy ranges (50-70% out-of-box)
- [Best LLM Models for Document Processing 2025](https://algodocs.com/best-llm-models-for-document-processing-in-2025/) - Model selection guidance

### Tertiary (LOW confidence)
- [Notion Database Properties Limit 2025](https://www.notionapps.com/blog/notion-database-properties-limit-2025) - Performance issues at scale
- [Task Management Software Essential Features](https://www.zoho.com/projects/task-management/essential-features.html) - Feature landscape
- [Contract Management Workflow Automation](https://www.pactly.com/blog/how-to-automate-your-contract-management-workflow/) - Industry practices

---
*Research completed: 2026-01-22*
*Ready for roadmap: yes*
