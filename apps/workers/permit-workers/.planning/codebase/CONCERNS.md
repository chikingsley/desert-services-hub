# Codebase Concerns

**Analysis Date:** 2026-01-22

## Tech Debt

**Incomplete Map Drawing Feature:**
- Issue: Page 2 location handling has placeholder code for polygon drawing; currently stops at "ready to draw" state
- Files: `src/portal/create/fill/page2/page2.ts` (line 84), `src/portal/create/fill/page2/map.ts` (line 17)
- Impact: Users creating new applications with fresh map locations cannot complete location entry; relies on copied location data from source applications
- Fix approach: Implement `drawPolygon()` function in map interaction layer; add tests for drawing completion; update `fillPage2Full()` to call drawing function before saving

**Polygon Drawing UI Not Implemented:**
- Issue: Map drawing mode is activated but actual polygon drawing via mouse/touch is not implemented
- Files: `src/portal/create/fill/page2/map.ts` (803 lines)
- Impact: Cannot create permits for sites with novel locations; all automation must use copy-from-existing-app flow
- Fix approach: Implement click-to-draw polygon interaction in Esri map frame; add boundary validation; test with various parcel shapes

**Error Suppression in Map Operations:**
- Issue: Catch blocks in map popup operations suppress errors without logging, making debugging difficult
- Files: `src/portal/create/fill/page2/map.ts` (lines 380-382, 451, 520, 596, 721)
- Pattern: `.catch((): { success: boolean; ... } => ({ success: false }))`
- Impact: When map interactions fail silently, user has no visibility into why location entry failed
- Fix approach: Log error details before returning failure state; add error type to return object; improve user messaging for map-specific failures

## Known Bugs

**Unsafe JSON Parsing Without Error Handling:**
- Symptoms: POST requests to `/api/permits/:id/:action` silently ignore JSON parse failures, defaulting to empty object
- Files: `src/index.ts` (line 88)
- Code: `const body = await req.json().catch(() => ({}))`
- Trigger: Client sends malformed JSON in request body for permit renew/close/revise operations
- Workaround: Valid JSON is sent from client; empty body is gracefully handled by action handlers
- Fix: Add proper error response (400 Bad Request) for invalid JSON; log parsing failures

**Console Logging in Production Code:**
- Symptoms: Heavy debug/info logging (640+ console.log statements) across 58 files
- Files: `src/` directory (640 occurrences of console.log/error/warn)
- Impact: Production logs become verbose; sensitive information may leak; test logs are noisy during automation runs
- Fix approach: Implement structured logging with severity levels (error/warn only in production); use logger abstraction instead of direct console.log calls; add log filtering by environment

**Generic Error Catching Without Context:**
- Symptoms: Multiple catch blocks rethrow errors without adding context
- Files: `src/email/client.ts` (lines 335-337, 401, 472, etc. - 30+ instances)
- Pattern: `catch (error) { throw error; }` (rethrows same error without wrapping)
- Impact: Stack traces lack context about which operation failed; hard to trace root cause in multi-step flows
- Fix approach: Wrap errors with operation context; use custom error classes for different failure types; add breadcrumb logging

## Security Considerations

**Hardcoded Test Permit ID:**
- Risk: Default test permit ID exposed in config and test code
- Files: `src/portal/utils/config.ts` (line 114)
- Code: `permitId: process.env.CLOSE_TEST_PERMIT_ID || "D0063431"`
- Current mitigation: Only used in test environment; requires explicit test run to trigger
- Recommendations: Move hardcoded ID to .env.example; add `.env` to .gitignore verification; document test data setup

**Exposed Azure/Email Credentials in Code:**
- Risk: Azure AD and Microsoft Graph credentials passed through multiple layers
- Files: `src/email/client.ts`, `src/email/groups.ts`, `src/api/email.ts`
- Current mitigation: Credentials loaded from environment variables (not hardcoded); Bun auto-loads .env files
- Recommendations: Add credential rotation documentation; audit all places credentials are logged (none found); verify no credentials in error messages

**Assessor API Key Not Validated:**
- Risk: Optional API key without validation; silent failures if missing
- Files: `src/portal/utils/config.ts` (line 64)
- Code: `assessorApiKey: process.env.ASSESSOR_API_KEY`
- Current mitigation: Feature degrades gracefully if key missing
- Recommendations: Document required vs optional keys; validate at startup; log warnings if optional keys missing

**No Input Validation on Portal Search:**
- Risk: Form input not sanitized before filling portal fields
- Files: `src/portal/utils/helpers.ts`, `src/portal/create/fill/page*.ts`
- Impact: Malicious input could trigger portal errors or unintended form submission
- Fix approach: Add input sanitization layer; validate permit IDs against regex before use; escape special characters in form inputs

## Performance Bottlenecks

**Large Monolithic Helper File:**
- Problem: `src/portal/utils/helpers.ts` contains 1200+ lines of diverse utility functions
- Files: `src/portal/utils/helpers.ts` (1204 lines)
- Cause: Central location for all portal interaction utilities; no separation of concerns
- Impact: Long import times; difficult to find functions; unclear dependencies between utilities
- Improvement path: Split into modules: `form-actions.ts`, `element-navigation.ts`, `popup-handling.ts`, `application-navigation.ts`

**Form Data Types File Explosion:**
- Problem: `src/form-data.ts` defines entire form structure in single file (1485 lines)
- Files: `src/form-data.ts` (1485 lines)
- Cause: All form fields and defaults in one location for type-safe selector generation
- Impact: Slow IDE performance when editing; circular imports risk; hard to navigate
- Improvement path: Keep type definitions together but split defaults into `form-defaults.ts`; consider splitting category-specific types into separate files

**Inefficient Email List Rendering:**
- Problem: Email pagination and search result formatting generates arrays with string manipulation
- Files: `src/email/index.ts` (lines 38-72), `src/email/client.ts` (getAllEmailsPaginated method)
- Impact: O(n) string concatenation for large email lists; no streaming response for large result sets
- Improvement path: Stream results; use lazy iteration; add pagination cursor support to API

**Synchronous Database Queries in Main Flow:**
- Problem: SQLite queries block during permit sync and scrape operations
- Files: `src/db/company-permits.ts`, `src/db/marketing-permits.ts`
- Impact: API endpoints block waiting for disk I/O; multiple concurrent syncs cause lock contention
- Improvement path: Implement queue-based job system; add connection pooling; consider async wrapper

## Fragile Areas

**Portal Selector String Matching:**
- Files: `src/portal/utils/selectors.ts`, `src/portal/utils/helpers.ts`
- Why fragile: Selectors depend on exact ADF form IDs which change between portal versions (siTable indices documented but not validated)
- Safe modification: Before changing selector patterns, run selector discovery debug script (documented in CLAUDE.md); test against live portal; verify no hardcoded indices
- Test coverage: E2E tests in `tests/e2e/` verify selectors work but don't validate against version changes
- Fix: Add selector validation test that checks portal version and expected selector patterns

**Map Popup Frame Location:**
- Files: `src/portal/create/fill/page2/map.ts` (lines 342-364)
- Why fragile: Frame identification uses `data-qaid="mapFrame"` attribute which could change; frame might not exist in some portal versions
- Safe modification: Add fallback frame detection by role; validate frame contents before interaction
- Test coverage: Limited - not tested in CI
- Fix: Add test that validates mapFrame can be found; implement frame detection fallback strategy

**Email Client Authentication State:**
- Files: `src/email/client.ts` (GraphEmailClient class)
- Why fragile: MSAL token cache can become stale; cached accounts list may diverge from Azure AD; no automatic reauthentication
- Safe modification: Add token refresh logic; validate cached accounts before use; implement auth retry with exponential backoff
- Test coverage: Unit tests exist but don't cover token expiration scenarios
- Fix: Add integration test for token refresh; implement 30-second auth timeout with retry

**Permit Parser Regex Patterns:**
- Files: `src/db/sync/permit-parser.ts` (lines 61-69)
- Why fragile: Regex assumes specific HTML/Excel export format; any formatting change breaks parsing
- Safe modification: Add format detection; validate parsed data matches expected schema; log parsing failures with raw input samples
- Test coverage: Unit tests cover known formats but not future format changes
- Fix: Add error handling that captures unparsed rows for manual review

## Scaling Limits

**Single SQLite Database:**
- Current capacity: WAL mode supports ~5 concurrent writers; practical limit ~100 writes/second per database
- Limit: Single-file SQLite cannot handle 100+ simultaneous users or high-throughput scraping
- Scaling path: Migrate to PostgreSQL for production; implement connection pooling; add read replicas for scrape operations

**Email Client Without Rate Limiting:**
- Current capacity: Graph API allows 2000 requests per minute per app; client makes unbounded requests
- Limit: Bulk email operations (searchAllMailboxes with 50+ mailboxes) can hit rate limits and fail silently
- Scaling path: Implement token bucket rate limiter; batch mailbox searches; add exponential backoff with jitter

**Single Browser Instance Per Job:**
- Current capacity: One Playwright browser per create/close/renew job; ~2-3 minute duration per operation
- Limit: Queue depth grows if multiple jobs requested faster than completion rate; no parallelization
- Scaling path: Implement connection pool of browser instances; support parallel job execution; queue jobs with priority

**Portal Login Not Cached Across Requests:**
- Current capacity: Every operation logs in separately; login takes 5-10 seconds
- Limit: High overhead for short operations; login failures block entire operation
- Scaling path: Implement persistent session management; cache authenticated browser contexts; implement retry with new login on session expiry

## Dependencies at Risk

**Microsoft Graph SDK (@microsoft/microsoft-graph-client):**
- Risk: Unmaintained/legacy versions; API breaking changes possible; third-party lib could have vulnerabilities
- Impact: Email functionality breaks if Microsoft changes API contract or drops support
- Migration plan: Monitor Microsoft Graph SDK releases; consider native fetch-based implementation; maintain version lock in package.json

**Playwright (@playwright/test):**
- Risk: Major version updates often break selector patterns; portal changes require selector updates
- Impact: Browser automation fails if Playwright version incompatible with portal; CSS selector engine changes
- Migration plan: Pin Playwright version; test updates in dev environment before production rollout; maintain selector compatibility layer

**Zod v3 and v4 Coexistence:**
- Risk: Package.json depends on `zod@^4.3.4` but node_modules has both v3 and v4 installed; type conflicts possible
- Impact: Unexpected behavior if code path uses wrong Zod version; breaking changes in validation logic
- Migration plan: Audit all Zod imports; remove v3 dependencies; ensure v4 compatibility across codebase

**XLSX Library for Excel Parsing:**
- Risk: XLSX parsing is complex; library may not handle all Excel variations; security risk from malicious files
- Impact: Parser could crash on unusual Excel files; data corruption if parsing logic flawed
- Migration plan: Add file validation before parsing; implement sandbox for parsing; limit file size

## Missing Critical Features

**No Permanent Audit Trail:**
- Problem: No persistent logging of automation actions; cannot replay permit creation or understand failure chains
- Blocks: Cannot debug failed permit applications; cannot prove automation ran correctly for compliance
- Missing: Job execution log table; detailed action logging; audit trail export

**No Contractor Validation Before Portal Entry:**
- Problem: If contractor name not in known list, flow may fail or create duplicate entry
- Blocks: Cannot handle new contractors without manual intervention; no feedback on contractor validation
- Missing: Contractor validation API endpoint; feedback on validation results; bulk contractor loader

**No Resume/Checkpoint System:**
- Problem: If browser crashes mid-operation, entire job lost; cannot resume from last checkpoint
- Blocks: Long-running operations (bulk scrape) are unreliable; no recovery from network failures
- Missing: Job state snapshots; checkpoint system; recovery procedure

**No Rate Limiting or Quota Management:**
- Problem: No protection against accidental DoS (e.g., user triggers 1000 scrape requests)
- Blocks: Can overwhelm portal or email API; no cost control
- Missing: Per-operation quota; rate limiting middleware; cost tracking

## Test Coverage Gaps

**Email Client Token Lifecycle:**
- What's not tested: Token expiration and refresh; cached token staleness; multi-account switching
- Files: `src/email/client.ts` (initUserAuth, getClient methods)
- Risk: Authentication failures in production would not be caught; token refresh bugs persist
- Priority: High - email operations are critical path

**Map Popup Frame Interaction:**
- What's not tested: Frame location discovery; Esri map API responsiveness; drawing mode activation
- Files: `src/portal/create/fill/page2/map.ts`
- Risk: Map operations fail silently; polygon drawing (when implemented) untested
- Priority: High - blocks new location creation

**Form Field Validation:**
- What's not tested: Invalid input handling in fillText/fillCheckbox/etc; form validation errors
- Files: `src/portal/utils/helpers.ts` (form action functions)
- Risk: Invalid form data submitted; portal returns cryptic errors
- Priority: Medium - handled by portal validation but no client-side guard

**Email Classification Edge Cases:**
- What's not tested: Email parsing with nested quotes; unusual MIME structures; Unicode handling
- Files: `src/email/groups.ts`, email parsing logic
- Risk: Emails misclassified or dropped; user notified with incomplete results
- Priority: Medium - impacts email routing accuracy

**Concurrent Job Execution:**
- What's not tested: Multiple permits created simultaneously; database lock handling; browser context conflicts
- Files: `src/api/permits.ts`, `src/db/company-permits.ts`
- Risk: Race conditions in permit creation; database corruption; flaky parallel tests
- Priority: High - production deployment uses concurrency

**Error Recovery Paths:**
- What's not tested: Network timeout recovery; partial form submission; popup blocked scenarios
- Files: `src/portal/create/`, `src/portal/close.ts`
- Risk: Jobs fail and leave application in inconsistent state; no recovery path for user
- Priority: High - affects user experience and data integrity

---

*Concerns audit: 2026-01-22*
