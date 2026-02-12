#!/usr/bin/env bun

/**
 * Email Sync — Status
 *
 * Shows current state of email data in Supabase Postgres.
 *
 * Usage:
 *   bun cli/status.ts
 */

import { showSyncStatus } from "@email/sync/mailboxes";
import { getStatus } from "@/apps/workers/email-sync/lib/sync";

const status = await getStatus();

console.log("Email Sync Status");
console.log("==================\n");

console.log(`Emails: ${status.totalEmails.toLocaleString()}`);
const pct = status.totalEmails
  ? Math.round((100 * status.totalLinked) / status.totalEmails)
  : 0;
console.log(
  `Linked to accounts: ${status.totalLinked.toLocaleString()} (${pct}%)`
);
console.log(`Attachments: ${status.totalAttachments.toLocaleString()}`);
console.log(`Mailboxes: ${status.mailboxCount}`);

console.log("");
await showSyncStatus();
