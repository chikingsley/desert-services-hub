/**
 * Intake Pipeline — Integration Tests
 *
 * Tests the full flow: webhook → job queue → process → auto-link
 * Covers PDFs and the intake endpoint with backward compat aliases.
 *
 * Run: bun test ./tests/intake-pipeline.test.ts --verbose
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "@lib/db/hub";

// ============================================================================
// Config
// ============================================================================

const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "http://localhost:4000";
const TEST_PDF_DIRS = [
  process.env.TEST_PDF_DIR,
  "/tmp/po-test",
  "tests/output/invoices",
  "packages/email/resources/inbox",
].filter((v): v is string => Boolean(v));
const POLL_INTERVAL_MS = 2000;
const PARSE_TIMEOUT_MS = 120_000; // 2 min for OCR + reconciliation

// ============================================================================
// Helpers
// ============================================================================

async function findTestPdf(): Promise<string> {
  const glob = new Bun.Glob("*.pdf");
  for (const dir of TEST_PDF_DIRS) {
    const absDir = resolve(dir);
    if (!existsSync(absDir)) {
      continue;
    }
    for await (const file of glob.scan({ cwd: absDir })) {
      return `${absDir}/${file}`;
    }
  }
  throw new Error(
    `No PDF files found. Checked: ${TEST_PDF_DIRS.map((d) => resolve(d)).join(", ")}`
  );
}

async function waitForJobCompletion(
  jobId: number,
  timeoutMs = PARSE_TIMEOUT_MS
): Promise<{ status: string; attempts: number; error: string | null }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const row = await db
      .query<{ status: string; attempts: number; error: string | null }>(
        "SELECT status, attempts, error FROM webhook_jobs WHERE id = $1"
      )
      .get(jobId);

    if (!row) {
      throw new Error(`Job #${jobId} not found`);
    }
    if (row.status === "completed" || row.status === "failed") {
      return row;
    }

    await Bun.sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Job #${jobId} timed out after ${timeoutMs}ms`);
}

// ============================================================================
// PDF Pipeline Tests (via /api/webhooks/intake)
// ============================================================================

describe("intake pipeline — PDF", () => {
  let testPdfPath: string;
  let jobId: number;

  beforeAll(async () => {
    testPdfPath = await findTestPdf();
    console.log(`Using test PDF: ${testPdfPath}`);
  });

  it(
    "webhook accepts PDF and enqueues job",
    async () => {
      const pdfBuffer = await Bun.file(testPdfPath).arrayBuffer();
      const base64 = Buffer.from(pdfBuffer).toString("base64");
      const fileName = testPdfPath.split("/").pop();
      if (!fileName) {
        throw new Error(`Invalid test PDF path: ${testPdfPath}`);
      }

      const response = await fetch(`${WEBHOOK_URL}/api/webhooks/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          forwarderEmail: "test-runner@desertservices.app",
          forwardedAt: new Date().toISOString(),
          originalSubject: `Test Intake Pipeline ${Date.now()}`,
          originalFrom: "vendor@example.com",
          bodyText: "Test email body for pipeline verification",
          bodyHasContent: false,
          attachments: [
            {
              filename: fileName,
              contentType: "application/pdf",
              size: pdfBuffer.byteLength,
              content: base64,
            },
          ],
        }),
      });

      expect(response.status).toBe(202);
      const body = (await response.json()) as {
        ok: boolean;
        jobId: number;
        files: number;
      };
      expect(body.ok).toBe(true);
      expect(body.files).toBe(1);
      expect(body.jobId).toBeGreaterThan(0);

      jobId = body.jobId;
      console.log(`  Job #${jobId} enqueued`);
    },
    { timeout: 30_000 }
  );

  it(
    "background worker processes the job",
    async () => {
      await db.run(
        "UPDATE webhook_jobs SET created_at = '2019-01-01' WHERE id = $1",
        [jobId]
      );

      console.log(`  Waiting for job #${jobId} to complete...`);
      const result = await waitForJobCompletion(jobId);

      expect(result.status).toBe("completed");
      expect(result.error).toBeNull();
      console.log(`  Job #${jobId} completed (attempt ${result.attempts})`);
    },
    { timeout: PARSE_TIMEOUT_MS + 10_000 }
  );

  it("file record is stored with parsed data", async () => {
    const contract = await db
      .query<{
        id: number;
        document_type: string;
        summary: string | null;
        model: string | null;
        processing_time_ms: number | null;
        extraction_status: string;
        original_from: string | null;
        original_subject: string | null;
        forwarder_email: string | null;
      }>(
        `SELECT id, document_type, summary, model, processing_time_ms,
                extraction_status, original_from, original_subject,
                forwarder_email
         FROM documents
         WHERE forwarder_email = 'test-runner@desertservices.app'
           AND extraction_status = 'success'
         ORDER BY id DESC LIMIT 1`
      )
      .get();

    expect(contract).toBeTruthy();
    if (!contract) {
      throw new Error("Expected a processed contract record");
    }

    expect(contract.extraction_status).toBe("success");
    expect(contract.document_type).not.toBe("unknown");
    expect(contract.summary).toBeTruthy();
    if (!contract.summary) {
      throw new Error("Expected contract summary to be present");
    }
    expect(contract.summary.length).toBeGreaterThan(100);

    expect(contract.model).toBeTruthy();
    if (!contract.model) {
      throw new Error("Expected model name to be present");
    }

    expect(contract.processing_time_ms).toBeGreaterThan(0);
    if (contract.processing_time_ms == null) {
      throw new Error("Expected processing_time_ms to be present");
    }

    expect(contract.original_from).toBe("vendor@example.com");
    expect(contract.forwarder_email).toBe("test-runner@desertservices.app");

    console.log(`  Record #${contract.id}:`);
    console.log(`    Type: ${contract.document_type}`);
    console.log(`    Model: ${contract.model}`);
    console.log(`    Time: ${contract.processing_time_ms}ms`);
    console.log(`    Summary: ${contract.summary.length} chars`);
  });

  it("backward compat: removed aliases stay removed", async () => {
    // /api/webhooks/files-intake is intentionally removed.
    const res1 = await fetch(`${WEBHOOK_URL}/api/webhooks/files-intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        forwarderEmail: "test-runner@desertservices.app",
        forwardedAt: new Date().toISOString(),
        originalSubject: "Backward Compat Test - files-intake",
        originalFrom: "test@example.com",
        bodyText: "",
        attachments: [],
      }),
    });
    expect(res1.status).toBe(404);

    // /api/webhooks/contracts-intake is intentionally removed.
    const res2 = await fetch(`${WEBHOOK_URL}/api/webhooks/contracts-intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        forwarderEmail: "test-runner@desertservices.app",
        forwardedAt: new Date().toISOString(),
        originalSubject: "Backward Compat Test - contracts-intake",
        originalFrom: "test@example.com",
        bodyText: "",
        attachments: [],
      }),
    });
    expect(res2.status).toBe(404);

    // /api/webhooks/dust-permit-intake was intentionally removed.
    const res3 = await fetch(`${WEBHOOK_URL}/api/webhooks/dust-permit-intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        forwarderEmail: "test-runner@desertservices.app",
        forwardedAt: new Date().toISOString(),
        originalSubject: "Backward Compat Test - dust-permit-intake",
        originalFrom: "test@example.com",
        bodyText: "",
        attachments: [],
      }),
    });
    expect(res3.status).toBe(404);
  });

  afterAll(async () => {
    await db.run(
      "DELETE FROM documents WHERE forwarder_email = 'test-runner@desertservices.app'"
    );
    console.log("  Cleaned up test records");
  });
});
