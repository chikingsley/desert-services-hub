#!/usr/bin/env bash
set -euo pipefail

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-desert-services-hub-postgres-1}"
REDIS_CONTAINER="${REDIS_CONTAINER:-desert-services-hub-redis-1}"
INTAKE_QUEUES="${INTAKE_QUEUES:-email-sync,task/email-sync,mailbox-sync-control,task/mailbox-sync,task/mailbox-backfill,mailbox-sync-mailbox,task/sync-one-mailbox,attachment-intake,task/attachment-intake,body-link-intake,task/body-link-intake,task/document-intake}"

ACTION_MODE="${ACTION_MODE:-pause}" # pause|pause_and_cancel_pending|panic_cancel_all|resume
WAIT_FOR_DRAIN="${WAIT_FOR_DRAIN:-1}" # 1 = wait for EXECUTING runs to hit 0
DRAIN_TIMEOUT_SECONDS="${DRAIN_TIMEOUT_SECONDS:-900}"
POLL_SECONDS="${POLL_SECONDS:-5}"
REMEDIATE_STALE_REDIS="${REMEDIATE_STALE_REDIS:-1}" # 1 = clear stale queue currentConcurrency/currentDequeued
DRY_RUN="${DRY_RUN:-0}"
LOG_FILE="${LOG_FILE:-}"

case "$ACTION_MODE" in
  pause|pause_and_cancel_pending|panic_cancel_all|resume) ;;
  *)
    echo "Invalid ACTION_MODE='$ACTION_MODE' (expected pause|pause_and_cancel_pending|panic_cancel_all|resume)" >&2
    exit 1
    ;;
esac

for var_name in WAIT_FOR_DRAIN DRAIN_TIMEOUT_SECONDS POLL_SECONDS REMEDIATE_STALE_REDIS DRY_RUN; do
  var_value="${!var_name}"
  if ! [[ "$var_value" =~ ^[0-9]+$ ]]; then
    echo "${var_name} must be numeric (got '$var_value')" >&2
    exit 1
  fi
done

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

split_queues() {
  local raw="$1"
  IFS=',' read -r -a QUEUE_ARRAY <<<"$raw"
  for i in "${!QUEUE_ARRAY[@]}"; do
    QUEUE_ARRAY[$i]="$(echo "${QUEUE_ARRAY[$i]}" | xargs)"
  done
}

sql_quote() {
  local input="$1"
  input="${input//\'/\'\'}"
  printf "'%s'" "$input"
}

build_queue_sql_list() {
  local out=""
  local q
  for q in "${QUEUE_ARRAY[@]}"; do
    if [[ -n "$q" ]]; then
      out+="$(sql_quote "$q"),"
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

set_queues_paused() {
  local paused_value="$1"
  psql_cmd "UPDATE \"TaskQueue\" SET paused=${paused_value}, \"updatedAt\"=now() WHERE name IN ($QUEUE_SQL_LIST);"
}

cancel_runs() {
  local where_statuses="$1"
  psql_cmd "UPDATE \"TaskRun\"
    SET status='CANCELED',
        \"updatedAt\"=now(),
        error=jsonb_build_object('type','CanceledError','message','Canceled by intake reset')
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

print_snapshot() {
  local phase="$1"
  local pending executing dequeued errors canceled
  local queue_state_rows row

  pending="$(count_queue_status "PENDING")"
  executing="$(count_queue_status "EXECUTING")"
  dequeued="$(count_queue_status "DEQUEUED")"
  errors="$(count_queue_status "COMPLETED_WITH_ERRORS")"
  canceled="$(count_queue_status "CANCELED")"
  log_line "snapshot phase=${phase} pending=${pending} executing=${executing} dequeued=${dequeued} completed_with_errors=${errors} canceled=${canceled}"

  queue_state_rows="$(
    psql_at "SELECT name || ' paused=' || paused::text || ' rows=' || count(*)
             FROM \"TaskQueue\"
             WHERE name IN ($QUEUE_SQL_LIST)
             GROUP BY name, paused
             ORDER BY name, paused;"
  )"
  while IFS= read -r row; do
    [[ -n "$row" ]] && log_line "queue-state phase=${phase} ${row}"
  done <<<"$queue_state_rows"
}

wait_for_drain() {
  local deadline_epoch now_epoch executing

  deadline_epoch=$(( $(date +%s) + DRAIN_TIMEOUT_SECONDS ))
  while true; do
    executing="$(count_queue_status "EXECUTING")"
    log_line "drain-check executing=${executing}"
    if (( executing == 0 )); then
      log_line "drain-complete executing=0"
      return 0
    fi

    now_epoch="$(date +%s)"
    if (( now_epoch >= deadline_epoch )); then
      log_line "drain-timeout executing=${executing} timeout_seconds=${DRAIN_TIMEOUT_SECONDS}"
      return 1
    fi

    sleep "$POLL_SECONDS"
  done
}

if ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  echo "Postgres container '$POSTGRES_CONTAINER' is not running." >&2
  exit 1
fi

if [[ "$REMEDIATE_STALE_REDIS" == "1" ]]; then
  if ! docker ps --format '{{.Names}}' | grep -qx "$REDIS_CONTAINER"; then
    echo "Redis container '$REDIS_CONTAINER' is not running but REMEDIATE_STALE_REDIS=1." >&2
    exit 1
  fi
fi

split_queues "$INTAKE_QUEUES"
QUEUE_SQL_LIST="$(build_queue_sql_list)"
if [[ -z "$QUEUE_SQL_LIST" ]]; then
  echo "No INTAKE_QUEUES configured." >&2
  exit 1
fi

log_line "intake-reset started mode=${ACTION_MODE} queues=${INTAKE_QUEUES} wait_for_drain=${WAIT_FOR_DRAIN} timeout=${DRAIN_TIMEOUT_SECONDS}s poll=${POLL_SECONDS}s dry_run=${DRY_RUN}"
print_snapshot "before"

if [[ "$ACTION_MODE" == "resume" ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    log_line "dry-run: would set paused=false on intake queues"
  else
    set_queues_paused "false"
    log_line "queues-resumed"
  fi
  print_snapshot "after"
  exit 0
fi

if [[ "$DRY_RUN" == "1" ]]; then
  log_line "dry-run: would set paused=true on intake queues"
else
  set_queues_paused "true"
  log_line "queues-paused"
fi

case "$ACTION_MODE" in
  pause_and_cancel_pending)
    if [[ "$DRY_RUN" == "1" ]]; then
      log_line "dry-run: would cancel runs with statuses PENDING,DEQUEUED"
    else
      cancel_runs "'PENDING','DEQUEUED'"
      log_line "runs-canceled statuses=PENDING,DEQUEUED"
    fi
    ;;
  panic_cancel_all)
    if [[ "$DRY_RUN" == "1" ]]; then
      log_line "dry-run: would cancel runs with statuses PENDING,DEQUEUED,EXECUTING"
    else
      cancel_runs "'PENDING','DEQUEUED','EXECUTING'"
      log_line "runs-canceled statuses=PENDING,DEQUEUED,EXECUTING"
    fi
    ;;
esac

if [[ "$REMEDIATE_STALE_REDIS" == "1" ]]; then
  for q in "${QUEUE_ARRAY[@]}"; do
    remediate_stale_redis_if_needed "$q"
  done
fi

if [[ "$WAIT_FOR_DRAIN" == "1" ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    log_line "dry-run: would wait for EXECUTING runs to drain to zero"
  else
    wait_for_drain
  fi
fi

print_snapshot "after"
log_line "intake-reset complete mode=${ACTION_MODE}"
