/**
 * Document Intake — Trigger.dev event-driven task
 *
 * Replaces the pgmq `intake` job. Triggered by the intake webhook
 * handler when a forwarded email arrives with attachments.
 *
 * Pipeline:
 *   1. Receive file contents as base64 from webhook
 *   2. Decode to in-memory buffers
 *   3. Extract text via processFilesIntake (pdf-analysis service)
 *
 * Source flow:
 *   Email/document ingress → webhook handler → this task
 *
 * The webhook handler also saves files to data/intake/ for audit
 * purposes, but this task receives them directly as base64 to avoid
 * shared filesystem requirements between containers.
 */

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
    // Decode webhook payload into buffers so extraction works across containers.
    const decodedFiles = files.map((file) => ({
      filename: file.filename,
      buffer: Buffer.from(file.contentBase64, "base64"),
    }));

    logger.info("Processing document intake", {
      files: files.length,
      totalBytes: decodedFiles.reduce((sum, f) => sum + f.buffer.byteLength, 0),
      subject: originalSubject,
      from: originalFrom,
      forwarder: forwarderEmail,
    });

    // Extract via pdf-analysis service using multipart upload.
    const results = await processFilesIntake({
      attachmentPaths: decodedFiles.map((f) => f.filename),
      attachmentBuffers: decodedFiles.map((f) => f.buffer),
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
  },
});
