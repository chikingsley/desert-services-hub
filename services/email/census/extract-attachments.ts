/**
 * Attachment Text Extraction Pipeline
 *
 * Extracts text from email attachments using Mistral OCR API.
 * Supports PDFs and images. Stores extracted text for full-text search.
 *
 * Usage:
 *   bun services/email/census/extract-attachments.ts [options]
 *
 * Options:
 *   --limit=<n>        Max attachments to process (default: 100)
 *   --batch=<n>        Batch size for parallel processing (default: 5)
 *   --retry-failed     Retry previously failed extractions
 *   --stats            Show extraction statistics only
 */
import { GraphEmailClient } from "../client";
import {
  type Attachment,
  db,
  type ExtractionStatus,
  getAttachmentStats,
  getEmailById,
  getPendingAttachments,
  updateAttachmentExtraction,
} from "./db";

const MISTRAL_API_KEY =
  process.env.MISTRAL_API_KEY ?? "7vkLXmFnfHBMXfcOjIrbwJitpCHXjkan";

// Supported content types for extraction
// NOTE: Only PDFs - images are almost always signatures/logos in email attachments
const EXTRACTABLE_TYPES = new Set(["application/pdf"]);

// Types to skip (not worth extracting)
const SKIP_TYPES = new Set([
  // Archives
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  // Media
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  // Office docs (would need different extraction)
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Images - almost always signatures/logos in email attachments
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/tiff",
  "image/bmp",
]);

interface ExtractionResult {
  attachmentId: number;
  status: ExtractionStatus;
  textLength?: number;
  error?: string;
}

interface ExtractionProgress {
  processed: number;
  total: number;
  current?: {
    name: string;
    status: ExtractionStatus;
  };
}

interface ExtractionStats {
  processed: number;
  success: number;
  failed: number;
  skipped: number;
  totalTextLength: number;
}

// Mistral OCR API types
interface MistralOcrPage {
  index: number;
  markdown: string;
  images: Array<{
    id: string;
    top_left_x: number;
    top_left_y: number;
    bottom_right_x: number;
    bottom_right_y: number;
  }>;
  tables: unknown[];
  hyperlinks: unknown[];
  header: string | null;
  footer: string | null;
  dimensions: { dpi: number; width: number; height: number };
}

interface MistralOcrResponse {
  pages: MistralOcrPage[];
  model: string;
  document_annotation: unknown;
  usage_info: { pages_processed: number; doc_size_bytes: number };
}

function createGraphClient(): GraphEmailClient {
  const config = {
    azureTenantId: process.env.AZURE_TENANT_ID ?? "",
    azureClientId: process.env.AZURE_CLIENT_ID ?? "",
    azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
    batchSize: 100,
  };

  if (
    !(config.azureTenantId && config.azureClientId && config.azureClientSecret)
  ) {
    throw new Error("Missing Azure credentials in environment variables");
  }

  const client = new GraphEmailClient(config);
  client.initAppAuth();
  return client;
}

/**
 * Extract text from a PDF using Mistral OCR API
 * @see https://docs.mistral.ai/api/endpoint/ocr
 */
export async function extractPdfWithMistral(
  pdfBytes: Buffer,
  _fileName: string
): Promise<string> {
  if (!MISTRAL_API_KEY) {
    throw new Error("MISTRAL_API_KEY environment variable is required");
  }

  const base64 = pdfBytes.toString("base64");

  const response = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        document_url: `data:application/pdf;base64,${base64}`,
      },
      table_format: "markdown",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mistral OCR failed: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as MistralOcrResponse;
  return data.pages.map((p) => p.markdown).join("\n\n");
}

/**
 * Process a single attachment
 */
async function processAttachment(
  client: GraphEmailClient,
  attachment: Attachment
): Promise<ExtractionResult> {
  const contentType = attachment.contentType?.toLowerCase() ?? "";

  // Skip non-extractable types (only PDFs are extracted)
  if (SKIP_TYPES.has(contentType) || !EXTRACTABLE_TYPES.has(contentType)) {
    updateAttachmentExtraction(
      attachment.id,
      "skipped",
      null,
      "Non-extractable content type"
    );
    return {
      attachmentId: attachment.id,
      status: "skipped",
      error: "Non-extractable content type",
    };
  }

  try {
    // Get the email to find the mailbox
    const email = getEmailById(attachment.emailId);
    if (!email) {
      throw new Error("Email not found");
    }

    // Get mailbox email from mailbox_id
    const mailboxRow = db
      .query<{ email: string }, [number]>(
        "SELECT email FROM mailboxes WHERE id = ?"
      )
      .get(email.mailboxId);

    if (!mailboxRow) {
      throw new Error("Mailbox not found");
    }

    // Download the attachment
    const attachmentData = await client.downloadAttachment(
      email.messageId,
      attachment.attachmentId,
      mailboxRow.email
    );

    if (!attachmentData.contentBytes) {
      throw new Error("No content in attachment");
    }

    const buffer = Buffer.from(attachmentData.contentBytes, "base64");

    // Extract text from PDF using Mistral OCR
    const extractedText = await extractPdfWithMistral(buffer, attachment.name);

    // Update the database
    updateAttachmentExtraction(attachment.id, "success", extractedText);

    return {
      attachmentId: attachment.id,
      status: "success",
      textLength: extractedText.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    updateAttachmentExtraction(attachment.id, "failed", null, errorMessage);

    return {
      attachmentId: attachment.id,
      status: "failed",
      error: errorMessage,
    };
  }
}

/**
 * Get failed attachments for retry
 */
function getFailedAttachments(limit = 100): Attachment[] {
  const rows = db
    .query<Record<string, unknown>, [number]>(
      `SELECT * FROM attachments
       WHERE extraction_status = 'failed'
       ORDER BY id
       LIMIT ?`
    )
    .all(limit);

  return rows.map((row) => ({
    id: row.id as number,
    emailId: row.email_id as number,
    attachmentId: row.attachment_id as string,
    name: row.name as string,
    contentType: row.content_type as string | null,
    size: row.size as number | null,
    extractedText: row.extracted_text as string | null,
    extractionStatus: (row.extraction_status as ExtractionStatus) ?? "pending",
    extractionError: row.extraction_error as string | null,
    extractedAt: row.extracted_at as string | null,
    createdAt: row.created_at as string,
  }));
}

/**
 * Extract text from all pending attachments
 */
export async function extractAllAttachments(options: {
  limit?: number;
  batchSize?: number;
  retryFailed?: boolean;
  onProgress?: (progress: ExtractionProgress) => void;
}): Promise<ExtractionStats> {
  const {
    limit = 100,
    batchSize = 5,
    retryFailed = false,
    onProgress,
  } = options;

  const client = createGraphClient();

  // Get attachments to process
  let attachments: Attachment[];
  if (retryFailed) {
    attachments = getFailedAttachments(limit);
    // Reset status to pending before retry
    for (const att of attachments) {
      db.run(
        "UPDATE attachments SET extraction_status = 'pending', extraction_error = NULL WHERE id = ?",
        [att.id]
      );
    }
  } else {
    attachments = getPendingAttachments(limit);
  }

  const stats: ExtractionStats = {
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    totalTextLength: 0,
  };

  // Process in batches
  for (let i = 0; i < attachments.length; i += batchSize) {
    const batch = attachments.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (att) => {
        const result = await processAttachment(client, att);

        stats.processed++;
        if (result.status === "success") {
          stats.success++;
          stats.totalTextLength += result.textLength ?? 0;
        } else if (result.status === "failed") {
          stats.failed++;
        } else {
          stats.skipped++;
        }

        onProgress?.({
          processed: stats.processed,
          total: attachments.length,
          current: {
            name: att.name,
            status: result.status,
          },
        });

        return result;
      })
    );

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < attachments.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return stats;
}

/**
 * Print extraction statistics
 */
export function printExtractionStats(): void {
  const stats = getAttachmentStats();

  console.log(`\n${"=".repeat(50)}`);
  console.log("ATTACHMENT EXTRACTION STATS");
  console.log("=".repeat(50));
  console.log(`Total attachments: ${stats.total.toLocaleString()}`);
  console.log(`Pending: ${stats.pending.toLocaleString()}`);
  console.log(`Success: ${stats.success.toLocaleString()}`);
  console.log(`Failed: ${stats.failed.toLocaleString()}`);
  console.log(`Skipped: ${stats.skipped.toLocaleString()}`);

  // Show top content types
  const typeStats = db
    .query<{ type: string; count: number }, []>(
      `SELECT content_type as type, COUNT(*) as count
       FROM attachments
       GROUP BY content_type
       ORDER BY count DESC
       LIMIT 10`
    )
    .all();

  console.log("\nTop Content Types:");
  for (const { type, count } of typeStats) {
    console.log(`  ${(type ?? "unknown").padEnd(50)} ${count}`);
  }
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);

  // Check for stats command
  if (args.includes("--stats")) {
    printExtractionStats();
    process.exit(0);
  }

  // Parse options
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const batchArg = args.find((a) => a.startsWith("--batch="));
  const retryFailed = args.includes("--retry-failed");

  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : 100;
  const batchSize = batchArg ? Number.parseInt(batchArg.split("=")[1], 10) : 5;

  console.log("=".repeat(50));
  console.log("ATTACHMENT TEXT EXTRACTION");
  console.log("=".repeat(50));
  console.log(`Limit: ${limit}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Retry failed: ${retryFailed}`);
  console.log(`${"=".repeat(50)}\n`);

  extractAllAttachments({
    limit,
    batchSize,
    retryFailed,
    onProgress: (p) => {
      let statusIcon = "\u2192";
      if (p.current?.status === "success") {
        statusIcon = "\u2713";
      } else if (p.current?.status === "failed") {
        statusIcon = "\u2717";
      }
      console.log(
        `[${p.processed}/${p.total}] ${statusIcon} ${p.current?.name ?? "..."}`
      );
    },
  })
    .then((stats) => {
      console.log(`\n${"=".repeat(50)}`);
      console.log("EXTRACTION COMPLETE");
      console.log("=".repeat(50));
      console.log(`Processed: ${stats.processed}`);
      console.log(`Success: ${stats.success}`);
      console.log(`Failed: ${stats.failed}`);
      console.log(`Skipped: ${stats.skipped}`);
      console.log(
        `Total text extracted: ${(stats.totalTextLength / 1024).toFixed(1)} KB`
      );
    })
    .catch((error) => {
      console.error("Extraction failed:", error);
      process.exit(1);
    });
}
