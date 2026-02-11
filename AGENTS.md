# Desert Services Hub - Agent Notes

This repo runs as a split runtime:
- **Docker Compose** for always-on web/webhooks/permit-worker services.
- **systemd (user units)** on the host for long-running poller workers.

## Where This Runs

- Primary host: `gmk-server`
- Repo path: `/home/simon/github/desert-services-hub`

## First Commands (Ops)

- `just up`        : build + start docker stack, install/restart pollers, strict health gate
- `just status`    : human-readable snapshot (docker + HTTP + pollers + best-effort CF)
- `just check`     : strict health gate (non-zero if core runtime is down)
- `just services-install` : (re)install poller unit files from `ops/systemd/`

## Code Quality

- `just code-check` : typecheck + lint
- `just fix`        : autofix lint issues

Note: repo tests include **integration coverage** that can trigger Microsoft device-login and create Outlook drafts.

## Runtime Inventory

Docker Compose (see `docker-compose.yml`):
- `web` (port 3000)
- `webhooks` (port 4747)
- `permit-worker` (port 47822)
- `tunnel` (optional)

Host pollers (systemd user units, see `ops/systemd/*.service`):
- `desert-outlook-folder-watcher.service`
- `desert-notifications.service`
- `desert-swppp-sync.service`

## Debugging Shortcuts

- Docker:
  - `docker compose ps`
  - `docker compose logs -f web|webhooks|permit-worker`
- Pollers:
  - `systemctl --user status desert-outlook-folder-watcher.service`
  - `journalctl --user -u desert-outlook-folder-watcher.service -n 200 --no-pager`

## Docs

- `SYSTEM-MAP.md` for the current runtime map and data flows.
- `CLAUDE.md` for detailed conventions and testing rules.

## Safety Docs Ops (SSSP/SDS)

- Primary SSSP input for current LGE packet:
  - `data/triage/1400-w-3rd/sssp-input.json`
- Generate SSSP PDF:
  - `bun apps/cli-tools/sssp-cli/bin/cli.ts generate --in <input.json> --out <output.pdf>`
- Contact policy for this flow:
  - Project lead defaults to the assigned Site Services Manager (SSM) from current sales-territory assignment, unless user overrides.
  - For lead/field/dispatcher contacts, format phone as two lines:
    - `C: (###) ###-####`
    - `O: (###) ###-####`
  - Do not wrap phone numbers within a line.
- Work Mac delivery:
  - Use SSH alias `work-mac` from `~/.ssh/config`.
  - Copy outputs to project folder:
    - `~/Downloads/1400w3rd/`
  - Open with Preview via AppleScript:
    - `osascript -e 'tell application "Preview" to open POSIX file "...pdf"'`
