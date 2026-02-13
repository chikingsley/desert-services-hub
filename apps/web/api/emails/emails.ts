/**
 * Emails API handlers
 * Routes: GET /api/emails, GET /api/emails/:id, POST /api/emails/:id/classification
 */
import { db } from "@lib/db/hub";
import { parseEmailRow } from "@lib/db/repositories/email";
import { findEstimateCandidatesForEmail } from "@lib/db/repositories/estimate-email";

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

const ALLOWED_EMAIL_CLASSIFICATIONS = new Set([
  "CONTRACT",
  "DUST_PERMIT",
  "SWPPP",
  "ESTIMATE",
  "INSURANCE",
  "INVOICE",
  "PAYMENT",
  "HR",
  "IT",
  "SCHEDULE",
  "CHANGE_ORDER",
  "INTERNAL",
  "VENDOR",
  "SPAM",
  "UNKNOWN",
]);

interface EmailStatsRow {
  total: number;
  estimates: number;
  contracts: number;
  dust_permits: number;
  invoices: number;
  payments: number;
  hr: number;
  it: number;
  internal: number;
  docusign: number;
  with_attachments: number;
  excluded: number;
}

const STATS_CACHE_TTL_MS = 30_000;
const EMAIL_LIST_DEDUP_COUNT_CACHE_TTL_MS = 30_000;
const statsCache = new Map<
  string,
  { expiresAt: number; value: EmailStatsRow | null }
>();
const emailListDedupCountCache = new Map<
  string,
  { expiresAt: number; value: number }
>();
let hasSearchDocumentColumn: boolean | null = null;
let hasEmailListDedupMv: boolean | null = null;

async function supportsSearchDocument(): Promise<boolean> {
  if (hasSearchDocumentColumn != null) {
    return hasSearchDocumentColumn;
  }

  const row = (await db
    .prepare(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'emails'
         AND column_name = 'search_document'
       LIMIT 1`
    )
    .get()) as { "?column?": number } | null;

  hasSearchDocumentColumn = Boolean(row);
  return hasSearchDocumentColumn;
}

async function getEmailStatsCached(
  showExcluded: boolean
): Promise<EmailStatsRow | null> {
  const key = showExcluded ? "all" : "active";
  const now = Date.now();
  const cached = statsCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const statsWhere = showExcluded ? "" : "WHERE is_excluded = 0";
  const value = (await db
    .prepare(
      `SELECT
        count(*)::int as total,
        count(*) FILTER (WHERE classification = 'ESTIMATE')::int as estimates,
        count(*) FILTER (WHERE classification = 'CONTRACT')::int as contracts,
        count(*) FILTER (WHERE classification = 'DUST_PERMIT')::int as dust_permits,
        count(*) FILTER (WHERE classification = 'INVOICE')::int as invoices,
        count(*) FILTER (WHERE classification = 'PAYMENT')::int as payments,
        count(*) FILTER (WHERE classification = 'HR')::int as hr,
        count(*) FILTER (WHERE classification = 'IT')::int as it,
        count(*) FILTER (WHERE classification = 'INTERNAL')::int as internal,
        count(*) FILTER (WHERE from_domain = 'docusign.net')::int as docusign,
        count(*) FILTER (WHERE has_attachments = 1)::int as with_attachments,
        (SELECT count(*)::int FROM emails WHERE is_excluded = 1) as excluded
      FROM emails ${statsWhere}`
    )
    .get()) as EmailStatsRow | null;

  statsCache.set(key, { expiresAt: now + STATS_CACHE_TTL_MS, value });
  return value;
}

async function supportsEmailListDedupMv(): Promise<boolean> {
  if (hasEmailListDedupMv != null) {
    return hasEmailListDedupMv;
  }

  const row = (await db
    .prepare(
      `SELECT 1
       FROM pg_matviews
       WHERE schemaname = current_schema()
         AND matviewname = 'email_list_dedup_mv'
       LIMIT 1`
    )
    .get()) as { "?column?": number } | null;

  hasEmailListDedupMv = Boolean(row);
  return hasEmailListDedupMv;
}

async function getEmailListDedupMvCountCached(): Promise<number> {
  const key = "active";
  const now = Date.now();
  const cached = emailListDedupCountCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const row = (await db
    .prepare("SELECT count(*)::int AS total FROM email_list_dedup_mv")
    .get()) as { total: number } | null;
  const value = row?.total ?? 0;
  emailListDedupCountCache.set(key, {
    expiresAt: now + EMAIL_LIST_DEDUP_COUNT_CACHE_TTL_MS,
    value,
  });
  return value;
}

function parseEmailIdFromPath(req: Request): number | null {
  const parts = new URL(req.url).pathname.split("/");
  // /api/emails/:id or /api/emails/:id/classification
  const raw = Number(parts[3]);
  if (!Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return raw;
}

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
    const classification = url.searchParams.get("classification")?.trim() || "";
    const sendersRaw = url.searchParams.get("senders")?.trim() || "";
    const senders = sendersRaw
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    const hasAttachments = url.searchParams.get("has_attachments");
    const showExcluded = url.searchParams.get("show_excluded");
    const onlyExcluded = url.searchParams.get("only_excluded");
    const excludeClassificationsRaw =
      url.searchParams.get("exclude_classifications")?.trim() || "";
    const excludeClassifications = excludeClassificationsRaw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const includeExcluded = showExcluded === "1" || showExcluded === "true";
    const onlyExcludedOn = onlyExcluded === "1" || onlyExcluded === "true";
    const hasAttachmentFilterOn =
      hasAttachments === "1" || hasAttachments === "true";
    const hasVisibilityOrAttachmentFilter =
      includeExcluded || onlyExcludedOn || hasAttachmentFilterOn;
    const hasAnyListFilter =
      hasVisibilityOrAttachmentFilter ||
      Boolean(search || from || classification) ||
      senders.length > 0 ||
      excludeClassifications.length > 0;
    const canUseDedupMv =
      !hasAnyListFilter && (await supportsEmailListDedupMv());
    const offset = (page - 1) * limit;

    if (canUseDedupMv) {
      const [emails, total, statsResult] = await Promise.all([
        db
          .prepare(
            `SELECT *, recipient_count
             FROM email_list_dedup_mv
             ORDER BY received_at DESC
             LIMIT ? OFFSET ?`
          )
          .all(limit, offset) as Promise<Record<string, unknown>[]>,
        getEmailListDedupMvCountCached(),
        getEmailStatsCached(false),
      ]);

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
          it: statsResult?.it ?? 0,
          internal: statsResult?.internal ?? 0,
          docusign: statsResult?.docusign ?? 0,
          withAttachments: statsResult?.with_attachments ?? 0,
          excluded: statsResult?.excluded ?? 0,
        },
      });
    }

    // Build WHERE clause (applied before dedup)
    const conditions: string[] = [];
    const params: unknown[] = [];

    // Spam filter behavior:
    // - only_excluded=1: show only excluded emails
    // - otherwise: excluded emails are hidden unless show_excluded=1
    if (onlyExcluded === "1" || onlyExcluded === "true") {
      conditions.push("is_excluded = 1");
    } else if (showExcluded !== "1" && showExcluded !== "true") {
      conditions.push("is_excluded = 0");
    }

    if (search) {
      const like = `%${search}%`;
      const hasSearchDocument = await supportsSearchDocument();
      if (hasSearchDocument) {
        // Fast path: keep this index-backed to avoid full table scans.
        conditions.push(
          "search_document @@ websearch_to_tsquery('english', ?)"
        );
        params.push(search);
      } else {
        // Fallback for environments missing the search_document migration.
        conditions.push(`(
          coalesce(subject, '') ILIKE ?
          OR coalesce(from_name, '') ILIKE ?
          OR coalesce(from_email, '') ILIKE ?
          OR coalesce(body_preview, '') ILIKE ?
          OR coalesce(project_name, '') ILIKE ?
          OR coalesce(contractor_name, '') ILIKE ?
          OR coalesce(attachment_names, '') ILIKE ?
          OR coalesce(real_sender_name, '') ILIKE ?
          OR coalesce(real_sender_email, '') ILIKE ?
          OR coalesce(original_sender_email, '') ILIKE ?
          OR coalesce(original_sender_domain, '') ILIKE ?
          OR coalesce(real_sender_company, '') ILIKE ?
        )`);
        params.push(
          like,
          like,
          like,
          like,
          like,
          like,
          like,
          like,
          like,
          like,
          like,
          like
        );
      }
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

    if (senders.length > 0) {
      const placeholders = senders.map(() => "?").join(", ");
      conditions.push(`(
        lower(from_email) IN (${placeholders})
        OR lower(real_sender_email) IN (${placeholders})
        OR lower(original_sender_email) IN (${placeholders})
      )`);
      params.push(...senders, ...senders, ...senders);
    }

    if (excludeClassifications.length > 0) {
      const placeholders = excludeClassifications.map(() => "?").join(", ");
      conditions.push(
        `(classification IS NULL OR classification NOT IN (${placeholders}))`
      );
      params.push(...excludeClassifications);
    }

    if (hasAttachments === "1" || hasAttachments === "true") {
      conditions.push("has_attachments = 1");
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Dedup key: for platform senders that generate unique emails per recipient,
    // group by content (subject+sender+hour). For everything else, group by Message-ID.
    const DEDUP_KEY = `CASE
        WHEN from_domain IN (
          'buildingconnected.com','planhub.com','cyberhoot.com',
          'texturacorp.com','worklio.com','avanan-mail.net'
        ) OR from_domain LIKE '%bidmail.com'
          OR from_domain LIKE '%procoretech.com'
        THEN normalized_subject || '|' || COALESCE(from_name,'') || '|' || floor(extract(epoch from timezone('UTC', received_at)) / 3600)::bigint::text
        ELSE COALESCE(internet_message_id, message_id)::text
      END`;

    const dedupQuery = `
      WITH base AS (
        SELECT
          ${LIST_COLUMNS},
          ${DEDUP_KEY} AS dedup_key
        FROM emails
        ${where}
      ),
      filtered AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY dedup_key
            ORDER BY id
          ) AS rn,
          COUNT(*) OVER (
            PARTITION BY dedup_key
          ) AS recipient_count
        FROM base
      ),
      deduped AS (
        SELECT
          *,
          COUNT(*) OVER ()::int AS total
        FROM filtered
        WHERE rn = 1
      )
      SELECT *, recipient_count, total
      FROM deduped
      ORDER BY received_at DESC
      LIMIT ? OFFSET ?
    `;

    const [emails, statsResult] = await Promise.all([
      db.prepare(dedupQuery).all(...params, limit, offset) as Promise<
        Record<string, unknown>[]
      >,
      getEmailStatsCached(includeExcluded),
    ]);

    const total = Number(emails[0]?.total) || 0;

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
        it: statsResult?.it ?? 0,
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

// GET /api/emails/senders — top sender list for multi-select filter
// Query: q?: string, limit?: number
export async function listEmailSenders(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || "";
    const limit = Math.min(
      100,
      Math.max(5, Number(url.searchParams.get("limit")) || 25)
    );

    const qLike = `%${q}%`;

    const rows = (await db
      .prepare(
        `WITH candidates AS (
          SELECT lower(from_email) AS email, nullif(trim(from_name), '') AS display_name
          FROM emails
          WHERE from_email IS NOT NULL
          UNION ALL
          SELECT lower(real_sender_email) AS email, nullif(trim(real_sender_name), '') AS display_name
          FROM emails
          WHERE real_sender_email IS NOT NULL
          UNION ALL
          SELECT lower(original_sender_email) AS email, NULL::text AS display_name
          FROM emails
          WHERE original_sender_email IS NOT NULL
        )
        SELECT
          email,
          coalesce(max(display_name), email) AS display_name,
          count(*)::int AS count
        FROM candidates
        WHERE email IS NOT NULL
          AND email <> ''
          AND (? = '' OR email ILIKE ? OR coalesce(display_name, '') ILIKE ?)
        GROUP BY email
        ORDER BY count DESC, email ASC
        LIMIT ?`
      )
      .all(q, qLike, qLike, limit)) as {
      email: string;
      display_name: string;
      count: number;
    }[];

    return Response.json({
      senders: rows.map((r) => ({
        email: r.email,
        displayName: r.display_name,
        count: r.count,
      })),
    });
  } catch (error) {
    console.error("Failed to list email senders:", error);
    return Response.json(
      { error: "Failed to list email senders" },
      { status: 500 }
    );
  }
}

// GET /api/emails/:id — single email with full body + sibling recipients
export async function getEmail(req: Request): Promise<Response> {
  try {
    const emailId = parseEmailIdFromPath(req);
    if (!emailId) {
      return Response.json({ error: "Invalid email ID" }, { status: 400 });
    }

    const row = (await db
      .prepare("SELECT * FROM emails WHERE id = ?")
      .get(emailId)) as Record<string, unknown> | null;

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

// GET /api/emails/:id/estimate-candidates — ranked estimate linking suggestions
export async function getEmailEstimateCandidates(
  req: Request
): Promise<Response> {
  try {
    const emailId = parseEmailIdFromPath(req);
    if (!emailId) {
      return Response.json({ error: "Invalid email ID" }, { status: 400 });
    }

    const url = new URL(req.url);
    const limit = Math.min(
      25,
      Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "10", 10))
    );

    const result = await findEstimateCandidatesForEmail(emailId, { limit });
    if (!result) {
      return Response.json({ error: "Email not found" }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    console.error("Failed to fetch estimate candidates for email:", error);
    return Response.json(
      { error: "Failed to fetch estimate candidates" },
      { status: 500 }
    );
  }
}

// POST /api/emails/:id/classification — classify/exclude a single email only
// Body: { classification?: string | null, is_excluded?: boolean }
export async function setEmailClassification(req: Request): Promise<Response> {
  try {
    const emailId = parseEmailIdFromPath(req);
    if (!emailId) {
      return Response.json({ error: "Invalid email ID" }, { status: 400 });
    }

    const body = (await req.json()) as {
      classification?: string | null;
      is_excluded?: boolean;
    };

    const rawClassification = body.classification;
    const classification =
      rawClassification == null ? null : rawClassification.trim().toUpperCase();
    const method = classification ? "manual" : null;

    if (classification && !ALLOWED_EMAIL_CLASSIFICATIONS.has(classification)) {
      return Response.json(
        { error: `Invalid classification: ${classification}` },
        { status: 400 }
      );
    }

    const row = (await db
      .prepare("SELECT id FROM emails WHERE id = ?")
      .get(emailId)) as { id: number } | null;
    if (!row) {
      return Response.json({ error: "Email not found" }, { status: 404 });
    }

    const isExcluded = body.is_excluded;
    if (isExcluded === undefined) {
      await db
        .prepare(
          `UPDATE emails
           SET classification = ?,
               classification_confidence = NULL,
               classification_method = ?
           WHERE id = ?`
        )
        .run(classification, method, emailId);
    } else {
      await db
        .prepare(
          `UPDATE emails
           SET classification = ?,
               classification_confidence = NULL,
               classification_method = ?,
               is_excluded = ?
           WHERE id = ?`
        )
        .run(classification, method, isExcluded ? 1 : 0, emailId);
    }

    return Response.json({
      id: emailId,
      classification,
      is_excluded: isExcluded ?? null,
      scope: "single_email",
    });
  } catch (error) {
    console.error("Failed to set single-email classification:", error);
    return Response.json(
      { error: "Failed to set single-email classification" },
      { status: 500 }
    );
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
    const domainCondition = "(from_domain = ? OR from_domain LIKE ?)";
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
