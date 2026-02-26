# Trigger Load Testing (k6)

This folder provides a safe first load-test harness for Trigger.dev.

## What it tests

1. Sends controlled load to `POST /api/v1/tasks/<task-id>/trigger`.
2. Uses synthetic Trigger task `load-test-db-ping` by default (DB-only, no Monday/Outlook side effects).
3. Queries Trigger Postgres after the run and fails if DB slot-exhaustion errors appear:
   - `remaining connection slots are reserved...`
   - `too many clients already`

## Prereqs

- Trigger stack running locally (`webapp`, `supervisor`, `postgres`).
- Trigger task code deployed/registered (includes `load-test-db-ping`).
- `TRIGGER_SECRET_KEY` available (or present in repo `.env`).
- `docker` available.

No local `k6` install is required. If `k6` is missing, the runner uses `grafana/k6` in Docker.

## Commands

Smoke test (recommended first):

```bash
cd /home/simon/github/desert-services-hub
TASK_ID=load-test-db-ping RATE=2 DURATION=30s HOLD_MS=250 \
  bash ops/load-tests/k6/run-trigger-load-test.sh
```

Stress-lite (still controlled):

```bash
cd /home/simon/github/desert-services-hub
TASK_ID=load-test-db-ping RATE=8 DURATION=2m PREALLOCATED_VUS=20 MAX_VUS=80 HOLD_MS=500 \
  bash ops/load-tests/k6/run-trigger-load-test.sh
```

Replay a real task payload (example: `monday-sync-item`):

```bash
cd /home/simon/github/desert-services-hub
TASK_ID=monday-sync-item \
TASK_PAYLOAD_JSON='{"mondayItemId":"1234567890"}' \
RATE=1 DURATION=30s PREALLOCATED_VUS=4 MAX_VUS=12 \
  bash ops/load-tests/k6/run-trigger-load-test.sh
```

Controlled saturation ladder (stops on safety limits or first slot error):

```bash
cd /home/simon/github/desert-services-hub
TASK_ID=load-test-db-saturation \
MAX_RUNNER_CONTAINERS=60 MAX_PENDING_RUNS=1000 \
  bash ops/load-tests/k6/run-db-saturation-ladder.sh
```

Notes:
- `run-db-saturation-ladder.sh` executes staged rates/payloads and checks after each stage:
  - runner container count safety cap
  - pending run safety cap (filtered to `TASK_ID` + `TASK_QUEUE`)
  - slot-exhaustion errors in Trigger `TaskRun.error` (filtered to `TASK_ID` + `TASK_QUEUE`)
- Set `TASK_QUEUE` if your task queue name differs from `TASK_ID`.
- Override stages with `STAGES`:
  - format: `NAME|RATE|DURATION|HOLD_MS|CONNECTIONS`
  - example:
    `STAGES='S1|1|20s|1500|10 S2|2|20s|2500|20 S3|4|20s|3500|30'`

## Safety defaults

- Defaults to `TRIGGER_API_URL=http://localhost:8030`.
- Refuses remote target URLs unless `ALLOW_REMOTE=1` is explicitly set.
- Exits non-zero if DB slot-exhaustion errors are detected in the test window.
- k6 request latency threshold can be overridden via `HTTP_P95_THRESHOLD_MS` (default `1500`).
