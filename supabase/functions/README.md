# Supabase Edge Functions (Webhook Ingress)

These functions are the canonical ingress for external webhooks:

- `monday-webhook`
- `outlook-webhook`
- `intake-webhook`

## Required Runtime Secrets

Set for edge runtime:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OUTLOOK_WEBHOOK_SECRET` (for Outlook validation)
- `MONDAY_WEBHOOK_BOARD_IDS` (comma-separated board IDs, optional)
- `MONDAY_ESTIMATING_BOARD_ID` (optional; defaults to `7943937851`)
- `BACKGROUND_JOBS_WEBHOOK_URL` (used by `intake-webhook` to forward payloads)

## Endpoints

- `POST /functions/v1/monday-webhook`
- `POST /functions/v1/outlook-webhook`
- `POST /functions/v1/intake-webhook`

## Monday Runtime Behavior

- Webhook ingress (`monday-webhook`) always responds to Monday challenge verification payloads.
- Webhook ingress enqueues `sync_item` only for ESTIMATING-board events (when `pulseId` is present).
- Webhook ingress also enqueues `monday_status_sync` with queue dedupe enabled for fast post-change convergence.
- Periodic reconciliation remains in `pg_cron` with `bg_sync_full` every 10 minutes.
- Periodic status reconciliation remains in `pg_cron` with `bg_monday_status_sync` hourly.

## Monday Webhook Registration

Use:

```bash
bun packages/monday/cli/setup-webhooks.ts --url=https://<your-base-url>
bun packages/monday/cli/setup-webhooks.ts --url=https://<your-base-url> --boards=ESTIMATING,LEADS,PROJECTS
```

The setup script now points Monday webhooks to `/functions/v1/monday-webhook`.
