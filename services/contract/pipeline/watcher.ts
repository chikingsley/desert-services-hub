import chokidar from "chokidar";
import { isAlreadyProcessed, markAsProcessed } from "./dedup";
import type { PipelineHandler } from "./types";

const DEFAULT_WATCH_DIR = "./contracts";

// Regex for ignoring dotfiles - defined at top level for performance
const DOTFILE_REGEX = /(^|[/\\])\../;

let watcher: chokidar.FSWatcher | null = null;

/**
 * Get the configured watch directory.
 * Read dynamically to allow runtime configuration via env var.
 */
function getWatchDir(): string {
  return process.env.CONTRACT_WATCH_DIR ?? DEFAULT_WATCH_DIR;
}

/**
 * Start watching for new PDF files in the configured directory.
 * When a new PDF is detected and hasn't been processed before,
 * it marks the file as processed and calls the handler.
 */
export function startWatcher(onNewPdf: PipelineHandler): void {
  const watchDir = getWatchDir();
  watcher = chokidar.watch(watchDir, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
    ignored: DOTFILE_REGEX,
  });

  watcher.on("add", async (filePath) => {
    // Only process PDF files
    if (!filePath.toLowerCase().endsWith(".pdf")) {
      return;
    }

    // Check deduplication
    if (isAlreadyProcessed(filePath)) {
      console.log(`[Watcher] Skipping duplicate: ${filePath}`);
      return;
    }

    console.log(`[Watcher] New PDF detected: ${filePath}`);

    // Mark as processed before calling handler to prevent race conditions
    markAsProcessed(filePath, "processing");

    try {
      await onNewPdf(filePath);
    } catch (error) {
      console.error(`[Watcher] Handler error for ${filePath}:`, error);
    }
  });

  watcher.on("ready", () => {
    console.log(`[Watcher] Watching for PDFs in: ${watchDir}`);
  });

  watcher.on("error", (error) => {
    console.error("[Watcher] Error:", error);
  });
}

/**
 * Stop the file watcher and clean up resources.
 */
export async function stopWatcher(): Promise<void> {
  if (watcher) {
    await watcher.close();
    watcher = null;
    console.log("[Watcher] Stopped");
  }
}
