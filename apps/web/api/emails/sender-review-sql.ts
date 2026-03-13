export function buildSenderReviewSamplesQuery(
  domains: string[]
): { params: string[]; sql: string } | null {
  if (domains.length === 0) {
    return null;
  }

  const valuesClause = domains
    .map((_, index) => `($${index + 1})`)
    .join(", ");

  return {
    params: domains,
    sql: `
SELECT d.val AS domain, s.samples
FROM (VALUES ${valuesClause}) AS d(val)
LEFT JOIN LATERAL (
  SELECT JSON_AGG(
    JSON_BUILD_OBJECT(
      'emailId', e2.id,
      'senderEmail', COALESCE(NULLIF(e2.real_sender_email, ''), NULLIF(e2.original_sender_email, ''), NULLIF(e2.from_email, '')),
      'senderName', COALESCE(NULLIF(e2.real_sender_name, ''), NULLIF(e2.from_name, '')),
      'subject', e2.subject,
      'receivedAt', e2.received_at,
      'accountName', a.name,
      'accountDomain', a.domain,
      'accountType', a.type
    ) ORDER BY e2.received_at DESC, e2.id DESC
  ) AS samples
  FROM (
    SELECT e.*
    FROM emails e
    WHERE e.is_excluded = 0
      AND e.classification IS NULL
      AND COALESCE(
        NULLIF(e.real_sender_domain, ''),
        NULLIF(e.original_sender_domain, ''),
        NULLIF(e.from_domain, '')
      ) = d.val
    ORDER BY e.received_at DESC, e.id DESC
    LIMIT 5
  ) e2
  LEFT JOIN accounts a ON a.id = e2.account_id
) s ON TRUE`,
  };
}
