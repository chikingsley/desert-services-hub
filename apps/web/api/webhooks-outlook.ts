/**
 * Outlook Change Notification Webhook Handler
 *
 * Route: POST /api/webhooks/outlook
 *
 * Receives Microsoft Graph change notifications for mail messages.
 * Two modes:
 *   1. Validation: Microsoft sends ?validationToken=xxx -- echo it back as text/plain
 *   2. Notification: Parse payload, validate clientState, enqueue email_notification jobs
 *
 * Actual processing happens in the background worker (apps/web/worker.ts).
 */
import { db } from "@lib/db/hub";

interface OutlookNotification {
  subscriptionId: string;
  changeType: string;
  resource: string;
  clientState: string;
  resourceData: {
    "@odata.type": string;
    "@odata.id": string;
    id: string;
  };
  tenantId: string;
}

const enqueueStmt = db.prepare(
  "INSERT INTO webhook_jobs (job_type, payload) VALUES ('email_notification', ?)"
);

const RESOURCE_RE = /^users\/([^/]+)\/messages/i;

/**
 * Extract mailbox email from resource string.
 * Format: "users/chi@desertservices.net/messages/AAMkAGI2..."
 *    or:  "Users/84245868-0b0f-439b-a67c-.../Messages/AAMk..."
 *
 * Microsoft may return a GUID instead of the email address.
 * If the captured segment doesn't look like an email, return null
 * so the caller can fall back to subscriptionId lookup.
 */
function parseMailboxFromResource(resource: string): string | null {
  const match = resource.match(RESOURCE_RE);
  const segment = match?.[1];
  if (!segment) return null;
  // Only return if it looks like an email; GUIDs will fall through
  return segment.includes("@") ? segment : null;
}

const lookupMailboxBySubscription = db.query<{ mailbox_email: string }>(
  "SELECT mailbox_email FROM outlook_subscriptions WHERE subscription_id = ? LIMIT 1"
);

export async function handleOutlookWebhook(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // Mode 1: Subscription validation handshake
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    console.log("[webhook:outlook] Validation token received");
    return new Response(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Mode 2: Change notification
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

  // Validate clientState
  const expectedSecret = process.env.OUTLOOK_WEBHOOK_SECRET;
  if (expectedSecret) {
    const invalidState = notifications.some(
      (n) => n.clientState !== expectedSecret
    );
    if (invalidState) {
      console.warn("[webhook:outlook] Invalid clientState -- rejecting");
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // Enqueue each notification as a job
  let enqueued = 0;
  for (const notification of notifications) {
    let mailboxEmail = parseMailboxFromResource(notification.resource);
    const messageId = notification.resourceData?.id;

    // Fall back to subscription lookup when Microsoft returns a GUID
    if (!mailboxEmail && notification.subscriptionId) {
      const row = await lookupMailboxBySubscription.get(
        notification.subscriptionId
      );
      mailboxEmail = row?.mailbox_email ?? null;
    }

    if (!(mailboxEmail && messageId)) {
      console.warn(
        "[webhook:outlook] Skipping notification with missing data:",
        notification.resource
      );
      continue;
    }

    const payload = JSON.stringify({
      messageId,
      mailboxEmail,
      changeType: notification.changeType,
      subscriptionId: notification.subscriptionId,
    });

    await enqueueStmt.run(payload);
    enqueued++;
  }

  if (enqueued > 0) {
    console.log(
      `[webhook:outlook] Enqueued ${enqueued} email_notification job(s)`
    );
  }

  // Return 202 quickly to avoid Microsoft redelivery
  return new Response(null, { status: 202 });
}
