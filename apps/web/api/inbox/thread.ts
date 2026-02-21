/**
 * Thread View API
 *
 * GET /api/inbox/thread/:conversationId — full conversation thread
 *
 * Returns all emails sharing the same conversation_id, ordered
 * chronologically. Includes full bodies (body_full, body_html) and
 * mailbox info for each message.
 */

import { db } from "@lib/db/client";
import { parseEmailRow } from "@lib/db/repositories/email";

export async function getThread(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/");
    // /api/inbox/thread/:conversationId
    const conversationId = decodeURIComponent(parts[4] ?? "");

    if (!conversationId) {
      return Response.json(
        { error: "conversation_id is required" },
        { status: 400 }
      );
    }

    // Fetch all emails in this conversation with full bodies
    const emailRows = (await db
      .query(
        `SELECT e.*, m.email AS mailbox_email, m.display_name AS mailbox_display_name
         FROM emails e
         JOIN mailboxes m ON m.id = e.mailbox_id
         WHERE e.conversation_id = $1
         ORDER BY e.received_at ASC`
      )
      .all(conversationId)) as Record<string, unknown>[];

    if (emailRows.length === 0) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }

    const emails = emailRows.map((row) => ({
      ...parseEmailRow(row),
      mailboxEmail: row.mailbox_email as string,
      mailboxDisplayName: row.mailbox_display_name as string | null,
    }));

    // Gather thread-level metadata from the latest email
    const latest = emails.at(-1);
    const projectId = emails.find((e) => e.projectId)?.projectId ?? null;
    const classification =
      emails.find((e) => e.classification)?.classification ?? null;

    // Deduplicate mailboxes that received messages in this thread
    const mailboxes = [
      ...new Map(
        emailRows.map((r) => [
          r.mailbox_id as number,
          {
            id: r.mailbox_id as number,
            email: r.mailbox_email as string,
            displayName: r.mailbox_display_name as string | null,
          },
        ])
      ).values(),
    ];

    return Response.json({
      conversationId,
      subject: latest?.subject ?? null,
      classification,
      projectId,
      messageCount: emails.length,
      mailboxes,
      emails,
    });
  } catch (error) {
    console.error("Failed to fetch thread:", error);
    return Response.json({ error: "Failed to fetch thread" }, { status: 500 });
  }
}
