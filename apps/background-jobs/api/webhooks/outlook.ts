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
 * Actual processing happens in the background worker (apps/background-jobs/worker.ts).
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
const existingQueuedJobStmt = db.query<{ id: number }>(
  `SELECT id FROM webhook_jobs
   WHERE job_type = 'email_notification'
     AND status IN ('pending', 'processing')
     AND payload::jsonb->>'messageId' = ?
   LIMIT 1`
);
const existingEmailStmt = db.query<{ id: number }>(
  "SELECT id FROM emails WHERE message_id = ? LIMIT 1"
);
const lookupMailboxBySubscriptionStmt = db.query<{ mailbox_email: string }>(
  "SELECT mailbox_email FROM outlook_subscriptions WHERE subscription_id = ? LIMIT 1"
);

const RESOURCE_RE = /^users\/([^/]+)\/messages/i;

/**
 * Extract mailbox email from resource string.
 * Format: "users/chi@desertservices.net/messages/AAMkAGI2..."
 */
function parseMailboxFromResource(resource: string): string | null {
  const match = resource.match(RESOURCE_RE);
  const candidate = match?.[1] ?? null;
  if (!candidate) {
    return null;
  }
  return candidate.includes("@") ? candidate : null;
}

async function enqueueNotification(
  notification: OutlookNotification
): Promise<boolean> {
  let mailboxEmail = parseMailboxFromResource(notification.resource);
  if (!mailboxEmail) {
    const mapped = await lookupMailboxBySubscriptionStmt.get(
      notification.subscriptionId
    );
    mailboxEmail = mapped?.mailbox_email ?? null;
  }
  const messageId = notification.resourceData?.id;

  if (!(mailboxEmail && messageId)) {
    console.warn(
      "[webhook:outlook] Skipping notification with missing data:",
      notification.resource
    );
    return false;
  }

  // Skip noisy updates for messages we already ingested.
  if (notification.changeType === "updated") {
    const existingEmail = await existingEmailStmt.get(messageId);
    if (existingEmail) {
      return false;
    }
  }

  // Deduplicate if this message is already queued/processing.
  const queued = await existingQueuedJobStmt.get(messageId);
  if (queued) {
    return false;
  }

  const payload = JSON.stringify({
    messageId,
    mailboxEmail,
    changeType: notification.changeType,
    subscriptionId: notification.subscriptionId,
  });
  await enqueueStmt.run(payload);
  return true;
}

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

  let enqueued = 0;
  for (const notification of notifications) {
    const wasEnqueued = await enqueueNotification(notification);
    if (wasEnqueued) {
      enqueued++;
    }
  }

  if (enqueued > 0) {
    console.log(
      `[webhook:outlook] Enqueued ${enqueued} email_notification job(s)`
    );
  }

  // Return 202 quickly to avoid Microsoft redelivery
  return new Response(null, { status: 202 });
}
