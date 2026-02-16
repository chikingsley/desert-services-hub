# Email CLI

## Layout

- `cli/` runnable scripts
- `src/` reusable email modules (client, commands, sync, enrichment, templates)
- `tests/` test coverage
- `resources/` tracked reference assets used by inbox workflows
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
- `bun packages/email/cli/sync-mailboxes.ts`
- `bun packages/email/cli/sync-groups.ts`
- `bun packages/email/cli/post-processing.ts`

## Outlook Webhooks (Real-time Email Sync)

Microsoft Graph change notifications push new emails to our webhook endpoint in real-time instead of waiting for the 5-min polling cycle.

### How it works

1. Subscriptions registered for all 36 mailboxes via Graph API
2. Microsoft POSTs to `https://monday-estimates.desertservices.app/api/webhooks/outlook`
3. Webhook enqueues `email_notification` jobs to `webhook_jobs` table
4. Background worker fetches the single message, stores it, enriches it
5. Existing 5-min polling stays as fallback for missed notifications

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

- `WEBHOOK_BASE_URL` — public tunnel URL (currently `https://monday-estimates.desertservices.app`)
- `OUTLOOK_WEBHOOK_SECRET` — clientState validation secret
