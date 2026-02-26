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
- `TRIGGER_API_URL` (used by webhook ingress to trigger Trigger.dev tasks)
- `TRIGGER_SECRET_KEY` (used by webhook ingress auth to Trigger.dev)

## Endpoints

- `POST /functions/v1/monday-webhook`
- `POST /functions/v1/outlook-webhook`
- `POST /functions/v1/intake-webhook`

## Monday Runtime Behavior

- Webhook ingress (`monday-webhook`) always responds to Monday challenge verification payloads.
- Webhook ingress triggers Trigger.dev task `monday-sync-item` for ESTIMATING-board events (when `pulseId` is present).
- Periodic reconciliation runs from Trigger.dev schedules (`monday-sync-incremental` and `monday-sync`), not `pg_cron`.

## Monday Webhook Registration

Use:

```bash
bun packages/monday/cli/setup-webhooks.ts --url=https://<your-base-url>
bun packages/monday/cli/setup-webhooks.ts --url=https://<your-base-url> --boards=ESTIMATING,LEADS,PROJECTS
```

The setup script now points Monday webhooks to `/functions/v1/monday-webhook`.
