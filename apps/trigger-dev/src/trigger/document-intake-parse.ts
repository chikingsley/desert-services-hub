import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { python } from "@trigger.dev/python";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const PARSE_SCRIPT = "./apps/trigger-dev/src/document-intake/parse.py";

const payloadSchema = z.object({
  filename: z.string().min(1),
  contentBase64: z.string().min(1),
});

const parseResultSchema = z
  .object({
    filename: z.string(),
    content: z.string(),
    page_count: z.number().int().nonnegative(),
    processing_time_ms: z.number().int().nonnegative(),
    extraction_method: z.string(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .transform((r) => ({
    filename: r.filename,
    content: r.content,
    pageCount: r.page_count,
    processingTimeMs: r.processing_time_ms,
    extractionMethod: r.extraction_method,
    metadata: r.metadata,
  }));

function parsePythonStdout(stdout: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`parse.py returned invalid JSON: ${message}`);
  }
  return parseResultSchema.parse(parsed);
}

export async function parseDocument(payload: z.infer<typeof payloadSchema>) {
  const filename =
    basename(payload.filename).trim() || `document-${randomUUID()}.pdf`;
  const workDir = join(tmpdir(), `document-intake-${randomUUID()}`);
  const filePath = join(workDir, filename);

  await mkdir(workDir, { recursive: true });
  await writeFile(filePath, Buffer.from(payload.contentBase64, "base64"));

  try {
    logger.info("Running document-intake parser", {
      filename,
      script: PARSE_SCRIPT,
    });

    const result = await python.runScript(PARSE_SCRIPT, [filePath]);
    const parsed = parsePythonStdout(result.stdout);

    logger.info("Document-intake parse complete", {
      filename: parsed.filename,
      pageCount: parsed.pageCount,
      processingTimeMs: parsed.processingTimeMs,
      extractionMethod: parsed.extractionMethod,
    });

    return parsed;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export const documentIntakeParse = schemaTask({
  id: "document-intake-parse",
  schema: payloadSchema,
  maxDuration: 7200,
  retry: { maxAttempts: 2 },
  run: async (payload) => parseDocument(payload),
});
