#!/usr/bin/env bun

/**
 * Test Trigger — Manually fire the contracts email intake pipeline.
 *
 * Modes:
 *   webhook <pdf...>    Post PDF(s) directly to the local webhook endpoint (saves + enqueues job)
 *   process <pdf...>    Run the parse pipeline directly on PDF(s) (skip email/webhook)
 *   enqueue <pdf...>    Save PDFs to intake dir and enqueue a job (skip webhook HTTP call)
 *
 * Examples:
 *   bun cli/test-trigger.ts webhook /tmp/contract.pdf
 *   bun cli/test-trigger.ts process /tmp/contract.pdf /tmp/po.pdf
 *   bun cli/test-trigger.ts enqueue /tmp/contract.pdf
 */

import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { db } from "@lib/db/hub";
import { processContractsEmailIntake } from "@/apps/workers/contract-intake/lib/parse-intake";

const LOG = "[test-trigger]";

const enqueueStmt = db.prepare(
  "INSERT INTO webhook_jobs (job_type, payload) VALUES ('contracts_email_intake', ?) RETURNING id"
);

const INTAKE_DIR = join(import.meta.dir, "../../../../data/contracts-intake");

// ============================================================================
// Commands
// ============================================================================

async function webhookMode(pdfPaths: string[]): Promise<void> {
  const webhookUrl =
    process.env.WEBHOOK_URL || "http://localhost:4747/api/webhooks/contracts-intake";

  // Build payload matching what the CF worker sends
  const attachments = pdfPaths.map((p) => {
    const bytes = readFileSync(p);
    return {
      filename: basename(p),
      contentType: "application/pdf",
      size: bytes.byteLength,
      content: bytes.toString("base64"),
    };
  });

  const payload = {
    forwarderEmail: "test@desertservices.app",
    forwardedAt: new Date().toISOString(),
    originalSubject: "Test Contract Intake",
    originalFrom: "test@example.com",
    bodyText: "",
    attachments,
  };

  console.log(
    `${LOG} POSTing ${attachments.length} PDF(s) to ${webhookUrl}...`
  );

  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await resp.json();
  console.log(`${LOG} Response (${resp.status}):`, body);
}

async function processMode(pdfPaths: string[]): Promise<void> {
  console.log(`${LOG} Running parse pipeline directly on ${pdfPaths.length} PDF(s)...\n`);

  const results = await processContractsEmailIntake({
    originalSubject: "Test — Direct Process",
    originalFrom: "test@example.com",
    bodyText: "",
    attachmentPaths: pdfPaths,
    forwarderEmail: "test@desertservices.app",
  });

  console.log(`\n${LOG} Results:`);
  for (const r of results) {
    if (r.error) {
      console.log(`  FAIL  ${r.fileName}: ${r.error}`);
    } else {
      console.log(
        `  OK    ${r.fileName}: ${r.documentType}, ${r.pageCount} pages, ${r.processingTimeMs}ms → contract #${r.contractId}`
      );
    }
  }
}

async function enqueueMode(pdfPaths: string[]): Promise<void> {
  // Copy PDFs to intake dir
  const jobId = `${Date.now()}-test`;
  const jobDir = join(INTAKE_DIR, jobId);
  await mkdir(jobDir, { recursive: true });

  const attachmentPaths: string[] = [];
  for (const p of pdfPaths) {
    const dest = join(jobDir, basename(p));
    await Bun.write(dest, readFileSync(p));
    attachmentPaths.push(dest);
    console.log(`${LOG} Copied: ${basename(p)} → ${dest}`);
  }

  const payload = JSON.stringify({
    originalSubject: "Test — Enqueued",
    originalFrom: "test@example.com",
    bodyText: "",
    attachmentPaths,
    forwarderEmail: "test@desertservices.app",
  });

  const row = (await enqueueStmt.get(payload)) as { id: number } | null;
  console.log(
    `${LOG} Enqueued job #${row?.id}: ${attachmentPaths.length} PDF(s)`
  );
  console.log(`${LOG} The background worker will pick this up automatically.`);
}

// ============================================================================
// CLI Entry
// ============================================================================

const command = process.argv[2];
const pdfPaths = process.argv.slice(3);

if (!command || !["webhook", "process", "enqueue"].includes(command)) {
  console.log("Usage: bun cli/test-trigger.ts <webhook|process|enqueue> <pdf...>");
  console.log("");
  console.log("  webhook  — POST PDFs as base64 to the local webhook endpoint");
  console.log("  process  — Run the parse pipeline directly (classify + parse → DB)");
  console.log("  enqueue  — Save PDFs and enqueue a job for the background worker");
  process.exit(1);
}

if (pdfPaths.length === 0) {
  console.error("Error: provide at least one PDF path");
  process.exit(1);
}

// Verify files exist
for (const p of pdfPaths) {
  if (!Bun.file(p).size) {
    console.error(`Error: file not found or empty: ${p}`);
    process.exit(1);
  }
}

switch (command) {
  case "webhook":
    await webhookMode(pdfPaths);
    break;
  case "process":
    await processMode(pdfPaths);
    break;
  case "enqueue":
    await enqueueMode(pdfPaths);
    break;
}
