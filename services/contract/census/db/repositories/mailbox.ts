/**
 * Mailbox Repository
 */
import { db } from "../connection";
import type { Mailbox } from "../types";

export function getMailbox(email: string): Mailbox | null {
  const row = db
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
    >("SELECT * FROM mailboxes WHERE email = ?")
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

export function getOrCreateMailbox(
  email: string,
  displayName?: string
): Mailbox {
  const existing = getMailbox(email);
  if (existing) {
    return existing;
  }

  db.run("INSERT INTO mailboxes (email, display_name) VALUES (?, ?)", [
    email,
    displayName ?? null,
  ]);

  const created = getMailbox(email);
  if (!created) {
    throw new Error(`Failed to create mailbox for ${email}`);
  }
  return created;
}

export function updateMailboxSyncState(
  mailboxId: number,
  emailCount: number
): void {
  db.run(
    `UPDATE mailboxes
     SET last_sync_at = datetime('now'),
         email_count = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [emailCount, mailboxId]
  );
}

export function getAllMailboxes(): Mailbox[] {
  const rows = db
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
