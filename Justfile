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

# Legacy no-op alias.
services-enable-only:
    @just services-install

services-status:
    @docker compose ps notifications swppp-sync

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
    @just docs-path-check

fix:
    @{{BUN}} run fix

# Validate AGENTS/skill path references stay aligned with real files.
docs-path-check:
    @{{BUN}} run scripts/check-doc-paths.ts

# Webhook Jobs: inspect / requeue background jobs in the `webhook_jobs` table.
jobs *args:
    @{{BUN}} apps/web/cli/webhook-jobs.ts {{args}}

# Deterministic project triage audit (linkage/completeness/DOD).
triage-audit project_id:
    @scripts/triage-audit.sh --project-id {{project_id}}

# Resolve project/estimate candidates using schema-safe SQL.
triage-resolve query:
    @cat scripts/sql/triage_resolve_candidates.sql | docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres -v q='{{query}}'

# Build a deduplicated post-date follow-up story for a project/account search query.
triage-followup-story query exact_subject since="2025-12-01" counterparty_domain="tofeldent.com":
    @cat scripts/sql/triage_followup_story.sql | docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres \
      -v query='{{query}}' \
      -v since='{{since}}' \
      -v exact_subject='{{exact_subject}}' \
      -v counterparty_domain='{{counterparty_domain}}'

# Single-shot project story JSON from sparse input.
# Examples:
#   PROJECT_ID=103 just project-story
#   SUBJECT="FW: DPX8 - Site Surrender Project" SINCE=2026-02-01 TIMELINE_LIMIT=12 just project-story
project-story:
    @scripts/project-story.sh

# Smoke test for project-story resolution + latency sanity.
project-story-smoke:
    @scripts/project-story-smoke.sh

# Refresh deduplicated project-email materialized view.
email-dedup-refresh:
    @docker exec supabase_db_desert-services-hub psql -U postgres -d postgres -c "REFRESH MATERIALIZED VIEW CONCURRENTLY public.project_email_dedup_mv;"

# Refresh deduplicated inbox-email materialized view used by /api/emails default listing path.
email-list-dedup-refresh:
    @docker exec supabase_db_desert-services-hub psql -U postgres -d postgres -c "REFRESH MATERIALIZED VIEW CONCURRENTLY public.email_list_dedup_mv;"

# Show deduplicated project-email summary and top duplicates.
email-dedup-report project_id limit="30" refresh="":
    @scripts/project-email-dedup-report.sh --project-id {{project_id}} --limit {{limit}} {{refresh}}

# Contract reporting fast paths (coarse project-level status).
contracts-status-summary:
	@cat scripts/sql/contracts_status_summary.sql | docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres

contracts-pending:
	@cat scripts/sql/contracts_pending.sql | docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres

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
    BUN_CMD="$(command -v bun 2>/dev/null || true)"
    if [[ -z "$BUN_CMD" && -x "$HOME/.bun/bin/bun" ]]; then
      BUN_CMD="$HOME/.bun/bin/bun"
    fi

    read_registry_lines() {
      local key="$1"
      if [[ -z "$BUN_CMD" ]]; then
        return 1
      fi
      "$BUN_CMD" "$ROOT_DIR/scripts/runtime-registry.ts" "$key"
    }

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
      mapfile -t required_docker_services < <(read_registry_lines "compose.required" 2>/dev/null || true)
      mapfile -t optional_docker_services < <(read_registry_lines "compose.optional" 2>/dev/null || true)

      if [[ ${#required_docker_services[@]} -eq 0 ]]; then
        required_docker_services=(web webhooks permit-worker notifications swppp-sync)
        warn "runtime registry unavailable for compose.required; using fallback defaults"
      fi

      if [[ ${#optional_docker_services[@]} -eq 0 ]]; then
        optional_docker_services=(tunnel)
        warn "runtime registry unavailable for compose.optional; using fallback defaults"
      fi

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
    echo "== Legacy User Systemd Overlap =="
    mapfile -t legacy_units < <(read_registry_lines "legacySystemdOverlapUnits" 2>/dev/null || true)
    if [[ ${#legacy_units[@]} -eq 0 ]]; then
      legacy_units=(
        "desert-notifications.service"
        "desert-swppp-sync.service"
        "desert-estimate-email-linker.service"
        "desert-outlook-folder-watcher.service"
      )
      warn "runtime registry unavailable for legacySystemdOverlapUnits; using fallback defaults"
    fi

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
    BUN_CMD="$(command -v bun 2>/dev/null || true)"
    if [[ -z "$BUN_CMD" && -x "$HOME/.bun/bin/bun" ]]; then
      BUN_CMD="$HOME/.bun/bin/bun"
    fi

    read_registry_lines() {
      local key="$1"
      if [[ -z "$BUN_CMD" ]]; then
        return 1
      fi
      "$BUN_CMD" "$ROOT_DIR/scripts/runtime-registry.ts" "$key"
    }

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

    mapfile -t workers < <(read_registry_lines "cloudflare.deploymentWorkers" 2>/dev/null || true)
    if [[ ${#workers[@]} -eq 0 ]]; then
      workers=(
        "apps/workers/intake-worker|intake-worker|https://intake-worker.cheez2012.workers.dev/health"
        "apps/workers/estimates-sync-worker|estimates-sync|https://estimates-sync.cheez2012.workers.dev/"
        "apps/workers/monday-status-sync-worker|monday-status-sync|https://monday-status-sync.cheez2012.workers.dev/"
        "apps/workers/inspections-email-worker|inspection-router|https://inspection-router.cheez2012.workers.dev/"
      )
      warn "runtime registry unavailable for cloudflare.deploymentWorkers; using fallback defaults"
    fi

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
