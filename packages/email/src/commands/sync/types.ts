/**
 * Type-only module for sync command option/progress contracts.
 */
import type { SyncAllOptions } from "@email/sync/config";

export interface MailboxSyncOptions extends Omit<SyncAllOptions, "onProgress"> {
  includeGroups: boolean;
  skipPost: boolean;
}

export interface MailboxProgress {
  mailbox: string;
  phase: "starting" | "fetching" | "storing" | "complete" | "error";
  emailsFetched?: number;
  emailsStored?: number;
  attachmentsStored?: number;
  error?: string;
}

export interface GroupProgress {
  group: string;
  phase: "starting" | "fetching" | "storing" | "complete" | "error";
  conversationsFetched?: number;
  postsStored?: number;
  attachmentsStored?: number;
  error?: string;
}
