import { parseBoolInt, parseJsonArray } from "@lib/db/parsers";
import { FROM_MAILBOX, type DbClient } from "./dust-permit-notif-helper";

export interface ReplyCandidate {
  bodyText: string | null;
  ccEmails: string[];
  chiEmailId: number | null;
  emailId: number;
  fromEmail: string | null;
  hasChiCopy: boolean;
  isForwarded: boolean;
  receivedAt: string;
  subject: string | null;
  toEmails: string[];
}

export interface ReplyRoute {
  mode: "reply-all" | "compose-new";
  replyToEmailId: number | null;
  candidates: ReplyCandidate[];
}

function parseEmails(value: unknown): string[] {
  return parseJsonArray(value).map((e) => String(e).trim()).filter(Boolean);
}

/**
 * Find emails related to a permit that could be the client's thread.
 * Searches by project_id first, falls back to text search on permitId/projectName.
 * Dedupes by internet_message_id, preferring Chi's mailbox copy.
 */
export async function findReplyCandidates(
  db: DbClient, permitId: string, projectName: string | null, projectId: number | null
): Promise<ReplyCandidate[]> {
  const searchTerms = [permitId, projectName].filter(Boolean) as string[];
  if (!searchTerms.length && !projectId) return [];

  const clauses = ["COALESCE(e.is_excluded, 0) = 0", "e.received_at >= now() - interval '365 days'"];
  const params: Array<string | number> = [];

  if (projectId) {
    params.push(projectId);
    clauses.push(`e.project_id = $${params.length}`);
  } else {
    const textClauses = searchTerms.map((t) => {
      params.push(`%${t}%`);
      return `(COALESCE(e.subject,'') ILIKE $${params.length} OR COALESCE(e.body_preview,'') ILIKE $${params.length} OR COALESCE(e.body_full,'') ILIKE $${params.length})`;
    });
    clauses.push(`(${textClauses.join(" OR ")})`);
  }

  params.push(FROM_MAILBOX);
  const chiIdx = params.length;
  params.push(100);
  const limitIdx = params.length;

  const rows = await db.query<{
    body_text: string | null; cc_emails: string | null; chi_email_id: number | null;
    email_id: number; from_email: string | null; has_chi_copy: boolean | number;
    is_forwarded: boolean | number; received_at: string; subject: string | null;
    to_emails: string | null;
  }>(
    `WITH matched AS (
       SELECT e.id, e.subject, e.from_email, e.to_emails, e.cc_emails,
              e.is_forwarded, e.received_at, m.email AS mailbox_email,
              COALESCE(NULLIF(e.internet_message_id, ''), NULLIF(e.message_id, ''), 'id:' || e.id::text) AS message_key,
              COALESCE(NULLIF(e.body_full, ''), NULLIF(e.body_preview, ''), '') AS body_text
       FROM emails e JOIN mailboxes m ON m.id = e.mailbox_id
       WHERE ${clauses.join(" AND ")}
     ), ranked AS (
       SELECT matched.*,
         MAX(CASE WHEN lower(matched.mailbox_email) = lower($${chiIdx}) THEN matched.id END)
           OVER (PARTITION BY matched.message_key) AS chi_email_id,
         MAX(CASE WHEN lower(matched.mailbox_email) = lower($${chiIdx}) THEN matched.id END)
           OVER (PARTITION BY matched.message_key) IS NOT NULL AS has_chi_copy,
         ROW_NUMBER() OVER (
           PARTITION BY matched.message_key
           ORDER BY CASE WHEN lower(matched.mailbox_email) = lower($${chiIdx}) THEN 0 ELSE 1 END,
                    matched.received_at DESC, matched.id DESC
         ) AS rn
       FROM matched
     )
     SELECT id AS email_id, chi_email_id, subject, from_email, to_emails, cc_emails,
            is_forwarded, received_at::text, body_text, has_chi_copy
     FROM ranked WHERE rn = 1
     ORDER BY received_at DESC, email_id DESC
     LIMIT $${limitIdx}`
  ).all(...params);

  return rows.map((r) => ({
    bodyText: r.body_text,
    ccEmails: parseEmails(r.cc_emails),
    chiEmailId: r.chi_email_id,
    emailId: r.email_id,
    fromEmail: r.from_email,
    hasChiCopy: parseBoolInt(r.has_chi_copy),
    isForwarded: parseBoolInt(r.is_forwarded),
    receivedAt: r.received_at,
    subject: r.subject,
    toEmails: parseEmails(r.to_emails),
  }));
}

/**
 * Score and select the best email thread to reply-all on.
 * Prefers: external sender, Chi mailbox copy, mentions permit ID, dust permit topic.
 * Avoids: maricopa.gov senders, internal senders, billing threads, forwards.
 */
export function selectReplyRoute(candidates: ReplyCandidate[], permitId: string, projectName: string | null): ReplyRoute {
  const scored = candidates.map((c) => {
    let score = 0;
    const from = c.fromEmail?.toLowerCase() ?? "";
    const haystack = `${c.subject ?? ""} ${c.bodyText ?? ""}`.toLowerCase();

    score += c.hasChiCopy ? 45 : -25;

    if (!from.endsWith("@desertservices.net") && !from.endsWith("@maricopa.gov")) score += 60;
    else if (from === "no-reply@maricopa.gov") score -= 80;
    else if (from.endsWith("@maricopa.gov")) score -= 140;
    else score -= 120;

    if (c.isForwarded) score -= 60;
    if (/^(re|fw|fwd):/i.test((c.subject ?? "").trim())) score += 12;
    if (haystack.includes(permitId.toLowerCase())) score += 70;
    if (haystack.includes("dust permit")) score += 35;
    if (haystack.includes("billing") || haystack.includes("invoice")) score -= 90;
    if (projectName && haystack.includes(projectName.toLowerCase())) score += 45;

    return { ...c, score };
  }).sort((a, b) => b.score - a.score || Date.parse(b.receivedAt) - Date.parse(a.receivedAt));

  const best = scored.find((c) =>
    c.hasChiCopy && c.chiEmailId && !c.isForwarded && c.score >= 50 &&
    !c.fromEmail?.toLowerCase().endsWith("@desertservices.net") &&
    !c.fromEmail?.toLowerCase().endsWith("@maricopa.gov")
  );

  return {
    mode: best ? "reply-all" : "compose-new",
    replyToEmailId: best?.chiEmailId ?? null,
    candidates: scored,
  };
}
