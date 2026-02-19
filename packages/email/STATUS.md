# Email Body-Link Status

Snapshot time: `2026-02-19`

## 1) Pipeline Wiring

Body-link processing is wired into both live paths:

- Webhook ingest path:
  - `packages/email/src/handlers/webhook-notification-handler.ts`
- Mailbox sync path:
  - `packages/email/src/sync/mailboxes-sync-core.ts`

Both call the shared processor:

- `packages/email/src/sync/body-link-sync.ts`

## 2) Current Behavior

- Extracts body links from OneDrive/SharePoint, Egnyte, Dropbox, BuildingConnected.
- Attempts direct fetch first; uses Playwright fallback for interactive pages.
- Detects non-retryable gated pages (`password protected`, `CAPTCHA`) and marks them `gated`.
- Persists per-email scan state on `emails` (`body_link_scan_*` fields).
- Skips already-scanned emails on subsequent backfills (unless `--force`).

## 3) Verified Result (Contracts Window)

Window tested:

- mailbox: `contracts@desertservices.net`
- since: `2025-12-01`
- before: `2026-02-20`
- limit: `20`

Result:

- `success`: `9`
- `gated`: `11`

The gated set corresponds to links like:

- `https://mycon.egnyte.com/fl/BpvvPjmHmBBX`

Playwright diagnostics for gated failures are written under:

- `data/attachments/body-links-debug/`

## 4) Historical Backfill Runbook

Run historical coverage by mailbox and date window:

```bash
bun packages/email/cli/cli.ts body-link-backfill \
  --mailbox contracts@desertservices.net \
  --since 2024-01-01 \
  --before 2026-02-20 \
  --limit 5000
```

Run all mailboxes (omit `--mailbox`) in smaller windows if needed.

Only use force-reprocessing intentionally:

```bash
bun packages/email/cli/cli.ts body-link-backfill ... --force
```

## 5) Automatic Backfill

Background jobs now enqueue `body_link_backfill` on startup and via pg_cron (`bg_body_link_backfill`, every 5 minutes).

Default runtime controls (env):

- `BODY_LINK_BACKFILL_ENABLED=1`
- `BODY_LINK_BACKFILL_LOOKBACK_DAYS=365`
- `BODY_LINK_BACKFILL_LIMIT=20`
- `BODY_LINK_BACKFILL_MAX_LINKS=12`
- `BODY_LINK_BACKFILL_MAILBOX_FILTER=` (blank means all mailboxes)

## 6) Manual Follow-Up Queue

Gated/manual failures are persisted via queued `body_link_manual_followup` jobs into `body_link_manual_followups`.

Track rows pending manual follow-up:

```sql
SELECT
  f.id,
  f.email_id,
  f.mailbox_email,
  e.received_at,
  e.subject,
  f.source,
  f.url,
  f.reason,
  f.status,
  f.occurrences,
  f.last_seen_at
FROM body_link_manual_followups f
JOIN emails e ON e.id = f.email_id
WHERE f.status = 'pending'
ORDER BY f.last_seen_at DESC;
```

## 7) Ongoing Plan

- Continue running `body-link-backfill` across historical ranges until desired coverage is complete.
- Use `body_link_scan_status` counts (`success/gated/failed/no_links`) as the source of truth.
- Use `body_link_manual_followups` for manual outreach/unlock follow-up queue.
