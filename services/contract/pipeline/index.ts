import { storeExtractedPages } from "../extraction/storage";
import { extractText } from "../extraction/text-extractor";
import { markAsProcessed, updateProcessingStatus } from "./dedup";
import { startWatcher, stopWatcher } from "./watcher";

// Re-export types for consumers
export type {
  PipelineHandler,
  ProcessedContract,
  ProcessingStatus,
} from "./types";

/**
 * Start the contract processing pipeline.
 * Watches for new PDFs and calls the handler when detected.
 */
export function startPipeline(
  handler: (filePath: string) => Promise<void>
): void {
  startWatcher(handler);
}

/**
 * Stop the contract processing pipeline.
 */
export async function stopPipeline(): Promise<void> {
  await stopWatcher();
}

// Graceful shutdown handlers
const shutdown = async () => {
  console.log("\n[Pipeline] Shutting down...");
  await stopPipeline();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/**
 * Process a contract PDF: extract text and store in database.
 * Data extraction happens separately via /contract-extract skill.
 */
async function processContract(filePath: string): Promise<void> {
  try {
    // Mark as processing and get the contract ID
    const contractId = markAsProcessed(filePath, "processing");

    // Extract text from the PDF
    const result = await extractText(filePath);

    // Store extracted pages in database
    storeExtractedPages(contractId, result.pages);

    // Mark as completed
    updateProcessingStatus(filePath, "completed");

    console.log(
      `[Pipeline] Extracted ${result.totalPages} pages via ${result.extractionMethod} in ${result.processingTimeMs}ms: ${filePath}`
    );
    console.log(
      `[Pipeline] Contract ${contractId} ready for extraction. Run /contract-extract ${contractId}`
    );
  } catch (error) {
    // Mark as failed on error
    updateProcessingStatus(filePath, "failed");

    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Pipeline] Failed to process contract: ${message}`);
    throw error;
  }
}

/**
 * Main entrypoint for direct execution.
 * Run with: bun run services/contract/pipeline/index.ts
 */
function main(): void {
  console.log("[Pipeline] Starting contract processing pipeline...");

  startPipeline(processContract);

  console.log("[Pipeline] Running. Press Ctrl+C to stop.");
}

// Run if executed directly
if (import.meta.main) {
  main();
}
