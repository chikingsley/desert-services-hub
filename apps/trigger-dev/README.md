# Trigger Self-Hosting (Desert Services Hub)

This folder contains the Trigger.dev self-host infra that runs `https://trigger.desertservices.app`.

## Source of truth

- Infra config: `docker-compose.yml` (services with `profiles: ["trigger"]`)
- Trigger env file: `apps/trigger-dev/hosting/docker/.env` (local only)
- Trigger task code (your custom TS jobs): `apps/trigger-dev/src/trigger/`
- Trigger SDK config: `trigger.config.ts`

## How it is run

From repo root:

- `just trigger-up`
- `just trigger-down`
- `just trigger-ps`
- `just trigger-logs service=webapp`
- `just trigger-health`

## Communication model

- Inbound webhooks trigger tasks through Trigger API:
  - `supabase/functions/outlook-webhook/index.ts`
  - `supabase/functions/monday-webhook/index.ts`
- `outlook-webhook-subscriptions` (scheduled) keeps Graph subscriptions alive for all rows in `mailboxes`.
- Trigger worker launches task-run containers through `docker-proxy`.
- Task-run containers are attached to `desert-services-hub_default`.

That network is what allows task containers to call services in the main app compose stack by service DNS names when those services are up (for example `permit-worker`).

## Notes

- Legacy split compose files (`webapp`, `worker`, `traefik`) were removed.
- Traefik is not used here; ingress is handled by Cloudflare tunnel to `localhost:8030`.

## Guardrails in this setup

- Telemetry disabled: `TRIGGER_TELEMETRY_DISABLED=1`
- Concurrency guardrails live in `apps/trigger-dev/hosting/docker/.env`
  - `DEFAULT_ENV_EXECUTION_CONCURRENCY_LIMIT`
  - `DEFAULT_ORG_EXECUTION_CONCURRENCY_LIMIT`
  - `TRIGGER_DEQUEUE_MAX_RUN_COUNT`
  - `TRIGGER_DEQUEUE_MAX_CONSUMER_COUNT`
- Task queue defaults live next to the Trigger tasks in `apps/trigger-dev/src/trigger/queue.ts`
- DB pool defaults live in `lib/db/client.ts`

## Outlook webhook subscription config

- Optional explicit URL: `OUTLOOK_WEBHOOK_URL`
- Default fallback: `${WEBHOOK_BASE_URL}/functions/v1/outlook-webhook`
- Current runtime bridge: `webhooks.desertservices.app` -> local `webhook-gateway` (`localhost:4000`) -> Supabase Kong (`localhost:54321`)
