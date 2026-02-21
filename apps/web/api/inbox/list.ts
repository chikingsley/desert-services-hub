/**
 * Inbox List API
 *
 * GET /api/inbox — thread-based inbox view
 *
 * Groups emails by conversation_id, returning the latest email per thread
 * with a message count. Supports mailbox, classification, project, and
 * full-text search filtering.
 */

import { db } from "@lib/db/client";
import { parseEmailRow } from "@lib/db/repositories/email";
import { z } from "zod";

const inboxQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(50),
  mailbox: z.coerce.number().int().positive().optional().catch(undefined),
  classification: z.string().trim().optional().catch(undefined),
  project_id: z.coerce.number().int().positive().optional().catch(undefined),
  search: z.string().trim().catch(""),
});

const THREAD_COLUMNS = `
  e.id, e.message_id, e.internet_message_id, e.mailbox_id, e.conversation_id,
  e.subject, e.normalized_subject, e.from_email, e.from_name, e.from_domain,
  e.to_emails, e.cc_emails, e.received_at,
  e.has_attachments, e.attachment_names, e.body_preview, e.web_url, e.categories,
  e.classification, e.classification_confidence, e.classification_method,
  e.project_name, e.contractor_name, e.account_id, e.project_id,
  e.thread_id, e.is_internal, e.is_forwarded,
  e.original_sender_email, e.original_sender_domain,
  e.is_platform_email, e.platform_name,
  e.real_sender_name, e.real_sender_company, e.real_sender_email, e.real_sender_domain,
  e.is_excluded, e.created_at
`;

export async function listInbox(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const params = inboxQuerySchema.parse(Object.fromEntries(url.searchParams));
    const offset = (params.page - 1) * params.limit;

    const conditions: string[] = ["e.is_excluded = 0"];
    const values: unknown[] = [];
    let idx = 1;

    if (params.mailbox) {
      conditions.push(`e.mailbox_id = $${idx}`);
      values.push(params.mailbox);
      idx++;
    }

    if (params.classification) {
      conditions.push(`e.classification = $${idx}`);
      values.push(params.classification);
      idx++;
    }

    if (params.project_id) {
      conditions.push(`e.project_id = $${idx}`);
      values.push(params.project_id);
      idx++;
    }

    if (params.search) {
      conditions.push(
        `e.search_vector @@ websearch_to_tsquery('english', $${idx})`
      );
      values.push(params.search);
      idx++;
    }

    const where = conditions.join(" AND ");
    const limitParam = `$${idx}`;
    const offsetParam = `$${idx + 1}`;

    // Thread-grouped query: for each conversation_id, take the row with the
    // latest received_at plus count the total messages in that thread.
    const query = `
      WITH ranked AS (
        SELECT
          ${THREAD_COLUMNS},
          ROW_NUMBER() OVER (
            PARTITION BY e.conversation_id
            ORDER BY e.received_at DESC
          ) AS rn,
          COUNT(*) OVER (PARTITION BY e.conversation_id) AS thread_count
        FROM emails e
        WHERE ${where}
      ),
      threads AS (
        SELECT *, COUNT(*) OVER ()::int AS total_threads
        FROM ranked
        WHERE rn = 1
      )
      SELECT *
      FROM threads
      ORDER BY received_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const rows = (await db
      .query(query)
      .all(...values, params.limit, offset)) as Record<string, unknown>[];

    const totalThreads = (rows[0]?.total_threads as number) ?? 0;

    const threads = rows.map((row) => ({
      ...parseEmailRow(row),
      threadCount: Number(row.thread_count) || 1,
    }));

    return Response.json({
      threads,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: totalThreads,
        totalPages: Math.ceil(totalThreads / params.limit),
      },
    });
  } catch (error) {
    console.error("Failed to list inbox:", error);
    return Response.json({ error: "Failed to list inbox" }, { status: 500 });
  }
}
