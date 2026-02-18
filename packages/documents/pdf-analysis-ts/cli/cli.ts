#!/usr/bin/env bun

import { parseArgs } from "node:util";
import {
  asJson,
  die,
  ensureParentDir,
  resolvePath,
} from "@pdf-analysis/common";
import { extractEstimate } from "@pdf-analysis/services/estimate";
import { extractPdfText } from "@pdf-analysis/services/kreuzberg";
import { extractNoi } from "@pdf-analysis/services/noi";
import { KreuzbergOcrProvider } from "@pdf-analysis/services/ocr-provider";
import { parseWithFallback } from "@pdf-analysis/services/pipeline";
import type { OutputFormat } from "@pdf-analysis/types";
import { z } from "zod";

function help(): void {
  console.log(`
Desert PDF Analysis CLI (TypeScript)

Usage:
  bun packages/documents/pdf-analysis/cli/cli.ts status
  bun packages/documents/pdf-analysis/cli/cli.ts text <pdf-path> [--format text|json] [--output path]
  bun packages/documents/pdf-analysis/cli/cli.ts ocr <pdf-path> [--backend rapidocronnx] [--output path]
  bun packages/documents/pdf-analysis/cli/cli.ts parse <pdf-path> [--min-text-length 400] [--output path]
  bun packages/documents/pdf-analysis/cli/cli.ts noi <text-file> [--format text|json] [--output path]
  bun packages/documents/pdf-analysis/cli/cli.ts estimate <pdf-path> [--format text|json] [--output path]
`);
}

function parseOutputFormat(
  value: string | undefined,
  fallback: OutputFormat
): OutputFormat {
  if (!value) {
    return fallback;
  }
  if (value === "text" || value === "json" || value === "markdown") {
    return value;
  }
  die(`Invalid --format '${value}'`);
}

async function writeOrStdout(content: string, output?: string): Promise<void> {
  if (!output) {
    process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
    return;
  }
  const resolved = resolvePath(output);
  ensureParentDir(resolved);
  await Bun.write(resolved, content.endsWith("\n") ? content : `${content}\n`);
  console.log(`Wrote output: ${resolved}`);
}

const parseSchema = z
  .object({
    "min-text-length": z.coerce.number().int().positive().optional(),
    output: z.string().trim().min(1).optional(),
  })
  .strict();

const outputSchema = z
  .object({
    format: z.string().trim().optional(),
    output: z.string().trim().min(1).optional(),
  })
  .strict();

async function handleStatus(): Promise<void> {
  const provider = new KreuzbergOcrProvider();
  const available = await provider.isAvailable();
  process.stdout.write(
    `${[
      "1. Text extractor: kreuzberg",
      `2. OCR provider: ${provider.name}`,
      `3. OCR available: ${available ? "yes" : "no"}`,
    ].join("\n")}\n`
  );
}

async function handleText(args: string[]): Promise<void> {
  const [inputPath, ...rest] = args;
  if (!inputPath) {
    die("text requires <pdf-path>");
  }
  const { values } = parseArgs({
    args: rest,
    options: {
      format: { type: "string" },
      output: { type: "string" },
    },
  });
  const parsed = outputSchema.safeParse(values);
  if (!parsed.success) {
    die(parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  const result = await extractPdfText(resolvePath(inputPath));
  const format = parseOutputFormat(parsed.data.format, "text");
  if (format === "json") {
    await writeOrStdout(asJson(result), parsed.data.output);
    return;
  }
  await writeOrStdout(result.content, parsed.data.output);
}

async function handleOcr(args: string[]): Promise<void> {
  const [inputPath, ...rest] = args;
  if (!inputPath) {
    die("ocr requires <pdf-path>");
  }
  const { values } = parseArgs({
    args: rest,
    options: {
      backend: { type: "string" },
      output: { type: "string" },
    },
  });

  const provider = new KreuzbergOcrProvider({ backend: values.backend });
  const result = await provider.ocrPdf(resolvePath(inputPath));
  await writeOrStdout(result.content, values.output);
}

async function handleParse(args: string[]): Promise<void> {
  const [inputPath, ...rest] = args;
  if (!inputPath) {
    die("parse requires <pdf-path>");
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      "min-text-length": { type: "string" },
      output: { type: "string" },
    },
  });

  const parsed = parseSchema.safeParse(values);
  if (!parsed.success) {
    die(parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  const provider = new KreuzbergOcrProvider();
  const result = await parseWithFallback(resolvePath(inputPath), provider, {
    minTextLength: parsed.data["min-text-length"],
  });

  const output = `${result.content}\n\n---\n\n${result.steps.join("\n")}`;
  await writeOrStdout(output, parsed.data.output);
}

async function handleNoi(args: string[]): Promise<void> {
  const [inputPath, ...rest] = args;
  if (!inputPath) {
    die("noi requires <text-file>");
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      format: { type: "string" },
      output: { type: "string" },
    },
  });
  const parsed = outputSchema.safeParse(values);
  if (!parsed.success) {
    die(parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  const text = await Bun.file(resolvePath(inputPath)).text();
  const result = extractNoi(text);
  const format = parseOutputFormat(parsed.data.format, "json");

  if (format === "json") {
    await writeOrStdout(asJson(result), parsed.data.output);
    return;
  }

  const lines = [
    `NOI: ${result.permitId || "Unknown"}`,
    `LTF#: ${result.ltfNumber || "Unknown"}`,
    `Applicant: ${result.applicantName}`,
    `Site: ${result.siteName}`,
    `SWPPP Email: ${result.swpppContactEmail || "Unknown"}`,
  ];
  await writeOrStdout(lines.join("\n"), parsed.data.output);
}

async function handleEstimate(args: string[]): Promise<void> {
  const [inputPath, ...rest] = args;
  if (!inputPath) {
    die("estimate requires <pdf-path>");
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      format: { type: "string" },
      output: { type: "string" },
    },
  });
  const parsed = outputSchema.safeParse(values);
  if (!parsed.success) {
    die(parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  const result = await extractEstimate(resolvePath(inputPath));
  const format = parseOutputFormat(parsed.data.format, "json");

  if (format === "json") {
    await writeOrStdout(asJson(result), parsed.data.output);
    return;
  }

  const lines = [
    `Estimate #${result.header.estimateNumber || "unknown"}`,
    `Date: ${result.header.date || "unknown"}`,
    `GC: ${result.header.gcName || "unknown"}`,
    `Job: ${result.header.jobName || "unknown"}`,
    `Line items: ${result.lineItems.length}`,
    `Grand Total: $${result.grandTotal.toFixed(2)}`,
  ];
  await writeOrStdout(lines.join("\n"), parsed.data.output);
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (!command || command === "-h" || command === "--help") {
    help();
    return;
  }

  switch (command) {
    case "status":
      await handleStatus();
      break;
    case "text":
      await handleText(rest);
      break;
    case "ocr":
      await handleOcr(rest);
      break;
    case "parse":
      await handleParse(rest);
      break;
    case "noi":
      await handleNoi(rest);
      break;
    case "estimate":
      await handleEstimate(rest);
      break;
    default:
      die(`Unknown command '${command}'`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  die(message);
});
