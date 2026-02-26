#!/usr/bin/env bash
set -euo pipefail

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-desert-services-hub-postgres-1}"
REDIS_CONTAINER="${REDIS_CONTAINER:-desert-services-hub-redis-1}"
MONDAY_QUEUES="${MONDAY_QUEUES:-monday-sync-item,monday-sync-pipeline}"

# Trip thresholds
RUNNER_LIMIT="${RUNNER_LIMIT:-150}"           # total runner-* containers
MONDAY_PENDING_LIMIT="${MONDAY_PENDING_LIMIT:-0}" # 0 = disabled
MONDAY_EXECUTING_LIMIT="${MONDAY_EXECUTING_LIMIT:-0}" # 0 = disabled

# Runtime behavior
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_SECONDS="${MAX_SECONDS:-0}" # 0 = run forever
ACTION_MODE="${ACTION_MODE:-pause}" # pause | pause_and_cancel_pending | panic_cancel_all
REMEDIATE_STALE_REDIS="${REMEDIATE_STALE_REDIS:-1}" # 1 = clear stale queue currentConcurrency/currentDequeued
EXIT_ON_TRIP="${EXIT_ON_TRIP:-1}" # 1 = exit after first trip action
DRY_RUN="${DRY_RUN:-0}" # 1 = print actions only
LOG_FILE="${LOG_FILE:-}"

case "$ACTION_MODE" in
  pause|pause_and_cancel_pending|panic_cancel_all) ;;
  *)
    echo "Invalid ACTION_MODE='$ACTION_MODE' (expected pause|pause_and_cancel_pending|panic_cancel_all)" >&2
    exit 1
    ;;
esac

log_line() {
  local line
  line="$(date -u '+%Y-%m-%d %H:%M:%S UTC') $*"
  echo "$line"
  if [[ -n "$LOG_FILE" ]]; then
    echo "$line" >>"$LOG_FILE"
  fi
}

psql_at() {
  local sql="$1"
  docker exec "$POSTGRES_CONTAINER" psql -U postgres -d main -Atc "$sql"
}

psql_cmd() {
  local sql="$1"
  docker exec "$POSTGRES_CONTAINER" psql -U postgres -d main -c "$sql" >/dev/null
}

redis_scan() {
  local pattern="$1"
  docker exec "$REDIS_CONTAINER" redis-cli --scan --pattern "$pattern"
}

redis_scard() {
  local key="$1"
  docker exec "$REDIS_CONTAINER" redis-cli SCARD "$key" | tr -d '\r'
}

redis_smembers() {
  local key="$1"
  docker exec "$REDIS_CONTAINER" redis-cli SMEMBERS "$key"
}

redis_del() {
  local key="$1"
  docker exec "$REDIS_CONTAINER" redis-cli DEL "$key" >/dev/null
}

redis_srem() {
  local key="$1"
  local member="$2"
  docker exec "$REDIS_CONTAINER" redis-cli SREM "$key" "$member" >/dev/null
}

runner_count() {
  docker ps --format '{{.Names}}' | grep -c '^runner-' || true
}

split_queues() {
  local raw="$1"
  IFS=',' read -r -a QUEUE_ARRAY <<<"$raw"
  for i in "${!QUEUE_ARRAY[@]}"; do
    QUEUE_ARRAY[$i]="$(echo "${QUEUE_ARRAY[$i]}" | xargs)"
  done
}

build_queue_sql_list() {
  local out=""
  local q
  for q in "${QUEUE_ARRAY[@]}"; do
    if [[ -n "$q" ]]; then
      out+="'$q',"
    fi
  done
  echo "${out%,}"
}

count_queue_status() {
  local status="$1"
  psql_at "SELECT count(*) FROM \"TaskRun\" WHERE queue IN ($QUEUE_SQL_LIST) AND status='${status}';"
}

count_queue_status_for_one() {
  local queue_name="$1"
  local status="$2"
  psql_at "SELECT count(*) FROM \"TaskRun\" WHERE queue='${queue_name}' AND status='${status}';"
}

pause_monday_queues() {
  psql_cmd "UPDATE \"TaskQueue\" SET paused=true, \"updatedAt\"=now() WHERE name IN ($QUEUE_SQL_LIST);"
}

cancel_monday_runs() {
  local where_statuses="$1"
  psql_cmd "UPDATE \"TaskRun\"
    SET status='CANCELED',
        \"updatedAt\"=now(),
        error=jsonb_build_object('type','CanceledError','message','Canceled by monday kill switch')
    WHERE queue IN ($QUEUE_SQL_LIST)
      AND status IN (${where_statuses});"
}

clear_queue_stale_redis() {
  local queue_name="$1"
  local cur_pattern="*:queue:${queue_name}:currentConcurrency"
  local deq_pattern="*:queue:${queue_name}:currentDequeued"
  local cur_keys deq_keys stale_ids global_keys key id

  cur_keys="$(redis_scan "$cur_pattern" || true)"
  deq_keys="$(redis_scan "$deq_pattern" || true)"
  if [[ -z "$cur_keys$deq_keys" ]]; then
    return 0
  fi

  stale_ids="$(
    {
      while IFS= read -r key; do
        [[ -n "$key" ]] && redis_smembers "$key"
      done <<<"$cur_keys"
      while IFS= read -r key; do
        [[ -n "$key" ]] && redis_smembers "$key"
      done <<<"$deq_keys"
    } | sort -u
  )"

  global_keys="$(redis_scan "engine:runqueue:*:currentConcurrency" || true)"
  while IFS= read -r id; do
    [[ -z "$id" ]] && continue
    while IFS= read -r key; do
      [[ -z "$key" ]] && continue
      redis_srem "$key" "$id" || true
    done <<<"$global_keys"
  done <<<"$stale_ids"

  while IFS= read -r key; do
    [[ -n "$key" ]] && redis_del "$key"
  done <<<"$cur_keys"
  while IFS= read -r key; do
    [[ -n "$key" ]] && redis_del "$key"
  done <<<"$deq_keys"
}

remediate_stale_redis_if_needed() {
  local queue_name="$1"
  local db_exec cur_count key
  local cur_keys_pattern="*:queue:${queue_name}:currentConcurrency"

  db_exec="$(count_queue_status_for_one "$queue_name" "EXECUTING")"
  cur_count=0
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    cur_count=$((cur_count + $(redis_scard "$key")))
  done < <(redis_scan "$cur_keys_pattern" || true)

  if (( db_exec == 0 && cur_count > 0 )); then
    log_line "stale-redis-detected queue=${queue_name} db_executing=${db_exec} redis_currentConcurrency=${cur_count}"
    if [[ "$DRY_RUN" == "1" ]]; then
      log_line "dry-run: would clear stale redis sets for queue=${queue_name}"
    else
      clear_queue_stale_redis "$queue_name"
      log_line "stale-redis-cleared queue=${queue_name}"
    fi
  fi
}

trip_killswitch() {
  local reason="$1"
  log_line "KILL-SWITCH TRIPPED reason=${reason} action_mode=${ACTION_MODE}"

  if [[ "$DRY_RUN" == "1" ]]; then
    log_line "dry-run: would pause monday queues: ${MONDAY_QUEUES}"
    case "$ACTION_MODE" in
      pause_and_cancel_pending)
        log_line "dry-run: would cancel monday runs with statuses PENDING,DEQUEUED"
        ;;
      panic_cancel_all)
        log_line "dry-run: would cancel monday runs with statuses PENDING,DEQUEUED,EXECUTING"
        ;;
    esac
    return 0
  fi

  pause_monday_queues
  case "$ACTION_MODE" in
    pause_and_cancel_pending)
      cancel_monday_runs "'PENDING','DEQUEUED'"
      ;;
    panic_cancel_all)
      cancel_monday_runs "'PENDING','DEQUEUED','EXECUTING'"
      ;;
  esac
}

if ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  echo "Postgres container '$POSTGRES_CONTAINER' is not running." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$REDIS_CONTAINER"; then
  echo "Redis container '$REDIS_CONTAINER' is not running." >&2
  exit 1
fi

split_queues "$MONDAY_QUEUES"
QUEUE_SQL_LIST="$(build_queue_sql_list)"
if [[ -z "$QUEUE_SQL_LIST" ]]; then
  echo "No MONDAY_QUEUES configured." >&2
  exit 1
fi

start_epoch="$(date +%s)"
tripped=0

log_line "monday-killswitch-monitor started queues=${MONDAY_QUEUES} runner_limit=${RUNNER_LIMIT} pending_limit=${MONDAY_PENDING_LIMIT} executing_limit=${MONDAY_EXECUTING_LIMIT} poll_seconds=${POLL_SECONDS} action_mode=${ACTION_MODE} dry_run=${DRY_RUN}"

while true; do
  now_epoch="$(date +%s)"
  elapsed=$((now_epoch - start_epoch))
  if (( MAX_SECONDS > 0 && elapsed >= MAX_SECONDS )); then
    log_line "monitor-finished elapsed_seconds=${elapsed} reason=max-seconds-reached"
    break
  fi

  runners="$(runner_count)"
  pending="$(count_queue_status "PENDING")"
  executing="$(count_queue_status "EXECUTING")"
  dequeued="$(count_queue_status "DEQUEUED")"

  log_line "snapshot runners=${runners} monday_pending=${pending} monday_executing=${executing} monday_dequeued=${dequeued}"

  if [[ "$REMEDIATE_STALE_REDIS" == "1" ]]; then
    for q in "${QUEUE_ARRAY[@]}"; do
      remediate_stale_redis_if_needed "$q"
    done
  fi

  reason=""
  if (( runners >= RUNNER_LIMIT )); then
    reason="runner-count-${runners}-gte-${RUNNER_LIMIT}"
  elif (( MONDAY_PENDING_LIMIT > 0 && pending >= MONDAY_PENDING_LIMIT )); then
    reason="monday-pending-${pending}-gte-${MONDAY_PENDING_LIMIT}"
  elif (( MONDAY_EXECUTING_LIMIT > 0 && executing >= MONDAY_EXECUTING_LIMIT )); then
    reason="monday-executing-${executing}-gte-${MONDAY_EXECUTING_LIMIT}"
  fi

  if [[ -n "$reason" && "$tripped" -eq 0 ]]; then
    trip_killswitch "$reason"
    tripped=1
    if [[ "$EXIT_ON_TRIP" == "1" ]]; then
      log_line "monitor-exit reason=trip exit_on_trip=1"
      exit 0
    fi
  fi

  sleep "$POLL_SECONDS"
done
