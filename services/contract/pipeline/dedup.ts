import path from "node:path";
import { db } from "@/lib/db";
import type { ProcessingStatus } from "./types";

/**
 * Check if a file has already been processed (by filename).
 * Uses filename-based deduplication to prevent reprocessing the same contract.
 */
export function isAlreadyProcessed(filePath: string): boolean {
  const filename = path.basename(filePath);
  const row = db
    .query("SELECT 1 FROM processed_contracts WHERE filename = ?")
    .get(filename);
  return row !== null;
}

/**
 * Mark a file as processed in the deduplication table.
 * Records the filename, full path, and processing status.
 * Returns the contract ID for linking related data (e.g., extracted pages).
 */
export function markAsProcessed(
  filePath: string,
  status: ProcessingStatus = "pending"
): number {
  const filename = path.basename(filePath);
  db.run(
    "INSERT OR IGNORE INTO processed_contracts (filename, file_path, status) VALUES (?, ?, ?)",
    [filename, filePath, status]
  );

  // Retrieve the contract ID (handles both new inserts and existing records)
  const row = db
    .query<{ id: number }, [string]>(
      "SELECT id FROM processed_contracts WHERE filename = ?"
    )
    .get(filename);

  if (!row) {
    throw new Error(`Failed to retrieve contract ID for ${filename}`);
  }

  return row.id;
}

/**
 * Update the status of a processed contract.
 */
export function updateProcessingStatus(
  filePath: string,
  status: ProcessingStatus
): void {
  const filename = path.basename(filePath);
  db.run("UPDATE processed_contracts SET status = ? WHERE filename = ?", [
    status,
    filename,
  ]);
}
