#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BASE_RUNNER="${BASE_RUNNER:-$ROOT_DIR/ops/load-tests/k6/run-trigger-load-test.sh}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-desert-services-hub-postgres-1}"

TASK_ID="${TASK_ID:-load-test-db-saturation}"
TASK_QUEUE="${TASK_QUEUE:-$TASK_ID}"
MAX_RUNNER_CONTAINERS="${MAX_RUNNER_CONTAINERS:-80}"
MAX_PENDING_RUNS="${MAX_PENDING_RUNS:-1200}"
STAGE_SETTLE_SECONDS="${STAGE_SETTLE_SECONDS:-20}"
HTTP_P95_THRESHOLD_MS="${HTTP_P95_THRESHOLD_MS:-10000}"

# Format: NAME|RATE|DURATION|HOLD_MS|CONNECTIONS
STAGES="${STAGES:-S1|1|20s|1500|10 S2|2|20s|2000|15 S3|3|20s|2500|20 S4|4|20s|3000|25 S5|5|20s|3500|30 S6|6|20s|4000|35 S7|8|20s|4500|40}"

if [[ ! -x "$BASE_RUNNER" ]]; then
  echo "Base runner not found or not executable: $BASE_RUNNER" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  echo "Postgres container '$POSTGRES_CONTAINER' is not running." >&2
  exit 1
fi

runner_count() {
  docker ps --format '{{.Names}}' | grep -c '^runner-' || true
}

pending_count() {
  docker exec "$POSTGRES_CONTAINER" psql -U postgres -d main -Atc \
    "SELECT count(*) FROM \"TaskRun\"
     WHERE \"taskIdentifier\"='$TASK_ID'
       AND queue='$TASK_QUEUE'
       AND status='PENDING';"
}

slot_error_count_in_window() {
  local start_utc="$1"
  local end_utc="$2"
  docker exec "$POSTGRES_CONTAINER" psql -U postgres -d main -Atc \
    "SELECT count(*) FROM \"TaskRun\"
     WHERE \"createdAt\" >= timestamp '$start_utc'
       AND \"createdAt\" <= timestamp '$end_utc'
       AND \"taskIdentifier\"='$TASK_ID'
       AND queue='$TASK_QUEUE'
       AND (
         COALESCE(error::text, '') ILIKE '%remaining connection slots are reserved%'
         OR COALESCE(error::text, '') ILIKE '%too many clients already%'
       );"
}

print_window_summary() {
  local start_utc="$1"
  local end_utc="$2"

  docker exec "$POSTGRES_CONTAINER" psql -U postgres -d main -c \
    "SELECT \"taskIdentifier\", queue, status, count(*) AS runs
     FROM \"TaskRun\"
     WHERE \"createdAt\" >= timestamp '$start_utc'
       AND \"createdAt\" <= timestamp '$end_utc'
       AND \"taskIdentifier\"='$TASK_ID'
       AND queue='$TASK_QUEUE'
     GROUP BY 1,2,3
     ORDER BY runs DESC, 1,2,3
     LIMIT 16;"
}

echo "Starting DB saturation ladder"
echo "  task:                 $TASK_ID"
echo "  queue:                $TASK_QUEUE"
echo "  stages:               $STAGES"
echo "  max_runner_containers $MAX_RUNNER_CONTAINERS"
echo "  max_pending_runs      $MAX_PENDING_RUNS"
echo "  stage_settle_seconds  $STAGE_SETTLE_SECONDS"
echo "  http_p95_threshold_ms $HTTP_P95_THRESHOLD_MS"

initial_pending="$(pending_count)"
initial_runners="$(runner_count)"
echo "Initial state: pending=$initial_pending runners=$initial_runners"

if [[ "$initial_runners" -gt "$MAX_RUNNER_CONTAINERS" ]]; then
  echo "Refusing to start: runner count already above safety limit." >&2
  exit 2
fi

if [[ "$initial_pending" -gt "$MAX_PENDING_RUNS" ]]; then
  echo "Refusing to start: pending count already above safety limit." >&2
  exit 2
fi

saturation_reproduced=0

for stage in $STAGES; do
  IFS='|' read -r name rate duration hold_ms connections <<<"$stage"

  pre_pending="$(pending_count)"
  pre_runners="$(runner_count)"

  if [[ "$pre_runners" -gt "$MAX_RUNNER_CONTAINERS" ]]; then
    echo "Stopping before $name: runner count $pre_runners exceeds $MAX_RUNNER_CONTAINERS" >&2
    exit 3
  fi

  if [[ "$pre_pending" -gt "$MAX_PENDING_RUNS" ]]; then
    echo "Stopping before $name: pending count $pre_pending exceeds $MAX_PENDING_RUNS" >&2
    exit 4
  fi

  stage_start_utc="$(docker exec "$POSTGRES_CONTAINER" psql -U postgres -d main -Atc "select to_char(now(), 'YYYY-MM-DD HH24:MI:SS')")"
  payload_json="$(printf '{"holdMs":%s,"connections":%s,"label":"%s"}' "$hold_ms" "$connections" "$name")"

  echo
  echo "== $name =="
  echo "rate=$rate/s duration=$duration holdMs=$hold_ms connections=$connections"
  echo "window_start_utc=$stage_start_utc"

  set +e
  TASK_ID="$TASK_ID" \
  RATE="$rate" \
  DURATION="$duration" \
  HOLD_MS="$hold_ms" \
  TASK_PAYLOAD_JSON="$payload_json" \
  HTTP_P95_THRESHOLD_MS="$HTTP_P95_THRESHOLD_MS" \
  bash "$BASE_RUNNER"
  stage_exit="$?"
  set -e

  stage_end_utc="$(docker exec "$POSTGRES_CONTAINER" psql -U postgres -d main -Atc "select to_char(now(), 'YYYY-MM-DD HH24:MI:SS')")"
  window_slot_errors="$(slot_error_count_in_window "$stage_start_utc" "$stage_end_utc")"
  post_pending="$(pending_count)"
  post_runners="$(runner_count)"

  echo "stage_exit=$stage_exit window_slot_errors=$window_slot_errors pending=$post_pending runners=$post_runners"
  print_window_summary "$stage_start_utc" "$stage_end_utc"

  if [[ "$post_runners" -gt "$MAX_RUNNER_CONTAINERS" ]]; then
    echo "Safety stop: runner count $post_runners exceeded $MAX_RUNNER_CONTAINERS" >&2
    exit 5
  fi

  if [[ "$post_pending" -gt "$MAX_PENDING_RUNS" ]]; then
    echo "Safety stop: pending count $post_pending exceeded $MAX_PENDING_RUNS" >&2
    exit 6
  fi

  if [[ "$window_slot_errors" -gt 0 || "$stage_exit" -eq 2 ]]; then
    echo
    echo "Saturation signal captured in stage $name."
    saturation_reproduced=1
    break
  fi

  echo "Settling for ${STAGE_SETTLE_SECONDS}s..."
  sleep "$STAGE_SETTLE_SECONDS"
done

echo
if [[ "$saturation_reproduced" -eq 1 ]]; then
  echo "Ladder complete: saturation reproduced."
  exit 0
fi

echo "Ladder complete: no slot-exhaustion signal detected."
exit 0
