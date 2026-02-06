/**
 * Email sync configuration — mailboxes, groups, Azure client, types.
 */
import { GraphEmailClient } from "@email/index";

// All company mailboxes to sync
// NOTE: internalcontracts@ is a Microsoft 365 Group, not a mailbox.
// Use sync-groups.ts to sync group conversations instead.
//
// Historical sync status (as of Feb 2026):
// - chi@, contracts@ — FULLY SYNCED (mailboxes are newer, no older emails exist)
// - kendra@ — synced back to 2024-01-01
// - Other mailboxes have varying history, check `bun apps/email-cli/sync/mailboxes.ts status`
export const ALL_MAILBOXES = [
  "chi@desertservices.net",
  "contracts@desertservices.net",
  "dustpermits@desertservices.net",
  "estimating@desertservices.net",
  "kendra@desertservices.net",
  "kerin@desertservices.net",
  "jayson@desertservices.net",
  "jeff@desertservices.net",
  "jared@desertservices.net",
  "rick@desertservices.net",
  "dawn@desertservices.net",
  "eva@desertservices.net",
] as const;

// Microsoft 365 Groups to sync (use sync/groups.ts)
export const ALL_GROUPS = {
  "internalcontracts@desertservices.net":
    "962f9440-9bde-4178-b538-edc7f8d3ecce",
} as const;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SyncAllOptions {
  mailboxes?: string[];
  since?: Date;
  before?: Date;
  maxPerMailbox?: number;
  concurrency?: number;
  incremental?: boolean;
  onProgress?: (progress: SyncProgress) => void;
}

export interface SyncProgress {
  mailbox: string;
  phase: "starting" | "fetching" | "storing" | "complete" | "error";
  emailsFetched?: number;
  emailsStored?: number;
  attachmentsStored?: number;
  error?: string;
}

export interface SyncResult {
  mailbox: string;
  emailsStored: number;
  attachmentsStored: number;
  error?: string;
}

export function createGraphClient(): GraphEmailClient {
  const config = {
    azureTenantId: process.env.AZURE_TENANT_ID ?? "",
    azureClientId: process.env.AZURE_CLIENT_ID ?? "",
    azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
    batchSize: 250,
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
