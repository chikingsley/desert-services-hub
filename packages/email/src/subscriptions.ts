/**
 * Outlook Change Notification Subscription Manager
 *
 * Creates, renews, and deletes Microsoft Graph change notification subscriptions
 * for all tracked mailboxes. Subscriptions expire after ~3 days (4230 min max)
 * and must be renewed before expiration.
 *
 * Usage:
 *   import { ensureAllSubscriptions, renewExpiring } from "@email/subscriptions";
 *   await ensureAllSubscriptions("https://<project-ref>.supabase.co/functions/v1/outlook-webhook");
 *   await renewExpiring(24); // renew subs expiring within 24h
 */
import type { GraphEmailClient } from "@email/client";
import { ALL_MAILBOXES, createGraphClient } from "@email/sync/config";
import { db } from "@lib/db/client";
import { getOrCreateMailbox } from "@lib/db/repositories/mailbox";

// Max subscription lifetime for messages is 4230 min. Use 4200 for headroom.
const SUBSCRIPTION_LIFETIME_MIN = 4200;

interface OutlookSubscription {
  id: number;
  subscription_id: string;
  mailbox_email: string;
  mailbox_id: number;
  resource: string;
  change_type: string;
  expiration: string;
  client_state: string | null;
  created_at: string;
  renewed_at: string | null;
}

// ============================================================================
// Prepared Statements
// ============================================================================

const upsertSub = db.query(`
  INSERT INTO outlook_subscriptions (subscription_id, mailbox_email, mailbox_id, resource, change_type, expiration, client_state)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT(subscription_id) DO UPDATE SET
    expiration = excluded.expiration,
    renewed_at = now()
`);

const deleteSubStmt = db.query(
  "DELETE FROM outlook_subscriptions WHERE subscription_id = $1"
);

const getSubByMailbox = db.query<OutlookSubscription>(
  "SELECT * FROM outlook_subscriptions WHERE mailbox_email = $1 LIMIT 1"
);

const getExpiringSubs = db.query<OutlookSubscription>(
  "SELECT * FROM outlook_subscriptions WHERE expiration < $1"
);

const getAllSubs = db.query<OutlookSubscription>(
  "SELECT * FROM outlook_subscriptions ORDER BY mailbox_email"
);

// ============================================================================
// Helpers
// ============================================================================

function getWebhookSecret(): string {
  const secret = process.env.OUTLOOK_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("OUTLOOK_WEBHOOK_SECRET environment variable is required");
  }
  return secret;
}

function computeExpiration(): string {
  const expiry = new Date(Date.now() + SUBSCRIPTION_LIFETIME_MIN * 60 * 1000);
  return expiry.toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Subscription CRUD
// ============================================================================

/**
 * Create a change notification subscription for a single mailbox.
 */
export async function createMailboxSubscription(
  client: GraphEmailClient,
  mailboxEmail: string,
  webhookUrl: string
): Promise<OutlookSubscription> {
  const mailbox = await getOrCreateMailbox(mailboxEmail);
  const resource = `users/${mailboxEmail}/messages`;
  const changeType = "created,updated";
  const clientState = getWebhookSecret();
  const expirationDateTime = computeExpiration();

  const result = await client.createSubscription({
    changeType,
    clientState,
    expirationDateTime,
    notificationUrl: webhookUrl,
    resource,
  });

  await upsertSub.run(
    result.id,
    mailboxEmail,
    mailbox.id,
    resource,
    changeType,
    result.expirationDateTime,
    clientState
  );

  console.log(
    `[subscriptions] Created for ${mailboxEmail} (expires ${result.expirationDateTime})`
  );

  const sub = await getSubByMailbox.get(mailboxEmail);
  return sub as OutlookSubscription;
}

/**
 * Renew an existing subscription.
 * On 404 (subscription lost), deletes the local record.
 */
export async function renewMailboxSubscription(
  client: GraphEmailClient,
  sub: OutlookSubscription
): Promise<boolean> {
  const expirationDateTime = computeExpiration();

  try {
    await client.renewSubscription(sub.subscription_id, expirationDateTime);
    await upsertSub.run(
      sub.subscription_id,
      sub.mailbox_email,
      sub.mailbox_id,
      sub.resource,
      sub.change_type,
      expirationDateTime,
      sub.client_state
    );
    return true;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404) {
      // Subscription no longer exists in Graph — clean up local record
      await deleteSubStmt.run(sub.subscription_id);
      console.log(
        `[subscriptions] ${sub.mailbox_email}: subscription gone (404), removed local record`
      );
    } else {
      console.error(
        `[subscriptions] ${sub.mailbox_email}: renewal failed:`,
        error
      );
    }
    return false;
  }
}

/**
 * Delete a subscription from Graph and local DB.
 */
export async function deleteMailboxSubscription(
  client: GraphEmailClient,
  subscriptionId: string
): Promise<void> {
  try {
    await client.deleteSubscription(subscriptionId);
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status !== 404) {
      throw error;
    }
    // Already gone in Graph — that's fine
  }

  await deleteSubStmt.run(subscriptionId);
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Ensure all 36 mailboxes have an active subscription.
 * Creates subscriptions for any missing ones. Sequential with 500ms delay.
 */
export async function ensureAllSubscriptions(
  webhookUrl: string
): Promise<{ created: number; existing: number; failed: number }> {
  const client = createGraphClient();
  let created = 0;
  let existing = 0;
  let failed = 0;

  for (const mailbox of ALL_MAILBOXES) {
    const sub = await getSubByMailbox.get(mailbox);
    if (sub) {
      existing++;
      continue;
    }

    try {
      await createMailboxSubscription(client, mailbox, webhookUrl);
      created++;
    } catch (error) {
      console.error(`[subscriptions] Failed to create for ${mailbox}:`, error);
      failed++;
    }

    // Throttle to avoid rate limits
    await sleep(500);
  }

  console.log(
    `[subscriptions] Ensure complete: ${created} created, ${existing} existing, ${failed} failed`
  );
  return { created, existing, failed };
}

/**
 * Renew all subscriptions expiring within the given window.
 */
export async function renewExpiring(
  hoursAhead = 24
): Promise<{ renewed: number; failed: number }> {
  const cutoff = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  const expiring = await getExpiringSubs.all(cutoff.toISOString());

  if (expiring.length === 0) {
    return { failed: 0, renewed: 0 };
  }

  const client = createGraphClient();
  let renewed = 0;
  let failed = 0;

  for (const sub of expiring) {
    const success = await renewMailboxSubscription(client, sub);
    if (success) {
      renewed++;
      console.log(`[subscriptions] Renewed ${sub.mailbox_email}`);
    } else {
      failed++;
    }
    await sleep(300);
  }

  return { failed, renewed };
}

/**
 * Delete all subscriptions.
 */
export async function deleteAllSubscriptions(): Promise<number> {
  const client = createGraphClient();
  const subs = await getAllSubs.all();
  let deleted = 0;

  for (const sub of subs) {
    try {
      await deleteMailboxSubscription(client, sub.subscription_id);
      deleted++;
    } catch (error) {
      console.error(
        `[subscriptions] Failed to delete ${sub.mailbox_email}:`,
        error
      );
    }
    await sleep(300);
  }

  return deleted;
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Get subscription for a specific mailbox.
 */
export async function getSubscription(
  mailboxEmail: string
): Promise<OutlookSubscription | null> {
  return (await getSubByMailbox.get(mailboxEmail)) ?? null;
}

/**
 * List all active subscriptions.
 */
export async function listSubscriptions(): Promise<OutlookSubscription[]> {
  return await getAllSubs.all();
}
