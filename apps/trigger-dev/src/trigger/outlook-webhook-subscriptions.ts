import { getAllMailboxes } from "@email/db/mailbox";
import {
  deleteOutlookSubscription,
  deleteOutlookSubscriptionsForMailboxExcept,
  listOutlookSubscriptions,
  type OutlookSubscriptionRecord,
  upsertOutlookSubscription,
} from "@email/db/outlook-subscription";
import { GraphApiError } from "@lib/graph/http";
import { graphDelete, graphPatch, graphPost } from "@lib/graph/http";
import { logger, schedules, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

// Microsoft Graph subscription limits for Outlook mail messages:
// - Max lifetime: 10,080 minutes (7 days) for basic notifications
// - Max lifetime: 1,440 minutes (under 1 day) for rich notifications (includeResourceData)
// - Max 1,000 active subscriptions per mailbox across all apps
// Docs: https://learn.microsoft.com/en-us/graph/api/resources/subscription
const SUBSCRIPTION_TTL_MINUTES = 10_080;
const RENEW_BUFFER_MINUTES = 60;

interface GraphSubscription {
  changeType: string;
  clientState?: string;
  expirationDateTime: string;
  id: string;
  resource: string;
}

export function resolveWebhookUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.OUTLOOK_WEBHOOK_URL?.trim();
  if (explicit) {
    return explicit;
  }
  const base = (env.WEBHOOK_BASE_URL?.trim() || "https://webhooks.desertservices.app")
    .replace(/\/+$/, "");
  return `${base}/functions/v1/outlook-webhook`;
}

export function shouldRenew(expiration: string, now = new Date()): boolean {
  const expiresAt = Date.parse(expiration);
  if (!Number.isFinite(expiresAt)) {
    return true;
  }
  return expiresAt <= now.getTime() + RENEW_BUFFER_MINUTES * 60_000;
}

function expirationIso(now = new Date()): string {
  return new Date(now.getTime() + SUBSCRIPTION_TTL_MINUTES * 60_000).toISOString();
}

async function createSubscription(
  mailboxEmail: string,
  notificationUrl: string,
  clientState?: string,
): Promise<GraphSubscription> {
  return graphPost<GraphSubscription>("subscriptions", {
    changeType: "created,updated",
    notificationUrl,
    resource: `users/${mailboxEmail}/messages`,
    expirationDateTime: expirationIso(),
    ...(clientState ? { clientState } : {}),
  });
}

async function renewSubscription(subscriptionId: string): Promise<GraphSubscription> {
  return graphPatch<GraphSubscription>(`subscriptions/${subscriptionId}`, {
    expirationDateTime: expirationIso(),
  });
}

async function deleteSubscriptionFromGraph(subscriptionId: string): Promise<void> {
  try {
    await graphDelete(`subscriptions/${subscriptionId}`);
  } catch (error) {
    // 404 = already gone (expired or manually deleted) — not an error
    if (error instanceof GraphApiError && error.status === 404) {
      return;
    }
    throw error;
  }
}

async function saveSubscription(
  mailboxId: number,
  mailboxEmail: string,
  sub: GraphSubscription,
  clientState?: string,
): Promise<OutlookSubscriptionRecord> {
  return upsertOutlookSubscription({
    subscriptionId: sub.id,
    mailboxId,
    mailboxEmail,
    resource: sub.resource,
    changeType: sub.changeType,
    expiration: sub.expirationDateTime,
    clientState: sub.clientState ?? clientState ?? null,
  });
}

interface EnsureResult {
  mailboxes: number;
  created: number;
  renewed: number;
  deleted: number;
  skipped: number;
  errors: number;
}

async function pruneDuplicateSubscriptions(
  mailboxEmail: string,
  keepSubscriptionId: string,
  mailboxRows: OutlookSubscriptionRecord[],
): Promise<number> {
  const duplicateIds = [
    ...new Set(
      mailboxRows
        .map((row) => row.subscriptionId)
        .filter((subscriptionId) => subscriptionId !== keepSubscriptionId),
    ),
  ];

  for (const subscriptionId of duplicateIds) {
    await deleteSubscriptionFromGraph(subscriptionId);
  }

  const removed = await deleteOutlookSubscriptionsForMailboxExcept(
    mailboxEmail,
    keepSubscriptionId,
  );
  return removed.length;
}

async function ensureSubscriptions(forceRecreate = false): Promise<EnsureResult> {
  const notificationUrl = resolveWebhookUrl();
  if (!notificationUrl.startsWith("https://")) {
    throw new Error("Outlook webhook URL must use https://");
  }

  const mailboxes = await getAllMailboxes();
  const existingRows = await listOutlookSubscriptions();
  const clientState = process.env.OUTLOOK_WEBHOOK_SECRET?.trim() || undefined;

  const rowsByMailbox = new Map<string, OutlookSubscriptionRecord[]>();
  for (const row of existingRows) {
    const list = rowsByMailbox.get(row.mailboxEmail) ?? [];
    list.push(row);
    rowsByMailbox.set(row.mailboxEmail, list);
  }

  const activeMailboxEmails = new Set(mailboxes.map((m) => m.email));
  let created = 0;
  let renewed = 0;
  let deleted = 0;
  let skipped = 0;
  let errors = 0;

  // Clean up subscriptions for mailboxes that no longer exist
  for (const row of existingRows) {
    if (activeMailboxEmails.has(row.mailboxEmail)) {
      continue;
    }
    await deleteSubscriptionFromGraph(row.subscriptionId);
    deleted += await deleteOutlookSubscription(row.subscriptionId);
  }

  // Ensure each active mailbox has a healthy subscription
  for (const mailbox of mailboxes) {
    try {
      const mailboxRows = rowsByMailbox.get(mailbox.email) ?? [];

      if (forceRecreate && mailboxRows[0]) {
        await deleteSubscriptionFromGraph(mailboxRows[0].subscriptionId);
        deleted += await deleteOutlookSubscription(mailboxRows[0].subscriptionId);
      }

      const current = forceRecreate ? undefined : mailboxRows[0];

      if (!current) {
        const sub = await createSubscription(mailbox.email, notificationUrl, clientState);
        const record = await saveSubscription(mailbox.id, mailbox.email, sub, clientState);
        created++;
        deleted += await pruneDuplicateSubscriptions(
          mailbox.email,
          record.subscriptionId,
          mailboxRows,
        );
        continue;
      }

      if (shouldRenew(current.expiration)) {
        let sub: GraphSubscription;
        try {
          sub = await renewSubscription(current.subscriptionId);
        } catch (error) {
          // 404 = subscription expired or was removed — recreate it
          if (error instanceof GraphApiError && error.status === 404) {
            deleted += await deleteOutlookSubscription(current.subscriptionId);
            sub = await createSubscription(mailbox.email, notificationUrl, clientState);
            created++;
          } else {
            throw error;
          }
        }

        const record = await saveSubscription(mailbox.id, mailbox.email, sub, clientState);
        renewed++;
        deleted += await pruneDuplicateSubscriptions(
          mailbox.email,
          record.subscriptionId,
          mailboxRows,
        );
      } else {
        skipped++;
      }
    } catch (error) {
      errors++;
      logger.error("Subscription ensure failed", {
        mailbox: mailbox.email,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const result: EnsureResult = { mailboxes: mailboxes.length, created, renewed, deleted, skipped, errors };
  logger.info("Outlook subscription ensure complete", { ...result });
  return result;
}

// On-demand task — supports forceRecreate to tear down and rebuild all subscriptions
export const outlookWebhookSubscriptionsSync = schemaTask({
  id: "outlook-webhook-subscriptions-sync",
  schema: z
    .object({ forceRecreate: z.boolean().default(false) })
    .default({ forceRecreate: false }),
  maxDuration: 300,
  retry: { maxAttempts: 2 },
  run: async ({ forceRecreate }) => ensureSubscriptions(forceRecreate),
});

// Scheduled task — renews subscriptions before they expire
// Outlook mail subscriptions last 7 days; checking every 6 hours is plenty
export const outlookWebhookSubscriptions = schedules.task({
  id: "outlook-webhook-subscriptions",
  cron: "0 */6 * * *",
  maxDuration: 300,
  run: async () => ensureSubscriptions(),
});
