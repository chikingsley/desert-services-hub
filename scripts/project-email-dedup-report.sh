#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/project-email-dedup-report.sh --project-id <id> [--limit <n>] [--refresh]

Description:
  Shows deduplicated project email messages from materialized view
  `project_email_dedup_mv` and prints duplicate concentration stats.
USAGE
}

PROJECT_ID=""
LIMIT_ROWS="30"
DO_REFRESH=0
DB_CONTAINER="supabase_db_desert-services-hub"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-id)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    --limit)
      LIMIT_ROWS="${2:-}"
      shift 2
      ;;
    --refresh)
      DO_REFRESH=1
      shift
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

if [[ ! "$LIMIT_ROWS" =~ ^[0-9]+$ ]]; then
  echo "--limit must be numeric." >&2
  usage >&2
  exit 1
fi

if [[ "$DO_REFRESH" -eq 1 ]]; then
  echo "Refreshing materialized view..."
  if ! docker exec "$DB_CONTAINER" psql -U postgres -d postgres -c \
    "REFRESH MATERIALIZED VIEW CONCURRENTLY public.project_email_dedup_mv;"; then
    docker exec "$DB_CONTAINER" psql -U postgres -d postgres -c \
      "REFRESH MATERIALIZED VIEW public.project_email_dedup_mv;"
  fi
fi

echo "=== PROJECT EMAIL DEDUP REPORT: project_id=${PROJECT_ID} ==="
echo

echo "--- SUMMARY ---"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -P pager=off -F $'\t' -Atc "
SELECT
  project_id,
  COUNT(*) AS unique_messages,
  COALESCE(SUM(email_row_count), 0) AS raw_email_rows,
  COALESCE(SUM(duplicate_row_count), 0) AS duplicate_rows,
  ROUND(
    CASE WHEN COALESCE(SUM(email_row_count), 0) = 0 THEN 0
         ELSE 100.0 * COALESCE(SUM(duplicate_row_count), 0)::numeric / SUM(email_row_count)::numeric
    END,
    2
  ) AS duplicate_pct,
  COALESCE(SUM(CASE WHEN has_permit_signal THEN 1 ELSE 0 END), 0) AS permit_signal_messages,
  MIN(first_received_at) AS first_seen,
  MAX(last_received_at) AS last_seen
FROM public.project_email_dedup_mv
WHERE project_id = ${PROJECT_ID}
GROUP BY project_id;
"

echo
echo "--- TOP DUPLICATES ---"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -P pager=off -F $'\t' -Atc "
SELECT
  canonical_email_id,
  to_char(canonical_received_at, 'YYYY-MM-DD HH24:MI') AS canonical_received_at,
  canonical_from_email,
  LEFT(COALESCE(canonical_subject, ''), 120) AS canonical_subject,
  email_row_count,
  mailbox_count,
  has_permit_signal
FROM public.project_email_dedup_mv
WHERE project_id = ${PROJECT_ID}
ORDER BY duplicate_row_count DESC, canonical_received_at DESC
LIMIT ${LIMIT_ROWS};
"

echo
echo "=== END PROJECT EMAIL DEDUP REPORT: project_id=${PROJECT_ID} ==="
