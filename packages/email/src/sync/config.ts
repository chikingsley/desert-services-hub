/**
 * Email sync configuration — mailboxes, groups, Azure client, types.
 */
import { GraphEmailClient } from "@email/client";

// All company mailboxes to sync
// NOTE: internalcontracts@ is a Microsoft 365 Group, not a mailbox.
// Use `cli.ts sync-groups` to sync group conversations instead.
export const ALL_MAILBOXES = [
  "chi@desertservices.net",
  "contracts@desertservices.net",
  "dustpermits@desertservices.net",
  "estimating@desertservices.net",
  "tim@desertservices.net",
  "jayson@desertservices.net",
  "don@desertservices.net",
  "jared@desertservices.net",
  "kendra@desertservices.net",
  "tania@desertservices.net",
  "kelley@desertservices.net",
  "daniel@desertservices.net",
  "logan@desertservices.net",
  "james@desertservices.net",
  "ap@desertservices.net",
  "yolanda@desertservices.net",
  "stephen@desertservices.net",
  "natalie@desertservices.net",
  "wendy@desertservices.net",
  "denise@desertservices.net",
  "hr@desertservices.net",
  "lacie@desertservices.net",
  "francine@desertservices.net",
  "kerin@desertservices.net",
  "rick@desertservices.net",
  "dawn@desertservices.net",
  "eva@desertservices.net",
  "brandon@desertservices.net",
  "glen@desertservices.net",
  "ar@desertservices.net",
  "jeff@desertservices.net",
  "michaelh@desertservices.net",
  "michaelr@desertservices.net",
  "danielr@desertservices.net",
  "dennis@desertservices.net",
  "herve@desertservices.net",
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
  fetchBodies?: boolean;
  fetchAttachments?: boolean;
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
    azureClientId: process.env.AZURE_CLIENT_ID ?? "",
    azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
    azureTenantId: process.env.AZURE_TENANT_ID ?? "",
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
