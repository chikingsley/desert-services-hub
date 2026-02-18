set shell := ["bash", "-euo", "pipefail", "-c"]
set dotenv-load := true


# Tools (make recipes work in non-login shells where bun isn't in PATH)
BUN := `command -v bun 2>/dev/null || echo "$HOME/.bun/bin/bun"`

default:
    @just --list

# Full project startup: docker stack + strict health gate.
up:
    @echo "Bringing up Docker services..."
    docker compose up -d --build
    @echo
    @just check

# Human-readable health snapshot.
status:
    @just _health "0"
    @echo
    @just _cf_check "0"

# Strict local-runtime health gate (non-zero if core runtime is down or legacy overlap exists).
check:
    @just _health "1"
    @echo
    @just _cf_check "0"

# Legacy no-op (host pollers migrated to Docker Compose).
services-install:
    @echo "No user systemd pollers to install. Pollers run as Docker Compose services."

services-status:
    @docker compose ps background-jobs

# Cloudflare worker deployment checks (best effort; requires token scope for deployments list).
cf-check:
    @just _cf_check "0"

cf-check-strict:
    @just _cf_check "1"

# Permits
# Run typed client integration checks (tunnel-based, no mock servers).
permits-test-client:
    @{{BUN}} run permits:test:client

# Run full renew+pay E2E in permit-worker runtime container.
permits-test-renew-pay:
    @{{BUN}} run permits:test:renew-and-pay

# Quick tunnel smoke check for permit-worker proxy routes.
permits-probe:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Probing permit tunnel routes..."
    curl -fsS --max-time 10 "https://web.desertservices.app/api/browser/status" >/dev/null
    tmp_file="$(mktemp)"
    status_code="$(curl -sS -o "$tmp_file" -w '%{http_code}' \
      -X POST "https://web.desertservices.app/api/permits/D0000000/renew-and-pay" \
      -H "content-type: application/json" \
      -d '{}')"
    rm -f "$tmp_file"
    if [[ "$status_code" != "400" ]]; then
      echo "Expected 400 from invalid renew-and-pay payload, got: $status_code" >&2
      exit 1
    fi
    echo "Permit tunnel probe OK"

# Code Quality (repo-level)
lint:
    @{{BUN}} run lint

typecheck:
    @{{BUN}} run typecheck

code-check:
    @{{BUN}} run check
    @just docs-path-check
    @just folder-size-check

fix:
    @{{BUN}} run fix

# Validate AGENTS/skill path references stay aligned with real files.
docs-path-check:
    @{{BUN}} run .github/scripts/check-doc-paths.ts

# Flag source directories with too many files (default: 10).
folder-size-check:
    @{{BUN}} run .github/scripts/check-folder-size.ts

# Webhook Jobs: inspect / requeue background jobs in the `webhook_jobs` table.
jobs *args:
    @{{BUN}} apps/background-jobs/cli/webhook-jobs.ts {{args}}

# Estimate-driven project seed lifecycle sync (create/update/promote/link/canonicalize).
# Examples:
#   just project-seed-sync
#   just project-seed-sync-dry limit=250 stale_days=45
project-seed-sync stale_days="45":
    @{{BUN}} apps/background-jobs/workers/estimate-poller/cli/project-seed-sync.ts --stale-days {{stale_days}}

project-seed-sync-dry limit="250" stale_days="45":
    @{{BUN}} apps/background-jobs/workers/estimate-poller/cli/project-seed-sync.ts --dry-run --limit {{limit}} --stale-days {{stale_days}}

# Refresh deduplicated project-email materialized view.
email-dedup-refresh:
    @docker exec supabase_db_desert-services-hub psql -U postgres -d postgres -c "REFRESH MATERIALIZED VIEW CONCURRENTLY public.project_email_dedup_mv;"

# Refresh deduplicated inbox-email materialized view used by /api/emails default listing path.
email-list-dedup-refresh:
    @docker exec supabase_db_desert-services-hub psql -U postgres -d postgres -c "REFRESH MATERIALIZED VIEW CONCURRENTLY public.email_list_dedup_mv;"

# Contract reporting fast paths (coarse project-level status).
contracts-status-summary:
	@docker exec supabase_db_desert-services-hub psql -U postgres -d postgres -c "SELECT COUNT(*) FILTER (WHERE contract_status = 'Pending' OR contract_status IS NULL) AS pending, COUNT(*) FILTER (WHERE contract_status = 'Received') AS received, COUNT(*) FILTER (WHERE contract_status = 'Sent Back') AS sent_back, COUNT(*) FILTER (WHERE contract_status = 'Executed') AS executed, COUNT(*) AS total FROM projects;"

contracts-pending:
	@docker exec supabase_db_desert-services-hub psql -U postgres -d postgres -c "SELECT id, name, contractor, COALESCE(contract_status, 'Pending') AS contract_status FROM projects WHERE contract_status = 'Pending' OR contract_status IS NULL ORDER BY name;"

contracts-pending-csv out="data/reports/contracts-pending.csv":
	@mkdir -p $(dirname {{out}})
	@docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres -c "\copy (SELECT id, name, contractor, COALESCE(contract_status, 'Pending') AS contract_status FROM projects WHERE contract_status = 'Pending' OR contract_status IS NULL ORDER BY name) TO STDOUT WITH CSV HEADER" > {{out}}
	@echo "Wrote {{out}}"

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
      required_docker_services=(web background-jobs permit-worker)
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
    check_http_health "background-jobs" "http://localhost:4747/api/health" required
    check_http_health "permit-worker" "http://localhost:47822/health" required

    echo
    echo "== Legacy User Systemd Overlap =="
    legacy_units=(
      "desert-notifications.service"
      "desert-swppp-sync.service"
      "desert-estimate-email-linker.service"
      "desert-outlook-folder-watcher.service"
    )

    if command -v systemctl >/dev/null 2>&1; then
      if systemctl --user show-environment >/dev/null 2>&1; then
        for unit in "${legacy_units[@]}"; do
          active_state="$(systemctl --user is-active "$unit" 2>/dev/null || true)"
          enabled_state="$(systemctl --user is-enabled "$unit" 2>/dev/null || true)"
          if [[ "$active_state" == "active" || "$enabled_state" == "enabled" ]]; then
            fail "${unit} still active/enabled (disable to avoid duplicate polling)"
          else
            ok "${unit} is not active/enabled"
          fi
        done
      else
        warn "systemctl --user bus is not available in this shell; skipping legacy-overlap checks"
      fi
    else
      warn "systemctl is not installed; skipping legacy-overlap checks"
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
      "apps/cf-workers/intake-worker|intake-worker|https://intake-worker.cheez2012.workers.dev/health"
      "apps/cf-workers/estimates-sync-worker|estimates-sync|https://estimates-sync.cheez2012.workers.dev/"
      "apps/cf-workers/inspections-email-worker|inspection-router|https://inspection-router.cheez2012.workers.dev/"
    )

    for worker in "${workers[@]}"; do
      IFS='|' read -r dir name url <<< "$worker"

      if [[ ! -d "$dir" ]]; then
        warn "${name}: directory missing (${dir})"
        continue
      fi

      if [[ -n "${url:-}" ]]; then
        if command -v curl >/dev/null 2>&1; then
          if curl -fsS --max-time 8 "$url" >/dev/null 2>&1; then
            ok "${name}: reachable (${url})"
            continue
          fi
          warn "${name}: not reachable (${url})"
        else
          warn "curl is missing; cannot verify ${name} URL (${url})"
        fi
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
