/**
 * Sync Handler
 *
 * Thin wrapper around sync services with AI-tool schema.
 *
 * @module src/handlers/sync
 */

import { z } from "zod";
import {
  type CompanySyncResult,
  runCompanySync,
  runSync,
  type SyncResult,
} from "@/db/sync/service";

export type { CompanySyncResult, SyncResult } from "@/db/sync/service";
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

export async function syncCompanyPermits(
  input: SyncInput
): Promise<CompanySyncResult> {
  return await runCompanySync(input);
}
