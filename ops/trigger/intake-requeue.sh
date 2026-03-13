#!/usr/bin/env bash
set -euo pipefail

APP_DB_CONTAINER="${APP_DB_CONTAINER:-supabase_db_desert-services-hub}"
APP_DB_NAME="${APP_DB_NAME:-postgres}"
APP_DB_USER="${APP_DB_USER:-postgres}"

MODE="${MODE:-documents}" # documents | bodylink_rescan
LIMIT="${LIMIT:-200}"
SINCE_HOURS="${SINCE_HOURS:-0}" # 0 disables time filter
DRY_RUN="${DRY_RUN:-1}"

# documents mode filters
SOURCE="${SOURCE:-email_attachment}"
STATUS="${STATUS:-failed}"
BODYLINK_ONLY="${BODYLINK_ONLY:-0}"
ERROR_LIKE="${ERROR_LIKE:-}"
FILE_LIKE="${FILE_LIKE:-}"
RESET_ATTEMPTS="${RESET_ATTEMPTS:-1}"

for var_name in LIMIT SINCE_HOURS DRY_RUN BODYLINK_ONLY RESET_ATTEMPTS; do
  var_value="${!var_name}"
  if ! [[ "$var_value" =~ ^[0-9]+$ ]]; then
    echo "${var_name} must be numeric (got '$var_value')" >&2
    exit 1
  fi
done

case "$MODE" in
  documents|bodylink_rescan) ;;
  *)
    echo "Invalid MODE='$MODE' (expected documents|bodylink_rescan)" >&2
    exit 1
    ;;
esac

if ! docker ps --format '{{.Names}}' | grep -qx "$APP_DB_CONTAINER"; then
  echo "App DB container '$APP_DB_CONTAINER' is not running." >&2
  exit 1
fi

psql_table() {
  local sql="$1"
  docker exec "$APP_DB_CONTAINER" psql -U "$APP_DB_USER" -d "$APP_DB_NAME" -c "$sql"
}

psql_at() {
  local sql="$1"
  docker exec "$APP_DB_CONTAINER" psql -U "$APP_DB_USER" -d "$APP_DB_NAME" -Atc "$sql"
}

sql_escape_literal() {
  local input="$1"
  input="${input//\'/\'\'}"
  printf "%s" "$input"
}

if [[ "$MODE" == "documents" ]]; then
  where_sql="d.source = '$(sql_escape_literal "$SOURCE")' AND d.extraction_status = '$(sql_escape_literal "$STATUS")'"

  if [[ "$BODYLINK_ONLY" == "1" ]]; then
    where_sql+=" AND d.outlook_attachment_id LIKE 'bodylink:%'"
  fi

  if (( SINCE_HOURS > 0 )); then
    where_sql+=" AND d.updated_at > now() - interval '${SINCE_HOURS} hours'"
  fi

  if [[ -n "$ERROR_LIKE" ]]; then
    esc_error="$(sql_escape_literal "$ERROR_LIKE")"
    where_sql+=" AND coalesce(d.extraction_error, '') ILIKE '%${esc_error}%'"
  fi

  if [[ -n "$FILE_LIKE" ]]; then
    esc_file="$(sql_escape_literal "$FILE_LIKE")"
    where_sql+=" AND coalesce(d.file_name, '') ILIKE '%${esc_file}%'"
  fi

  echo "=== intake-requeue (documents mode) ==="
  echo "filters:"
  echo "  source=${SOURCE} status=${STATUS} bodylink_only=${BODYLINK_ONLY} since_hours=${SINCE_HOURS} limit=${LIMIT}"
  [[ -n "$ERROR_LIKE" ]] && echo "  error_like=${ERROR_LIKE}"
  [[ -n "$FILE_LIKE" ]] && echo "  file_like=${FILE_LIKE}"
  echo "  dry_run=${DRY_RUN}"
  echo

  echo "--- Candidate documents ---"
  psql_table "
    SELECT
      d.id,
      d.email_id,
      d.file_name,
      d.extraction_status,
      d.extraction_attempts,
      d.storage_path,
      left(coalesce(d.extraction_error, ''), 120) AS extraction_error,
      d.updated_at
    FROM documents d
    WHERE ${where_sql}
    ORDER BY d.updated_at DESC
    LIMIT ${LIMIT};
  "
  echo

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "dry-run only: no updates applied."
    exit 0
  fi

  attempt_reset_sql=""
  if [[ "$RESET_ATTEMPTS" == "1" ]]; then
    attempt_reset_sql=", extraction_attempts = 0"
  fi

  updated_count="$(
    psql_at "
      WITH candidate AS (
        SELECT d.id
        FROM documents d
        WHERE ${where_sql}
        ORDER BY d.updated_at DESC
        LIMIT ${LIMIT}
      ),
      updated AS (
        UPDATE documents d
        SET extraction_status = 'pending',
            extraction_error = NULL,
            extracted_at = NULL,
            last_attempted_at = NULL,
            updated_at = now()
            ${attempt_reset_sql}
        FROM candidate c
        WHERE d.id = c.id
        RETURNING d.id
      )
      SELECT count(*) FROM updated;
    "
  )"

  echo "updated_rows=${updated_count}"
  exit 0
fi

# bodylink_rescan mode
where_sql="d.source = 'email_attachment'
  AND d.outlook_attachment_id LIKE 'bodylink:%'
  AND d.extraction_status = 'failed'
  AND d.storage_path IS NULL
  AND d.email_id IS NOT NULL"

if (( SINCE_HOURS > 0 )); then
  where_sql+=" AND d.updated_at > now() - interval '${SINCE_HOURS} hours'"
fi

if [[ -n "$ERROR_LIKE" ]]; then
  esc_error="$(sql_escape_literal "$ERROR_LIKE")"
  where_sql+=" AND coalesce(d.extraction_error, '') ILIKE '%${esc_error}%'"
fi

echo "=== intake-requeue (bodylink_rescan mode) ==="
echo "filters:"
echo "  since_hours=${SINCE_HOURS} limit=${LIMIT}"
[[ -n "$ERROR_LIKE" ]] && echo "  error_like=${ERROR_LIKE}"
echo "  dry_run=${DRY_RUN}"
echo

echo "--- Candidate emails/docs ---"
psql_table "
  SELECT
    d.email_id,
    count(*) AS failed_docs,
    max(d.updated_at) AS newest_failure_utc,
    left(max(coalesce(d.extraction_error, '')), 120) AS sample_error
  FROM documents d
  WHERE ${where_sql}
  GROUP BY d.email_id
  ORDER BY newest_failure_utc DESC
  LIMIT ${LIMIT};
"
echo

if [[ "$DRY_RUN" == "1" ]]; then
  echo "dry-run only: no updates applied."
  exit 0
fi

email_update_count="$(
  psql_at "
    WITH candidate_emails AS (
      SELECT d.email_id
      FROM documents d
      WHERE ${where_sql}
      GROUP BY d.email_id
      ORDER BY max(d.updated_at) DESC
      LIMIT ${LIMIT}
    ),
    updated AS (
      UPDATE emails e
      SET body_link_scan_status = 'pending',
          body_link_scan_error = NULL,
          body_link_scan_links_found = NULL,
          body_link_scan_attachments_added = NULL,
          body_link_scanned_at = NULL,
          body_link_scan_version = NULL,
          body_link_scan_attempts = 0
      FROM candidate_emails c
      WHERE e.id = c.email_id
      RETURNING e.id
    )
    SELECT count(*) FROM updated;
  "
)"

doc_update_count="$(
  psql_at "
    WITH candidate_emails AS (
      SELECT d.email_id
      FROM documents d
      WHERE ${where_sql}
      GROUP BY d.email_id
      ORDER BY max(d.updated_at) DESC
      LIMIT ${LIMIT}
    ),
    updated_docs AS (
      UPDATE documents d
      SET extraction_status = 'pending',
          extraction_error = NULL,
          extracted_at = NULL,
          last_attempted_at = NULL,
          extraction_attempts = 0,
          updated_at = now()
      FROM candidate_emails c
      WHERE d.email_id = c.email_id
        AND d.source = 'email_attachment'
        AND d.outlook_attachment_id LIKE 'bodylink:%'
      RETURNING d.id
    )
    SELECT count(*) FROM updated_docs;
  "
)"

echo "updated_email_rows=${email_update_count}"
echo "updated_document_rows=${doc_update_count}"
