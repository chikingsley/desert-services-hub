#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase_db_desert-services-hub}"
PSQL_BASE=(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres)

SCOPE="project-estimate-gap"
LIMIT=5000
SINCE_DAYS=""
APPLY=0

usage() {
  cat <<'EOF'
Usage:
  scripts/email-resolver-backfill.sh [options]

Options:
  --scope <name>       Backfill scope (default: project-estimate-gap)
                       supported:
                         - project-estimate-gap
                         - project-any-gap
                         - project-no-estimate-scope
                         - unprojected
                         - all-unresolved
                         - all
  --limit <n>          Max emails to target this run (default: 5000)
  --since-days <n>     Restrict to emails created within last N days
  --apply              Enqueue jobs (default is dry-run)
  --help               Show this help

Examples:
  scripts/email-resolver-backfill.sh --scope project-estimate-gap --limit 20000
  scripts/email-resolver-backfill.sh --scope unprojected --since-days 30 --limit 50000 --apply
  scripts/email-resolver-backfill.sh --scope all-unresolved --limit 100000 --apply
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      SCOPE="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --since-days)
      SINCE_DAYS="$2"
      shift 2
      ;;
    --apply)
      APPLY=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || [[ "$LIMIT" -lt 1 ]]; then
  echo "Invalid --limit: $LIMIT" >&2
  exit 2
fi

if [[ -n "$SINCE_DAYS" ]]; then
  if ! [[ "$SINCE_DAYS" =~ ^[0-9]+$ ]] || [[ "$SINCE_DAYS" -lt 1 ]]; then
    echo "Invalid --since-days: $SINCE_DAYS" >&2
    exit 2
  fi
fi

case "$SCOPE" in
  project-estimate-gap)
    WHERE_SQL="
      e.project_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM project_estimates pe WHERE pe.project_id = e.project_id)
      AND NOT EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.email_id = e.id)
    "
    ;;
  project-any-gap)
    WHERE_SQL="
      e.project_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.email_id = e.id)
    "
    ;;
  project-no-estimate-scope)
    WHERE_SQL="
      e.project_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM project_estimates pe WHERE pe.project_id = e.project_id)
    "
    ;;
  unprojected)
    WHERE_SQL="e.project_id IS NULL"
    ;;
  all-unresolved)
    WHERE_SQL="
      e.project_id IS NULL
      OR (
        e.project_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.email_id = e.id)
      )
    "
    ;;
  all)
    WHERE_SQL="TRUE"
    ;;
  *)
    echo "Unsupported --scope: $SCOPE" >&2
    exit 2
    ;;
esac

SINCE_SQL=""
if [[ -n "$SINCE_DAYS" ]]; then
  SINCE_SQL="AND e.created_at >= now() - interval '${SINCE_DAYS} days'"
fi

read_sql="$(cat <<SQL
WITH target AS (
  SELECT e.id AS email_id
  FROM emails e
  WHERE ${WHERE_SQL}
    ${SINCE_SQL}
  ORDER BY e.created_at DESC NULLS LAST, e.id DESC
  LIMIT ${LIMIT}
),
queued AS (
  SELECT DISTINCT (j.payload::jsonb->>'emailId')::bigint AS email_id
  FROM webhook_jobs j
  WHERE j.job_type = 'email_resolve'
    AND j.status IN ('pending', 'processing')
),
stats AS (
  SELECT
    (SELECT COUNT(*) FROM target) AS target_rows,
    (SELECT COUNT(*) FROM target t JOIN queued q ON q.email_id = t.email_id) AS already_queued_rows,
    (SELECT COUNT(*) FROM target t LEFT JOIN queued q ON q.email_id = t.email_id WHERE q.email_id IS NULL) AS enqueueable_rows
)
SELECT
  target_rows,
  already_queued_rows,
  enqueueable_rows
FROM stats;
SQL
)"

echo "Resolver Backfill"
echo "scope=${SCOPE}"
echo "limit=${LIMIT}"
if [[ -n "$SINCE_DAYS" ]]; then
  echo "since_days=${SINCE_DAYS}"
else
  echo "since_days=(none)"
fi
echo "mode=$([[ "$APPLY" -eq 1 ]] && echo apply || echo dry-run)"
echo

"${PSQL_BASE[@]}" -c "$read_sql"

if [[ "$APPLY" -ne 1 ]]; then
  exit 0
fi

write_sql="$(cat <<SQL
WITH target AS (
  SELECT e.id AS email_id
  FROM emails e
  WHERE ${WHERE_SQL}
    ${SINCE_SQL}
  ORDER BY e.created_at DESC NULLS LAST, e.id DESC
  LIMIT ${LIMIT}
),
ins AS (
  INSERT INTO webhook_jobs (job_type, payload)
  SELECT
    'email_resolve',
    jsonb_build_object('emailId', t.email_id)::text
  FROM target t
  WHERE NOT EXISTS (
    SELECT 1
    FROM webhook_jobs j
    WHERE j.job_type = 'email_resolve'
      AND j.status IN ('pending', 'processing')
      AND j.payload::jsonb->>'emailId' = t.email_id::text
  )
  RETURNING 1
)
SELECT COUNT(*) AS queued FROM ins;
SQL
)"

"${PSQL_BASE[@]}" -c "$write_sql"
