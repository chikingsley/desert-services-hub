/**
 * Mailbox Repository
 */
import { db } from "@lib/db/client";
import type { Mailbox } from "@lib/db/types";

export async function getMailbox(email: string): Promise<Mailbox | null> {
  const row = await db
    .query<
      {
        id: number;
        email: string;
        display_name: string | null;
        last_sync_at: string | null;
        email_count: number;
        created_at: string;
        updated_at: string;
      },
      [string]
    >("SELECT * FROM mailboxes WHERE email = $1")
    .get(email);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    lastSyncAt: row.last_sync_at,
    emailCount: row.email_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getOrCreateMailbox(
  email: string,
  displayName?: string
): Promise<Mailbox> {
  const existing = await getMailbox(email);
  if (existing) {
    return existing;
  }

  await db.run("INSERT INTO mailboxes (email, display_name) VALUES ($1, $2)", [
    email,
    displayName ?? null,
  ]);

  const created = await getMailbox(email);
  if (!created) {
    throw new Error(`Failed to create mailbox for ${email}`);
  }
  return created;
}

export async function updateMailboxSyncState(
  mailboxId: number,
  emailCount: number
): Promise<void> {
  await db.run(
    `UPDATE mailboxes
     SET last_sync_at = now(),
         email_count = $1,
         updated_at = now()
     WHERE id = $2`,
    [emailCount, mailboxId]
  );
}

export async function getAllMailboxes(): Promise<Mailbox[]> {
  const rows = await db
    .query<
      {
        id: number;
        email: string;
        display_name: string | null;
        last_sync_at: string | null;
        email_count: number;
        created_at: string;
        updated_at: string;
      },
      []
    >("SELECT * FROM mailboxes ORDER BY email")
    .all();

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    lastSyncAt: row.last_sync_at,
    emailCount: row.email_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
