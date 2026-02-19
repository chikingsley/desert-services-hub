/* global Deno */

import { json } from "../_shared/queue.ts";

interface IncomingAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: string;
}

interface FileLink {
  url: string;
  source: "onedrive" | "egnyte" | "dropbox";
}

interface IncomingPayload {
  forwarderEmail: string;
  forwardedAt: string;
  originalSubject: string;
  originalFrom: string;
  bodyText: string;
  bodyHasContent?: boolean;
  attachments: IncomingAttachment[];
  fileLinks?: FileLink[];
}

const BACKGROUND_JOBS_WEBHOOK_URL =
  Deno.env.get("BACKGROUND_JOBS_WEBHOOK_URL") ?? "http://background-jobs:4747";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  let body: IncomingPayload;
  try {
    body = (await req.json()) as IncomingPayload;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const hasAttachments = (body.attachments?.length ?? 0) > 0;
  const hasLinks = (body.fileLinks?.length ?? 0) > 0;
  const hasBody = body.bodyHasContent === true;

  if (!(hasAttachments || hasLinks || hasBody)) {
    return json(
      { error: "No attachments, links, or body content provided" },
      400
    );
  }

  const upstream = await fetch(
    `${BACKGROUND_JOBS_WEBHOOK_URL}/api/webhooks/intake`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
});
