/**
 * Desert Services Contracts Dispatcher Worker
 *
 * Receives emails forwarded from contracts@desertservices.net via
 * Cloudflare Email Routing. Classifies the email and dispatches
 * the appropriate action.
 *
 * Triggers:
 *   1. "Requested new link" in body → find new DocuSign signing link
 *   2. (future) DocuSign attachment forwarded → kick off intake
 *   3. (future) Other patterns
 *
 * Email: contracts-dispatch@desertservices.app
 * Worker: contracts-dispatcher.cheez2012.workers.dev
 */

import { EmailMessage } from "cloudflare:email";
import { getGraphToken } from "@lib/graph/token";
import PostalMime from "postal-mime";
import { type DocuSignResult, findDocuSignLink } from "./docusign";

// =============================================================================
// Types
// =============================================================================

export interface Env {
  SEND_EMAIL: SendEmail;
  AZURE_TENANT_ID: string;
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
}

type TriggerType = "requested-new-link" | "unknown";

interface ClassifiedEmail {
  trigger: TriggerType;
  subject: string;
  from: string;
  body: string;
  receivedAt: Date;
}

interface DispatcherMetrics {
  receivedTotal: number;
  manualTriggerTotal: number;
  triggerRequestedNewLinkTotal: number;
  triggerUnknownTotal: number;
  docusignSearchFoundTotal: number;
  docusignSearchNotFoundTotal: number;
  notificationSentTotal: number;
  notificationFailedTotal: number;
  workerErrorTotal: number;
  forwardFailedTotal: number;
}

interface DispatcherErrorSnapshot {
  code: string;
  message: string;
  at: string;
}

const METRICS: DispatcherMetrics = {
  receivedTotal: 0,
  manualTriggerTotal: 0,
  triggerRequestedNewLinkTotal: 0,
  triggerUnknownTotal: 0,
  docusignSearchFoundTotal: 0,
  docusignSearchNotFoundTotal: 0,
  notificationSentTotal: 0,
  notificationFailedTotal: 0,
  workerErrorTotal: 0,
  forwardFailedTotal: 0,
};

let lastError: DispatcherErrorSnapshot | null = null;

function incrementMetric(key: keyof DispatcherMetrics, by = 1): void {
  METRICS[key] += by;
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function logEvent(
  event: string,
  fields: Record<string, unknown> = {},
  level: "info" | "error" = "info"
): void {
  const line = JSON.stringify({
    source: "contracts-dispatcher",
    event,
    level,
    at: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}

function recordError(
  code: string,
  error: unknown,
  fields: Record<string, unknown> = {}
): void {
  const message = sanitizeErrorMessage(error);
  incrementMetric("workerErrorTotal");
  lastError = { code, message, at: new Date().toISOString() };
  logEvent("error", { code, message, ...fields }, "error");
}

// =============================================================================
// Worker Entry Point
// =============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        worker: "contracts-dispatcher",
        metrics: METRICS,
        lastError,
        checkedAt: new Date().toISOString(),
      });
    }

    // Manual trigger endpoint for testing:
    // POST /trigger/docusign-link?subject=220668+PCSD+Music+Building
    if (
      url.pathname === "/trigger/docusign-link" &&
      request.method === "POST"
    ) {
      const subject = url.searchParams.get("subject");
      if (!subject) {
        return new Response("Missing ?subject= parameter", { status: 400 });
      }
      incrementMetric("manualTriggerTotal");
      logEvent("manual_trigger.requested", { subject });

      try {
        const token = await getGraphToken(
          env.AZURE_TENANT_ID,
          env.AZURE_CLIENT_ID,
          env.AZURE_CLIENT_SECRET
        );

        const result = await findDocuSignLink(token, subject, new Date());

        if (result.found) {
          incrementMetric("docusignSearchFoundTotal");
          logEvent("docusign.search.found", {
            subject,
            mailbox: result.foundInMailbox,
            receivedAt: result.receivedAt,
          });
          await sendDocuSignNotification(env, result);
          return Response.json(result);
        }

        incrementMetric("docusignSearchNotFoundTotal");
        logEvent("docusign.search.not_found", { subject });
        return Response.json(result, { status: 404 });
      } catch (error) {
        recordError("manual_trigger_failed", error, { subject });
        return Response.json(
          { error: "Manual DocuSign trigger failed" },
          { status: 500 }
        );
      }
    }

    return new Response(
      "Contracts Dispatcher Worker\n\nEndpoints:\n  GET  /health\n  POST /trigger/docusign-link?subject=...",
      { headers: { "Content-Type": "text/plain" } }
    );
  },

  async email(
    message: ForwardableEmailMessage,
    env: Env,
    ctx: ExecutionContext
  ) {
    const from = message.from;
    const subject = message.headers.get("subject") ?? "";
    incrementMetric("receivedTotal");
    logEvent("email.received", { from, subject });

    try {
      // Read and parse the email
      const rawBuffer = await streamToArrayBuffer(message.raw);
      const parsed = await new PostalMime().parse(rawBuffer);

      const classified = classifyEmail({
        subject,
        from,
        body: parsed.text ?? parsed.html ?? "",
        receivedAt: new Date(),
      });
      logEvent("email.classified", {
        trigger: classified.trigger,
        subject: classified.subject,
      });

      // Dispatch based on trigger type
      switch (classified.trigger) {
        case "requested-new-link":
          incrementMetric("triggerRequestedNewLinkTotal");
          ctx.waitUntil(
            handleRequestedNewLink(env, classified).catch((error) => {
              recordError("requested_new_link_handler_failed", error, {
                subject: classified.subject,
              });
            })
          );
          break;
        case "unknown":
          incrementMetric("triggerUnknownTotal");
          logEvent("email.ignored", {
            reason: "no_matching_trigger",
            subject: classified.subject,
          });
          break;
        default:
          incrementMetric("triggerUnknownTotal");
          logEvent("email.ignored", {
            reason: "unhandled_trigger",
            trigger: classified.trigger,
            subject: classified.subject,
          });
          break;
      }

      // Always forward to chi@ so you still get the email
      await message.forward("chi@desertservices.net");
      logEvent("email.forwarded", {
        subject,
        target: "chi@desertservices.net",
      });
    } catch (error) {
      recordError("email_handler_failed", error, { from, subject });
      try {
        await message.forward("chi@desertservices.net");
      } catch (fwdErr) {
        incrementMetric("forwardFailedTotal");
        recordError("forward_failed", fwdErr, { from, subject });
      }
    }
  },
};

// =============================================================================
// Classification
// =============================================================================

const TRIGGER_PHRASE = "requested new link";

function classifyEmail(input: {
  subject: string;
  from: string;
  body: string;
  receivedAt: Date;
}): ClassifiedEmail {
  const bodyLower = input.body.toLowerCase();

  if (bodyLower.includes(TRIGGER_PHRASE)) {
    return { trigger: "requested-new-link", ...input };
  }

  // Future triggers go here:
  // - DocuSign attachment detection
  // - "new contract" keywords
  // - etc.

  return { trigger: "unknown", ...input };
}

// =============================================================================
// Handlers
// =============================================================================

/**
 * Handle "requested new link" trigger.
 * Extracts the document subject from the email and searches
 * all mailboxes for the new DocuSign signing link.
 */
async function handleRequestedNewLink(
  env: Env,
  email: ClassifiedEmail
): Promise<void> {
  // Extract the document subject — strip Re:/FW: prefixes
  const documentSubject = email.subject
    .replace(/^(?:Re|Fw|FW|Fwd):\s*/gi, "")
    .trim();

  logEvent("docusign.search.started", { documentSubject });

  try {
    const token = await getGraphToken(
      env.AZURE_TENANT_ID,
      env.AZURE_CLIENT_ID,
      env.AZURE_CLIENT_SECRET
    );

    const result = await findDocuSignLink(
      token,
      documentSubject,
      email.receivedAt
    );

    if (result.found) {
      incrementMetric("docusignSearchFoundTotal");
      logEvent("docusign.search.found", {
        documentSubject,
        mailbox: result.foundInMailbox,
        receivedAt: result.receivedAt,
      });
      await sendDocuSignNotification(env, result);
      return;
    }

    incrementMetric("docusignSearchNotFoundTotal");
    logEvent("docusign.search.not_found", { documentSubject });
    await sendDocuSignNotFound(env, documentSubject);
  } catch (error) {
    recordError("docusign_search_failed", error, { documentSubject });
    throw error;
  }
}

// =============================================================================
// Notifications
// =============================================================================

async function sendDocuSignNotification(
  env: Env,
  result: DocuSignResult & { found: true }
): Promise<void> {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0;">New DocuSign Link Found</h2>
  </div>
  <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <div style="margin-bottom: 12px;">
      <div style="font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase;">Document</div>
      <div style="font-size: 16px; margin-top: 2px;">${result.documentSubject}</div>
    </div>
    <div style="margin-bottom: 12px;">
      <div style="font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase;">Found In</div>
      <div style="font-size: 16px; margin-top: 2px;">${result.foundInMailbox}</div>
    </div>
    <div style="margin-bottom: 12px;">
      <div style="font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase;">Received</div>
      <div style="font-size: 16px; margin-top: 2px;">${result.receivedAt}</div>
    </div>
    ${
      result.securityCode
        ? `<div style="margin-bottom: 12px;">
      <div style="font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase;">Security Code</div>
      <div style="font-size: 16px; margin-top: 2px; font-family: monospace;">${result.securityCode}</div>
    </div>`
        : ""
    }
    <a href="${result.signingUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; font-weight: 600;">Open DocuSign</a>
  </div>
</body>
</html>`;

  await sendNotificationEmail(
    env,
    `[DocuSign Link] ${result.documentSubject}`,
    html
  );
}

async function sendDocuSignNotFound(
  env: Env,
  documentSubject: string
): Promise<void> {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0;">DocuSign Link Not Found Yet</h2>
  </div>
  <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <div style="margin-bottom: 12px;">
      <div style="font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase;">Document</div>
      <div style="font-size: 16px; margin-top: 2px;">${documentSubject}</div>
    </div>
    <p style="color: #6b7280;">The new signing link hasn't arrived yet. It may still be generating. Check your mailboxes manually or wait a few minutes.</p>
  </div>
</body>
</html>`;

  await sendNotificationEmail(
    env,
    `[DocuSign Pending] ${documentSubject}`,
    html
  );
}

async function sendNotificationEmail(
  env: Env,
  subject: string,
  htmlBody: string
): Promise<void> {
  try {
    const messageId = `${Date.now()}.${crypto.randomUUID()}@desertservices.app`;
    const date = new Date().toUTCString();

    const rawEmail = [
      '"Contracts Dispatcher" <contracts-dispatch@desertservices.app>',
      "To: chi@desertservices.net",
      `Subject: ${subject}`,
      `Date: ${date}`,
      `Message-ID: <${messageId}>`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "",
      htmlBody,
    ].join("\r\n");

    // Prepend "From: " to the first line
    const fullRawEmail = `From: ${rawEmail}`;

    const message = new EmailMessage(
      "contracts-dispatch@desertservices.app",
      "chi@desertservices.net",
      fullRawEmail
    );
    await env.SEND_EMAIL.send(message);
    incrementMetric("notificationSentTotal");
    logEvent("notification.sent", { subject });
  } catch (error) {
    incrementMetric("notificationFailedTotal");
    recordError("notification_send_failed", error, { subject });
  }
}

// =============================================================================
// Utilities
// =============================================================================

async function streamToArrayBuffer(
  stream: ReadableStream<Uint8Array>
): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  let result = await reader.read();
  while (!result.done) {
    chunks.push(result.value);
    result = await reader.read();
  }

  let length = 0;
  for (const c of chunks) {
    length += c.length;
  }

  const combined = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.length;
  }

  return combined.buffer;
}
