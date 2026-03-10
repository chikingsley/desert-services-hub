import { getAllMailboxes } from "@email/db/mailbox";
import {
  deleteOutlookSubscription,
  deleteOutlookSubscriptionsForMailboxExcept,
  listOutlookSubscriptions,
  type OutlookSubscriptionRecord,
  upsertOutlookSubscription,
} from "@email/db/outlook-subscription";
import { getGraphToken } from "@lib/graph/auth";
import { logger, schedules, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const DEFAULT_CHANGE_TYPE = "created,updated";
const RENEW_BUFFER_MINUTES = 60;
const SUBSCRIPTION_TTL_MINUTES = 4200;
const TRAILING_SLASH_RE = /\/+$/;

class GraphRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GraphRequestError";
    this.status = status;
  }
}

interface GraphSubscription {
  changeType: string;
  clientState?: string;
  expirationDateTime: string;
  id: string;
  resource: string;
}

function normalizeUrl(url: string): string {
  return url.replace(TRAILING_SLASH_RE, "");
}

export function resolveOutlookWebhookUrl(
  env: NodeJS.ProcessEnv = process.env
): string {
  const explicit = env.OUTLOOK_WEBHOOK_URL?.trim();
  if (explicit) {
    return explicit;
  }
  const base =
    env.WEBHOOK_BASE_URL?.trim() || "https://webhooks.desertservices.app";
  return `${normalizeUrl(base)}/functions/v1/outlook-webhook`;
}

export function computeSubscriptionExpirationIso(
  now = new Date(),
  ttlMinutes = SUBSCRIPTION_TTL_MINUTES
): string {
  return new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
}

export function shouldRenewSubscription(
  expiration: string,
  now = new Date(),
  renewBufferMinutes = RENEW_BUFFER_MINUTES
): boolean {
  const expiresAt = Date.parse(expiration);
  if (!Number.isFinite(expiresAt)) {
    return true;
  }
  return expiresAt <= now.getTime() + renewBufferMinutes * 60_000;
}

function mailboxResource(mailboxEmail: string): string {
  return `users/${mailboxEmail}/messages`;
}

function graphApiUrl(path: string): string {
  return path.startsWith("https://") ? path : `${GRAPH_API_BASE}/${path}`;
}

async function graphRequest<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const token = await getGraphToken();
  const response = await fetch(graphApiUrl(path), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new GraphRequestError(
      response.status,
      `Graph API ${response.status}: ${text}`
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function createGraphSubscription(params: {
  changeType: string;
  clientState?: string;
  mailboxEmail: string;
  notificationUrl: string;
}): Promise<GraphSubscription> {
  return graphRequest<GraphSubscription>("POST", "subscriptions", {
    changeType: params.changeType,
    notificationUrl: params.notificationUrl,
    resource: mailboxResource(params.mailboxEmail),
    expirationDateTime: computeSubscriptionExpirationIso(),
    ...(params.clientState ? { clientState: params.clientState } : {}),
  });
}

function renewGraphSubscription(
  subscriptionId: string
): Promise<GraphSubscription> {
  return graphRequest<GraphSubscription>(
    "PATCH",
    `subscriptions/${subscriptionId}`,
    {
      expirationDateTime: computeSubscriptionExpirationIso(),
    }
  );
}

async function deleteGraphSubscription(subscriptionId: string): Promise<void> {
  await graphRequest<void>("DELETE", `subscriptions/${subscriptionId}`);
}

function writeSubscription(
  mailboxId: number,
  mailboxEmail: string,
  subscription: GraphSubscription,
  fallbackClientState?: string
): Promise<OutlookSubscriptionRecord> {
  return upsertOutlookSubscription({
    subscriptionId: subscription.id,
    mailboxId,
    mailboxEmail,
    resource: subscription.resource,
    changeType: subscription.changeType,
    expiration: subscription.expirationDateTime,
    clientState: subscription.clientState ?? fallbackClientState ?? null,
  });
}

interface EnsureOptions {
  forceRecreate?: boolean;
}

interface EnsureResult {
  created: number;
  deleted: number;
  errors: number;
  mailboxes: number;
  renewed: number;
  skipped: number;
}

export async function ensureOutlookWebhookSubscriptions(
  options: EnsureOptions = {}
): Promise<EnsureResult> {
  const notificationUrl = resolveOutlookWebhookUrl();
  if (!notificationUrl.startsWith("https://")) {
    throw new Error("Outlook webhook notification URL must be https://");
  }

  const mailboxes = await getAllMailboxes();
  const existingRows = await listOutlookSubscriptions();
  const rowsByMailbox = new Map<string, OutlookSubscriptionRecord[]>();

  for (const row of existingRows) {
    const list = rowsByMailbox.get(row.mailboxEmail) ?? [];
    list.push(row);
    rowsByMailbox.set(row.mailboxEmail, list);
  }

  const existingMailboxSet = new Set(mailboxes.map((m) => m.email));
  let created = 0;
  let renewed = 0;
  let deleted = 0;
  let skipped = 0;
  let errors = 0;
  const clientState = process.env.OUTLOOK_WEBHOOK_SECRET?.trim() || undefined;

  for (const row of existingRows) {
    if (existingMailboxSet.has(row.mailboxEmail)) {
      continue;
    }
    try {
      await deleteGraphSubscription(row.subscriptionId);
    } catch (error) {
      if (!(error instanceof GraphRequestError && error.status === 404)) {
        errors++;
      }
    }
    deleted += await deleteOutlookSubscription(row.subscriptionId);
  }

  for (const mailbox of mailboxes) {
    const mailboxRows = rowsByMailbox.get(mailbox.email) ?? [];
    const primary = mailboxRows[0];

    try {
      if (options.forceRecreate && primary) {
        try {
          await deleteGraphSubscription(primary.subscriptionId);
        } catch (error) {
          if (!(error instanceof GraphRequestError && error.status === 404)) {
            throw error;
          }
        }
        deleted += await deleteOutlookSubscription(primary.subscriptionId);
      }

      const currentRows = options.forceRecreate ? [] : mailboxRows;
      const current = currentRows[0];
      if (!current) {
        const createdSub = await createGraphSubscription({
          mailboxEmail: mailbox.email,
          changeType: DEFAULT_CHANGE_TYPE,
          notificationUrl,
          clientState,
        });
        const record = await writeSubscription(
          mailbox.id,
          mailbox.email,
          createdSub,
          clientState
        );
        created++;
        const removed = await deleteOutlookSubscriptionsForMailboxExcept(
          mailbox.email,
          record.subscriptionId
        );
        deleted += removed.length;
        continue;
      }

      if (shouldRenewSubscription(current.expiration)) {
        let renewedSub: GraphSubscription;
        try {
          renewedSub = await renewGraphSubscription(current.subscriptionId);
        } catch (error) {
          if (
            error instanceof GraphRequestError &&
            (error.status === 404 || error.status === 410)
          ) {
            deleted += await deleteOutlookSubscription(current.subscriptionId);
            renewedSub = await createGraphSubscription({
              mailboxEmail: mailbox.email,
              changeType: DEFAULT_CHANGE_TYPE,
              notificationUrl,
              clientState,
            });
            created++;
          } else {
            throw error;
          }
        }

        const record = await writeSubscription(
          mailbox.id,
          mailbox.email,
          renewedSub,
          clientState
        );
        renewed++;
        const removed = await deleteOutlookSubscriptionsForMailboxExcept(
          mailbox.email,
          record.subscriptionId
        );
        deleted += removed.length;
      } else {
        skipped++;
      }
    } catch (error) {
      errors++;
      logger.error("Outlook subscription ensure failed", {
        mailbox: mailbox.email,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const result: EnsureResult = {
    mailboxes: mailboxes.length,
    created,
    renewed,
    deleted,
    skipped,
    errors,
  };

  logger.info("Outlook webhook subscription ensure complete", { ...result });
  return result;
}

export const outlookWebhookSubscriptionsSync = schemaTask({
  id: "outlook-webhook-subscriptions-sync",
  schema: z
    .object({
      forceRecreate: z.boolean().default(false),
    })
    .default({ forceRecreate: false }),
  maxDuration: 300,
  retry: { maxAttempts: 2 },
  run: async ({ forceRecreate }) =>
    ensureOutlookWebhookSubscriptions({ forceRecreate }),
});

export const outlookWebhookSubscriptions = schedules.task({
  id: "outlook-webhook-subscriptions",
  cron: "*/30 * * * *",
  maxDuration: 300,
  run: async () => ensureOutlookWebhookSubscriptions(),
});
