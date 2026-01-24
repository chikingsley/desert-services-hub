import { spawn } from "node:child_process";
import { storeExtractedPages } from "../extraction/storage";
import { extractText } from "../extraction/text-extractor";
import { processContractMatch } from "../matching/link";
import { markAsProcessed, updateProcessingStatus } from "./dedup";
import { startWatcher, stopWatcher } from "./watcher";

/**
 * Run estimate matching for a contract.
 * Matches the contract to Monday ESTIMATING board items.
 */
async function runEstimateMatching(contractId: number): Promise<void> {
  const result = await processContractMatch(contractId);

  switch (result.status) {
    case "matched":
      console.log(
        `[Pipeline] Auto-matched to estimate "${result.estimateName}" ` +
          `(${Math.round(result.confidence * 100)}% confidence)`
      );
      console.log(`[Pipeline] Estimate ID: ${result.estimateId}`);
      break;

    case "needs_selection":
      console.log(
        `[Pipeline] Match needs human selection - ${result.candidateCount} candidates, ` +
          `top confidence: ${Math.round(result.topConfidence * 100)}%`
      );
      console.log(
        `[Pipeline] Run /contract-match ${contractId} to select manually`
      );
      break;

    case "no_match":
      console.log(`[Pipeline] No matching estimate found: ${result.reason}`);
      break;

    case "missing_data":
      console.log(`[Pipeline] Cannot match - ${result.reason}`);
      break;

    default: {
      // Exhaustive check - this should never happen
      const _exhaustive: never = result;
      console.log(
        `[Pipeline] Unknown match status: ${JSON.stringify(_exhaustive)}`
      );
    }
  }
}

/**
 * Run Claude Code to extract contract data.
 * Uses `claude -p` for non-interactive execution.
 */
function runClaudeExtraction(contractId: number): Promise<void> {
  const prompt = `Extract all contract data from contract ID ${contractId}.

Read the contract text from the database using:
bun -e "import { getFullText } from './services/contract/extraction/storage'; console.log(getFullText(${contractId}));"

Then extract all 7 domains (contractInfo, billing, contacts, sov, insurance, siteInfo, redFlags) and store them using storeAgentResult from './services/contract/agents/storage'.

Be thorough but concise. Store results immediately.`;

  return new Promise((resolve, reject) => {
    const claude = spawn(
      "claude",
      ["-p", prompt, "--allowedTools", "Bash,Read"],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    claude.stdout?.on("data", (data) => {
      process.stdout.write(data);
    });

    claude.stderr?.on("data", (data) => {
      console.error(`[Claude] ${data.toString()}`);
    });

    claude.on("close", (code) => {
      if (code === 0) {
        console.log("[Pipeline] Claude extraction completed");
        resolve();
      } else {
        console.error(`[Pipeline] Claude extraction failed with code ${code}`);
        reject(new Error(`Claude exited with code ${code}`));
      }
    });

    claude.on("error", (err) => {
      console.error("[Pipeline] Failed to spawn Claude:", err.message);
      reject(err);
    });
  });
}

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

    console.log(
      `[Pipeline] Extracted ${result.totalPages} pages via ${result.extractionMethod} in ${result.processingTimeMs}ms: ${filePath}`
    );

    // Run Claude extraction automatically
    console.log(
      `[Pipeline] Starting Claude extraction for contract ${contractId}...`
    );
    try {
      await runClaudeExtraction(contractId);
    } catch {
      // Log but don't fail - text extraction succeeded
      console.error(
        `[Pipeline] Claude extraction failed, can retry with /contract-extract ${contractId}`
      );
    }

    // Run estimate matching
    console.log(
      `[Pipeline] Starting estimate matching for contract ${contractId}...`
    );
    try {
      await runEstimateMatching(contractId);
    } catch {
      // Log but don't fail - extraction succeeded
      console.error(
        `[Pipeline] Estimate matching failed, can retry with /contract-match ${contractId}`
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
