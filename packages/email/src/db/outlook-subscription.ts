import { db } from "@lib/db/client";

export interface OutlookSubscriptionRecord {
  changeType: string;
  clientState: string | null;
  createdAt: string;
  expiration: string;
  id: number;
  mailboxEmail: string;
  mailboxId: number;
  renewedAt: string | null;
  resource: string;
  subscriptionId: string;
}

export interface UpsertOutlookSubscriptionInput {
  changeType: string;
  clientState?: string | null;
  expiration: string;
  mailboxEmail: string;
  mailboxId: number;
  resource: string;
  subscriptionId: string;
}

interface OutlookSubscriptionRow {
  change_type: string;
  client_state: string | null;
  created_at: string;
  expiration: string;
  id: number;
  mailbox_email: string;
  mailbox_id: number;
  renewed_at: string | null;
  resource: string;
  subscription_id: string;
}

function parseOutlookSubscriptionRow(
  row: OutlookSubscriptionRow
): OutlookSubscriptionRecord {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    mailboxEmail: row.mailbox_email,
    mailboxId: row.mailbox_id,
    resource: row.resource,
    changeType: row.change_type,
    expiration: row.expiration,
    clientState: row.client_state,
    createdAt: row.created_at,
    renewedAt: row.renewed_at,
  };
}

export async function listOutlookSubscriptions(): Promise<
  OutlookSubscriptionRecord[]
> {
  const rows = await db
    .query<OutlookSubscriptionRow>(
      `SELECT id, subscription_id, mailbox_email, mailbox_id, resource,
              change_type, expiration, client_state, created_at, renewed_at
       FROM outlook_subscriptions
       ORDER BY mailbox_email, expiration DESC`
    )
    .all();

  return rows.map(parseOutlookSubscriptionRow);
}

export async function listOutlookSubscriptionsForMailbox(
  mailboxEmail: string
): Promise<OutlookSubscriptionRecord[]> {
  const rows = await db
    .query<OutlookSubscriptionRow, [string]>(
      `SELECT id, subscription_id, mailbox_email, mailbox_id, resource,
              change_type, expiration, client_state, created_at, renewed_at
       FROM outlook_subscriptions
       WHERE mailbox_email = $1
       ORDER BY expiration DESC`
    )
    .all(mailboxEmail);

  return rows.map(parseOutlookSubscriptionRow);
}

export async function upsertOutlookSubscription(
  input: UpsertOutlookSubscriptionInput
): Promise<OutlookSubscriptionRecord> {
  const row = await db
    .query<OutlookSubscriptionRow>(
      `INSERT INTO outlook_subscriptions (
         subscription_id,
         mailbox_email,
         mailbox_id,
         resource,
         change_type,
         expiration,
         client_state,
         renewed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (subscription_id)
       DO UPDATE SET
         mailbox_email = excluded.mailbox_email,
         mailbox_id = excluded.mailbox_id,
         resource = excluded.resource,
         change_type = excluded.change_type,
         expiration = excluded.expiration,
         client_state = excluded.client_state,
         renewed_at = now()
       RETURNING id, subscription_id, mailbox_email, mailbox_id, resource,
                 change_type, expiration, client_state, created_at, renewed_at`
    )
    .get(
      input.subscriptionId,
      input.mailboxEmail,
      input.mailboxId,
      input.resource,
      input.changeType,
      input.expiration,
      input.clientState ?? null
    );

  if (!row) {
    throw new Error(
      `Failed to upsert outlook subscription ${input.subscriptionId}`
    );
  }

  return parseOutlookSubscriptionRow(row);
}

export async function deleteOutlookSubscription(
  subscriptionId: string
): Promise<number> {
  const rows = await db
    .query<{ id: number }, [string]>(
      `DELETE FROM outlook_subscriptions
       WHERE subscription_id = $1
       RETURNING id`
    )
    .all(subscriptionId);
  return rows.length;
}

export async function deleteOutlookSubscriptionsForMailbox(
  mailboxEmail: string
): Promise<number> {
  const rows = await db
    .query<{ id: number }, [string]>(
      `DELETE FROM outlook_subscriptions
       WHERE mailbox_email = $1
       RETURNING id`
    )
    .all(mailboxEmail);
  return rows.length;
}

export async function deleteOutlookSubscriptionsForMailboxExcept(
  mailboxEmail: string,
  keepSubscriptionId: string
): Promise<OutlookSubscriptionRecord[]> {
  const rows = await db
    .query<OutlookSubscriptionRow, [string, string]>(
      `DELETE FROM outlook_subscriptions
       WHERE mailbox_email = $1
         AND subscription_id <> $2
       RETURNING id, subscription_id, mailbox_email, mailbox_id, resource,
                 change_type, expiration, client_state, created_at, renewed_at`
    )
    .all(mailboxEmail, keepSubscriptionId);

  return rows.map(parseOutlookSubscriptionRow);
}
