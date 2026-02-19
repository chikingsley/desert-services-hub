/* global Deno */

import { enqueueBackgroundJob, json, selectOne } from "../_shared/queue.ts";

interface OutlookNotification {
  subscriptionId: string;
  changeType: string;
  resource: string;
  clientState: string;
  resourceData: {
    id: string;
  };
}

const RESOURCE_RE = /^users\/([^/]+)\/messages/i;

function parseMailboxFromResource(resource: string): string | null {
  const match = resource.match(RESOURCE_RE);
  const candidate = match?.[1] ?? null;
  if (!candidate) {
    return null;
  }
  return candidate.includes("@") ? candidate : null;
}

async function mailboxBySubscription(
  subscriptionId: string
): Promise<string | null> {
  const params = new URLSearchParams({
    select: "mailbox_email",
    subscription_id: `eq.${subscriptionId}`,
    limit: "1",
  });
  const row = await selectOne<{ mailbox_email: string }>(
    "outlook_subscriptions",
    params
  );
  return row?.mailbox_email ?? null;
}

async function emailExists(messageId: string): Promise<boolean> {
  const params = new URLSearchParams({
    select: "id",
    message_id: `eq.${messageId}`,
    limit: "1",
  });
  const row = await selectOne<{ id: number }>("emails", params);
  return Boolean(row);
}

function isValidClientState(
  notifications: OutlookNotification[],
  expectedSecret: string | undefined
): boolean {
  if (!expectedSecret) {
    return true;
  }
  return !notifications.some((n) => n.clientState !== expectedSecret);
}

async function processNotification(
  notification: OutlookNotification
): Promise<boolean> {
  let mailboxEmail = parseMailboxFromResource(notification.resource);
  if (!mailboxEmail) {
    mailboxEmail = await mailboxBySubscription(notification.subscriptionId);
  }

  const messageId = notification.resourceData?.id;
  if (!(mailboxEmail && messageId)) {
    return false;
  }

  if (notification.changeType === "updated") {
    const exists = await emailExists(messageId);
    if (exists) {
      return false;
    }
  }

  const id = await enqueueBackgroundJob(
    "email_notification",
    {
      messageId,
      mailboxEmail,
      changeType: notification.changeType,
      subscriptionId: notification.subscriptionId,
    },
    { dedupe: true, maxAttempts: 3 }
  );

  return id !== null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  const url = new URL(req.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let body: { value?: OutlookNotification[] };
  try {
    body = (await req.json()) as { value?: OutlookNotification[] };
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const notifications = body.value;
  if (!notifications?.length) {
    return new Response(null, { status: 202 });
  }

  if (
    !isValidClientState(notifications, Deno.env.get("OUTLOOK_WEBHOOK_SECRET"))
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  let enqueued = 0;
  for (const notification of notifications) {
    const wasEnqueued = await processNotification(notification);
    if (wasEnqueued) {
      enqueued++;
    }
  }

  if (enqueued > 0) {
    console.log(
      `[edge:outlook] Enqueued ${enqueued} email_notification job(s)`
    );
  }

  return new Response(null, { status: 202 });
});
