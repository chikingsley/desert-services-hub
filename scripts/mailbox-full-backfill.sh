#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

DB_CONTAINER="supabase_db_desert-services-hub"
FLOOR_DATE="${1:-2016-01-01}"
MAX_ITERS="${MAX_ITERS:-12}"
SYNC_TIMEOUT_SEC="${SYNC_TIMEOUT_SEC:-900}"
BUN_BIN="${BUN_BIN:-$(command -v bun 2>/dev/null || echo "$HOME/.bun/bin/bun")}"

psql_q() {
  local sql="$1"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -At -c "$sql"
}

echo "[backfill] floor=$FLOOR_DATE max_iters=$MAX_ITERS"
echo "[backfill] bun=$BUN_BIN"

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
  SELECT m.email
  FROM mailboxes m
  WHERE m.email <> 'test@desertservices.net'
  ORDER BY m.email
")

for mailbox in "${MAILBOXES[@]}"; do
  [[ -z "$mailbox" ]] && continue
  echo "\n[mailbox] $mailbox"

  already_done="$(psql_q "
    SELECT COALESCE(fully_backfilled::text, 'false')
    FROM mailbox_backfill_status
    WHERE email = '$mailbox'
  " || true)"
  if [[ "$already_done" == "true" ]]; then
    echo "  - already marked fully_backfilled, skipping"
    continue
  fi

  oldest_before="$(psql_q "
    SELECT COALESCE(MIN(e.received_at)::date::text, '')
    FROM emails e
    JOIN mailboxes m ON m.id = e.mailbox_id
    WHERE m.email = '$mailbox'
  ")"

  if [[ -z "$oldest_before" ]]; then
    echo "  - no emails in DB; marking not-applicable"
    psql_q "
      INSERT INTO mailbox_backfill_status(email, fully_backfilled, floor_attempted, oldest_before, oldest_after, iterations, last_run_at, note)
      VALUES ('$mailbox', FALSE, '$FLOOR_DATE', NULL, NULL, 0, now(), 'no emails in DB')
      ON CONFLICT(email) DO UPDATE SET
        fully_backfilled = EXCLUDED.fully_backfilled,
        floor_attempted = EXCLUDED.floor_attempted,
        oldest_before = EXCLUDED.oldest_before,
        oldest_after = EXCLUDED.oldest_after,
        iterations = EXCLUDED.iterations,
        last_run_at = now(),
        note = EXCLUDED.note
    " >/dev/null
    continue
  fi

  current_oldest="$oldest_before"
  iterations=0
  fully=false
  note=""

  while true; do
    if [[ "$current_oldest" < "$FLOOR_DATE" || "$current_oldest" == "$FLOOR_DATE" ]]; then
      fully=true
      note="reached floor date"
      break
    fi

    if (( iterations >= MAX_ITERS )); then
      note="hit max iterations ($MAX_ITERS)"
      break
    fi

    iterations=$((iterations + 1))
    echo "  - iter $iterations: backfill since $FLOOR_DATE before $current_oldest"

    if ! timeout "${SYNC_TIMEOUT_SEC}s" "$BUN_BIN" apps/cli-tools/email-cli/src/sync/mailboxes.ts \
      --full --no-post --no-bodies --no-attachments \
      --mailbox="$mailbox" \
      --since="$FLOOR_DATE" --before="$current_oldest" \
      --concurrency=1 --limit=250000; then
      note="sync command failed/timeout on iter $iterations"
      break
    fi

    next_oldest="$(psql_q "
      SELECT COALESCE(MIN(e.received_at)::date::text, '')
      FROM emails e
      JOIN mailboxes m ON m.id = e.mailbox_id
      WHERE m.email = '$mailbox'
    ")"

    if [[ -z "$next_oldest" ]]; then
      note="mailbox became empty unexpectedly"
      break
    fi

    if [[ "$next_oldest" == "$current_oldest" ]]; then
      fully=true
      note="no older emails available before $current_oldest"
      break
    fi

    echo "    oldest moved: $current_oldest -> $next_oldest"
    current_oldest="$next_oldest"
  done

  echo "  - done: fully=$fully oldest_before=$oldest_before oldest_after=$current_oldest iters=$iterations note=$note"

  psql_q "
    INSERT INTO mailbox_backfill_status(email, fully_backfilled, floor_attempted, oldest_before, oldest_after, iterations, last_run_at, note)
    VALUES ('$mailbox', $fully, '$FLOOR_DATE', '$oldest_before', '$current_oldest', $iterations, now(), '$note')
    ON CONFLICT(email) DO UPDATE SET
      fully_backfilled = EXCLUDED.fully_backfilled,
      floor_attempted = EXCLUDED.floor_attempted,
      oldest_before = EXCLUDED.oldest_before,
      oldest_after = EXCLUDED.oldest_after,
      iterations = EXCLUDED.iterations,
      last_run_at = now(),
      note = EXCLUDED.note
  " >/dev/null

done

echo "\n[backfill] complete"
