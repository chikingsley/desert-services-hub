/**
 * Email mailbox sync orchestration.
 */

import {
  ALL_MAILBOXES,
  createGraphClient,
  MS_PER_DAY,
  type SyncAllOptions,
  type SyncResult,
} from "@email/sync/config";
import { getMailbox } from "@lib/db/repositories/mailbox";
import { syncMailboxFull } from "./mailboxes-sync-core";

function getDefaultSince(since?: Date): Date {
  return since ?? new Date(Date.now() - 365 * MS_PER_DAY);
}

export async function syncAllMailboxes(
  options: SyncAllOptions = {}
): Promise<SyncResult[]> {
  const {
    mailboxes,
    since,
    before,
    maxPerMailbox = 50_000,
    concurrency = 3,
    incremental = false,
    fetchBodies = true,
    fetchAttachments = true,
    onProgress,
  } = options;

  const client = createGraphClient();
  const targetMailboxes = mailboxes ?? ALL_MAILBOXES;
  const results: SyncResult[] = [];

  for (let i = 0; i < targetMailboxes.length; i += concurrency) {
    const batch = targetMailboxes.slice(i, i + concurrency);
    const batchPromises = batch.map(async (mailboxEmail) => {
      let effectiveSince = getDefaultSince(since);
      if (incremental) {
        const existingMailbox = await getMailbox(mailboxEmail);
        if (existingMailbox?.lastSyncAt) {
          effectiveSince = new Date(existingMailbox.lastSyncAt);
        }
      }

      return syncMailboxFull(
        client,
        mailboxEmail,
        effectiveSince,
        before,
        maxPerMailbox,
        !incremental,
        fetchBodies,
        fetchAttachments,
        onProgress
      );
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}
