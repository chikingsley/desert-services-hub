/**
 * Email Attachments API
 *
 * Provides attachment listing and download for a specific email.
 */
import { createGraphClient } from "@lib/graph/client";
import { db } from "@lib/db/client";
import {
  getAttachmentById,
  getAttachmentsForEmail,
} from "@lib/db/repositories/attachment";

interface ApiEmailAttachment {
  id: string; // "db:<pk>" or "graph:<graphAttachmentId>"
  name: string;
  contentType: string | null;
  size: number | null;
}

type AttachmentsSource = "db" | "graph" | "none";

interface ListEmailAttachmentsResponse {
  attachments: ApiEmailAttachment[];
  source: AttachmentsSource;
  unavailableReason?: string;
}

const NUMERIC_ID_RE = /^[0-9]+$/;

interface DownloadAttachmentMeta {
  graphAttachmentId: string;
  filename: string;
  contentType: string;
}

function safeFilename(name: string): string {
  // Avoid header injection / weird characters in Content-Disposition.
  const cleaned = name.replace(/[\r\n\t]/g, " ").trim();
  return cleaned || "attachment";
}

function parseEmailId(req: Request): number | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const id = Number(parts[3]); // /api/emails/:id/...
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }
  return id;
}

async function getEmailMessageAndMailbox(emailId: number): Promise<{
  messageId: string;
  mailboxEmail: string;
  hasAttachments: boolean;
} | null> {
  const emailRow = (await db
    .query(
      "SELECT message_id, mailbox_id, has_attachments FROM emails WHERE id = $1"
    )
    .get(emailId)) as {
    message_id: string;
    mailbox_id: number;
    has_attachments: number;
  } | null;

  if (!emailRow) {
    return null;
  }

  const mailboxRow = (await db
    .query("SELECT email FROM mailboxes WHERE id = $1")
    .get(emailRow.mailbox_id)) as { email: string } | null;

  if (!mailboxRow?.email) {
    return null;
  }

  return {
    messageId: emailRow.message_id,
    mailboxEmail: mailboxRow.email,
    hasAttachments: emailRow.has_attachments === 1,
  };
}

function parseAttachmentRef(
  rawRef: string
):
  | { kind: "db"; pk: number }
  | { kind: "graph"; graphAttachmentId: string }
  | { kind: "invalid" } {
  if (rawRef.startsWith("db:") || NUMERIC_ID_RE.test(rawRef)) {
    const pk = rawRef.startsWith("db:")
      ? Number(rawRef.slice(3))
      : Number(rawRef);
    if (!Number.isFinite(pk)) {
      return { kind: "invalid" };
    }
    return { kind: "db", pk };
  }

  if (rawRef.startsWith("graph:")) {
    return {
      kind: "graph",
      graphAttachmentId: rawRef.slice(6),
    };
  }

  return { kind: "invalid" };
}

async function resolveDbAttachmentDownloadMeta(
  emailId: number,
  pk: number
): Promise<DownloadAttachmentMeta | null> {
  const attachment = await getAttachmentById(pk);
  if (!attachment || attachment.emailId !== emailId) {
    return null;
  }

  return {
    graphAttachmentId: attachment.attachmentId,
    filename: attachment.name,
    contentType: attachment.contentType ?? "application/octet-stream",
  };
}

async function resolveGraphAttachmentDownloadMeta(
  messageId: string,
  mailboxEmail: string,
  graphAttachmentId: string
): Promise<DownloadAttachmentMeta> {
  const client = createGraphClient();
  const attachments = await client.getAttachments(messageId, mailboxEmail);
  const found = attachments.find(
    (attachment) => attachment.id === graphAttachmentId
  );

  return {
    graphAttachmentId,
    filename: found?.name ?? "attachment",
    contentType: found?.contentType ?? "application/octet-stream",
  };
}

export async function listEmailAttachments(req: Request): Promise<Response> {
  const emailId = parseEmailId(req);
  if (!emailId) {
    return Response.json({ error: "Invalid email ID" }, { status: 400 });
  }

  try {
    // Prefer DB attachments when present (cheap + stable IDs).
    const dbAttachments = await getAttachmentsForEmail(emailId);
    if (dbAttachments.length > 0) {
      const attachments: ApiEmailAttachment[] = dbAttachments.map((a) => ({
        id: `db:${a.id}`,
        name: a.name,
        contentType: a.contentType,
        size: a.size,
      }));
      return Response.json({
        attachments,
        source: "db",
      } satisfies ListEmailAttachmentsResponse);
    }

    // Fallback: ask Graph directly so UI works even when attachment metadata
    // wasn't persisted into the attachments table yet.
    const meta = await getEmailMessageAndMailbox(emailId);
    if (!meta) {
      return Response.json({
        attachments: [] satisfies ApiEmailAttachment[],
        source: "none",
        unavailableReason: "Email not found",
      } satisfies ListEmailAttachmentsResponse);
    }

    // Avoid expensive Graph calls when the message itself reports no attachments.
    if (!meta.hasAttachments) {
      return Response.json({
        attachments: [] satisfies ApiEmailAttachment[],
        source: "none",
      } satisfies ListEmailAttachmentsResponse);
    }

    try {
      const client = createGraphClient();
      const graphAttachments = await client.getAttachments(
        meta.messageId,
        meta.mailboxEmail
      );

      const attachments: ApiEmailAttachment[] = graphAttachments
        .filter((a) => !a.isInline)
        .map((a) => ({
          id: `graph:${a.id}`,
          name: a.name,
          contentType: a.contentType ?? null,
          size: a.size ?? null,
        }));

      return Response.json({
        attachments,
        source: "graph",
      } satisfies ListEmailAttachmentsResponse);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({
        attachments: [] satisfies ApiEmailAttachment[],
        source: "none",
        unavailableReason: `Graph unavailable: ${msg}`,
      } satisfies ListEmailAttachmentsResponse);
    }
  } catch (error) {
    console.error("Failed to list email attachments:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({
      attachments: [] satisfies ApiEmailAttachment[],
      source: "none",
      unavailableReason: `Failed to list attachments: ${msg}`,
    } satisfies ListEmailAttachmentsResponse);
  }
}

export async function downloadEmailAttachment(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const emailId = parseEmailId(req);
  const rawRef = parts[5] ? decodeURIComponent(parts[5]) : "";

  if (!emailId) {
    return Response.json({ error: "Invalid email ID" }, { status: 400 });
  }
  if (!rawRef) {
    return Response.json({ error: "Invalid attachment ID" }, { status: 400 });
  }

  try {
    const meta = await getEmailMessageAndMailbox(emailId);
    if (!meta) {
      return Response.json({ error: "Email not found" }, { status: 404 });
    }

    const parsedRef = parseAttachmentRef(rawRef);
    if (parsedRef.kind === "invalid") {
      return Response.json({ error: "Invalid attachment ID" }, { status: 400 });
    }

    const attachmentMeta =
      parsedRef.kind === "db"
        ? await resolveDbAttachmentDownloadMeta(emailId, parsedRef.pk)
        : await resolveGraphAttachmentDownloadMeta(
            meta.messageId,
            meta.mailboxEmail,
            parsedRef.graphAttachmentId
          );

    if (!attachmentMeta) {
      return Response.json({ error: "Attachment not found" }, { status: 404 });
    }

    const client = createGraphClient();
    const buffer = await client.downloadAttachment(
      meta.messageId,
      attachmentMeta.graphAttachmentId,
      meta.mailboxEmail
    );

    const inline = url.searchParams.get("inline") === "1";
    const safeName = safeFilename(attachmentMeta.filename);

    // Use Uint8Array so TS treats it as a valid BodyInit across DOM/Node typings.
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": attachmentMeta.contentType,
        "Content-Length": buffer.byteLength.toString(),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
        // Some browsers otherwise try to sniff.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to download email attachment:", error);
    return Response.json(
      { error: "Failed to download email attachment" },
      { status: 500 }
    );
  }
}
