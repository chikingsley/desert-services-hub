/**
 * Emails API handlers
 * Routes: GET /api/emails, GET /api/emails/:id, POST /api/emails/:id/classification
 */
import { db } from "@lib/db/client";
import { parseEmailRow } from "@lib/db/repositories/email";
import { findEstimateCandidatesForEmail } from "@lib/db/repositories/estimate-email";
import { listEmails as listEmailsHandler } from "./list-emails";

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
export function listEmails(req: Request): Promise<Response> {
  return listEmailsHandler(req);
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
      .query(
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
          AND ($1 = '' OR email ILIKE $2 OR coalesce(display_name, '') ILIKE $3)
        GROUP BY email
        ORDER BY count DESC, email ASC
        LIMIT $4`
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
      .query("SELECT * FROM emails WHERE id = $1")
      .get(emailId)) as Record<string, unknown> | null;

    if (!row) {
      return Response.json({ error: "Email not found" }, { status: 404 });
    }

    const internetMsgId = row.internet_message_id as string | null;
    let recipients: { mailbox: string; receivedAt: string }[] = [];

    if (internetMsgId) {
      const siblings = (await db
        .query(
          `SELECT m.email as mailbox, e.received_at
           FROM emails e
           JOIN mailboxes m ON m.id = e.mailbox_id
           WHERE e.internet_message_id = $1
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
      .query("SELECT id FROM emails WHERE id = $1")
      .get(emailId)) as { id: number } | null;
    if (!row) {
      return Response.json({ error: "Email not found" }, { status: 404 });
    }

    const isExcluded = body.is_excluded;
    if (isExcluded === undefined) {
      await db
        .query(
          `UPDATE emails
           SET classification = $1,
               classification_confidence = NULL,
               classification_method = $2
           WHERE id = $3`
        )
        .run(classification, method, emailId);
    } else {
      await db
        .query(
          `UPDATE emails
           SET classification = $1,
               classification_confidence = NULL,
               classification_method = $2,
               is_excluded = $3
           WHERE id = $4`
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
       VALUES ($1, $2, $3)
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
        .query(
          `UPDATE emails SET is_excluded = 1 WHERE is_excluded = 0 AND ${domainCondition}`
        )
        .run(...domainParams);
    }

    if (classification) {
      await db
        .query(
          `UPDATE emails SET classification = $1, classification_method = 'domain_rule'
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
      .query(
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
