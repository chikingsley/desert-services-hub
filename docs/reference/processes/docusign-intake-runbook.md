# DocuSign Intake Runbook

Last updated: 2026-02-12

## Scope

This runbook covers the DocuSign dispatcher worker:

- Worker: `apps/workers/docusign-file-automation/ds-contracts-dispatcher`
- Endpoint: `https://contracts-dispatcher.cheez2012.workers.dev/health`
- Trigger modes:
  - Cloudflare Email handler (`contracts-dispatch@desertservices.app`)
  - Manual replay endpoint (`POST /trigger/docusign-link?subject=...`)

## Health And Status Surfaces

- `just status`
  - Includes Cloudflare worker reachability/deployment checks from `ops/runtime/worker-registry.json`.
- Worker health endpoint:
  - `GET /health` returns:
    - `status`
    - `metrics` counters
    - `lastError`
    - `checkedAt`

## Structured Log Events

Logs are JSON lines with `source=contracts-dispatcher` and event names:

- `email.received`
- `email.classified`
- `email.forwarded`
- `email.ignored`
- `manual_trigger.requested`
- `docusign.search.started`
- `docusign.search.found`
- `docusign.search.not_found`
- `notification.sent`
- `error`

## Metrics Fields (`/health`)

- `receivedTotal`
- `manualTriggerTotal`
- `triggerRequestedNewLinkTotal`
- `triggerUnknownTotal`
- `docusignSearchFoundTotal`
- `docusignSearchNotFoundTotal`
- `notificationSentTotal`
- `notificationFailedTotal`
- `workerErrorTotal`
- `forwardFailedTotal`

## Alert Thresholds (Operator Baseline)

Use these as manual alert thresholds until automated alerting is added:

- `workerErrorTotal` increases by >= 3 within 15 minutes
- `notificationFailedTotal` increases by >= 2 within 15 minutes
- `forwardFailedTotal` increases by >= 1 (immediate attention)
- `docusignSearchNotFoundTotal` increases sharply for a known active subject queue

## Troubleshooting Playbook

1. Check worker health:
   - `curl -sS https://contracts-dispatcher.cheez2012.workers.dev/health | jq`
2. Check Cloudflare deployment/status:
   - `just status`
3. Review logs for recent `error` events and `code` values.
4. Validate Graph credentials/secrets in worker environment:
   - `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
5. Replay one document lookup manually:
   - `curl -X POST 'https://contracts-dispatcher.cheez2012.workers.dev/trigger/docusign-link?subject=<url-encoded-subject>'`
6. Confirm notification path:
   - Look for `notification.sent` events and outbound email delivery to `chi@desertservices.net`.

## Failure Classes And Immediate Actions

- `manual_trigger_failed` / `docusign_search_failed`
  - Check Graph auth and mailbox access scopes.
- `notification_send_failed`
  - Validate Cloudflare `SEND_EMAIL` binding and destination policy.
- `forward_failed`
  - Treat as high severity; original email may not reach operator mailbox.
- `email_handler_failed`
  - Inspect malformed MIME/body parsing edge cases.

## Recovery Notes

- If dispatcher is unhealthy, preserve inbound coverage by forwarding contracts mailbox directly to operator until worker is restored.
- Use manual replay endpoint after recovery for missed subjects.
