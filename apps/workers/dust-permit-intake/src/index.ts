/**
 * Dust Permit Intake Email Worker (Deprecated)
 *
 * Receives emails forwarded to dustpermits@desertservices.app via
 * Cloudflare Email Routing. Parses attachments, POSTs to hub webhook
 * for NOI extraction and project linking.
 *
 * DEPRECATED: dustpermits@ now routes to intake-worker.
 * Email: dustpermits@desertservices.app (legacy fallback only)
 * Worker: dust-permit-intake.cheez2012.workers.dev
 */

import PostalMime from "postal-mime";

// =============================================================================
// Types
// =============================================================================

export interface Env {
  SEND_EMAIL: SendEmail;
  HUB_WEBHOOK_URL: string;
}

const HUB_PATH = "/api/webhooks/dust-permit-intake";
const LOG = "[dust-permit-intake]";

const FWD_PREFIX_RE = /^(?:fw|fwd|re|forwarded):\s*/gi;
const ORIGINAL_SENDER_RE = /From:\s*(?:.*?<([^>]+)>|([^\s<]+@[^\s>]+))/i;

// =============================================================================
// Worker Entry Point
// =============================================================================

export default {
  fetch(request: Request, _env: Env): Response {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", { headers: { "Content-Type": "text/plain" } });
    }

    return new Response(
      "Dust Permit Intake Worker\n\nEndpoints:\n  GET /health",
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

    console.log(`${LOG} Email from: ${from}`);
    console.log(`${LOG} Subject: ${subject}`);

    try {
      const rawBuffer = await streamToArrayBuffer(message.raw);
      const parsed = await new PostalMime().parse(rawBuffer);

      // Extract PDF attachments as base64
      const pdfAttachments = (parsed.attachments ?? [])
        .filter(
          (a) =>
            a.mimeType === "application/pdf" ||
            (a.filename ?? "").toLowerCase().endsWith(".pdf")
        )
        .map((a) => ({
          filename: a.filename ?? "document.pdf",
          contentType: a.mimeType ?? "application/pdf",
          size: a.content.byteLength,
          content: arrayBufferToBase64(a.content),
        }));

      if (pdfAttachments.length === 0) {
        console.log(`${LOG} No PDF attachments found, skipping`);
        await message.forward("chi@desertservices.net");
        return;
      }

      console.log(`${LOG} Found ${pdfAttachments.length} PDF attachment(s)`);

      // Build payload
      const originalSubject = subject.replace(FWD_PREFIX_RE, "").trim();
      const payload = {
        forwarderEmail: from,
        forwardedAt: new Date().toISOString(),
        originalSubject,
        originalFrom: extractOriginalSender(parsed.text ?? parsed.html ?? ""),
        bodyText: parsed.text ?? "",
        attachments: pdfAttachments,
      };

      // POST to hub webhook
      ctx.waitUntil(postToHub(env, payload, subject));

      // Always forward to chi@ so you still get the email
      await message.forward("chi@desertservices.net");
    } catch (error) {
      console.error(`${LOG} Error: ${error}`);
      try {
        await message.forward("chi@desertservices.net");
      } catch (fwdErr) {
        console.error(`${LOG} Forward failed: ${fwdErr}`);
      }
    }
  },
};

// =============================================================================
// Hub Communication
// =============================================================================

async function postToHub(
  env: Env,
  payload: Record<string, unknown>,
  _subject: string
): Promise<void> {
  const hubUrl =
    (env.HUB_WEBHOOK_URL || "https://monday-estimates.desertservices.app") +
    HUB_PATH;

  try {
    const response = await fetch(hubUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = (await response.json()) as {
        jobId?: number;
        pdfs?: number;
      };
      console.log(
        `${LOG} Hub accepted: job #${result.jobId}, ${result.pdfs} PDF(s)`
      );
    } else {
      const text = await response.text();
      console.error(
        `${LOG} Hub rejected (${response.status}): ${text.slice(0, 200)}`
      );
    }
  } catch (error) {
    console.error(`${LOG} Hub POST failed: ${error}`);
  }

  // Send notification email would go here in future
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Try to extract the original sender from a forwarded email body.
 * Looks for "From: Name <email>" pattern in the body text.
 */
function extractOriginalSender(body: string): string {
  const fromMatch = body.match(ORIGINAL_SENDER_RE);
  return fromMatch?.[1] ?? fromMatch?.[2] ?? "";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

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
