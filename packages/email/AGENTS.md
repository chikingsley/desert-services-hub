# Email Package (`packages/email`)

Email sync, webhook ingestion, attachment handling, and mailbox/group CLI operations.

## Scope

- `src/sync/*`: mailbox/group sync orchestration and processors.
- `src/handlers/*`: webhook-driven ingest path.
- `src/commands/*`: CLI command handlers.
- `cli/*`: runnable CLI entrypoints.

## Rules

- Body-link processing must run through `processBodyLinksForEmail()` in `src/sync/body-link-sync.ts`.
- Do not duplicate body-link insert logic in command handlers or webhook/sync runners.
- Keep runners thin:
  - `mailboxes-sync-core.ts` and `webhook-notification-handler.ts` should orchestrate only.
  - parsing/downloading/classification should stay in `src/sync/body-link-*`.
- Preserve idempotency:
  - body-link docs use deterministic `attachmentId` (`bodylink:<source>:<hash>`).
  - skip already scanned emails unless `--force` is explicitly set.
- Keep DocuSign body-link extraction disabled unless explicitly re-approved.

## Body-Link Contract

- Extraction sources:
  - OneDrive/SharePoint
  - Egnyte
  - Dropbox
  - BuildingConnected `goto` links
- Download strategy:
  - direct fetch first
  - Playwright fallback for interactive pages
  - gated pages (password/CAPTCHA) classified as non-retryable
- Diagnostics:
  - failed Playwright attempts write `png/html/json` artifacts to `EMAIL_BODY_LINK_PLAYWRIGHT_DEBUG_DIR`.

## Scan State (emails table)

- `body_link_scan_status`: `pending | no_links | success | gated | failed`
- `body_link_scanned_at`
- `body_link_scan_error`
- `body_link_scan_links_found`
- `body_link_scan_attachments_added`
- `body_link_scan_attempts`
- `body_link_scan_version`

These fields are updated by `recordBodyLinkScanResult()` in `lib/db/repositories/email.ts`.

## Operational Commands

- Mailbox sync (wired path):
  - `bun packages/email/cli/cli.ts sync-mailboxes ...`
- Historical backfill (wired, resumable/skip-aware):
  - `bun packages/email/cli/cli.ts body-link-backfill --mailbox contracts@desertservices.net --since 2025-12-01 --before 2026-02-20 --limit 20`
  - add `--force` only when intentionally reprocessing already-scanned rows
- Automatic backfill (background jobs):
  - queue job type: `body_link_backfill`
  - pg_cron schedule: `bg_body_link_backfill` (every 5 minutes)

## Manual Follow-Up Queue (Gated)

Use the durable follow-up table populated by queued `body_link_manual_followup` jobs:

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
ORDER BY f.last_seen_at DESC;
```

## Testing / Validation

- Keep tests in top-level `tests/packages/email/...`.
- For body-link changes, run:
  - `bun test tests/packages/email/src/sync/body-link-attachments.test.ts tests/packages/email/src/sync/body-link-sync.test.ts`
  - `bunx ultracite check <touched files>`
