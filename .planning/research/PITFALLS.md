# Domain Pitfalls: Contract Intake and Task Management

**Domain:** Email-to-task automation + contract processing for construction services
**Researched:** 2026-01-22
**Confidence:** HIGH (based on existing codebase analysis + industry research)

This document catalogs pitfalls specific to Desert Services' contract intake system. The owner emphasized: "It's really unacceptable to miss these things" regarding contract parsing accuracy.

---

## Critical Pitfalls

Mistakes that cause missed contracts, lost business, or require major rework.

### Pitfall 1: Silent Email Monitoring Failures

**What goes wrong:** Microsoft Graph webhook subscriptions expire after ~70 hours without notification. If the renewal process fails silently, the system stops receiving emails but appears healthy.

**Why it happens:**
- Graph API subscriptions are ephemeral
- No built-in notification when subscriptions expire
- Polling-only approaches get throttled ("Microsoft Graph jail")
- Network blips or Azure outages during renewal windows

**Consequences:**
- Contracts arrive but system doesn't see them
- Days of missed contracts before anyone notices
- Manual catch-up required, risking human error

**Warning signs:**
- No new emails processed for 12+ hours during business hours
- Subscription renewal API calls failing (check logs)
- Sudden drop in daily email volume metrics

**Prevention:**
1. Implement dual-path monitoring: webhooks + backstop polling every 4 hours
2. Proactive subscription renewal every 12-24 hours (not waiting until near expiry)
3. "Heartbeat" check: alert if no emails processed for 6+ hours on weekdays
4. Store last processed timestamp; compare against known email activity

**Phase mapping:** Email monitoring infrastructure (Phase 1 or 2)

---

### Pitfall 2: PDF Parsing Accuracy Drift

**What goes wrong:** AI extraction works perfectly on initial contract templates, then silently degrades as contractors use different formats, scanned documents, or non-standard layouts.

**Why it happens:**
- LLMs achieve 50-70% accuracy out-of-box; tested samples may be the "good" 70%
- Complex layouts (merged cells, multi-column, rotated text) trip up extraction
- Scanned PDFs with handwritten annotations, blur, or misalignment
- Each GC has different contract templates and clause phrasing

**Consequences:**
- Miss key terms ("T&M" billing, maintenance scope, specific pricing)
- Wrong contractor/owner information flows to Notion
- Insurance requirements missed, creating compliance risk
- Financial terms extracted incorrectly

**Warning signs:**
- Extraction confidence scores dropping below 0.8
- Manual corrections needed more than 10% of time
- New GC contracts consistently requiring manual review

**Prevention:**
1. Confidence scoring on every extraction field; flag low-confidence items for human review
2. Schema validation: dates must be valid ISO, amounts must be positive numbers
3. Business rule validation: signature dates can't precede creation dates, totals must equal line item sums
4. Create a "golden set" of 20+ contracts from different GCs for regression testing
5. Multi-method extraction: try Jina text first, fall back to Gemini vision for image-heavy PDFs
6. Track accuracy metrics per GC; alert when new GC's documents consistently fail

**Phase mapping:** Contract parsing (Phase 2-3), ongoing monitoring dashboard

---

### Pitfall 3: Missing Contract Attachments

**What goes wrong:** System processes email body but misses contract PDF attachments, or downloads the wrong attachment (e.g., signature page instead of full contract).

**Why it happens:**
- Emails often have multiple attachments (contract, exhibits, insurance certs)
- Some systems send contracts as inline images, not file attachments
- DocuSign/PandaDoc emails have download links, not direct attachments
- Attachment names don't always indicate document type

**Consequences:**
- Contract record created without actual contract document
- Partial information extracted from summary email instead of full PDF
- Tasks created based on incomplete data

**Warning signs:**
- Contract records with no attached PDF
- Extraction results missing key fields that should be in a full contract
- High ratio of "OTHER" doc type classifications

**Prevention:**
1. Validate every contract record has at least one PDF attachment
2. Classify attachments before processing: prioritize main contract over exhibits
3. Handle DocuSign/PandaDoc pattern: detect download links and fetch actual documents
4. Store attachment metadata with contract record for audit trail
5. Alert on emails classified as CONTRACT but having no PDF attachments

**Phase mapping:** Email processing + attachment handling (Phase 1-2)

---

### Pitfall 4: Notion API Status Limitation Workaround Failures

**What goes wrong:** Notion API only accepts default status values (e.g., "Not Started", "In Progress", "Done"). Custom statuses like "Waiting on Signature" or "Pending Review" fail silently or throw errors.

**Why it happens:**
- Notion's API limitation is not documented prominently
- Different databases may have different status configurations
- Status names are case-sensitive and whitespace-sensitive

**Consequences:**
- Tasks created with wrong status
- Sync failures that require manual intervention
- Workflow automation breaks when status updates fail

**Warning signs:**
- API errors mentioning "invalid option"
- Tasks appearing with unexpected statuses
- Notion sync operations timing out or failing intermittently

**Prevention:**
1. Workaround documented in CLAUDE.md: use "Not Started" and put actual status in "Next Steps" field
2. Map internal statuses to Notion-compatible statuses at sync boundary
3. Validate status values before API calls
4. Create abstraction layer that handles status mapping
5. Log all Notion API failures with full request payload for debugging

**Phase mapping:** Notion integration (Phase 3-4)

---

### Pitfall 5: Task Duplication from Email Threads

**What goes wrong:** Same contract discussed in email thread creates duplicate tasks each time a reply comes in.

**Why it happens:**
- Email threads share conversationId but each message has unique messageId
- Processing by messageId without checking conversationId creates duplicates
- "Forward" and "Reply All" create new conversation branches
- Same attachment forwarded to different mailboxes processed multiple times

**Consequences:**
- Task list bloated with duplicates
- Team confused about which task is "real"
- Completed task reopened when reply arrives
- Metrics skewed by duplicate counting

**Warning signs:**
- Multiple tasks with near-identical descriptions
- Tasks created within minutes of each other for same project
- Notification fatigue from duplicate alerts

**Prevention:**
1. Track processed emails by both messageId AND conversationId
2. Implement deduplication logic: check if task exists for this contract/project before creating
3. Use findOrCreate pattern: `findOrCreateByTitle()` in Notion client
4. When processing thread, check if root message already created task
5. Hash-based deduplication: generate fingerprint from project name + contractor + amount

**Phase mapping:** Task creation (Phase 2-3), deduplication service

---

## Moderate Pitfalls

Mistakes that cause delays, rework, or technical debt.

### Pitfall 6: Context-Free Tasks Are Useless

**What goes wrong:** Tasks created without sufficient context attached. Team member sees "Review contract" but doesn't know which contract, who sent it, or where to find it.

**Why it happens:**
- Extracting text but not linking to source document
- Notion page created without relation to email/attachment
- Task description too terse ("Sign document")
- Context scattered across multiple systems

**Prevention:**
1. Every task MUST include: source email link, attachment(s), contractor name, project name
2. Store email ID and message ID with task for traceability
3. Use Notion relations to link tasks to projects, contracts, and contacts
4. Include "next steps" field with specific actions
5. Attach PDF directly to Notion page, not just reference

**Phase mapping:** Task creation + Notion sync (Phase 2-3)

---

### Pitfall 7: Monday.com Estimate Matching Ambiguity

**What goes wrong:** Contract arrives but can't reliably match to the estimate in Monday.com. "AMS Mesa" estimate doesn't match "American Medical Services - Mesa Location" in contract.

**Why it happens:**
- Project names vary: abbreviations, legal names vs. common names
- Multiple estimates for same project (revisions)
- Estimate may not exist yet when contract arrives
- GC uses different project number than internal system

**Consequences:**
- Manual reconciliation required for every contract
- Wrong estimate linked, causing financial discrepancies
- Contracts processed without matching to quote

**Prevention:**
1. Fuzzy matching with confidence thresholds (existing `find_best_matches` in Monday client)
2. Store multiple identifiers: project name, estimate ID, GC's project number
3. When match confidence < 0.7, flag for human review
4. Build lookup table of known aliases (AMS = American Medical Services)
5. Allow manual linking with feedback loop to improve matching

**Phase mapping:** Contract-to-estimate reconciliation (Phase 3)

---

### Pitfall 8: Rate Limiting and API Throttling

**What goes wrong:** Batch processing of backlog contracts triggers rate limits, causing partial failures and inconsistent state.

**Why it happens:**
- Notion: 350ms between requests recommended
- Microsoft Graph: Throttling after sustained high-volume calls
- Gemini/Jina: Token limits and requests per minute caps
- Monday.com: GraphQL complexity limits

**Consequences:**
- Some contracts processed, others silently dropped
- Partial data in Notion (task created, but attachments failed)
- Need to re-run batch with unknown completion state

**Prevention:**
1. Implement retry with exponential backoff for all API calls
2. Process contracts sequentially with configurable delay (current: 200ms for tasks)
3. Use queue-based processing for batches
4. Track processing state: "pending", "in_progress", "completed", "failed"
5. Resume from failure point, not beginning

**Phase mapping:** All integration phases; infrastructure concern

---

### Pitfall 9: Notion Database Performance at Scale

**What goes wrong:** As contract database grows, queries slow down, property updates timeout, and sync becomes unreliable.

**Why it happens:**
- Notion performance issues with large databases (reported in 2025)
- Too many properties per database increases load time
- Complex relations create cascading queries
- No built-in archiving mechanism

**Consequences:**
- Sync operations timeout
- Users experience slow load times
- Integration stops working for "no apparent reason"

**Prevention:**
1. Archive completed projects to separate database after 90 days
2. Limit active properties; use linked databases for historical data
3. Paginate queries; never load full database
4. Monitor query duration; alert on sustained slowness
5. Consider local cache for frequently accessed data

**Phase mapping:** Notion database design (Phase 3); monitoring (Phase 4+)

---

### Pitfall 10: Semantic Understanding vs. Field Extraction

**What goes wrong:** System extracts "August 19, 2025" correctly but doesn't understand if it's the effective_date, signature_date, or completion_date.

**Why it happens:**
- Same date format appears multiple times in different contexts
- LLM extracts text but misassigns semantic role
- Contract templates vary in how they label dates
- Ambiguous phrasing: "This agreement dated August 19..."

**Consequences:**
- Wrong dates in task due dates
- Contract flagged as overdue when it's not
- Compliance tracking based on wrong milestone

**Prevention:**
1. Use structured extraction prompts that explicitly name each date type
2. Cross-validate: effective date should be before or equal to completion date
3. When ambiguous, extract both and flag for human review
4. Include surrounding context in extraction (5 words before/after date)
5. Build date validation rules based on contract logic

**Phase mapping:** Contract parsing (Phase 2-3)

---

## Minor Pitfalls

Mistakes that cause annoyance but are recoverable.

### Pitfall 11: Email Body Preview Truncation

**What goes wrong:** Email preview stored is truncated, losing context needed for accurate task extraction.

**Prevention:**
- Store full body content, not just preview
- If truncating for storage, keep at least 2000 characters
- Store flag indicating if body was truncated

**Phase mapping:** Email storage schema (Phase 1)

---

### Pitfall 12: Timezone Handling for Due Dates

**What goes wrong:** Contract specifies "due by 5pm on March 15" but system interprets as UTC, making it due at 10am Phoenix time.

**Prevention:**
- All dates stored as ISO with timezone
- Display dates in user's timezone (Arizona doesn't do DST)
- Due dates should assume end of business day in local timezone

**Phase mapping:** Date handling throughout system

---

### Pitfall 13: Special Characters in Filenames

**What goes wrong:** Contractor sends "Contract - ABC/XYZ (Rev 3).pdf" and filename breaks file path handling.

**Prevention:**
- Sanitize filenames before storage
- Preserve original filename in metadata while using safe filename on disk
- Handle Unicode characters, spaces, slashes, colons

**Phase mapping:** Attachment handling (Phase 1-2)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Email monitoring | Silent webhook expiry | Dual-path: webhooks + backstop polling |
| Contract parsing | Accuracy drift on new GC formats | Confidence scoring + human review queue |
| Task creation | Duplicates from email threads | ConversationId tracking + deduplication |
| Monday matching | Fuzzy name matching failures | Multi-field matching + human fallback |
| Notion sync | Status limitation workaround | Abstract status mapping at sync boundary |
| Attachment handling | Missing/wrong attachment | Validate every record has PDF attached |
| Scaling | Rate limiting on batch catch-up | Queue-based processing with retry |

---

## Sources

Research gathered from:
- Existing Desert Services Hub codebase analysis (services/email, services/notion, services/contract)
- [Microsoft Graph Webhooks Best Practices](https://learn.microsoft.com/en-us/graph/best-practices-concept) (HIGH confidence)
- [Microsoft Graph Change Notifications](https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview) (HIGH confidence)
- [Scaling Microsoft Graph API](https://medium.com/@anantgna/scaling-microsoft-graph-api-centralized-monitoring-archiving-for-50-high-volume-mailboxes-1ddf329196bf) (MEDIUM confidence)
- [PDF Data Extraction Benchmark 2025](https://procycons.com/en/blogs/pdf-data-extraction-benchmark/) (MEDIUM confidence)
- [Contract OCR Guide](https://unstract.com/blog/contract-ocr-guide-to-extracting-data-from-contracts/) (MEDIUM confidence)
- [Notion API 2025-09-03 Upgrade Guide](https://developers.notion.com/docs/upgrade-guide-2025-09-03) (HIGH confidence)
- [Notion Database Properties Limit](https://www.notionapps.com/blog/notion-database-properties-limit-2025) (MEDIUM confidence)
- [Contract Data Extraction Best Practices](https://www.icertis.com/learn/automate-contract-extraction/) (MEDIUM confidence)
