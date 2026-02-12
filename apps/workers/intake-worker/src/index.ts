/**
 * Intake Worker
 *
 * Receives emails forwarded to intake@desertservices.app via Cloudflare
 * Email Routing. Extracts attachments, detects file-sharing links
 * (OneDrive, Egnyte, Dropbox), and POSTs to hub webhook for processing.
 *
 * Email: intake@desertservices.app (also contracts@, dustpermits@)
 * Worker: intake-worker.cheez2012.workers.dev
 */

import PostalMime from "postal-mime";

// =============================================================================
// Types
// =============================================================================

export interface Env {
  SEND_EMAIL: SendEmail;
  HUB_WEBHOOK_URL: string;
}

interface FileLink {
  url: string;
  source: "onedrive" | "egnyte" | "dropbox";
}

const HUB_PATH = "/api/webhooks/intake";
const LOG = "[intake]";

const FWD_PREFIX_RE = /^(?:fw|fwd|re|forwarded):\s*/gi;
const ORIGINAL_SENDER_RE = /From:\s*(?:.*?<([^>]+)>|([^\s<]+@[^\s>]+))/i;

/** Body text shorter than this is considered boilerplate (just FWD headers) */
const MIN_BODY_LENGTH = 50;

// =============================================================================
// Worker Entry Point
// =============================================================================

export default {
  fetch(request: Request, _env: Env): Response {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", { headers: { "Content-Type": "text/plain" } });
    }

    return new Response("Intake Worker\n\nEndpoints:\n  GET /health", {
      headers: { "Content-Type": "text/plain" },
    });
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

      // Extract ALL attachments (not just PDFs)
      const attachments = (parsed.attachments ?? []).map((a) => {
        const content =
          typeof a.content === "string"
            ? new TextEncoder().encode(a.content).buffer
            : a.content;

        return {
          filename: a.filename ?? `attachment.${guessExtension(a.mimeType)}`,
          contentType: a.mimeType ?? "application/octet-stream",
          size: content.byteLength,
          content: arrayBufferToBase64(content),
        };
      });

      // Extract file-sharing links from HTML/text body
      const fileLinks = extractFileLinks(parsed.html ?? "", parsed.text ?? "");

      const bodyText = parsed.text ?? "";
      const bodyHasContent =
        bodyText.replace(FWD_PREFIX_RE, "").trim().length >= MIN_BODY_LENGTH;

      // Proceed if we have attachments, links, OR meaningful body text
      if (
        attachments.length === 0 &&
        fileLinks.length === 0 &&
        !bodyHasContent
      ) {
        console.log(
          `${LOG} No attachments, links, or body content, forwarding only`
        );
        await message.forward("chi@desertservices.net");
        return;
      }

      console.log(
        `${LOG} Found ${attachments.length} attachment(s) + ${fileLinks.length} link(s)${bodyHasContent ? " + body text" : ""}`
      );

      // Build payload
      const originalSubject = subject.replace(FWD_PREFIX_RE, "").trim();
      const payload = {
        forwarderEmail: from,
        forwardedAt: new Date().toISOString(),
        originalSubject,
        originalFrom: extractOriginalSender(parsed.text ?? parsed.html ?? ""),
        bodyText,
        bodyHasContent,
        attachments,
        fileLinks,
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
// Link Extraction
// =============================================================================

const ONEDRIVE_RE =
  /https:\/\/(?:(?:[^\s"<>]*sharepoint\.com)|(?:www\.)?onedrive\.live\.com)\/[^\s"<>]*/gi;
const EGNYTE_RE = /https:\/\/[^\s"<>]+\.egnyte\.com\/fl\/[^\s"<>]*/gi;
const DROPBOX_RE = /https:\/\/(?:www\.)?dropbox\.com\/[^\s"<>]*/gi;
const TRAILING_URL_ARTIFACT_PATTERN = /['">\s\]),.;]+$/;
const SHAREPOINT_COLON_PATH_RE = /\/:[a-z]:\//;

/**
 * Extract file sharing links from email HTML and text body.
 * Supports OneDrive/SharePoint, Egnyte, Dropbox.
 */
export function extractFileLinks(html: string, text: string): FileLink[] {
  const links: FileLink[] = [];
  const seen = new Set<string>();

  // Search both HTML and text (HTML has full URLs, text may have some too)
  const combined = `${html || ""}\n${text || ""}`;

  for (const match of combined.matchAll(ONEDRIVE_RE)) {
    // Clean trailing HTML/punctuation artifacts (quotes, angle brackets, etc.)
    const url = match[0].replace(TRAILING_URL_ARTIFACT_PATTERN, "");
    if (!isLikelyOneDriveShareUrl(url)) {
      continue;
    }
    if (!seen.has(url)) {
      seen.add(url);
      links.push({ url, source: "onedrive" });
    }
  }

  for (const match of combined.matchAll(EGNYTE_RE)) {
    const url = match[0].replace(TRAILING_URL_ARTIFACT_PATTERN, "");
    if (!seen.has(url)) {
      seen.add(url);
      links.push({ url, source: "egnyte" });
    }
  }

  for (const match of combined.matchAll(DROPBOX_RE)) {
    const url = match[0].replace(TRAILING_URL_ARTIFACT_PATTERN, "");
    if (!seen.has(url)) {
      seen.add(url);
      links.push({ url, source: "dropbox" });
    }
  }

  return links;
}

function isLikelyOneDriveShareUrl(url: string): boolean {
  const lower = url.toLowerCase();

  if (lower.includes("onedrive.live.com")) {
    return true;
  }
  if (!lower.includes("sharepoint.com")) {
    return false;
  }

  // Common SharePoint file-share URL shapes seen in forwarded mail.
  return (
    SHAREPOINT_COLON_PATH_RE.test(lower) ||
    lower.includes("guestaccess.aspx") ||
    lower.includes("/_layouts/15/") ||
    lower.includes("/doc.aspx")
  );
}

// =============================================================================
// Hub Communication
// =============================================================================

async function postToHub(
  env: Env,
  payload: Record<string, unknown>,
  _subject: string
): Promise<void> {
  const hubUrl =
    (env.HUB_WEBHOOK_URL || "https://webhooks.desertservices.app") + HUB_PATH;

  try {
    const response = await fetch(hubUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = (await response.json()) as {
        jobId?: number;
        files?: number;
      };
      console.log(
        `${LOG} Hub accepted: job #${result.jobId}, ${result.files} file(s)`
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
}

// =============================================================================
// Helpers
// =============================================================================

function extractOriginalSender(body: string): string {
  const fromMatch = body.match(ORIGINAL_SENDER_RE);
  return fromMatch?.[1] ?? fromMatch?.[2] ?? "";
}

function guessExtension(mimeType?: string): string {
  if (!mimeType) {
    return "bin";
  }
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/tiff": "tiff",
    "image/webp": "webp",
    "text/plain": "txt",
    "text/csv": "csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  return map[mimeType] ?? "bin";
}

function arrayBufferToBase64(buffer: ArrayBufferLike): string {
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
