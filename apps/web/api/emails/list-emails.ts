import { flagParam, multiFilter, searchParam } from "@/api/validation";
import { parseEmailRow } from "@email/db/email";
import { db, type SqlParam } from "@lib/db/client";
import { z } from "zod";

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

interface EmailStatsRow {
  contracts: number;
  docusign: number;
  dust_permits: number;
  estimates: number;
  excluded: number;
  hr: number;
  internal: number;
  invoices: number;
  it: number;
  payments: number;
  total: number;
  with_attachments: number;
}

const emailListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(50),
  search: searchParam,
  from: searchParam,
  classification: searchParam,
  senders: multiFilter,
  exclude_classifications: multiFilter,
  show_excluded: flagParam,
  only_excluded: flagParam,
  has_attachments: flagParam,
});

interface EmailListParams {
  classification: string;
  excludeClassifications: string[];
  from: string;
  hasAttachmentFilterOn: boolean;
  includeExcluded: boolean;
  limit: number;
  offset: number;
  onlyExcludedOn: boolean;
  page: number;
  search: string;
  senders: string[];
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
let hasSearchVectorColumn: boolean | null = null;
let hasEmailListDedupMv: boolean | null = null;

const DEDUP_KEY = `CASE
  WHEN from_domain IN (
    'buildingconnected.com','planhub.com','cyberhoot.com',
    'texturacorp.com','worklio.com','avanan-mail.net'
  ) OR from_domain LIKE '%bidmail.com'
    OR from_domain LIKE '%procoretech.com'
  THEN normalized_subject || '|' || COALESCE(from_name,'') || '|' || floor(extract(epoch from timezone('UTC', received_at)) / 3600)::bigint::text
  ELSE COALESCE(internet_message_id, message_id)::text
END`;

function parseListParams(req: Request): EmailListParams {
  const url = new URL(req.url);
  const raw = emailListQuerySchema.parse(Object.fromEntries(url.searchParams));

  return {
    page: raw.page,
    limit: raw.limit,
    offset: (raw.page - 1) * raw.limit,
    search: raw.search,
    from: raw.from,
    classification: raw.classification,
    senders: raw.senders.map((s) => s.toLowerCase()),
    excludeClassifications: raw.exclude_classifications,
    includeExcluded: raw.show_excluded,
    onlyExcludedOn: raw.only_excluded,
    hasAttachmentFilterOn: raw.has_attachments,
  };
}

function hasAnyListFilter(params: EmailListParams): boolean {
  const hasVisibilityFilter =
    params.includeExcluded ||
    params.onlyExcludedOn ||
    params.hasAttachmentFilterOn ||
    params.excludeClassifications.length > 0;
  const hasSearchFilter = Boolean(
    params.search ||
      params.from ||
      params.classification ||
      params.senders.length > 0
  );
  return hasVisibilityFilter || hasSearchFilter;
}

async function supportsSearchVector(): Promise<boolean> {
  if (hasSearchVectorColumn != null) {
    return hasSearchVectorColumn;
  }

  const row = (await db
    .query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'emails'
         AND column_name = 'search_vector'
       LIMIT 1`
    )
    .get()) as { "?column?": number } | null;

  hasSearchVectorColumn = Boolean(row);
  return hasSearchVectorColumn;
}

async function supportsEmailListDedupMv(): Promise<boolean> {
  if (hasEmailListDedupMv != null) {
    return hasEmailListDedupMv;
  }

  const row = (await db
    .query(
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
    .query(
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

async function getEmailListDedupMvCountCached(): Promise<number> {
  const key = "active";
  const now = Date.now();
  const cached = emailListDedupCountCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const row = (await db
    .query("SELECT count(*)::int AS total FROM email_list_dedup_mv")
    .get()) as { total: number } | null;
  const value = row?.total ?? 0;
  emailListDedupCountCache.set(key, {
    expiresAt: now + EMAIL_LIST_DEDUP_COUNT_CACHE_TTL_MS,
    value,
  });
  return value;
}

function parseRowsForList(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  return rows.map((row) => ({
    ...parseEmailRow({ ...row, body_full: null, body_html: null } as Parameters<
      typeof parseEmailRow
    >[0]),
    recipientCount: Number(row.recipient_count) || 1,
  }));
}

function statsPayload(
  statsResult: EmailStatsRow | null
): Record<string, number> {
  return {
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
  };
}

async function tryListFromDedupMv(
  params: EmailListParams
): Promise<Response | null> {
  if (hasAnyListFilter(params)) {
    return null;
  }

  if (!(await supportsEmailListDedupMv())) {
    return null;
  }

  const [emails, total, statsResult] = await Promise.all([
    db
      .query(
        `SELECT *, recipient_count
         FROM email_list_dedup_mv
         ORDER BY received_at DESC
         LIMIT $1 OFFSET $2`
      )
      .all(params.limit, params.offset) as Promise<Record<string, unknown>[]>,
    getEmailListDedupMvCountCached(),
    getEmailStatsCached(false),
  ]);

  return Response.json({
    emails: parseRowsForList(emails),
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit),
    },
    stats: statsPayload(statsResult),
  });
}

async function addSearchCondition(
  search: string,
  conditions: string[],
  values: SqlParam[]
): Promise<void> {
  if (!search) {
    return;
  }

  const hasSearchVector = await supportsSearchVector();
  if (hasSearchVector) {
    const p = values.length + 1;
    conditions.push(`search_vector @@ websearch_to_tsquery('english', $${p})`);
    values.push(search);
    return;
  }

  const like = `%${search}%`;
  const p = values.length + 1;
  conditions.push(`(
    coalesce(subject, '') ILIKE $${p}
    OR coalesce(from_name, '') ILIKE $${p + 1}
    OR coalesce(from_email, '') ILIKE $${p + 2}
    OR coalesce(body_preview, '') ILIKE $${p + 3}
    OR coalesce(project_name, '') ILIKE $${p + 4}
    OR coalesce(contractor_name, '') ILIKE $${p + 5}
    OR coalesce(attachment_names, '') ILIKE $${p + 6}
    OR coalesce(real_sender_name, '') ILIKE $${p + 7}
    OR coalesce(real_sender_email, '') ILIKE $${p + 8}
    OR coalesce(original_sender_email, '') ILIKE $${p + 9}
    OR coalesce(original_sender_domain, '') ILIKE $${p + 10}
    OR coalesce(real_sender_company, '') ILIKE $${p + 11}
  )`);
  values.push(
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

function addVisibilityCondition(
  params: EmailListParams,
  conditions: string[]
): void {
  if (params.onlyExcludedOn) {
    conditions.push("is_excluded = 1");
    return;
  }

  if (!params.includeExcluded) {
    conditions.push("is_excluded = 0");
  }
}

function addFromCondition(
  from: string,
  conditions: string[],
  values: SqlParam[]
): void {
  if (!from) {
    return;
  }

  const p = values.length + 1;
  if (from.includes("@")) {
    conditions.push(`from_email ILIKE $${p}`);
    values.push(`%${from}%`);
    return;
  }

  conditions.push(`from_domain = $${p}`);
  values.push(from);
}

function addClassificationCondition(
  classification: string,
  conditions: string[],
  values: SqlParam[]
): void {
  if (!classification) {
    return;
  }

  const p = values.length + 1;
  conditions.push(`classification = $${p}`);
  values.push(classification);
}

function addSenderCondition(
  senders: string[],
  conditions: string[],
  values: SqlParam[]
): void {
  if (senders.length === 0) {
    return;
  }

  const offset = values.length;
  const placeholders1 = senders.map((_, i) => `$${offset + i + 1}`).join(", ");
  const placeholders2 = senders
    .map((_, i) => `$${offset + senders.length + i + 1}`)
    .join(", ");
  const placeholders3 = senders
    .map((_, i) => `$${offset + senders.length * 2 + i + 1}`)
    .join(", ");
  conditions.push(`(
    lower(from_email) IN (${placeholders1})
    OR lower(real_sender_email) IN (${placeholders2})
    OR lower(original_sender_email) IN (${placeholders3})
  )`);
  values.push(...senders, ...senders, ...senders);
}

function addExcludeClassificationsCondition(
  excludeClassifications: string[],
  conditions: string[],
  values: SqlParam[]
): void {
  if (excludeClassifications.length === 0) {
    return;
  }

  const offset = values.length;
  const placeholders = excludeClassifications
    .map((_, i) => `$${offset + i + 1}`)
    .join(", ");
  conditions.push(
    `(classification IS NULL OR classification NOT IN (${placeholders}))`
  );
  values.push(...excludeClassifications);
}

function addAttachmentCondition(
  hasAttachmentFilterOn: boolean,
  conditions: string[]
): void {
  if (hasAttachmentFilterOn) {
    conditions.push("has_attachments = 1");
  }
}

async function buildWhereClause(
  params: EmailListParams
): Promise<{ where: string; values: SqlParam[] }> {
  const conditions: string[] = [];
  const values: SqlParam[] = [];

  addVisibilityCondition(params, conditions);
  await addSearchCondition(params.search, conditions, values);
  addFromCondition(params.from, conditions, values);
  addClassificationCondition(params.classification, conditions, values);
  addSenderCondition(params.senders, conditions, values);
  addExcludeClassificationsCondition(
    params.excludeClassifications,
    conditions,
    values
  );
  addAttachmentCondition(params.hasAttachmentFilterOn, conditions);

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
  };
}

function buildDedupQuery(where: string, paramCount: number): string {
  const limitParam = `$${paramCount + 1}`;
  const offsetParam = `$${paramCount + 2}`;
  return `
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
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;
}

export async function listEmails(req: Request): Promise<Response> {
  try {
    const params = parseListParams(req);

    const dedupMvResponse = await tryListFromDedupMv(params);
    if (dedupMvResponse) {
      return dedupMvResponse;
    }

    const { where, values } = await buildWhereClause(params);
    const query = buildDedupQuery(where, values.length);

    const [emails, statsResult] = await Promise.all([
      db.query(query).all(...values, params.limit, params.offset) as Promise<
        Record<string, unknown>[]
      >,
      getEmailStatsCached(params.includeExcluded),
    ]);

    const total = Number(emails[0]?.total) || 0;
    return Response.json({
      emails: parseRowsForList(emails),
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
      stats: statsPayload(statsResult),
    });
  } catch (error) {
    console.error("Failed to fetch emails:", error);
    return Response.json({ error: "Failed to fetch emails" }, { status: 500 });
  }
}
