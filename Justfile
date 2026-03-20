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

# Web-only dev startup: bind-mounted source + Bun hot reload.
web-dev:
    @echo "Starting web in dev mode (docker-compose.yml + docker-compose.dev.yml)..."
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d web
    @echo
    @docker compose -f docker-compose.yml -f docker-compose.dev.yml ps web

# Full project startup including Trigger.dev self-host stack.
up-all:
    @echo "Bringing up core Docker services..."
    docker compose up -d --build
    @echo
    @echo "Bringing up Trigger.dev stack..."
    docker compose --profile trigger up -d webapp supervisor postgres redis electric clickhouse registry minio docker-proxy
    @echo
    @just check

# Human-readable health snapshot.
status:
    @just _health "0"
    @echo
    @just _cf_check "0"

# Trigger.dev compose status snapshot.
trigger-ps:
    @docker compose ps webapp supervisor postgres redis electric clickhouse registry minio docker-proxy

# Trigger.dev dashboard health check.
trigger-health:
    @curl -fsS --max-time 10 "http://localhost:8030/healthcheck"
    @echo

# Strict local-runtime health gate (non-zero if core runtime is down or legacy overlap exists).
check:
    @just _health "1"
    @echo
    @just _cf_check "0"

# Legacy no-op (host pollers migrated to Docker Compose).
services-install:
    @echo "No user systemd pollers to install. Pollers run as Docker Compose services."

services-status:
    @docker compose ps web permit-worker aqdata-worker

# Trigger.dev stack lifecycle.
trigger-up:
    @docker compose --profile trigger up -d webapp supervisor postgres redis electric clickhouse registry minio docker-proxy

trigger-down:
    @docker compose stop webapp supervisor postgres redis electric clickhouse registry minio docker-proxy
    @docker compose rm -f webapp supervisor postgres redis electric clickhouse registry minio docker-proxy

trigger-restart service="webapp":
    @docker compose --profile trigger up -d --force-recreate {{service}}

trigger-logs service="webapp":
    @docker compose logs -f --tail 200 {{service}}

# Hatchet orchestration engine lifecycle.
hatchet-up:
    @docker compose --profile hatchet up -d hatchet

hatchet-down:
    @docker compose stop hatchet
    @docker compose rm -f hatchet

hatchet-logs:
    @docker compose logs -f --tail 200 hatchet

# Start the Hatchet worker (long-running bun process).
hatchet-worker:
    {{BUN}} run apps/hatchet/src/worker.ts

# Monday queue guardrail: trips and pauses Monday queues when thresholds are hit.
# Example:
#   just monday-killswitch 150 500 1800 pause
monday-killswitch run_limit="150" pending_limit="0" max_seconds="1800" mode="pause":
    @RUNNER_LIMIT={{run_limit}} MONDAY_PENDING_LIMIT={{pending_limit}} MAX_SECONDS={{max_seconds}} ACTION_MODE={{mode}} \
      bash ops/trigger/monday-killswitch-monitor.sh

# Intake reset/quiesce control for mailbox + document ingestion queues.
# mode: pause | pause_and_cancel_pending | panic_cancel_all | resume
trigger-intake-reset mode="pause" wait_for_drain="1" drain_timeout="900":
    @ACTION_MODE={{mode}} WAIT_FOR_DRAIN={{wait_for_drain}} DRAIN_TIMEOUT_SECONDS={{drain_timeout}} \
      bash ops/trigger/intake-reset.sh

# Intake failure report (Trigger runs + documents backlog/error buckets).
trigger-intake-report hours="24" limit="20":
    @HOURS={{hours}} LIMIT={{limit}} bash ops/trigger/intake-failure-report.sh

# Requeue failed extraction docs (dry-run by default).
trigger-intake-requeue limit="100" dry_run="1" error_like="" bodylink_only="0":
    @LIMIT={{limit}} DRY_RUN={{dry_run}} ERROR_LIKE="{{error_like}}" BODYLINK_ONLY={{bodylink_only}} \
      bash ops/trigger/intake-requeue.sh

# Reset body-link scan state for emails with failed body-link docs missing storage_path.
trigger-intake-rescan-bodylinks limit="100" dry_run="1":
    @MODE=bodylink_rescan LIMIT={{limit}} DRY_RUN={{dry_run}} \
      bash ops/trigger/intake-requeue.sh

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

# Fast county parcel lookup helpers (calls local Bun script, no worker required).
# Examples:
#   just pima-lookup identifier 114964
#   just maricopa-lookup address "16155 W Elwood St"
#   just county-lookup pima coordinates "32.159457,-110.842543"
county-lookup county mode value include_geometry="0":
    #!/usr/bin/env bash
    set -euo pipefail
    args=(--county "{{county}}")
    case "{{mode}}" in
      identifier)
        args+=(--identifier "{{value}}")
        ;;
      address)
        args+=(--address "{{value}}")
        ;;
      parcel)
        args+=(--parcel "{{value}}")
        ;;
      coordinates)
        args+=(--coordinates "{{value}}")
        ;;
      *)
        echo "mode must be one of: identifier, address, parcel, coordinates" >&2
        exit 1
        ;;
    esac
    if [[ "{{include_geometry}}" == "1" ]]; then
      args+=(--include-geometry)
    fi
    {{BUN}} apps/dust-permits/scripts/county-lookup.ts "${args[@]}"

pima-lookup mode value include_geometry="0":
    @just county-lookup pima "{{mode}}" "{{value}}" "{{include_geometry}}"

maricopa-lookup mode value include_geometry="0":
    @just county-lookup maricopa "{{mode}}" "{{value}}" "{{include_geometry}}"

# AQData
aqdata-health:
    @echo "AQData worker:"
    @curl -fsS --max-time 10 "http://localhost:47823/health"
    @echo

aqdata-sync-now:
    @curl -fsS --max-time 30 -X POST "http://localhost:47823/api/sync"
    @echo

aqdata-scrape-now limit="10":
    @curl -fsS --max-time 30 -X POST "http://localhost:47823/api/scrape" \
      -H "content-type: application/json" \
      -d '{"limit": {{limit}}}'
    @echo

aqdata-status:
    @docker exec supabase_db_desert-services-hub psql -U postgres -d postgres -c "SELECT COUNT(*) AS total_rows, COUNT(*) FILTER (WHERE detail_scraped_at IS NOT NULL) AS detail_scraped_rows FROM aqdata_permits;"

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

# Estimate-driven project seed lifecycle sync (create/update/promote/link/canonicalize).
# Examples:
#   just project-seed-sync
#   just project-seed-sync-dry limit=250 stale_days=45
project-seed-sync stale_days="45":
    @{{BUN}} packages/monday/cli/project-seed-sync.ts --stale-days {{stale_days}}

project-seed-sync-dry limit="250" stale_days="45":
    @{{BUN}} packages/monday/cli/project-seed-sync.ts --dry-run --limit {{limit}} --stale-days {{stale_days}}

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

# Direct Postgres SQL (fast path, no temp files).
# Example:
#   just pg-sql "select now();"
#   just pg-sql "select id,name from projects order by updated_at desc limit 5;"
pg-sql sql:
	@docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "{{sql}}"

# Fast DB-first project candidate lookup with safe psql var binding.
# Example:
#   just triage-pg-find "dpx8 site surrender"
triage-pg-find needle:
	@docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "select id, name, project_number, monday_item_id, updated_at from projects where name ilike '%' || \$needle\${{needle}}\$needle\$ || '%' or coalesce(project_number,'') ilike '%' || \$needle\${{needle}}\$needle\$ || '%' order by updated_at desc limit 20;"

# Fast canonical estimate linkage for a project.
# Example:
#   just triage-pg-estimates 103
triage-pg-estimates project_id:
	@docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "select pe.project_id, pe.estimate_id, pe.is_canonical, pe.source, e.name as estimate_name, e.estimate_number, e.monday_item_id, e.bid_status, e.status, e.bid_value, e.awarded_value, e.updated_at from project_estimates pe join estimates e on e.id = pe.estimate_id where pe.project_id = {{project_id}}::int order by pe.is_canonical desc nulls last, pe.created_at desc;"

# Fast contract/subcontract/work-order evidence for a project.
# Example:
#   just triage-pg-contracts 103
triage-pg-contracts project_id:
	@docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "select d.id, d.project_id, d.estimate_id, d.document_type, d.file_name, d.extraction_status, d.updated_at from documents d where d.project_id = {{project_id}}::int and (d.document_type in ('contract','subcontract','work_order') or d.file_name ilike '%contract%' or d.file_name ilike '%subcontract%' or d.file_name ilike '%work order%' or coalesce(d.summary,'') ilike '%contract%' or coalesce(d.summary,'') ilike '%subcontract%' or coalesce(d.summary,'') ilike '%work order%') order by d.updated_at desc nulls last;"

# SSH file transfer wrappers (uses ~/.ssh/config host aliases).
# Examples:
#   just ssh-push /abs/local/file.pdf work-mac '~/Downloads/'
#   just ssh-pull work-mac '~/Downloads/file.pdf' '/abs/local/dir/'
#   just ssh-sync /abs/local/dir/ work-mac '~/Downloads/dir/'
ssh-push src host dest:
	@/home/simon/.codex/skills/ssh-file-transfer/scripts/push-file.sh --src "{{src}}" --host "{{host}}" --dest "{{dest}}"

ssh-pull host src dest:
	@/home/simon/.codex/skills/ssh-file-transfer/scripts/pull-file.sh --host "{{host}}" --src "{{src}}" --dest "{{dest}}"

ssh-sync src host dest:
	@/home/simon/.codex/skills/ssh-file-transfer/scripts/sync-dir.sh --src "{{src}}" --host "{{host}}" --dest "{{dest}}"

# Generate internal contact sheet PDF from local contacts table.
# Example:
#   just internal-contact-sheet-pdf
#   just internal-contact-sheet-pdf out=data/exports/contacts/internal-contact-sheet.pdf
internal-contact-sheet-pdf out="data/exports/contacts/internal-contact-sheet.pdf":
	@{{BUN}} -e "import { generatePdf } from './packages/documents/pdf-generation/src/safety/internal-contact-sheet/generate'; await generatePdf('{{out}}'); console.log('Wrote PDF: {{out}}');"

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
      required_docker_services=(web permit-worker)
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
