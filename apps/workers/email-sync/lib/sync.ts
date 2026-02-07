/**
 * Email Sync — Core Logic
 *
 * Wraps the existing email sync infrastructure (mailboxes, groups, enrichment)
 * into a single syncAll() call suitable for polling.
 *
 * IMPORTANT: Mailboxes are synced sequentially (concurrency=1) to avoid
 * Graph API rate limits. See memory/email-sync.md.
 */

import { linkEmailsToAccounts } from "@contract/db/lib/link-accounts";
import { processPlatformEmails } from "@contract/db/lib/platform-extraction";
import type { SyncResult } from "@email/sync/config";
import { enrichEmailDomains } from "@email/sync/enrichment";
import { syncAllGroups } from "@email/sync/groups";
import { syncAllMailboxes } from "@email/sync/mailboxes";
import { db } from "@lib/db/hub";

// ============================================================================
// Types
// ============================================================================

export interface EmailSyncSummary {
  mailboxResults: SyncResult[];
  totalEmails: number;
  totalAttachments: number;
  errors: number;
  enrichment: {
    platformSenders: boolean;
    accountsLinked: number;
    accountsCreated: number;
  };
  groups: {
    synced: number;
    posts: number;
  };
  duration: number;
}

// ============================================================================
// Sync
// ============================================================================

export async function syncAll(options?: {
  includeGroups?: boolean;
}): Promise<EmailSyncSummary> {
  const start = Date.now();
  const includeGroups = options?.includeGroups ?? true;

  // Step 1: Incremental sync all mailboxes (sequential — concurrency=1)
  const mailboxResults = await syncAllMailboxes({
    incremental: true,
    concurrency: 1,
    onProgress: (p) => {
      if (p.phase === "fetching") {
        console.log(`  [${p.mailbox}] Fetching...`);
      } else if (p.phase === "complete") {
        console.log(
          `  [${p.mailbox}] ${p.emailsStored} emails, ${p.attachmentsStored} attachments`
        );
      } else if (p.phase === "error") {
        console.log(`  [${p.mailbox}] ERROR: ${p.error}`);
      }
    },
  });

  let totalEmails = 0;
  let totalAttachments = 0;
  let errors = 0;

  for (const r of mailboxResults) {
    if (r.error) {
      errors++;
    } else {
      totalEmails += r.emailsStored;
      totalAttachments += r.attachmentsStored;
    }
  }

  // Step 2: Sync M365 groups
  let groupsSynced = 0;
  let groupPosts = 0;

  if (includeGroups) {
    try {
      const groupResults = await syncAllGroups({
        onProgress: (p) => {
          if (p.phase === "complete") {
            console.log(
              `  [group:${p.group}] ${p.postsStored} posts, ${p.attachmentsStored} attachments`
            );
          }
        },
      });

      groupsSynced = groupResults.length;
      for (const r of groupResults) {
        groupPosts += r.postsStored;
      }
    } catch (err) {
      console.error("  [groups] Error:", err);
    }
  }

  // Step 3: Enrichment pipeline (domain extraction → platform senders → account linking)
  await enrichEmailDomains();
  await processPlatformEmails();
  const linkStats = await linkEmailsToAccounts();

  const accountsLinked =
    linkStats.linkedByPlatformDomain +
    linkStats.linkedByForwardDomain +
    linkStats.linkedByDirectDomain +
    linkStats.linkedByNameLookup +
    linkStats.linkedByAlias +
    linkStats.linkedByConversation;

  return {
    mailboxResults,
    totalEmails,
    totalAttachments,
    errors,
    enrichment: {
      platformSenders: true,
      accountsLinked,
      accountsCreated: linkStats.accountsCreated,
    },
    groups: {
      synced: groupsSynced,
      posts: groupPosts,
    },
    duration: Date.now() - start,
  };
}

// ============================================================================
// Status
// ============================================================================

export async function getStatus(): Promise<{
  totalEmails: number;
  totalLinked: number;
  totalAttachments: number;
  mailboxCount: number;
}> {
  const stats = await db
    .query<{ total: number; linked: number }, []>(
      `SELECT COUNT(*) as total,
       SUM(CASE WHEN account_id IS NOT NULL AND account_id > 0 THEN 1 ELSE 0 END) as linked
       FROM emails`
    )
    .get();

  const attachments = await db
    .query<{ count: number }, []>("SELECT COUNT(*) as count FROM attachments")
    .get();

  const mailboxes = await db
    .query<{ count: number }, []>("SELECT COUNT(*) as count FROM mailboxes")
    .get();

  return {
    totalEmails: stats?.total ?? 0,
    totalLinked: stats?.linked ?? 0,
    totalAttachments: attachments?.count ?? 0,
    mailboxCount: mailboxes?.count ?? 0,
  };
}
