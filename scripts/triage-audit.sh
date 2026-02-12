#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/triage-audit.sh --project-id <id>

Description:
  Runs a deterministic triage audit query pack for a single project and prints
  linkage/completeness status across projects, emails, permits, estimates,
  attachments, and documents.
USAGE
}

PROJECT_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-id)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_ID" || ! "$PROJECT_ID" =~ ^[0-9]+$ ]]; then
  echo "--project-id is required and must be numeric." >&2
  usage >&2
  exit 1
fi

DB_CONTAINER="supabase_db_desert-services-hub"

echo "=== TRIAGE AUDIT: project_id=${PROJECT_ID} ==="
echo

docker exec "$DB_CONTAINER" psql -U postgres -d postgres -P pager=off -F $'\t' -Atc "
SELECT 'PROJECT' AS section, p.id, p.name, p.contractor, p.contract_status, p.dust_permit_status,
       p.noi_status, p.swppp_status, p.signs_status, p.email_count, p.outlook_folder,
       p.first_seen, p.last_seen, p.updated_at
FROM projects p
WHERE p.id = ${PROJECT_ID};
"

echo
echo "--- TRACKED FOLDER ---"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -P pager=off -F $'\t' -Atc "
SELECT tf.id, tf.display_name, tf.folder_id, tf.project_id, tf.last_synced_at, tf.message_count
FROM tracked_folders tf
WHERE tf.project_id = ${PROJECT_ID}
ORDER BY tf.created_at DESC;
"

echo
echo "--- EMAIL LINKAGE + DUPLICATE SIGNAL ---"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -P pager=off -F $'\t' -Atc "
WITH e AS (
  SELECT *
  FROM emails
  WHERE project_id = ${PROJECT_ID}
),
keys AS (
  SELECT COALESCE(NULLIF(internet_message_id, ''), message_id) AS msg_key
  FROM e
)
SELECT
  (SELECT COUNT(*) FROM e) AS linked_email_rows,
  (SELECT COUNT(DISTINCT msg_key) FROM keys) AS unique_message_keys,
  (SELECT COUNT(*) FROM e WHERE has_attachments = 1) AS emails_with_attachments,
  (SELECT MIN(received_at) FROM e) AS min_received_at,
  (SELECT MAX(received_at) FROM e) AS max_received_at;
"

echo
echo "--- RECENT PERMIT-RELATED EMAILS (sample) ---"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -P pager=off -F $'\t' -Atc "
SELECT id,
       to_char(received_at, 'YYYY-MM-DD HH24:MI') AS received_at,
       from_email,
       subject,
       LEFT(regexp_replace(COALESCE(body_preview,''), E'[\\n\\r\\t]+', ' ', 'g'), 180) AS preview
FROM emails
WHERE project_id = ${PROJECT_ID}
  AND (
    COALESCE(subject,'') ~* 'dust|permit|noi|pointandpay|maricopa|swppp|certificate'
    OR COALESCE(body_preview,'') ~* 'dust|permit|noi|pointandpay|maricopa|swppp|certificate'
  )
ORDER BY received_at DESC
LIMIT 15;
"

echo
echo "--- PERMIT SIGNALS ---"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -P pager=off -F $'\t' -Atc "
WITH e AS (
  SELECT *
  FROM emails
  WHERE project_id = ${PROJECT_ID}
)
SELECT
  MAX(received_at) FILTER (WHERE lower(COALESCE(from_email,'')) = 'aqdimpact@maricopa.gov' AND COALESCE(subject,'') ~* 'submission confirmation') AS submitted_confirmation_at,
  MAX(received_at) FILTER (WHERE lower(COALESCE(from_email,'')) = 'noreply@pointandpay.com' AND COALESCE(subject,'') ~* 'payment has been approved') AS payment_approved_at,
  MAX(received_at) FILTER (WHERE lower(COALESCE(from_email,'')) = 'no-reply@maricopa.gov' AND COALESCE(subject,'') ~* 'dust permit issued') AS permit_issued_email_at,
  MAX(received_at) FILTER (WHERE lower(COALESCE(from_email,'')) = 'no-reply@maricopa.gov' AND COALESCE(subject,'') ~* 'dust permit rejected') AS permit_rejected_email_at
FROM e;
"

echo
echo "--- PERMIT TABLE LINKAGE ---"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -P pager=off -F $'\t' -Atc "
SELECT id, project_name, company_name, status, submitted_date, effective_date, expiration_date, facility_id, project_id
FROM dust_permits_filed_by_desert_services
WHERE project_id = ${PROJECT_ID}
ORDER BY submitted_date DESC NULLS LAST, id DESC;
"

echo
echo "--- ESTIMATE LINKAGE ---"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -P pager=off -F $'\t' -Atc "
SELECT pe.project_id, pe.estimate_id, pe.source, pe.created_at,
       est.monday_item_id, est.estimate_number, est.name, est.contractor, est.bid_status, est.awarded
FROM project_estimates pe
JOIN estimates est ON est.id = pe.estimate_id
WHERE pe.project_id = ${PROJECT_ID}
ORDER BY pe.created_at DESC;
"

echo
echo "--- ATTACHMENT LINKAGE ---"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -P pager=off -F $'\t' -Atc "
SELECT COUNT(*) AS attachment_rows,
       COUNT(*) FILTER (WHERE extraction_status = 'success') AS att_success,
       COUNT(*) FILTER (WHERE extraction_status = 'failed') AS att_failed,
       COUNT(*) FILTER (WHERE extraction_status = 'pending') AS att_pending,
       COUNT(*) FILTER (WHERE extraction_status = 'skipped') AS att_skipped
FROM attachments a
JOIN emails e ON e.id = a.email_id
WHERE e.project_id = ${PROJECT_ID};
"

echo
echo "--- DOCUMENT LINKAGE ---"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -P pager=off -F $'\t' -Atc "
SELECT COUNT(*) AS document_rows,
       COUNT(*) FILTER (WHERE extraction_status = 'success') AS doc_success,
       COUNT(*) FILTER (WHERE extraction_status = 'failed') AS doc_failed,
       COUNT(*) FILTER (WHERE extraction_status = 'pending') AS doc_pending,
       COUNT(*) FILTER (WHERE extraction_status = 'unsupported') AS doc_unsupported
FROM documents
WHERE project_id = ${PROJECT_ID};
"

echo
echo "--- DOD CHECKLIST (quick) ---"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -P pager=off -F $'\t' -Atc "
WITH
proj AS (
  SELECT * FROM projects WHERE id = ${PROJECT_ID}
),
folder AS (
  SELECT COUNT(*) AS c FROM tracked_folders WHERE project_id = ${PROJECT_ID}
),
emails AS (
  SELECT COUNT(*) AS c FROM emails WHERE project_id = ${PROJECT_ID}
),
permits AS (
  SELECT COUNT(*) AS c FROM dust_permits_filed_by_desert_services WHERE project_id = ${PROJECT_ID}
),
ests AS (
  SELECT COUNT(*) AS c FROM project_estimates WHERE project_id = ${PROJECT_ID}
),
docs AS (
  SELECT COUNT(*) AS c FROM documents WHERE project_id = ${PROJECT_ID}
)
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM proj) THEN 'PASS' ELSE 'FAIL' END AS project_exists,
  CASE WHEN (SELECT c FROM folder) > 0 THEN 'PASS' ELSE 'WARN' END AS folder_linked,
  CASE WHEN (SELECT c FROM emails) > 0 THEN 'PASS' ELSE 'WARN' END AS emails_linked,
  CASE WHEN (SELECT c FROM ests) > 0 THEN 'PASS' ELSE 'WARN' END AS estimates_linked,
  CASE WHEN (SELECT c FROM permits) > 0 OR (SELECT dust_permit_status FROM proj) IN ('Requested','Issued','Closed','Billing Sent') THEN 'PASS' ELSE 'WARN' END AS permit_state_present,
  CASE WHEN (SELECT c FROM docs) > 0 THEN 'PASS' ELSE 'WARN' END AS documents_present;
"

echo
echo "=== END TRIAGE AUDIT: project_id=${PROJECT_ID} ==="
