/**
 * Sync Handler
 *
 * Thin wrapper around sync services with AI-tool schema.
 *
 * @module src/handlers/sync
 */

import { z } from "zod";
import { runSync, type SyncResult } from "@/db/sync/service";

export { syncFromXls } from "@/db/sync/service";

/**
 * Schema for sync operation (AI-tool compatible)
 */
export const syncSchema = z.object({});

export type SyncInput = z.infer<typeof syncSchema>;

/**
 * Sync permits from CSV exports to SQLite databases.
 */
export async function syncPermits(input: SyncInput): Promise<SyncResult> {
  return await runSync(input);
}
