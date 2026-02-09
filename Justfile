set shell := ["bash", "-euo", "pipefail", "-c"]
set dotenv-load := true


# Tools (make recipes work in non-login shells where bun isn't in PATH)
BUN := `command -v bun 2>/dev/null || echo "$HOME/.bun/bin/bun"`

default:
    @just --list

# Full project startup: docker stack + user poller services + strict health gate.
up:
    @echo "Bringing up Docker services..."
    docker compose up -d --build
    @echo
    @just services-install
    @echo
    @just check

# Human-readable health snapshot.
status:
    @just _health "0"
    @echo
    @just _cf_check "0"

# Strict local-runtime health gate (non-zero if core stack or poller services are down).
check:
    @just _health "1"
    @echo
    @just _cf_check "0"

# Install and restart user-level systemd services from ops/systemd templates.
services-install:
    @just _services_install "1"

# Install/enable services but do not restart.
services-enable-only:
    @just _services_install "0"

services-status:
    @systemctl --user status desert-outlook-folder-watcher.service desert-notifications.service desert-swppp-sync.service --no-pager -n 40

# Cloudflare worker deployment checks (best effort; requires token scope for deployments list).
cf-check:
    @just _cf_check "0"

cf-check-strict:
    @just _cf_check "1"

# Code Quality (repo-level)
lint:
    @{{BUN}} run lint

typecheck:
    @{{BUN}} run typecheck

code-check:
    @{{BUN}} run check

fix:
    @{{BUN}} run fix

[private]
_services_install start_after_install:
    #!/usr/bin/env bash
    set -euo pipefail

    START_AFTER_INSTALL="{{start_after_install}}"
    ROOT_DIR="{{justfile_directory()}}"
    SRC_DIR="${ROOT_DIR}/ops/systemd"
    DST_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

    if ! command -v systemctl >/dev/null 2>&1; then
      echo "systemctl is required for service installation."
      exit 1
    fi

    if ! systemctl --user show-environment >/dev/null 2>&1; then
      echo "systemctl --user is not available in this shell."
      exit 1
    fi

    units=(
      "desert-outlook-folder-watcher.service"
      "desert-notifications.service"
      "desert-swppp-sync.service"
    )

    mkdir -p "$DST_DIR"
    for unit in "${units[@]}"; do
      install -m 0644 "${SRC_DIR}/${unit}" "${DST_DIR}/${unit}"
      echo "[OK] Installed ${unit}"
    done

    systemctl --user daemon-reload

    for unit in "${units[@]}"; do
      systemctl --user enable "$unit" >/dev/null
      if [[ "$START_AFTER_INSTALL" == "1" ]]; then
        systemctl --user restart "$unit"
      fi
    done

    echo
    echo "User services ready."
    for unit in "${units[@]}"; do
      active="$(systemctl --user is-active "$unit" 2>/dev/null || true)"
      enabled="$(systemctl --user is-enabled "$unit" 2>/dev/null || true)"
      echo "  - ${unit}: active=${active}, enabled=${enabled}"
    done

[private]
_health strict:
    #!/usr/bin/env bash
    set -u

    STRICT="{{strict}}"
    ROOT_DIR="{{justfile_directory()}}"
    cd "$ROOT_DIR" || exit 1

    PASS_COUNT=0
    WARN_COUNT=0
    FAIL_COUNT=0

    ok() {
      printf '[OK] %s\n' "$1"
      PASS_COUNT=$((PASS_COUNT + 1))
    }

    warn() {
      printf '[WARN] %s\n' "$1"
      WARN_COUNT=$((WARN_COUNT + 1))
    }

    fail() {
      printf '[FAIL] %s\n' "$1"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    }

    is_running_service() {
      local target="$1"
      local running_services="$2"
      printf '%s\n' "$running_services" | grep -Fxq "$target"
    }

    check_http_health() {
      local label="$1"
      local url="$2"
      local required="$3"

      if ! command -v curl >/dev/null 2>&1; then
        warn "curl is missing; cannot verify ${label} HTTP health (${url})"
        return
      fi

      if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
        ok "${label} health endpoint is reachable (${url})"
      else
        if [[ "$required" == "required" ]]; then
          fail "${label} health endpoint is not reachable (${url})"
        else
          warn "${label} health endpoint is not reachable (${url})"
        fi
      fi
    }

    echo "Desert Services Hub - System Health"
    echo "Repository: $ROOT_DIR"
    echo

    echo "== Docker Compose =="
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
      running_services="$(docker compose ps --status running --services 2>/dev/null || true)"

      required_docker_services=(web webhooks permit-worker)
      optional_docker_services=(tunnel)

      for service in "${required_docker_services[@]}"; do
        if is_running_service "$service" "$running_services"; then
          ok "docker compose service '${service}' is running"
        else
          fail "docker compose service '${service}' is not running"
        fi
      done

      for service in "${optional_docker_services[@]}"; do
        if is_running_service "$service" "$running_services"; then
          ok "docker compose service '${service}' is running"
        else
          warn "docker compose service '${service}' is not running"
        fi
      done
    else
      fail "docker compose is not available in this environment"
    fi

    echo
    echo "== HTTP Health Endpoints =="
    check_http_health "web" "http://localhost:3000/api/health" required
    check_http_health "webhooks" "http://localhost:4747/api/health" required
    check_http_health "permit-worker" "http://localhost:47822/health" required

    echo
    echo "== User Systemd Pollers =="
    required_units=(
      "desert-outlook-folder-watcher.service"
      "desert-notifications.service"
      "desert-swppp-sync.service"
    )

    if command -v systemctl >/dev/null 2>&1; then
      if systemctl --user show-environment >/dev/null 2>&1; then
        unit_listing="$(systemctl --user list-unit-files --type=service --no-legend 2>/dev/null | awk '{print $1}')"

        for unit in "${required_units[@]}"; do
          if ! printf '%s\n' "$unit_listing" | grep -Fxq "$unit"; then
            fail "${unit} is missing (run: just services-install)"
            continue
          fi

          active_state="$(systemctl --user is-active "$unit" 2>/dev/null || true)"
          enabled_state="$(systemctl --user is-enabled "$unit" 2>/dev/null || true)"

          if [[ "$active_state" == "active" ]]; then
            ok "${unit} is active"
          else
            fail "${unit} is not active (state: ${active_state})"
          fi

          if [[ "$enabled_state" == "enabled" ]]; then
            ok "${unit} is enabled"
          else
            fail "${unit} is not enabled (state: ${enabled_state})"
          fi
        done
      else
        warn "systemctl --user bus is not available in this shell; skipping poller checks"
      fi
    else
      warn "systemctl is not installed; skipping poller checks"
    fi

    echo
    echo "Summary: ${PASS_COUNT} ok, ${WARN_COUNT} warning(s), ${FAIL_COUNT} failure(s)"

    if [[ "$STRICT" == "1" && "$FAIL_COUNT" -gt 0 ]]; then
      exit 1
    fi

[private]
_cf_check strict:
    #!/usr/bin/env bash
    set -u

    STRICT="{{strict}}"
    ROOT_DIR="{{justfile_directory()}}"
    cd "$ROOT_DIR" || exit 1

    PASS=0
    WARN=0
    FAIL=0

    ok() {
      printf '[OK] %s\n' "$1"
      PASS=$((PASS + 1))
    }

    warn() {
      printf '[WARN] %s\n' "$1"
      WARN=$((WARN + 1))
    }

    fail() {
      printf '[FAIL] %s\n' "$1"
      FAIL=$((FAIL + 1))
    }

    echo "Cloudflare Worker Deployment Check"
    echo "Repository: $ROOT_DIR"
    echo

    BUNX="$(command -v bunx || true)"
    if [[ -z "$BUNX" && -x "$HOME/.bun/bin/bunx" ]]; then
      BUNX="$HOME/.bun/bin/bunx"
    fi

    if [[ -z "$BUNX" ]]; then
      warn "bunx not found; skipping Cloudflare deployment checks"
      exit 0
    fi

    if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
      warn "CLOUDFLARE_API_TOKEN not set; skipping Cloudflare deployment checks"
      exit 0
    fi

    auth_out="$("$BUNX" --bun wrangler whoami 2>&1)"
    auth_status=$?
    if [[ $auth_status -ne 0 || "$auth_out" == *"[ERROR]"* || "$auth_out" == *"Authentication error"* || "$auth_out" == *"Too many authentication failures"* ]]; then
      msg="${auth_out//$'\n'/ }"
      if [[ "$STRICT" == "1" ]]; then
        fail "Wrangler auth check failed (${msg})"
      else
        warn "Wrangler auth check failed (${msg})"
      fi
      echo
      echo "Cloudflare summary: ${PASS} ok, ${WARN} warning(s), ${FAIL} failure(s)"
      if [[ "$STRICT" == "1" && "$FAIL" -gt 0 ]]; then
        exit 1
      fi
      exit 0
    fi

    workers=(
      "apps/workers/estimates-sync-worker:estimates-sync"
      "apps/workers/monday-status-sync-worker:monday-status-sync"
      "apps/workers/inspections-email-worker:inspection-router"
      "apps/workers/dust-permit-intake:dust-permit-intake"
      "apps/workers/docusign-file-automation/ds-contracts-dispatcher:contracts-dispatcher"
    )

    for worker in "${workers[@]}"; do
      dir="${worker%%:*}"
      name="${worker##*:}"

      if [[ ! -d "$dir" ]]; then
        warn "${name}: directory missing (${dir})"
        continue
      fi

      output="$(cd "$dir" && "$BUNX" --bun wrangler deployments list --json 2>&1)"
      status=$?

      if [[ $status -ne 0 ]]; then
        # Most common: token missing scopes (e.g. memberships read)
        if [[ "$STRICT" == "1" ]]; then
          fail "${name}: deployment check failed (${output//$'\n'/ })"
        else
          warn "${name}: deployment check unavailable (${output//$'\n'/ })"
        fi
        continue
      fi

      if [[ -z "${output// }" ]]; then
        warn "${name}: wrangler returned empty deployment output"
      elif printf '%s' "$output" | grep -q '"id"'; then
        ok "${name}: deployment history available"
      else
        warn "${name}: no deployment entries found"
      fi
    done

    echo
    echo "Cloudflare summary: ${PASS} ok, ${WARN} warning(s), ${FAIL} failure(s)"

    if [[ "$STRICT" == "1" && "$FAIL" -gt 0 ]]; then
      exit 1
    fi
