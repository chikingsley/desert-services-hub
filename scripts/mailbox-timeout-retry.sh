#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

DB_CONTAINER="supabase_db_desert-services-hub"
FLOOR_DATE="${1:-2016-01-01}"
CHUNK_DAYS="${CHUNK_DAYS:-120}"
SYNC_TIMEOUT_SEC="${SYNC_TIMEOUT_SEC:-180}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-24}"
BUN_BIN="${BUN_BIN:-$(command -v bun 2>/dev/null || echo "$HOME/.bun/bin/bun")}"

psql_q() {
  local sql="$1"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -At -c "$sql"
}

echo "[retry] floor=$FLOOR_DATE chunk_days=$CHUNK_DAYS timeout=${SYNC_TIMEOUT_SEC}s max_attempts=$MAX_ATTEMPTS"

docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS mailbox_backfill_status (
  email TEXT PRIMARY KEY,
  fully_backfilled BOOLEAN NOT NULL DEFAULT FALSE,
  floor_attempted DATE,
  oldest_before DATE,
  oldest_after DATE,
  iterations INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);
SQL

mapfile -t MAILBOXES < <(psql_q "
  SELECT email
  FROM mailbox_backfill_status
  WHERE NOT fully_backfilled
  ORDER BY email
")

if [[ ${#MAILBOXES[@]} -eq 0 ]]; then
  echo "[retry] no pending mailboxes"
  exit 0
fi

for mailbox in "${MAILBOXES[@]}"; do
  [[ -z "$mailbox" ]] && continue
  echo "\n[mailbox] $mailbox"

  current_oldest="$(psql_q "
    SELECT COALESCE(MIN(e.received_at)::date::text, '')
    FROM emails e
    JOIN mailboxes m ON m.id = e.mailbox_id
    WHERE m.email = '$mailbox'
  ")"

  if [[ -z "$current_oldest" ]]; then
    echo "  - no emails in DB; marking non-full"
    psql_q "
      UPDATE mailbox_backfill_status
      SET last_run_at = now(),
          note = 'no emails in DB on retry'
      WHERE email = '$mailbox'
    " >/dev/null
    continue
  fi

  oldest_before="$current_oldest"
  attempts=0
  moved=false
  done=false
  note=""

  while (( attempts < MAX_ATTEMPTS )); do
    attempts=$((attempts + 1))

    if [[ "$current_oldest" < "$FLOOR_DATE" || "$current_oldest" == "$FLOOR_DATE" ]]; then
      done=true
      note="reached floor date"
      break
    fi

    since="$(date -d "$current_oldest - ${CHUNK_DAYS} days" +%F)"
    if [[ "$since" < "$FLOOR_DATE" ]]; then
      since="$FLOOR_DATE"
    fi

    echo "  - attempt $attempts: since=$since before=$current_oldest"

    if ! timeout "${SYNC_TIMEOUT_SEC}s" "$BUN_BIN" apps/cli-tools/email-cli/src/sync/mailboxes.ts \
      --full --no-post --no-bodies --no-attachments \
      --mailbox="$mailbox" --since="$since" --before="$current_oldest" \
      --concurrency=1 --limit=250000; then
      note="timeout/failure on retry attempt $attempts"
      continue
    fi

    next_oldest="$(psql_q "
      SELECT COALESCE(MIN(e.received_at)::date::text, '')
      FROM emails e
      JOIN mailboxes m ON m.id = e.mailbox_id
      WHERE m.email = '$mailbox'
    ")"

    if [[ -z "$next_oldest" ]]; then
      note="mailbox empty after retry"
      break
    fi

    if [[ "$next_oldest" < "$current_oldest" ]]; then
      echo "    oldest moved: $current_oldest -> $next_oldest"
      current_oldest="$next_oldest"
      moved=true
      continue
    fi

    if [[ "$since" == "$FLOOR_DATE" ]]; then
      done=true
      note="no older emails available before $current_oldest"
      break
    fi

    # No movement in this chunk; move chunk farther back next attempt.
    current_oldest="$since"
  done

  oldest_after="$(psql_q "
    SELECT COALESCE(MIN(e.received_at)::date::text, '$oldest_before')
    FROM emails e
    JOIN mailboxes m ON m.id = e.mailbox_id
    WHERE m.email = '$mailbox'
  ")"

  if [[ "$done" == true && -z "$note" ]]; then
    note="completed"
  elif [[ "$done" != true && -z "$note" ]]; then
    note="max retry attempts reached"
  fi

  echo "  - done: fully=$done oldest_before=$oldest_before oldest_after=$oldest_after attempts=$attempts note=$note"

  psql_q "
    UPDATE mailbox_backfill_status
    SET fully_backfilled = $done,
        floor_attempted = '$FLOOR_DATE',
        oldest_before = '$oldest_before',
        oldest_after = '$oldest_after',
        iterations = COALESCE(iterations,0) + $attempts,
        last_run_at = now(),
        note = '$note'
    WHERE email = '$mailbox'
  " >/dev/null

done

echo "\n[retry] complete"
