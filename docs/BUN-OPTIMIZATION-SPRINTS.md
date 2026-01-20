# Bun Runtime Optimization - Sprint Plan

**Project Goal**: Optimize desert-services-hub to fully leverage Bun's native runtime capabilities, improving performance, reducing dependencies, and streamlining file I/O patterns.

**Scope**: 5 sprints, each producing demoable, testable improvements.

**Last Updated**: Generated with review feedback incorporated.

---

## Sprint 1: Foundation & Baseline Metrics

**Goal**: Establish testing infrastructure, baseline performance metrics, and audit documentation.

**Demo**: Run benchmark suite showing current performance numbers; all audit reports generated.

---

### Ticket 1.1: Create Performance Benchmark Suite

**Description**: Build a benchmark script that measures key performance indicators across the application.

**Files to Create**:
- `scripts/benchmarks/startup-time.ts`
- `scripts/benchmarks/api-response-time.ts`
- `scripts/benchmarks/file-io-throughput.ts`
- `scripts/benchmarks/db-query-time.ts`
- `scripts/benchmarks/run-all.ts`

**Expected Baseline Ranges**:
- Cold start: 2-5 seconds
- API response (simple GET): 20-100ms
- API response (with DB): 50-200ms
- File I/O read (10MB): 50-200ms
- SQLite query (single row): 1-5ms

**Acceptance Criteria**:
- [ ] Benchmark measures cold start time (`bun run dev` to first request)
- [ ] Benchmark measures API route response times (quotes, takeoffs, upload endpoints)
- [ ] Benchmark measures file read/write throughput (1KB, 100KB, 10MB files)
- [ ] Benchmark measures SQLite query times (list, single, search operations)
- [ ] Results output to `benchmark-results.json` with timestamp
- [ ] Each run appends to history for trend tracking

**Validation**:
```bash
bun scripts/benchmarks/run-all.ts && cat benchmark-results.json | head -50
```

**Dependencies**: None

---

### Ticket 1.2: Complete Codebase Optimization Audit

**Description**: Document all optimization opportunities across fs usage, Buffer operations, console statements, and JSON parsing.

**Files to Create**:
- `docs/audits/fs-usage-audit.md`
- `docs/audits/buffer-usage-audit.md`
- `docs/audits/console-statement-audit.md`
- `docs/audits/json-parse-audit.md`

**Sub-deliverables**:

#### 1.2a: fs Module Usage Audit
**Files to Audit** (13 identified):
- `bun-init/build.ts`
- `scripts/normalize-contractors-final.ts`
- `projects/accounts/scripts/smart-normalize.ts`
- `projects/accounts/scripts/normalize-contractors.ts`
- `projects/accounts/scripts/parse-certs.ts`
- `projects/accounts/scripts/parse-excel.ts`
- `projects/accounts/scripts/parse-contractor-pairs.ts`
- `projects/accounts/scripts/parse-credit-memos.ts`
- `projects/accounts/scripts/parse-cp-invoices.ts`
- `projects/accounts/scripts/parse-signs.ts`
- `projects/accounts/scripts/parse-excel-noheader.ts`
- `projects/accounts/scripts/parse-all-aia.ts`
- `projects/accounts/scripts/parse-aia.ts`

#### 1.2b: Buffer Operations Audit
**Files to Audit** (22 identified, grouped):
- **Core lib** (high priority):
  - `lib/pdf/generate-pdf.ts`
  - `lib/minio.ts`
- **Services** (medium priority):
  - `services/email/client.ts` (2285 lines, extensive Buffer usage)
  - `services/pdf/extract-all.ts`
  - `services/quoting/pdf.ts`
  - `services/swppp/templates/index.ts`
  - `services/email/cli.ts`
  - `services/email/templates/index.ts`
  - `services/email/groups.ts`
  - `services/contract/client.ts`
  - `services/sharepoint/client.ts`
  - `services/pdf/smart-triage.ts`
  - `services/notion/client.ts`
- **API Routes**:
  - `app/api/upload/pdf/route.ts`
- **Tests** (low priority - optimization not critical):
  - `tests/lib/pdf/back-page.test.ts`
  - `tests/lib/pdf/unbreakable.test.ts`
  - `tests/lib/pdf/sectioned.test.ts`
  - `tests/lib/pdf/simple.test.ts`
  - `tests/lib/minio.test.ts`

#### 1.2c: Console Statement Audit
**Files to Audit** (10 identified):
- `app/api/quotes/route.ts`
- `app/api/quotes/[id]/route.ts`
- `app/api/quotes/[id]/duplicate/route.ts`
- `app/api/quotes/[id]/pdf/route.ts`
- `app/api/webhooks/monday/route.ts`
- `app/api/monday/search/route.ts`
- `app/api/quotes/[id]/takeoff/route.ts`
- `app/api/takeoffs/[id]/quote/route.ts`
- `app/api/takeoffs/[id]/pdf/route.ts`
- `app/api/upload/pdf/route.ts`

#### 1.2d: JSON.parse Audit
**Files to Audit** (4 identified):
- `app/api/quotes/route.ts`
- `app/api/monday/search/route.ts`
- `app/api/takeoffs/route.ts`
- `app/api/takeoffs/[id]/route.ts`

**Acceptance Criteria**:
- [ ] Each file listed with line numbers
- [ ] Each usage categorized by type
- [ ] Migration complexity rated: trivial, moderate, complex
- [ ] Alternative Bun pattern identified for each
- [ ] Priority ranked by performance impact

**Validation**:
```bash
# fs usage (including node:fs)
grep -l "from ['\"]fs['\"]\\|from ['\"]node:fs['\"]" $(find . -name "*.ts" -not -path "./node_modules/*" -not -path "./.next/*") | wc -l

# Buffer operations
grep -rn "Buffer\.\(from\|concat\|alloc\)" --include="*.ts" | wc -l

# Console statements in API
grep -rn "console\.\(log\|warn\|error\)" app/api/ --include="*.ts" | wc -l
```

**Dependencies**: None

---

### Ticket 1.3: Document Baseline Metrics

**Description**: Run all benchmarks and create baseline documentation.

**Files to Create**:
- `docs/audits/baseline-metrics.md`

**Acceptance Criteria**:
- [ ] Startup time recorded (cold, warm)
- [ ] API response times recorded (p50, p95, p99)
- [ ] File I/O throughput recorded
- [ ] Database query times recorded
- [ ] System specs documented (CPU, RAM, Bun version, OS)
- [ ] Date/commit hash recorded

**Validation**: All benchmark scripts run successfully and output captured.

**Dependencies**: 1.1

---

## Sprint 2: Database Layer Optimization

**Goal**: Ensure all database access uses `bun:sqlite` optimally with proper typing and error handling.

**Demo**: Run database benchmark showing improved query performance; all DB tests pass.

---

### Ticket 2.1: Create Database Test Suite

**Description**: Build comprehensive tests for database operations.

**Files to Create**:
- `tests/lib/db/quotes.test.ts`
- `tests/lib/db/takeoffs.test.ts`
- `tests/lib/db/catalog.test.ts`
- `tests/lib/db/monday-cache.test.ts`

**Acceptance Criteria**:
- [ ] CRUD operations tested for each table
- [ ] JSON column serialization/deserialization tested
- [ ] Foreign key constraints tested
- [ ] FTS5 search tested (with fallback)
- [ ] Tests use test database (`test-app.db`), not production
- [ ] Cleanup in afterAll hooks
- [ ] All tests pass

**Validation**:
```bash
bun test tests/lib/db/
```

**Dependencies**: None

---

### Ticket 2.2: Create Typed Query Helpers

**Description**: Add type-safe query wrapper functions to reduce repeated JSON parsing.

**Files to Modify**:
- `lib/db/index.ts`

**Files to Create**:
- `lib/db/queries/takeoffs.ts`
- `lib/db/queries/quotes.ts`
- `lib/db/queries/catalog.ts`

**Acceptance Criteria**:
- [ ] Each table has typed query functions: `get(id)`, `list(filters)`, `create(data)`, `update(id, data)`, `delete(id)`
- [ ] JSON columns (`annotations`, `page_scales`, `column_values`) parsed once at query boundary
- [ ] Return types match domain types in `lib/types.ts`
- [ ] Prepared statements used for repeated queries
- [ ] Existing API routes continue to work (no breaking changes yet)

**Validation**:
```bash
bun test tests/lib/db/ && bun x tsc --noEmit
```

**Dependencies**: 2.1

---

### Ticket 2.3: Optimize JSON Column Handling

**Description**: Use SQLite JSON functions instead of JS-side parsing where beneficial.

**Files to Modify**:
- `lib/db/queries/takeoffs.ts` (annotations, page_scales columns)
- `lib/db/queries/quotes.ts` (if applicable)
- `app/api/monday/search/route.ts` (column_values)

**Pattern**:
```sql
-- Instead of SELECT * then JSON.parse
SELECT id, name, json_extract(annotations, '$[0].type') as first_annotation_type
FROM takeoffs WHERE ...
```

**Acceptance Criteria**:
- [ ] Benchmark shows reduced query time for JSON-heavy queries
- [ ] `json_extract()` used for partial JSON reads
- [ ] Full JSON still available when needed via typed helpers
- [ ] No behavioral changes (tests still pass)

**Validation**:
```bash
bun test tests/lib/db/ && bun scripts/benchmarks/db-query-time.ts
```

**Dependencies**: 2.2

---

### Ticket 2.4: Add Database Connection Lifecycle Management

**Description**: Ensure proper database initialization and cleanup patterns.

**Files to Modify**:
- `lib/db/index.ts`

**Acceptance Criteria**:
- [ ] Explicit `initDatabase()` function for startup
- [ ] `closeDatabase()` function for graceful shutdown
- [ ] WAL checkpoint on shutdown (`PRAGMA wal_checkpoint(TRUNCATE)`)
- [ ] Error handling for database initialization failures
- [ ] Export both `db` and lifecycle functions

**Validation**:
```bash
bun test tests/lib/db/
bun -e "import { db, closeDatabase } from './lib/db'; console.log(db.query('SELECT 1').get()); closeDatabase();"
```

**Dependencies**: 2.1

---

### Ticket 2.5: Migrate API Routes to Typed Query Helpers

**Description**: Refactor API routes to use the new typed query helpers instead of inline queries.

**Files to Modify**:
- `app/api/quotes/route.ts`
- `app/api/quotes/[id]/route.ts`
- `app/api/takeoffs/route.ts`
- `app/api/takeoffs/[id]/route.ts`

**Acceptance Criteria**:
- [ ] All inline `db.query()` calls replaced with typed helpers
- [ ] JSON.parse calls removed (handled by helpers)
- [ ] API response format unchanged
- [ ] API tests pass

**Validation**:
```bash
bun test tests/api/
```

**Dependencies**: 2.2, 4.1 (API tests should exist first)

---

## Sprint 3: File I/O Optimization

**Goal**: Replace Node.js fs patterns with Bun-native file operations for improved performance.

**Demo**: Run file I/O benchmark showing throughput improvements; file upload/download flows work correctly.

---

### Ticket 3.1: Create File I/O Test Suite

**Description**: Build tests for all file operations in the application.

**Files to Create**:
- `tests/lib/file-io.test.ts`
- `tests/lib/minio.integration.test.ts`

**Acceptance Criteria**:
- [ ] `Bun.file()` read operations tested (text, bytes, json, arrayBuffer)
- [ ] `Bun.write()` operations tested (string, Uint8Array, Blob)
- [ ] Large file handling tested (>10MB)
- [ ] MinIO upload/download tested (integration, requires MinIO running)
- [ ] Streaming patterns tested
- [ ] Test fixtures created in `tests/fixtures/`

**Validation**:
```bash
bun test tests/lib/file-io.test.ts
MINIO_ENDPOINT=localhost bun test tests/lib/minio.integration.test.ts
```

**Dependencies**: None

---

### Ticket 3.2a: Audit MinIO Client Capabilities

**Description**: Investigate whether the `minio` npm package supports Bun-native types.

**Research Questions**:
- Does `minio@8.x` `putObject()` accept `Uint8Array` or only `Buffer`?
- Does `getObject()` return a Web `ReadableStream` or only Node.js stream?
- Can we use `Bun.S3` directly with self-hosted MinIO?

**Files to Create**:
- `docs/audits/minio-bun-compatibility.md`

**Acceptance Criteria**:
- [ ] Document minio package API capabilities
- [ ] Test script proving what types are accepted/returned
- [ ] Recommendation: optimize within minio, switch to Bun.S3, or accept limitation
- [ ] If Bun.S3 works with MinIO, document configuration

**Validation**:
```bash
# Test script should run without error
bun scripts/test-minio-types.ts
```

**Dependencies**: 3.1

---

### Ticket 3.2b: Optimize MinIO Upload Operations

**Description**: Optimize upload operations based on audit findings.

**Files to Modify**:
- `lib/minio.ts`

**Current Pattern** (lines 43-56):
```typescript
await minioClient.putObject(bucket, objectName, buffer, buffer.length, {...});
```

**Target**: Accept `Uint8Array | ArrayBuffer | Blob` in addition to Buffer, convert at boundary if needed.

**Acceptance Criteria**:
- [ ] `uploadFile()` accepts `Uint8Array | Buffer | Blob`
- [ ] `uploadTakeoffPdf()` accepts same types
- [ ] `uploadThumbnail()` accepts same types
- [ ] Conversion to Buffer (if required by minio) happens once at boundary
- [ ] Tests pass

**Validation**:
```bash
bun test tests/lib/minio.integration.test.ts
```

**Dependencies**: 3.2a

---

### Ticket 3.2c: Optimize MinIO Download Operations

**Description**: Optimize download operations to reduce Buffer accumulation.

**Files to Modify**:
- `lib/minio.ts`

**Current Pattern** (lines 92-104):
```typescript
const chunks: Buffer[] = [];
stream.on("data", (chunk: Buffer) => chunks.push(chunk));
stream.on("end", () => resolve(Buffer.concat(chunks)));
```

**Target**: Return `Uint8Array` directly, stream to Web `ReadableStream` where beneficial.

**Acceptance Criteria**:
- [ ] `getFile()` returns `Uint8Array` (not `Buffer`)
- [ ] `getFileStream()` returns Web `ReadableStream` (not Node.js stream)
- [ ] Memory usage reduced for large files (verified via benchmark)
- [ ] All callers updated to handle new return types
- [ ] Tests pass

**Validation**:
```bash
bun test tests/lib/minio.integration.test.ts
bun scripts/benchmarks/file-io-throughput.ts
```

**Dependencies**: 3.2a

---

### Ticket 3.3: Migrate PDF Upload Route to Bun Patterns

**Description**: Optimize the PDF upload API route to use Bun-native file handling.

**Files to Modify**:
- `app/api/upload/pdf/route.ts`

**Current Pattern**:
```typescript
const arrayBuffer = await file.arrayBuffer();
const buffer = Buffer.from(arrayBuffer);
```

**Target Pattern**:
```typescript
const bytes = new Uint8Array(await file.arrayBuffer());
// Pass directly to MinIO (after 3.2b allows it)
```

**Acceptance Criteria**:
- [ ] No `Buffer.from()` conversion in route
- [ ] File validation still works (size, type)
- [ ] MinIO upload accepts new format
- [ ] Response format unchanged
- [ ] Manual test: upload 50MB PDF successfully

**Validation**:
```bash
curl -X POST -F "file=@tests/fixtures/large.pdf" http://localhost:3000/api/upload/pdf
```

**Dependencies**: 3.2b

---

### Ticket 3.4: Optimize PDF Generation Buffer Usage

**Description**: Remove unnecessary Buffer conversion in PDF generation.

**Files to Modify**:
- `lib/pdf/generate-pdf.ts`

**Current Pattern** (logo loading):
```typescript
const file = Bun.file(LOGO_PATH);
const buffer = await file.arrayBuffer();
const base64 = Buffer.from(buffer).toString("base64");
```

**Target**: Use `Bun.file().bytes()` and native base64 encoding.

**Note**: This is a small optimization - the current code already uses `Bun.file()`.

**Acceptance Criteria**:
- [ ] Logo loading uses `Bun.file().bytes()`
- [ ] Base64 encoding done without Buffer (or with minimal conversion)
- [ ] PDF renders correctly (visual inspection)
- [ ] Tests pass

**Validation**:
```bash
bun test tests/lib/pdf/
```

**Dependencies**: 3.1

---

### Ticket 3.5a: Migrate parse-* Scripts to Bun.file()

**Description**: Update parse scripts to use Bun-native file operations.

**Files to Modify** (9 files):
- `projects/accounts/scripts/parse-certs.ts`
- `projects/accounts/scripts/parse-excel.ts`
- `projects/accounts/scripts/parse-contractor-pairs.ts`
- `projects/accounts/scripts/parse-credit-memos.ts`
- `projects/accounts/scripts/parse-cp-invoices.ts`
- `projects/accounts/scripts/parse-signs.ts`
- `projects/accounts/scripts/parse-excel-noheader.ts`
- `projects/accounts/scripts/parse-all-aia.ts`
- `projects/accounts/scripts/parse-aia.ts`

**Pattern Replacement**:
```typescript
// Before
import { readFileSync, writeFileSync } from "fs";
const data = readFileSync(path, "utf-8");
writeFileSync(outPath, output);

// After
const data = await Bun.file(path).text();
await Bun.write(outPath, output);
```

**Acceptance Criteria**:
- [ ] All `fs` imports replaced with Bun APIs
- [ ] Directory operations use `node:fs/promises` (Bun-compatible)
- [ ] Each script tested: runs and produces correct output
- [ ] No behavioral changes

**Validation**:
```bash
grep -l "from ['\"]fs['\"]" projects/accounts/scripts/parse-*.ts
# Should return empty
```

**Dependencies**: 3.1

---

### Ticket 3.5b: Migrate normalize-* Scripts to Bun.file()

**Description**: Update normalization scripts to use Bun-native file operations.

**Files to Modify** (3 files):
- `projects/accounts/scripts/smart-normalize.ts`
- `projects/accounts/scripts/normalize-contractors.ts`
- `scripts/normalize-contractors-final.ts`

**Acceptance Criteria**:
- [ ] All `fs` imports replaced with Bun APIs
- [ ] Each script tested individually
- [ ] Output matches previous behavior

**Validation**:
```bash
grep -l "from ['\"]fs['\"]" projects/accounts/scripts/*normalize*.ts scripts/normalize-*.ts
# Should return empty
```

**Dependencies**: 3.1

---

### Ticket 3.5c: Migrate bun-init/build.ts to Bun.file()

**Description**: Update build script to use Bun-native file operations.

**Files to Modify**:
- `bun-init/build.ts`

**Acceptance Criteria**:
- [ ] `fs` imports replaced with Bun APIs
- [ ] Build script runs correctly
- [ ] Output unchanged

**Validation**:
```bash
cd bun-init && bun build.ts
```

**Dependencies**: 3.1

---

### Ticket 3.6: Optimize Email Client Buffer Handling

**Description**: Optimize Buffer usage in the email client for attachments.

**Files to Modify**:
- `services/email/client.ts`

**Key Areas** (extensive file, 2285 lines):
- Attachment download: `Buffer.from(response.contentBytes, 'base64')`
- Attachment upload encoding
- Email body handling

**Acceptance Criteria**:
- [ ] Attachment download uses `Uint8Array` where possible
- [ ] Base64 operations optimized
- [ ] Email send/receive still works
- [ ] Integration tests pass

**Validation**:
```bash
bun test services/email/tests/
```

**Dependencies**: 3.1

---

### Ticket 3.7: Optimize SharePoint Client Streaming

**Description**: Optimize stream-to-buffer conversion in SharePoint client.

**Files to Modify**:
- `services/sharepoint/client.ts`

**Current Pattern**: Manual stream-to-buffer conversion for downloads.

**Target**: Return `ReadableStream` or `Uint8Array` directly.

**Acceptance Criteria**:
- [ ] Download operations optimized
- [ ] Large file downloads don't buffer entirely in memory
- [ ] Existing functionality preserved

**Validation**:
```bash
bun test services/sharepoint/tests/ # if tests exist
# or manual test
```

**Dependencies**: 3.1

---

## Sprint 4: API Route Optimization

**Goal**: Clean up API routes, add structured logging, and optimize response handling.

**Demo**: API routes return faster responses; no console.log in production; structured error responses.

---

### Ticket 4.1: Create API Route Test Suite

**Description**: Build integration tests for all API routes.

**Files to Create**:
- `tests/api/quotes.test.ts`
- `tests/api/takeoffs.test.ts`
- `tests/api/upload.test.ts`
- `tests/api/monday.test.ts`
- `tests/api/health.test.ts`

**Acceptance Criteria**:
- [ ] Each route tested (GET, POST, PUT, DELETE as applicable)
- [ ] Error cases tested (404, 400, 500)
- [ ] Response format validated
- [ ] Tests use test database
- [ ] Cleanup after tests
- [ ] Tests work with CURRENT implementation (before refactoring)

**Validation**:
```bash
bun test tests/api/
```

**Dependencies**: None (intentionally no dependency on Sprint 2)

---

### Ticket 4.2: Remove Debug Console Statements

**Description**: Remove or replace console.log statements in API routes.

**Files to Modify** (10 files):
- [ ] `app/api/quotes/route.ts`
- [ ] `app/api/quotes/[id]/route.ts`
- [ ] `app/api/quotes/[id]/duplicate/route.ts`
- [ ] `app/api/quotes/[id]/pdf/route.ts`
- [ ] `app/api/webhooks/monday/route.ts`
- [ ] `app/api/monday/search/route.ts`
- [ ] `app/api/quotes/[id]/takeoff/route.ts`
- [ ] `app/api/takeoffs/[id]/quote/route.ts`
- [ ] `app/api/takeoffs/[id]/pdf/route.ts`
- [ ] `app/api/upload/pdf/route.ts`

**Strategy**:
- Debug logs (`console.log`) → Remove
- Error logs (`console.error`) → Keep with structured context
- Info logs → Conditional on `process.env.DEBUG`

**Acceptance Criteria**:
- [ ] Zero `console.log` in production code paths
- [ ] `console.error` retained for actual errors with context
- [ ] Ultracite check passes
- [ ] API tests still pass

**Validation**:
```bash
grep -rn "console\.log" app/api/ --include="*.ts"
# Should return empty
bun x ultracite check
bun test tests/api/
```

**Dependencies**: 4.1

---

### Ticket 4.3: Standardize API Error Responses

**Description**: Create consistent error response format across all API routes.

**Files to Create**:
- `lib/api/errors.ts`

**Files to Modify**:
- All files in `app/api/`

**Error Format**:
```typescript
type APIError = {
  error: string;      // Human-readable message
  code: string;       // Machine-readable code (e.g., "QUOTE_NOT_FOUND")
  details?: unknown;  // Optional additional context
};

// Helper function
function createErrorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown
): Response
```

**Acceptance Criteria**:
- [ ] `createErrorResponse()` helper created and exported
- [ ] Common error codes defined (NOT_FOUND, BAD_REQUEST, INTERNAL_ERROR, etc.)
- [ ] All routes use consistent error format
- [ ] HTTP status codes match error types
- [ ] API tests updated to verify error format

**Validation**:
```bash
bun test tests/api/
```

**Dependencies**: 4.1

---

### Ticket 4.4: Optimize PDF Response Streaming

**Description**: Ensure PDF responses stream efficiently without buffering.

**Files to Modify**:
- `app/api/quotes/[id]/pdf/route.ts`
- `app/api/takeoffs/[id]/pdf/route.ts`

**Acceptance Criteria**:
- [ ] PDF responses include `Content-Length` header
- [ ] Large PDFs (>5MB) don't cause memory issues
- [ ] Response time measured and documented
- [ ] Browser download works correctly
- [ ] Response uses streaming where beneficial

**Validation**:
```bash
curl -I http://localhost:3000/api/quotes/test-id/pdf
# Should show Content-Length and Content-Type headers
```

**Dependencies**: 3.4, 4.1

---

### Ticket 4.5: Add Request Validation Middleware

**Description**: Create reusable validation for common request patterns.

**Files to Create**:
- `lib/api/validation.ts`

**Acceptance Criteria**:
- [ ] `validateBody<T>(request, schema)` helper using Zod
- [ ] `validateParams(params, required[])` helper
- [ ] Returns typed result or error response
- [ ] Used in at least 3 routes as proof of concept
- [ ] Type inference works correctly

**Validation**:
```bash
bun test tests/api/ && bun x tsc --noEmit
```

**Dependencies**: 4.3

---

## Sprint 5: Build & Production Optimization

**Goal**: Optimize production builds with bytecode compilation and final performance tuning.

**Demo**: Production build with benchmarks showing improvements; bytecode-compiled CLI scripts run faster.

---

### Ticket 5.1: Bytecode Compile CLI Scripts

**Description**: Add bytecode compilation for frequently-run scripts.

**Files to Modify**:
- `package.json` (add build scripts)

**Scripts to Compile**:
- `services/file-automation/docusign/bc-bids-sync.ts` (corrected path)
- `services/email/building-connected/sync.ts`
- `scripts/match-contractors.ts`

**Acceptance Criteria**:
- [ ] `bun run build:scripts` command added to package.json
- [ ] Each script produces `.js` and `.jsc` files in `dist/scripts/`
- [ ] Compiled scripts run correctly
- [ ] Startup time improvement measured (target: 1.5-2x faster)
- [ ] Scripts with dynamic imports tested for compatibility

**Validation**:
```bash
bun run build:scripts
time bun dist/scripts/bc-bids-sync.js --help  # Compare to source version
time bun services/file-automation/docusign/bc-bids-sync.ts --help
```

**Dependencies**: None

---

### Ticket 5.2: Create Production Build Configuration

**Description**: Optimize Next.js production build for Bun runtime.

**Files to Modify**:
- `next.config.mjs`
- `package.json`

**Acceptance Criteria**:
- [ ] `bun run build` produces optimized output
- [ ] Build time measured and documented
- [ ] Bundle size measured and documented
- [ ] No build warnings
- [ ] Production server starts correctly

**Validation**:
```bash
bun run build && bun run start
# Test key flows manually: quotes list, takeoff upload, PDF generation
```

**Dependencies**: 2.4, 3.5c, 4.5 (all optimizations complete)

---

### Ticket 5.3: Final Performance Benchmark

**Description**: Run complete benchmark suite and compare to baseline.

**Files to Create**:
- `docs/audits/final-metrics.md`

**Acceptance Criteria**:
- [ ] All baseline benchmarks re-run on same hardware
- [ ] Comparison table: before/after for each metric
- [ ] Improvement percentages calculated
- [ ] Regressions (if any) documented with explanation
- [ ] Statistical significance noted (multiple runs)

**Comparison Format**:
| Metric | Baseline | Final | Change |
|--------|----------|-------|--------|
| Cold start | Xs | Ys | -Z% |
| API p50 | Xms | Yms | -Z% |
| ... | ... | ... | ... |

**Validation**: Document exists with complete comparison.

**Dependencies**: 5.1, 5.2

---

### Ticket 5.4: Update Project Documentation

**Description**: Update CLAUDE.md and README with new patterns and commands.

**Files to Modify**:
- `CLAUDE.md`
- `.claude/CLAUDE.md`
- `README.md` (create if doesn't exist)

**Acceptance Criteria**:
- [ ] Bun-native patterns documented (Bun.file, Bun.write, bun:sqlite)
- [ ] New build commands documented (`build:scripts`)
- [ ] Performance improvements summarized
- [ ] Any breaking changes highlighted
- [ ] Existing Bun.serve patterns in `services/email/http-server.ts` referenced

**Validation**: Review documentation manually.

**Dependencies**: 5.3

---

### Ticket 5.5: Create Optimization Playbook

**Description**: Document the optimization patterns for future reference.

**Files to Create**:
- `docs/BUN-OPTIMIZATION-PLAYBOOK.md`

**Content Sections**:
1. When to use `Bun.file()` vs `node:fs`
2. Buffer vs Uint8Array decision tree
3. SQLite JSON function patterns
4. Bytecode compilation criteria
5. Streaming best practices
6. MinIO/S3 patterns

**Acceptance Criteria**:
- [ ] Each pattern documented with before/after examples
- [ ] Decision criteria explained
- [ ] Links to Bun docs included
- [ ] Code snippets tested and working

**Validation**: Document reviewed by team member.

**Dependencies**: 5.3

---

### Ticket 5.6: Evaluate Bun.S3 for MinIO Operations

**Description**: Investigate if Bun's native S3 support can replace the `minio` npm package.

**Research Questions**:
- Does `Bun.S3` work with self-hosted MinIO?
- What configuration is needed?
- Performance comparison: Bun.S3 vs minio package

**Files to Create**:
- `docs/audits/bun-s3-evaluation.md`
- `scripts/test-bun-s3-minio.ts`

**Acceptance Criteria**:
- [ ] Bun.S3 tested against local MinIO
- [ ] If compatible: migration path documented
- [ ] If not compatible: limitations documented
- [ ] Recommendation: migrate, partial migrate, or keep minio package

**Validation**:
```bash
bun scripts/test-bun-s3-minio.ts
```

**Dependencies**: 3.2a (builds on MinIO audit findings)

---

## Sprint Summary

| Sprint | Focus | Tickets | Key Deliverables |
|--------|-------|---------|------------------|
| 1 | Foundation | 3 | Benchmarks, comprehensive audit, baseline metrics |
| 2 | Database | 5 | Typed queries, JSON optimization, API migration |
| 3 | File I/O | 10 | Bun.file() migration, MinIO optimization, streaming |
| 4 | API Routes | 5 | Console cleanup, error handling, validation |
| 5 | Production | 6 | Bytecode compilation, final benchmarks, docs |

**Total Tickets**: 29

---

## Dependency Graph

```
Sprint 1:
  1.1 ─────────────────────┐
  1.2 (no deps)            │
  1.3 ← 1.1 ───────────────┴─→ Baseline complete

Sprint 2:
  2.1 (no deps)
  2.2 ← 2.1
  2.3 ← 2.2
  2.4 ← 2.1
  2.5 ← 2.2, 4.1 (cross-sprint)

Sprint 3:
  3.1 (no deps)
  3.2a ← 3.1
  3.2b ← 3.2a
  3.2c ← 3.2a
  3.3 ← 3.2b
  3.4 ← 3.1
  3.5a ← 3.1
  3.5b ← 3.1
  3.5c ← 3.1
  3.6 ← 3.1
  3.7 ← 3.1

Sprint 4:
  4.1 (no deps) ─────────────→ Enables 2.5
  4.2 ← 4.1
  4.3 ← 4.1
  4.4 ← 3.4, 4.1
  4.5 ← 4.3

Sprint 5:
  5.1 (no deps)
  5.2 ← 2.4, 3.5c, 4.5
  5.3 ← 5.1, 5.2
  5.4 ← 5.3
  5.5 ← 5.3
  5.6 ← 3.2a
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| FTS5 not available on all systems | Low | Low | Fallback to LIKE queries (already implemented) |
| MinIO client requires Node.js Buffer | High | Medium | Accept Buffer at boundary, convert internally; document limitation |
| pdfmake requires Buffer internally | High | Low | Wrap with conversion at API boundary only |
| Bun.S3 incompatible with self-hosted MinIO | Medium | Low | Keep minio package if needed |
| Bytecode compilation fails with dynamic imports | Medium | Medium | Test each script individually; skip incompatible scripts |
| Next.js 16 incompatibilities with Bun optimizations | Low | High | Test thoroughly in dev before production; keep rollback plan |
| Breaking changes during API refactoring | Medium | High | API tests (4.1) created BEFORE refactoring begins |
| Performance regressions from changes | Low | Medium | Benchmark after each sprint; revert if regression detected |

---

## Success Criteria

**Performance**:
- [ ] Startup time reduced by ≥25%
- [ ] API response times reduced by ≥15%
- [ ] File I/O throughput improved by ≥20%

**Code Quality**:
- [ ] Zero `fs` imports in application code (services and app/)
- [ ] Zero `console.log` in production API routes
- [ ] All tests passing (≥95% coverage on new code)
- [ ] Ultracite check passing with zero errors

**Documentation**:
- [ ] Baseline metrics documented
- [ ] Final metrics documented with comparison
- [ ] Optimization playbook complete
- [ ] CLAUDE.md updated with new patterns

---

## Appendix: Files by Sprint

### Sprint 2 Critical Files
- `lib/db/index.ts` - Schema and connection
- `lib/types.ts` - Domain types for type safety

### Sprint 3 Critical Files
- `lib/minio.ts` - All storage operations (250 lines)
- `lib/pdf/generate-pdf.ts` - PDF generation
- `app/api/upload/pdf/route.ts` - Upload endpoint
- `services/email/client.ts` - Email with attachments (2285 lines)
- `services/sharepoint/client.ts` - SharePoint downloads

### Sprint 4 Critical Files
- All `app/api/**/*.ts` files (10 routes)
- `lib/api/errors.ts` (new)
- `lib/api/validation.ts` (new)

### Sprint 5 Critical Files
- `services/file-automation/docusign/bc-bids-sync.ts` - BC sync script
- `services/email/building-connected/sync.ts` - Building Connected sync
- `next.config.mjs` - Build configuration
