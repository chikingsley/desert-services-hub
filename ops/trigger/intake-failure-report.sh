#!/usr/bin/env bash
set -euo pipefail

TRIGGER_DB_CONTAINER="${TRIGGER_DB_CONTAINER:-desert-services-hub-postgres-1}"
TRIGGER_DB_NAME="${TRIGGER_DB_NAME:-main}"
TRIGGER_DB_USER="${TRIGGER_DB_USER:-postgres}"

APP_DB_CONTAINER="${APP_DB_CONTAINER:-supabase_db_desert-services-hub}"
APP_DB_NAME="${APP_DB_NAME:-postgres}"
APP_DB_USER="${APP_DB_USER:-postgres}"

HOURS="${HOURS:-24}"
LIMIT="${LIMIT:-20}"
TASK_IDENTIFIERS="${TASK_IDENTIFIERS:-email-sync,mailbox-sync,mailbox-backfill,sync-one-mailbox,attachment-intake,body-link-intake,document-intake}"

for var_name in HOURS LIMIT; do
  var_value="${!var_name}"
  if ! [[ "$var_value" =~ ^[0-9]+$ ]]; then
    echo "${var_name} must be numeric (got '$var_value')" >&2
    exit 1
  fi
done

split_csv() {
  local raw="$1"
  IFS=',' read -r -a OUT <<<"$raw"
  for i in "${!OUT[@]}"; do
    OUT[$i]="$(echo "${OUT[$i]}" | xargs)"
  done
}

sql_quote() {
  local input="$1"
  input="${input//\'/\'\'}"
  printf "'%s'" "$input"
}

build_sql_list() {
  local out=""
  local item
  for item in "${OUT[@]}"; do
    if [[ -n "$item" ]]; then
      out+="$(sql_quote "$item"),"
    fi
  done
  echo "${out%,}"
}

trigger_psql_table() {
  local sql="$1"
  docker exec "$TRIGGER_DB_CONTAINER" psql -U "$TRIGGER_DB_USER" -d "$TRIGGER_DB_NAME" -c "$sql"
}

app_psql_table() {
  local sql="$1"
  docker exec "$APP_DB_CONTAINER" psql -U "$APP_DB_USER" -d "$APP_DB_NAME" -c "$sql"
}

if ! docker ps --format '{{.Names}}' | grep -qx "$TRIGGER_DB_CONTAINER"; then
  echo "Trigger DB container '$TRIGGER_DB_CONTAINER' is not running." >&2
  exit 1
fi

APP_DB_AVAILABLE=1
if ! docker ps --format '{{.Names}}' | grep -qx "$APP_DB_CONTAINER"; then
  APP_DB_AVAILABLE=0
fi

split_csv "$TASK_IDENTIFIERS"
TASK_SQL_LIST="$(build_sql_list)"
if [[ -z "$TASK_SQL_LIST" ]]; then
  echo "No TASK_IDENTIFIERS configured." >&2
  exit 1
fi

FAILURE_STATUSES="'COMPLETED_WITH_ERRORS','CRASHED','SYSTEM_FAILURE','TIMED_OUT','EXPIRED'"

echo "=== Trigger Intake Failure Report ==="
echo "window: last ${HOURS} hours"
echo "tasks: ${TASK_IDENTIFIERS}"
echo

echo "--- Run status by task/queue/status ---"
trigger_psql_table "
  SELECT
    \"taskIdentifier\" AS task,
    queue,
    status,
    count(*) AS runs
  FROM \"TaskRun\"
  WHERE \"createdAt\" > now() - interval '${HOURS} hours'
    AND \"taskIdentifier\" IN (${TASK_SQL_LIST})
  GROUP BY 1, 2, 3
  ORDER BY runs DESC, task, queue, status
  LIMIT ${LIMIT};
"
echo

echo "--- Failures by task (newest first) ---"
trigger_psql_table "
  SELECT
    \"taskIdentifier\" AS task,
    count(*) AS failures,
    max(\"createdAt\") AS latest_failure_utc
  FROM \"TaskRun\"
  WHERE \"createdAt\" > now() - interval '${HOURS} hours'
    AND \"taskIdentifier\" IN (${TASK_SQL_LIST})
    AND status IN (${FAILURE_STATUSES})
  GROUP BY 1
  ORDER BY failures DESC, latest_failure_utc DESC;
"
echo

echo "--- Top Trigger error buckets ---"
trigger_psql_table "
  SELECT
    \"taskIdentifier\" AS task,
    left(
      coalesce(
        nullif(error->>'message', ''),
        nullif(error->>'name', ''),
        nullif(error->>'type', ''),
        '(no error payload)'
      ),
      180
    ) AS error_bucket,
    count(*) AS failures,
    max(\"createdAt\") AS latest_failure_utc
  FROM \"TaskRun\"
  WHERE \"createdAt\" > now() - interval '${HOURS} hours'
    AND \"taskIdentifier\" IN (${TASK_SQL_LIST})
    AND status IN (${FAILURE_STATUSES})
  GROUP BY 1, 2
  ORDER BY failures DESC, latest_failure_utc DESC
  LIMIT ${LIMIT};
"
echo

if [[ "$APP_DB_AVAILABLE" == "1" ]]; then
  echo "--- Documents extraction status (email_attachment) ---"
  app_psql_table "
    SELECT extraction_status AS status, count(*) AS docs
    FROM documents
    WHERE source = 'email_attachment'
    GROUP BY 1
    ORDER BY docs DESC;
  "
  echo

  echo "--- Top document extraction errors (email_attachment failed) ---"
  app_psql_table "
    SELECT
      left(coalesce(nullif(extraction_error, ''), '(no extraction_error)'), 180) AS error_bucket,
      count(*) AS docs
    FROM documents
    WHERE source = 'email_attachment'
      AND extraction_status = 'failed'
    GROUP BY 1
    ORDER BY docs DESC
    LIMIT ${LIMIT};
  "
  echo

  echo "--- Body-link failures with missing storage_path ---"
  app_psql_table "
    SELECT count(*) AS missing_storage_failed
    FROM documents
    WHERE source = 'email_attachment'
      AND outlook_attachment_id LIKE 'bodylink:%'
      AND extraction_status = 'failed'
      AND storage_path IS NULL;
  "
  echo

  echo "--- Oldest pending attachment work ---"
  app_psql_table "
    SELECT
      min(created_at) AS oldest_pending_created_at,
      max(created_at) AS newest_pending_created_at,
      count(*) AS pending_docs
    FROM documents
    WHERE source = 'email_attachment'
      AND extraction_status = 'pending';
  "
else
  echo "App DB container '${APP_DB_CONTAINER}' is not running; skipping documents-table sections."
fi
