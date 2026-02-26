/**
 * Document Intake — Trigger.dev event-driven task
 *
 * Replaces the pgmq `intake` job. Triggered by the intake webhook
 * handler when a forwarded email arrives with attachments.
 *
 * Pipeline:
 *   1. Receive file contents as base64 from webhook
 *   2. Write to temp directory
 *   3. Extract text via processFilesIntake (pdf-analysis service)
 *   4. Clean up temp files
 *
 * Source flow:
 *   Email/document ingress → webhook handler → this task
 *
 * The webhook handler also saves files to data/intake/ for audit
 * purposes, but this task receives them directly as base64 to avoid
 * shared filesystem requirements between containers.
 */

import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { processFilesIntake } from "@documents-intake/files-intake";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const fileSchema = z.object({
  filename: z.string().min(1),
  contentBase64: z.string().min(1),
});

export const documentIntake = schemaTask({
  id: "document-intake",
  schema: z.object({
    originalSubject: z.string(),
    originalFrom: z.string(),
    bodyText: z.string(),
    forwarderEmail: z.string(),
    files: z.array(fileSchema).min(1),
  }),
  maxDuration: 300,
  retry: { maxAttempts: 3 },
  run: async ({
    originalSubject,
    originalFrom,
    bodyText,
    forwarderEmail,
    files,
  }) => {
    const jobDir = `/tmp/doc-intake-${Date.now()}`;
    await mkdir(jobDir, { recursive: true });

    // 1. Write files to temp directory
    const tmpPaths: string[] = [];
    for (const file of files) {
      const tmpPath = join(jobDir, file.filename);
      await Bun.write(tmpPath, Buffer.from(file.contentBase64, "base64"));
      tmpPaths.push(tmpPath);
    }

    logger.info("Processing document intake", {
      files: files.length,
      subject: originalSubject,
      from: originalFrom,
      forwarder: forwarderEmail,
    });

    try {
      // 2. Extract via pdf-analysis service
      const results = await processFilesIntake({
        attachmentPaths: tmpPaths,
        originalSubject,
        originalFrom,
        bodyText,
        forwarderEmail,
      });

      const succeeded = results.filter((r) => r.documentId !== null).length;
      const failed = results.filter((r) => r.documentId === null).length;

      logger.info("Document intake complete", {
        total: results.length,
        succeeded,
        failed,
      });

      return {
        processed: results.length,
        succeeded,
        failed,
        results: results.map((r) => ({
          documentId: r.documentId,
          fileName: r.fileName,
          documentType: r.documentType,
          pageCount: r.pageCount,
          error: r.error ?? null,
        })),
      };
    } finally {
      // 3. Cleanup temp files
      for (const p of tmpPaths) {
        try {
          await unlink(p);
        } catch {
          // Non-fatal cleanup failure.
        }
      }
    }
  },
});
