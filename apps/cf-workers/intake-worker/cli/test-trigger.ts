#!/usr/bin/env bun

/**
 * Test Trigger — Manually fire the document intake pipeline.
 *
 * Modes:
 *   webhook <file...>    Post file(s) to the local webhook endpoint
 *   process <file...>    Run the parse pipeline directly on file(s)
 *
 * Examples:
 *   bun cli/test-trigger.ts webhook /tmp/contract.pdf
 *   bun cli/test-trigger.ts webhook /tmp/screenshot.png /tmp/po.pdf
 *   bun cli/test-trigger.ts process /tmp/contract.pdf
 */

import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { processFilesIntake } from "@documents-intake/files-intake";

const LOG = "[test-trigger]";

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".webp": "image/webp",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

async function webhookMode(filePaths: string[]): Promise<void> {
  const webhookUrl =
    process.env.WEBHOOK_URL || "http://localhost:4747/api/webhooks/intake";

  const attachments = filePaths.map((p) => {
    const bytes = readFileSync(p);
    const ext = extname(p).toLowerCase();
    return {
      filename: basename(p),
      contentType: MIME_MAP[ext] ?? "application/octet-stream",
      size: bytes.byteLength,
      content: bytes.toString("base64"),
    };
  });

  const payload = {
    forwarderEmail: "test@desertservices.app",
    forwardedAt: new Date().toISOString(),
    originalSubject: "Test Files Intake",
    originalFrom: "test@example.com",
    bodyText: "",
    bodyHasContent: false,
    attachments,
  };

  console.log(
    `${LOG} POSTing ${attachments.length} file(s) to ${webhookUrl}...`
  );

  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await resp.json();
  console.log(`${LOG} Response (${resp.status}):`, body);
}

async function processMode(filePaths: string[]): Promise<void> {
  console.log(
    `${LOG} Running parse pipeline directly on ${filePaths.length} file(s)...\n`
  );

  const results = await processFilesIntake({
    originalSubject: "Test — Direct Process",
    originalFrom: "test@example.com",
    bodyText: "",
    attachmentPaths: filePaths,
    forwarderEmail: "test@desertservices.app",
  });

  console.log(`\n${LOG} Results:`);
  for (const r of results) {
    if (r.error) {
      console.log(`  FAIL  ${r.fileName}: ${r.error}`);
    } else {
      console.log(
        `  OK    ${r.fileName}: ${r.documentType}, ${r.pageCount} pages, ${r.processingTimeMs}ms → document #${r.documentId}`
      );
    }
  }
}

const command = process.argv[2];
const filePaths = process.argv.slice(3);

if (!(command && ["webhook", "process"].includes(command))) {
  console.log("Usage: bun cli/test-trigger.ts <webhook|process> <file...>");
  console.log("");
  console.log(
    "  webhook  — POST files as base64 to the local webhook endpoint"
  );
  console.log(
    "  process  — Run the parse pipeline directly (classify + parse → DB)"
  );
  process.exit(1);
}

if (filePaths.length === 0) {
  console.error("Error: provide at least one file path");
  process.exit(1);
}

for (const p of filePaths) {
  if (!Bun.file(p).size) {
    console.error(`Error: file not found or empty: ${p}`);
    process.exit(1);
  }
}

switch (command) {
  case "webhook":
    await webhookMode(filePaths);
    break;
  case "process":
    await processMode(filePaths);
    break;
  default:
    throw new Error(`Unknown command: ${command}`);
}
