#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
K6_SCRIPT_PATH="${K6_SCRIPT_PATH:-$ROOT_DIR/ops/load-tests/k6/trigger-task-trigger.js}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-desert-services-hub-postgres-1}"

TRIGGER_API_URL="${TRIGGER_API_URL:-http://localhost:8030}"
TASK_ID="${TASK_ID:-load-test-db-ping}"
RATE="${RATE:-2}"
DURATION="${DURATION:-30s}"
PREALLOCATED_VUS="${PREALLOCATED_VUS:-8}"
MAX_VUS="${MAX_VUS:-32}"
HOLD_MS="${HOLD_MS:-250}"
TASK_PAYLOAD_JSON="${TASK_PAYLOAD_JSON:-}"
HTTP_P95_THRESHOLD_MS="${HTTP_P95_THRESHOLD_MS:-1500}"

read_env_value() {
  local key="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    return 0
  fi
  local line
  line="$(grep -m1 "^${key}=" "$file" || true)"
  if [[ -z "$line" ]]; then
    return 0
  fi
  printf '%s' "${line#*=}"
}

if [[ -z "${TRIGGER_SECRET_KEY:-}" ]]; then
  TRIGGER_SECRET_KEY="$(read_env_value "TRIGGER_SECRET_KEY" "$ROOT_DIR/.env")"
fi

if [[ -z "${TRIGGER_SECRET_KEY:-}" ]]; then
  echo "TRIGGER_SECRET_KEY is required (export it or set it in $ROOT_DIR/.env)." >&2
  exit 1
fi

case "$TRIGGER_API_URL" in
  http://localhost:8030|https://localhost:8030|http://127.0.0.1:8030|https://127.0.0.1:8030)
    ;;
  *)
    if [[ "${ALLOW_REMOTE:-0}" != "1" ]]; then
      echo "Refusing remote load test against '$TRIGGER_API_URL'." >&2
      echo "Set ALLOW_REMOTE=1 to override intentionally." >&2
      exit 1
    fi
    ;;
esac

if ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  echo "Postgres container '$POSTGRES_CONTAINER' is not running." >&2
  exit 1
fi

START_UTC="$(docker exec "$POSTGRES_CONTAINER" psql -U postgres -d main -Atc "select to_char(now(), 'YYYY-MM-DD HH24:MI:SS')")"

echo "Starting Trigger load test"
echo "  target:       $TRIGGER_API_URL"
echo "  task:         $TASK_ID"
echo "  rate:         $RATE req/s"
echo "  duration:     $DURATION"
echo "  holdMs:       $HOLD_MS"
echo "  p95Threshold: ${HTTP_P95_THRESHOLD_MS}ms"
if [[ -n "$TASK_PAYLOAD_JSON" ]]; then
  echo "  payload:      custom TASK_PAYLOAD_JSON"
fi
echo "  started_utc:  $START_UTC"

if command -v k6 >/dev/null 2>&1; then
  TRIGGER_API_URL="$TRIGGER_API_URL" \
  TRIGGER_SECRET_KEY="$TRIGGER_SECRET_KEY" \
  TASK_ID="$TASK_ID" \
  RATE="$RATE" \
  DURATION="$DURATION" \
  PREALLOCATED_VUS="$PREALLOCATED_VUS" \
  MAX_VUS="$MAX_VUS" \
  HOLD_MS="$HOLD_MS" \
  TASK_PAYLOAD_JSON="$TASK_PAYLOAD_JSON" \
  HTTP_P95_THRESHOLD_MS="$HTTP_P95_THRESHOLD_MS" \
  k6 run "$K6_SCRIPT_PATH"
else
  docker run --rm --network host \
    -e TRIGGER_API_URL="$TRIGGER_API_URL" \
    -e TRIGGER_SECRET_KEY="$TRIGGER_SECRET_KEY" \
    -e TASK_ID="$TASK_ID" \
    -e RATE="$RATE" \
    -e DURATION="$DURATION" \
    -e PREALLOCATED_VUS="$PREALLOCATED_VUS" \
    -e MAX_VUS="$MAX_VUS" \
    -e HOLD_MS="$HOLD_MS" \
    -e TASK_PAYLOAD_JSON="$TASK_PAYLOAD_JSON" \
    -e HTTP_P95_THRESHOLD_MS="$HTTP_P95_THRESHOLD_MS" \
    -v "$ROOT_DIR/ops/load-tests/k6:/scripts:ro" \
    grafana/k6 run /scripts/trigger-task-trigger.js
fi

END_UTC="$(docker exec "$POSTGRES_CONTAINER" psql -U postgres -d main -Atc "select to_char(now(), 'YYYY-MM-DD HH24:MI:SS')")"

ERROR_COUNT="$(docker exec "$POSTGRES_CONTAINER" psql -U postgres -d main -Atc "SELECT count(*) FROM \"TaskRun\" WHERE \"createdAt\" >= timestamp '$START_UTC' AND \"createdAt\" <= timestamp '$END_UTC' AND (COALESCE(error::text, '') ILIKE '%remaining connection slots are reserved%' OR COALESCE(error::text, '') ILIKE '%too many clients already%');")"

WINDOW_SUMMARY="$(docker exec "$POSTGRES_CONTAINER" psql -U postgres -d main -c "SELECT \"taskIdentifier\", count(*) AS runs, count(*) FILTER (WHERE status = 'COMPLETED_WITH_ERRORS') AS completed_with_errors, count(*) FILTER (WHERE status IN ('SYSTEM_FAILURE', 'CRASHED', 'TIMED_OUT')) AS hard_failures FROM \"TaskRun\" WHERE \"createdAt\" >= timestamp '$START_UTC' AND \"createdAt\" <= timestamp '$END_UTC' GROUP BY 1 ORDER BY runs DESC LIMIT 8;")"

ERROR_ROWS="$(docker exec "$POSTGRES_CONTAINER" psql -U postgres -d main -c "SELECT to_char(\"createdAt\", 'YYYY-MM-DD HH24:MI:SS') AS created_utc, \"taskIdentifier\", \"friendlyId\", left(COALESCE(error::text, ''), 140) AS error_snippet FROM \"TaskRun\" WHERE \"createdAt\" >= timestamp '$START_UTC' AND \"createdAt\" <= timestamp '$END_UTC' AND (COALESCE(error::text, '') ILIKE '%remaining connection slots are reserved%' OR COALESCE(error::text, '') ILIKE '%too many clients already%') ORDER BY \"createdAt\" DESC LIMIT 8;")"

RUNNER_COUNT="$(docker ps --format '{{.Names}}' | grep -c '^runner-' || true)"

echo
echo "Load test window summary ($START_UTC -> $END_UTC UTC)"
echo "$WINDOW_SUMMARY"
echo "runner containers currently up: $RUNNER_COUNT"
echo "slot-exhaustion errors in window: $ERROR_COUNT"

if [[ "$ERROR_COUNT" -gt 0 ]]; then
  echo
  echo "Detected DB slot-exhaustion errors during this test window:"
  echo "$ERROR_ROWS"
  exit 2
fi

echo "No DB slot-exhaustion errors detected in this test window."
