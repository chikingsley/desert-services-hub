/**
 * Email Attachments API
 *
 * Provides attachment listing and download for a specific email.
 */
import { createGraphClient } from "@email/sync/config";
import { db } from "@lib/db/hub";
import {
  getAttachmentById,
  getAttachmentsForEmail,
} from "@lib/db/repositories/attachment";

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

function parseAttachmentId(req: Request): number | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // /api/emails/:id/attachments/:attachmentId/download
  const attId = Number(parts[5]);
  if (!Number.isFinite(attId) || attId <= 0) {
    return null;
  }
  return attId;
}

export async function listEmailAttachments(req: Request): Promise<Response> {
  const emailId = parseEmailId(req);
  if (!emailId) {
    return Response.json({ error: "Invalid email ID" }, { status: 400 });
  }

  try {
    const attachments = await getAttachmentsForEmail(emailId);
    return Response.json({ attachments });
  } catch (error) {
    console.error("Failed to list email attachments:", error);
    return Response.json(
      { error: "Failed to list email attachments" },
      { status: 500 }
    );
  }
}

export async function downloadEmailAttachment(req: Request): Promise<Response> {
  const emailId = parseEmailId(req);
  const attachmentPk = parseAttachmentId(req);

  if (!emailId) {
    return Response.json({ error: "Invalid email ID" }, { status: 400 });
  }
  if (!attachmentPk) {
    return Response.json({ error: "Invalid attachment ID" }, { status: 400 });
  }

  try {
    const attachment = await getAttachmentById(attachmentPk);
    if (!attachment || attachment.emailId !== emailId) {
      return Response.json({ error: "Attachment not found" }, { status: 404 });
    }

    const emailRow = (await db
      .prepare("SELECT message_id, mailbox_id FROM emails WHERE id = ?")
      .get(emailId)) as {
      message_id: string;
      mailbox_id: number;
    } | null;

    if (!emailRow) {
      return Response.json({ error: "Email not found" }, { status: 404 });
    }

    const mailboxRow = (await db
      .prepare("SELECT email FROM mailboxes WHERE id = ?")
      .get(emailRow.mailbox_id)) as { email: string } | null;

    if (!mailboxRow?.email) {
      return Response.json(
        { error: "Mailbox not found for email" },
        { status: 404 }
      );
    }

    const client = createGraphClient();
    const buffer = await client.downloadAttachment(
      emailRow.message_id,
      attachment.attachmentId,
      mailboxRow.email
    );

    const url = new URL(req.url);
    const inline = url.searchParams.get("inline") === "1";
    const filename = safeFilename(attachment.name);
    const contentType = attachment.contentType ?? "application/octet-stream";

    // Use Uint8Array so TS treats it as a valid BodyInit across DOM/Node typings.
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.byteLength.toString(),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
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
