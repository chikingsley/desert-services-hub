# Monday Queue Kill Switch

Queue-scoped guard for Trigger Monday processing (`monday-sync-item`, `monday-sync-pipeline`).

Script:

- `ops/trigger/monday-killswitch-monitor.sh`

## What it does

Every poll interval it checks:

- total Trigger runner container count (`runner-*`)
- Monday queue counts (`PENDING`, `EXECUTING`, `DEQUEUED`)
- optional stale Redis queue-concurrency state

If a threshold trips, it can:

- pause Monday queues only
- optionally cancel Monday pending/dequeued runs
- optionally panic-cancel executing runs too

It does **not** touch non-Monday queues unless you change `MONDAY_QUEUES`.

## Quick start

Run guard for 30 minutes, trip if runner containers hit 150:

```bash
cd /home/simon/github/desert-services-hub
RUNNER_LIMIT=150 MAX_SECONDS=1800 ACTION_MODE=pause \
  bash ops/trigger/monday-killswitch-monitor.sh
```

Or via `just`:

```bash
cd /home/simon/github/desert-services-hub
just monday-killswitch 150 500 1800 pause
```

Trip earlier on Monday backlog:

```bash
cd /home/simon/github/desert-services-hub
RUNNER_LIMIT=150 MONDAY_PENDING_LIMIT=500 MAX_SECONDS=1800 ACTION_MODE=pause \
  bash ops/trigger/monday-killswitch-monitor.sh
```

Dry-run (no writes):

```bash
cd /home/simon/github/desert-services-hub
DRY_RUN=1 RUNNER_LIMIT=20 MONDAY_PENDING_LIMIT=10 MAX_SECONDS=120 \
  bash ops/trigger/monday-killswitch-monitor.sh
```

## Modes

- `ACTION_MODE=pause`:
  - pauses Monday queues only
- `ACTION_MODE=pause_and_cancel_pending`:
  - pauses Monday queues
  - cancels `PENDING` and `DEQUEUED` Monday runs
- `ACTION_MODE=panic_cancel_all`:
  - pauses Monday queues
  - cancels `PENDING`, `DEQUEUED`, and `EXECUTING` Monday runs

## Important env vars

- `RUNNER_LIMIT` (default `150`)
- `MONDAY_PENDING_LIMIT` (default `0`, disabled)
- `MONDAY_EXECUTING_LIMIT` (default `0`, disabled)
- `POLL_SECONDS` (default `5`)
- `MAX_SECONDS` (default `0`, run forever)
- `EXIT_ON_TRIP` (default `1`)
- `REMEDIATE_STALE_REDIS` (default `1`)
- `MONDAY_QUEUES` (default `monday-sync-item,monday-sync-pipeline`)

---

# Intake Reset + Triage Toolkit

These scripts are for controlled email/intake incident response:

- freeze intake queues
- inspect failures by bucket
- requeue a limited batch safely

Scripts:

- `ops/trigger/intake-reset.sh`
- `ops/trigger/intake-failure-report.sh`
- `ops/trigger/intake-requeue.sh`

## 1) Quiesce/Reset intake queues

Pause intake/mailbox queues and wait for in-flight runs to drain:

```bash
cd /home/simon/github/desert-services-hub
ACTION_MODE=pause WAIT_FOR_DRAIN=1 DRAIN_TIMEOUT_SECONDS=900 \
  bash ops/trigger/intake-reset.sh
```

Pause + cancel queued work (leave executing runs alone):

```bash
cd /home/simon/github/desert-services-hub
ACTION_MODE=pause_and_cancel_pending \
  bash ops/trigger/intake-reset.sh
```

Resume intake queues:

```bash
cd /home/simon/github/desert-services-hub
ACTION_MODE=resume bash ops/trigger/intake-reset.sh
```

Dry run:

```bash
cd /home/simon/github/desert-services-hub
DRY_RUN=1 ACTION_MODE=pause bash ops/trigger/intake-reset.sh
```

## 2) Failure report (where to catch issues)

Show Trigger failure buckets + documents backlog summary:

```bash
cd /home/simon/github/desert-services-hub
HOURS=24 LIMIT=20 bash ops/trigger/intake-failure-report.sh
```

## 3) Requeue a targeted batch

Preview then requeue failed document extraction rows:

```bash
cd /home/simon/github/desert-services-hub
DRY_RUN=1 LIMIT=100 ERROR_LIKE="All providers failed" \
  bash ops/trigger/intake-requeue.sh

DRY_RUN=0 LIMIT=100 ERROR_LIKE="All providers failed" \
  bash ops/trigger/intake-requeue.sh
```

For body-link rows missing local storage, reset emails for body-link rescan:

```bash
cd /home/simon/github/desert-services-hub
MODE=bodylink_rescan DRY_RUN=1 LIMIT=100 \
  bash ops/trigger/intake-requeue.sh

MODE=bodylink_rescan DRY_RUN=0 LIMIT=100 \
  bash ops/trigger/intake-requeue.sh
```
