import { db } from "@lib/db/hub";
import type { PermitIntentRow } from "./permit-intent-types";
import { SIGNAL_WEBSEARCH_QUERY } from "./permit-intent-types";

export interface LoadPermitIntentCandidatesOptions {
  limit: number;
  sinceDays: number;
  includeNoiseDomains?: boolean;
}

const NOISE_DOMAIN_BLOCKLIST = [
  "avanan-mail.net",
  "bidmail.com",
  "buildingconnected.com",
  "cyberhoot.com",
  "gcpay.com",
  "monday.com",
  "planhub.com",
  "procoretech.com",
  "siteline.com",
  "texturacorp.com",
  "us02.procoretech.com",
  "worklio.com",
];

const ALWAYS_EXCLUDED_DOMAINS = [
  "desertservices.app",
  "desertservices.net",
  "maricopa.gov",
  "pointandpay.com",
  "upwindcompanies.com",
];

const ALWAYS_EXCLUDED_SENDERS = [
  "aqdimpact@maricopa.gov",
  "no-reply@maricopa.gov",
  "noreply@pointandpay.com",
];

function sqlStringList(values: string[]): string {
  return values.map((value) => `'${value.replaceAll(/'/g, "''")}'`).join(", ");
}

async function supportsSearchDocument(): Promise<boolean> {
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
  return Boolean(row);
}

export async function loadPermitIntentCandidates(
  opts: LoadPermitIntentCandidatesOptions
): Promise<PermitIntentRow[]> {
  const hasSearchDocument = await supportsSearchDocument();
  const blockedDomains = opts.includeNoiseDomains
    ? [...ALWAYS_EXCLUDED_DOMAINS]
    : [...ALWAYS_EXCLUDED_DOMAINS, ...NOISE_DOMAIN_BLOCKLIST];

  const signalClause = hasSearchDocument
    ? "e.search_document @@ websearch_to_tsquery('english', ?)"
    : `(
         COALESCE(e.subject, '') ~* '(dust\\s*control\\s*permit|dust\\s*permit|notice\\s+of\\s+intent|\\mnoi\\M|adeq\\s*permit)'
         OR COALESCE(e.body_preview, '') ~* '(dust\\s*control\\s*permit|dust\\s*permit|notice\\s+of\\s+intent|\\mnoi\\M|adeq\\s*permit)'
         OR COALESCE(e.attachment_names, '') ~* '(dust\\s*control\\s*permit|dust\\s*permit|notice\\s+of\\s+intent|\\mnoi\\M|adeq\\s*permit)'
       )`;

  const query = `
    WITH source AS (
      SELECT
        e.id, e.received_at,
        LOWER(COALESCE(e.from_email, '')) AS from_email,
        LOWER(COALESCE(e.from_domain, '')) AS from_domain,
        COALESCE(e.subject, '') AS subject,
        COALESCE(e.body_preview, '') AS body_preview,
        e.attachment_names, e.classification, e.conversation_id, e.project_id,
        CASE
          WHEN e.from_domain IN (
            'buildingconnected.com','planhub.com','cyberhoot.com',
            'texturacorp.com','worklio.com','avanan-mail.net'
          )
          OR e.from_domain LIKE '%bidmail.com'
          OR e.from_domain LIKE '%procoretech.com'
          THEN COALESCE(e.normalized_subject, '') || '|' || COALESCE(e.from_name, '') || '|' || floor(extract(epoch from timezone('UTC', e.received_at)) / 3600)::bigint::text
          ELSE COALESCE(NULLIF(e.internet_message_id, ''), NULLIF(e.message_id, ''), 'id:' || e.id::text)
        END AS dedup_key
      FROM emails e
      WHERE COALESCE(e.is_excluded, 0) = 0
        AND COALESCE(e.is_internal, 0) = 0
        AND e.received_at >= now() - (?::int * interval '1 day')
        AND ${signalClause}
        AND LOWER(COALESCE(e.from_domain, '')) <> ''
        AND LOWER(COALESCE(e.from_domain, '')) NOT IN (${sqlStringList(blockedDomains)})
        AND LOWER(COALESCE(e.from_email, '')) NOT IN (${sqlStringList(ALWAYS_EXCLUDED_SENDERS)})
        AND COALESCE(e.classification, '') NOT IN ('HR', 'IT', 'SPAM')
    ),
    ranked AS (
      SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.dedup_key ORDER BY s.received_at DESC, s.id DESC) AS rn
      FROM source s
    )
    SELECT id, received_at, from_email, from_domain, subject, body_preview, attachment_names,
           classification, conversation_id, project_id
    FROM ranked
    WHERE rn = 1
    ORDER BY received_at DESC, id DESC
    LIMIT ?;
  `;

  if (hasSearchDocument) {
    return await db
      .query<PermitIntentRow, [number, string, number]>(query)
      .all(opts.sinceDays, SIGNAL_WEBSEARCH_QUERY, opts.limit);
  }

  return await db
    .query<PermitIntentRow, [number, number]>(query)
    .all(opts.sinceDays, opts.limit);
}
