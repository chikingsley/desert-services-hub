/* global Deno */

/**
 * Outlook Webhook — Supabase Edge Function
 *
 * Receives Microsoft Graph change notifications for email messages.
 * Validates the notification, deduplicates, then triggers the
 * Trigger.dev `email-sync` task via REST API.
 *
 * Triggers Trigger.dev directly for observability and retry management.
 */

interface OutlookNotification {
  changeType: string;
  clientState: string;
  resource: string;
  resourceData: {
    id: string;
  };
  subscriptionId: string;
}

const RESOURCE_RE = /^users\/([^/]+)\/messages/i;

const TRIGGER_API_URL =
  Deno.env.get("TRIGGER_API_URL") ?? "https://trigger.desertservices.app";
const TRIGGER_SECRET_KEY = Deno.env.get("TRIGGER_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
  if (!(SUPABASE_URL && SERVICE_ROLE_KEY)) {
    return null;
  }
  const params = new URLSearchParams({
    select: "mailbox_email",
    subscription_id: `eq.${subscriptionId}`,
    limit: "1",
  });
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/outlook_subscriptions?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!response.ok) {
    return null;
  }
  const rows = (await response.json()) as { mailbox_email: string }[];
  return rows[0]?.mailbox_email ?? null;
}

async function emailExists(messageId: string): Promise<boolean> {
  if (!(SUPABASE_URL && SERVICE_ROLE_KEY)) {
    return false;
  }
  const params = new URLSearchParams({
    select: "id",
    message_id: `eq.${messageId}`,
    limit: "1",
  });
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/emails?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!response.ok) {
    return false;
  }
  const rows = (await response.json()) as { id: number }[];
  return rows.length > 0;
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

/** Trigger a Trigger.dev task via the REST API. */
async function triggerEmailSync(
  messageId: string,
  mailboxEmail: string,
  changeType: string
): Promise<boolean> {
  if (!TRIGGER_SECRET_KEY) {
    console.error("[edge:outlook] TRIGGER_SECRET_KEY not set");
    return false;
  }

  const response = await fetch(
    `${TRIGGER_API_URL}/api/v1/tasks/email-sync/trigger`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TRIGGER_SECRET_KEY}`,
      },
      body: JSON.stringify({
        payload: { messageId, mailboxEmail, changeType },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    console.error(
      `[edge:outlook] Trigger.dev email-sync failed (${response.status}): ${body}`
    );
    return false;
  }

  return true;
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

  // Skip updates for emails we already have
  if (notification.changeType === "updated") {
    const exists = await emailExists(messageId);
    if (exists) {
      return false;
    }
  }

  return triggerEmailSync(messageId, mailboxEmail, notification.changeType);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Microsoft Graph subscription validation handshake
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

  let triggered = 0;
  for (const notification of notifications) {
    const wasTriggered = await processNotification(notification);
    if (wasTriggered) {
      triggered++;
    }
  }

  if (triggered > 0) {
    console.log(
      `[edge:outlook] Triggered ${triggered} email-sync task(s) via Trigger.dev`
    );
  }

  return new Response(null, { status: 202 });
});
