/**
 * Emails API handlers
 * Routes: GET /api/emails, GET /api/emails/:id
 */
import { db } from "@lib/db/hub";
import { parseEmailRow } from "@lib/db/repositories/email";

// Columns for list view — exclude body_full, body_html (can be huge)
const LIST_COLUMNS = `
  id, message_id, internet_message_id, mailbox_id, conversation_id,
  subject, normalized_subject, from_email, from_name, from_domain,
  to_emails, cc_emails, received_at,
  has_attachments, attachment_names, body_preview, web_url, categories,
  classification, classification_confidence, classification_method,
  project_name, contractor_name, account_id, project_id, estimate_id,
  thread_id, is_internal, is_forwarded,
  original_sender_email, original_sender_domain,
  is_platform_email, platform_name,
  real_sender_name, real_sender_company, real_sender_email, real_sender_domain,
  is_excluded, created_at
`;

// GET /api/emails — paginated list with search + filters
export async function listEmails(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit")) || 50)
    );
    const search = url.searchParams.get("search")?.trim() || "";
    const from = url.searchParams.get("from")?.trim() || "";
    const classification = url.searchParams.get("classification")?.trim() || "";
    const hasAttachments = url.searchParams.get("has_attachments");

    // Build WHERE clause
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      conditions.push("search_document @@ plainto_tsquery('english', ?)");
      params.push(search);
    }

    if (from) {
      // If it looks like a domain (no @), match from_domain; otherwise ILIKE on from_email
      if (from.includes("@")) {
        conditions.push("from_email ILIKE ?");
        params.push(`%${from}%`);
      } else {
        conditions.push("from_domain = ?");
        params.push(from);
      }
    }

    if (classification) {
      conditions.push("classification = ?");
      params.push(classification);
    }

    if (hasAttachments === "1" || hasAttachments === "true") {
      conditions.push("has_attachments = 1");
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (page - 1) * limit;

    const [emails, countResult, statsResult] = await Promise.all([
      db
        .prepare(
          `SELECT ${LIST_COLUMNS}
           FROM emails
           ${where}
           ORDER BY received_at DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset) as Promise<Record<string, unknown>[]>,
      db
        .prepare(`SELECT count(*)::int as total FROM emails ${where}`)
        .get(...params) as Promise<{ total: number } | null>,
      db
        .prepare(
          `SELECT
            count(*)::int as total,
            count(*) FILTER (WHERE classification = 'CONTRACT')::int as contracts,
            count(*) FILTER (WHERE classification = 'DUST_PERMIT')::int as dust_permits,
            count(*) FILTER (WHERE classification = 'INVOICE')::int as invoices,
            count(*) FILTER (WHERE classification = 'INTERNAL')::int as internal,
            count(*) FILTER (WHERE from_domain = 'docusign.net')::int as docusign,
            count(*) FILTER (WHERE has_attachments = 1)::int as with_attachments
          FROM emails`
        )
        .get() as Promise<{
        total: number;
        contracts: number;
        dust_permits: number;
        invoices: number;
        internal: number;
        docusign: number;
        with_attachments: number;
      } | null>,
    ]);

    const total = countResult?.total ?? 0;

    // Parse rows — parseEmailRow handles JSON arrays, boolean conversion, etc.
    // We set body_full/body_html to null since we didn't select them
    const parsed = emails.map((row) =>
      parseEmailRow({ ...row, body_full: null, body_html: null })
    );

    return Response.json({
      emails: parsed,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats: {
        total: statsResult?.total ?? 0,
        contracts: statsResult?.contracts ?? 0,
        dustPermits: statsResult?.dust_permits ?? 0,
        invoices: statsResult?.invoices ?? 0,
        internal: statsResult?.internal ?? 0,
        docusign: statsResult?.docusign ?? 0,
        withAttachments: statsResult?.with_attachments ?? 0,
      },
    });
  } catch (error) {
    console.error("Failed to fetch emails:", error);
    return Response.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    );
  }
}

// GET /api/emails/:id — single email with full body
export async function getEmail(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const id = url.pathname.split("/").pop();

    if (!id || Number.isNaN(Number(id))) {
      return Response.json({ error: "Invalid email ID" }, { status: 400 });
    }

    const row = await db
      .prepare("SELECT * FROM emails WHERE id = ?")
      .get(Number(id)) as Record<string, unknown> | null;

    if (!row) {
      return Response.json({ error: "Email not found" }, { status: 404 });
    }

    return Response.json({ email: parseEmailRow(row) });
  } catch (error) {
    console.error("Failed to fetch email:", error);
    return Response.json(
      { error: "Failed to fetch email" },
      { status: 500 }
    );
  }
}
