/**
 * Mailbox listing command — queries Graph API for all tenant mailboxes
 * and cross-references with Supabase Postgres email counts and sync config.
 */
import { getAppClient } from "@email/commands/config";
import type { CommandHandler } from "@email/commands/types";
import { ALL_MAILBOXES } from "@email/sync/config";
import { db } from "@lib/db/client";

async function getMailboxStats(): Promise<
  Map<string, { emailCount: number; lastSync: string | null }>
> {
  const rows = await db
    .query<{ email: string; email_count: number; last_sync_at: string | null }>(
      "SELECT email, email_count, last_sync_at FROM mailboxes ORDER BY email"
    )
    .all();

  const map = new Map<
    string,
    { emailCount: number; lastSync: string | null }
  >();
  for (const row of rows) {
    map.set(row.email.toLowerCase(), {
      emailCount: row.email_count,
      lastSync: row.last_sync_at,
    });
  }
  return map;
}

const syncSet = new Set(ALL_MAILBOXES.map((m) => m.toLowerCase()));

export const mailboxHandlers: Record<string, CommandHandler> = {
  mailboxes: async () => {
    console.log("Querying Microsoft Graph for tenant mailboxes...\n");

    const client = getAppClient();
    const allUsers = await client.listUsers();
    const stats = await getMailboxStats();

    const dsUsers = allUsers
      .filter((u) => u.email.toLowerCase().endsWith("@desertservices.net"))
      .map((u) => ({ ...u, email: u.email.toLowerCase() }))
      .toSorted((a, b) => a.email.localeCompare(b.email));

    const enabled = dsUsers.filter((u) => u.accountEnabled);
    const disabled = dsUsers.filter((u) => !u.accountEnabled);

    console.log(`Active Mailboxes (${enabled.length}):\n`);
    for (const user of enabled) {
      const inSync = syncSet.has(user.email);
      const stat = stats.get(user.email);
      const syncTag = inSync ? "[SYNCED]" : "[NOT IN SYNC]";
      const emailInfo = stat
        ? `${stat.emailCount.toLocaleString()} emails, last sync: ${stat.lastSync ?? "never"}`
        : "not in Supabase Postgres";
      console.log(`  ${syncTag} ${user.email}`);
      console.log(`    Name: ${user.displayName} | ${emailInfo}`);
    }

    if (disabled.length > 0) {
      console.log(`\nDisabled Accounts (${disabled.length}):\n`);
      for (const user of disabled) {
        console.log(`  ${user.email} — ${user.displayName}`);
      }
    }

    const inSyncNotInGraph = [...syncSet].filter(
      (m) => !dsUsers.some((u) => u.email === m)
    );
    if (inSyncNotInGraph.length > 0) {
      console.log("\nIn sync config but NOT found in Graph:");
      for (const m of inSyncNotInGraph) {
        console.log(`  ${m}`);
      }
    }

    console.log(
      `\nSummary: ${enabled.length} active, ${disabled.length} disabled, ${syncSet.size} in sync config`
    );
  },
};
