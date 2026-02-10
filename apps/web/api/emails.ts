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
  project_name, contractor_name, account_id, project_id,
  thread_id, is_internal, is_forwarded,
  original_sender_email, original_sender_domain,
  is_platform_email, platform_name,
  real_sender_name, real_sender_company, real_sender_email, real_sender_domain,
  is_excluded, created_at
`;

// GET /api/emails — paginated, deduplicated, spam-filtered list
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
    const classification =
      url.searchParams.get("classification")?.trim() || "";
    const hasAttachments = url.searchParams.get("has_attachments");
    const showExcluded = url.searchParams.get("show_excluded");

    // Build WHERE clause (applied before dedup)
    const conditions: string[] = [];
    const params: unknown[] = [];

    // Spam filter: exclude by default
    if (showExcluded !== "1" && showExcluded !== "true") {
      conditions.push("is_excluded = 0");
    }

    if (search) {
      conditions.push("search_document @@ plainto_tsquery('english', ?)");
      params.push(search);
    }

    if (from) {
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

    // Dedup key: for platform senders that generate unique emails per recipient,
    // group by content (subject+sender+hour). For everything else, group by Message-ID.
    const DEDUP_KEY = `CASE
        WHEN from_domain IN (
          'buildingconnected.com','planhub.com','cyberhoot.com',
          'texturacorp.com','worklio.com','avanan-mail.net'
        ) OR from_domain LIKE '%bidmail.com'
          OR from_domain LIKE '%procoretech.com'
        THEN normalized_subject || '|' || COALESCE(from_name,'') || '|' || date_trunc('hour', received_at)
        ELSE COALESCE(internet_message_id, message_id)::text
      END`;

    const dedupQuery = `
      WITH filtered AS (
        SELECT ${LIST_COLUMNS},
          ROW_NUMBER() OVER (
            PARTITION BY ${DEDUP_KEY}
            ORDER BY id
          ) AS rn,
          COUNT(*) OVER (
            PARTITION BY ${DEDUP_KEY}
          ) AS recipient_count
        FROM emails
        ${where}
      )
      SELECT *, recipient_count
      FROM filtered
      WHERE rn = 1
      ORDER BY received_at DESC
      LIMIT ? OFFSET ?
    `;

    const dedupCountQuery = `
      WITH filtered AS (
        SELECT
          ROW_NUMBER() OVER (
            PARTITION BY ${DEDUP_KEY}
            ORDER BY id
          ) AS rn
        FROM emails
        ${where}
      )
      SELECT count(*)::int AS total FROM filtered WHERE rn = 1
    `;

    const statsWhere =
      showExcluded !== "1" && showExcluded !== "true"
        ? "WHERE is_excluded = 0"
        : "";

    const [emails, countResult, statsResult] = await Promise.all([
      db
        .prepare(dedupQuery)
        .all(...params, limit, offset) as Promise<Record<string, unknown>[]>,
      db
        .prepare(dedupCountQuery)
        .get(...params) as Promise<{ total: number } | null>,
      db
        .prepare(
          `SELECT
            count(*)::int as total,
            count(*) FILTER (WHERE classification = 'ESTIMATE')::int as estimates,
            count(*) FILTER (WHERE classification = 'CONTRACT')::int as contracts,
            count(*) FILTER (WHERE classification = 'DUST_PERMIT')::int as dust_permits,
            count(*) FILTER (WHERE classification = 'INVOICE')::int as invoices,
            count(*) FILTER (WHERE classification = 'PAYMENT')::int as payments,
            count(*) FILTER (WHERE classification = 'HR')::int as hr,
            count(*) FILTER (WHERE classification = 'INTERNAL')::int as internal,
            count(*) FILTER (WHERE from_domain = 'docusign.net')::int as docusign,
            count(*) FILTER (WHERE has_attachments = 1)::int as with_attachments,
            (SELECT count(*)::int FROM emails WHERE is_excluded = 1) as excluded
          FROM emails ${statsWhere}`
        )
        .get() as Promise<{
        total: number;
        estimates: number;
        contracts: number;
        dust_permits: number;
        invoices: number;
        payments: number;
        hr: number;
        internal: number;
        docusign: number;
        with_attachments: number;
        excluded: number;
      } | null>,
    ]);

    const total = countResult?.total ?? 0;

    const parsed = emails.map((row) => ({
      ...parseEmailRow({ ...row, body_full: null, body_html: null }),
      recipientCount: Number(row.recipient_count) || 1,
    }));

    return Response.json({
      emails: parsed,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total: statsResult?.total ?? 0,
        estimates: statsResult?.estimates ?? 0,
        contracts: statsResult?.contracts ?? 0,
        dustPermits: statsResult?.dust_permits ?? 0,
        invoices: statsResult?.invoices ?? 0,
        payments: statsResult?.payments ?? 0,
        hr: statsResult?.hr ?? 0,
        internal: statsResult?.internal ?? 0,
        docusign: statsResult?.docusign ?? 0,
        withAttachments: statsResult?.with_attachments ?? 0,
        excluded: statsResult?.excluded ?? 0,
      },
    });
  } catch (error) {
    console.error("Failed to fetch emails:", error);
    return Response.json({ error: "Failed to fetch emails" }, { status: 500 });
  }
}

// GET /api/emails/:id — single email with full body + sibling recipients
export async function getEmail(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const id = url.pathname.split("/").pop();

    if (!id || Number.isNaN(Number(id))) {
      return Response.json({ error: "Invalid email ID" }, { status: 400 });
    }

    const row = (await db
      .prepare("SELECT * FROM emails WHERE id = ?")
      .get(Number(id))) as Record<string, unknown> | null;

    if (!row) {
      return Response.json({ error: "Email not found" }, { status: 404 });
    }

    const internetMsgId = row.internet_message_id as string | null;
    let recipients: { mailbox: string; receivedAt: string }[] = [];

    if (internetMsgId) {
      const siblings = (await db
        .prepare(
          `SELECT m.email as mailbox, e.received_at
           FROM emails e
           JOIN mailboxes m ON m.id = e.mailbox_id
           WHERE e.internet_message_id = ?
           ORDER BY m.email`
        )
        .all(internetMsgId)) as {
        mailbox: string;
        received_at: string;
      }[];

      recipients = siblings.map((s) => ({
        mailbox: s.mailbox,
        receivedAt: s.received_at,
      }));
    }

    return Response.json({
      email: parseEmailRow(row),
      recipients,
    });
  } catch (error) {
    console.error("Failed to fetch email:", error);
    return Response.json({ error: "Failed to fetch email" }, { status: 500 });
  }
}

// POST /api/emails/domain-rule — set classification or spam for a domain
// Body: { domain: string, classification?: string, is_excluded?: boolean }
export async function setDomainRule(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as {
      domain?: string;
      classification?: string | null;
      is_excluded?: boolean;
    };
    const domain = body.domain?.trim().toLowerCase();

    if (!domain) {
      return Response.json({ error: "domain is required" }, { status: 400 });
    }

    const classification = body.classification ?? null;
    const isExcluded = body.is_excluded ?? false;

    // Upsert the domain rule
    await db.run(
      `INSERT INTO domain_rules (domain, classification, is_excluded)
       VALUES (?, ?, ?)
       ON CONFLICT (domain) DO UPDATE SET
         classification = excluded.classification,
         is_excluded = excluded.is_excluded`,
      [domain, classification, isExcluded]
    );

    // Apply to existing emails: exact domain + subdomains
    const domainCondition = `(from_domain = ? OR from_domain LIKE ?)`;
    const domainParams = [domain, `%.${domain}`];

    if (isExcluded) {
      await db
        .prepare(
          `UPDATE emails SET is_excluded = 1 WHERE is_excluded = 0 AND ${domainCondition}`
        )
        .run(...domainParams);
    }

    if (classification) {
      await db
        .prepare(
          `UPDATE emails SET classification = ?, classification_method = 'domain_rule'
           WHERE ${domainCondition}`
        )
        .run(classification, ...domainParams);
    }

    console.log(
      `[domain-rule] ${domain}: classification=${classification}, excluded=${isExcluded}`
    );

    return Response.json({ domain, classification, is_excluded: isExcluded });
  } catch (error) {
    console.error("Failed to set domain rule:", error);
    return Response.json(
      { error: "Failed to set domain rule" },
      { status: 500 }
    );
  }
}

// GET /api/emails/domain-rules — list all domain rules
export async function listDomainRules(_req: Request): Promise<Response> {
  try {
    const rules = (await db
      .prepare(
        "SELECT domain, classification, is_excluded, created_at FROM domain_rules ORDER BY domain"
      )
      .all()) as {
      domain: string;
      classification: string | null;
      is_excluded: boolean;
      created_at: string;
    }[];

    return Response.json({ rules });
  } catch (error) {
    console.error("Failed to list domain rules:", error);
    return Response.json(
      { error: "Failed to list domain rules" },
      { status: 500 }
    );
  }
}

// POST /api/emails/spam — convenience wrapper for blocking a domain
export async function markDomainAsSpam(req: Request): Promise<Response> {
  const body = (await req.json()) as { domain?: string };
  const spamReq = new Request(req.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain: body.domain, is_excluded: true }),
  });
  return setDomainRule(spamReq);
}
