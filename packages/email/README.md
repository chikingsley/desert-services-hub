# Email CLI

## Layout

- `cli/` runnable scripts
- `src/` reusable email modules (client, commands, sync, enrichment, templates)
- `tests/` test coverage
- `data/` local runtime artifacts (ignored by git)

## Entrypoints

- `bun packages/email/cli/cli.ts`
- `bun packages/email/cli/docusign-link-watcher.ts`
- `bun packages/email/cli/immutable-ids.ts`
- `bun packages/email/cli/retry-attachment-failed-parse.ts`
- `bun packages/email/cli/test-deep-search.ts`
- `bun packages/email/cli/bc-bids-sync.ts`
- `bun packages/email/cli/enrich-accounts.ts`
- `bun packages/email/cli/manage-subscriptions.ts`
- `bun packages/email/cli/cli.ts sync-mailboxes`
- `bun packages/email/cli/cli.ts sync-groups`
- `bun packages/email/cli/post-processing.ts`

## Outlook Webhooks (Real-time Email Sync)

Microsoft Graph change notifications push new emails to our webhook endpoint in real-time instead of relying on periodic fallback sync.

### How it works

1. Subscriptions registered for all 36 mailboxes via Graph API
2. Microsoft POSTs to `https://<project-ref>.supabase.co/functions/v1/outlook-webhook`
3. Edge function enqueues `email_notification` via `enqueue_background_job`
4. Background worker consumes `pgmq.q_background_jobs`, stores/enriches the message
5. A 15-minute `mailbox_fallback_sync` job provides recovery for missed notifications

### Subscription lifecycle

- Max lifetime: ~3 days (4230 min), we use 4200 min
- Auto-renewal: worker renews hourly (anything expiring within 24h)
- Stored in `outlook_subscriptions` table in Postgres

### Management CLI

```bash
# Run from inside Docker (needs DB access):
docker exec desert-hub bun packages/email/cli/manage-subscriptions.ts <command>

# Commands:
create --all                              # Create subs for all 36 mailboxes
create --mailbox=chi@desertservices.net    # Create sub for one mailbox
list                                      # List all subscriptions
renew [--hours=24]                        # Renew expiring subscriptions
delete --all                              # Delete all subscriptions
status                                    # Show subscription health
```

### Env vars

- `WEBHOOK_BASE_URL` — Supabase project base URL (for example `https://<project-ref>.supabase.co`)
- `OUTLOOK_WEBHOOK_SECRET` — clientState validation secret
