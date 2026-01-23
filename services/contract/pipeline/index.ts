import path from "node:path";
import { createMistralClient } from "../agents/mistral-client";
import { runAllAgents, summarizeResults } from "../agents/orchestrator";
import { getFullText, storeExtractedPages } from "../extraction/storage";
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
 * Process a contract PDF: extract text, run agents, and store in database.
 */
async function processContract(filePath: string): Promise<void> {
  const filename = path.basename(filePath);

  try {
    // Mark as processing and get the contract ID
    const contractId = markAsProcessed(filePath, "processing");

    // Extract text from the PDF
    const result = await extractText(filePath);

    // Store extracted pages in database
    storeExtractedPages(contractId, result.pages);

    console.log(
      `[Pipeline] Extracted ${result.totalPages} pages via ${result.extractionMethod} in ${result.processingTimeMs}ms: ${filePath}`
    );

    // Run extraction agents
    try {
      const fullText = getFullText(contractId);
      if (!fullText || fullText.trim().length === 0) {
        console.warn(
          `[Pipeline] No text extracted for contract ${contractId}, skipping extraction agents`
        );
      } else {
        const mistral = createMistralClient();
        const results = await runAllAgents(contractId, fullText, mistral);
        const summary = summarizeResults(results);

        if (summary.errors.length > 0) {
          console.warn(
            `[Pipeline] ${summary.errors.length} agent(s) failed:`,
            summary.errors.map((e) => `${e.agent}: ${e.error}`).join(", ")
          );
        }

        console.log(
          `[Pipeline] Extraction complete for ${filename}: ${summary.success.length}/7 agents succeeded`
        );
      }
    } catch (extractionError) {
      // Log but don't crash - text extraction succeeded, that's the main goal
      const message =
        extractionError instanceof Error
          ? extractionError.message
          : String(extractionError);
      console.error(
        `[Pipeline] Agent extraction failed for ${filename}: ${message}`
      );
    }

    // Mark as completed
    updateProcessingStatus(filePath, "completed");
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
