#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_CONTAINER="${DB_CONTAINER:-supabase_db_desert-services-hub}"
PSQL_BASE=(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres)
SNAPSHOT_DIR="${ROOT_DIR}/data/reports/ops-health"
LATEST_SNAPSHOT_FILE="${SNAPSHOT_DIR}/latest.tsv"
HISTORY_FILE="${SNAPSHOT_DIR}/history.tsv"

sql() {
  "${PSQL_BASE[@]}" -c "$1"
}

sql_at() {
  "${PSQL_BASE[@]}" -At -F $'\t' -c "$1"
}

declare -A CUR=()
declare -A PREV=()

to_num() {
  local value="$1"
  if [[ -z "$value" ]]; then
    echo "0"
    return
  fi
  echo "$value"
}

metric() {
  local key="$1"
  echo "${CUR[$key]:-0}"
}

set_metric() {
  local key="$1"
  local value="$2"
  CUR["$key"]="$value"
}

calc_pct() {
  local numerator="$1"
  local denominator="$2"
  awk -v n="$numerator" -v d="$denominator" 'BEGIN { if (d <= 0) { printf "0.00" } else { printf "%.2f", (n / d) * 100 } }'
}

collect_metrics() {
  local query
  query="$(cat <<'SQL'
WITH m AS (
  SELECT 'emails_total'::text AS key, COUNT(*)::numeric AS value FROM emails
  UNION ALL
  SELECT 'emails_with_project', COUNT(*)::numeric FROM emails WHERE project_id IS NOT NULL
  UNION ALL
  SELECT 'emails_with_project_and_estimate', COUNT(*)::numeric
  FROM emails e
  WHERE e.project_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.email_id = e.id)
  UNION ALL
  SELECT 'emails_with_project_without_estimate', COUNT(*)::numeric
  FROM emails e
  WHERE e.project_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.email_id = e.id)
  UNION ALL
  SELECT 'emails_on_projects_with_estimates', COUNT(*)::numeric
  FROM emails e
  WHERE e.project_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM project_estimates pe WHERE pe.project_id = e.project_id)
  UNION ALL
  SELECT 'emails_on_projects_without_estimates', COUNT(*)::numeric
  FROM emails e
  WHERE e.project_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM project_estimates pe WHERE pe.project_id = e.project_id)
  UNION ALL
  SELECT 'emails_created_1h', COUNT(*)::numeric
  FROM emails
  WHERE created_at >= now() - interval '1 hour'
  UNION ALL
  SELECT 'emails_created_1h_with_resolve_job', COUNT(*)::numeric
  FROM emails e
  WHERE e.created_at >= now() - interval '1 hour'
    AND EXISTS (
      SELECT 1
      FROM webhook_jobs j
      WHERE j.job_type = 'email_resolve'
        AND j.payload::jsonb->>'emailId' = e.id::text
    )
  UNION ALL
  SELECT 'emails_created_24h', COUNT(*)::numeric
  FROM emails
  WHERE created_at >= now() - interval '24 hours'
  UNION ALL
  SELECT 'emails_created_24h_with_project', COUNT(*)::numeric
  FROM emails
  WHERE created_at >= now() - interval '24 hours'
    AND project_id IS NOT NULL
  UNION ALL
  SELECT 'emails_created_24h_with_estimate_link', COUNT(*)::numeric
  FROM emails e
  WHERE e.created_at >= now() - interval '24 hours'
    AND EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.email_id = e.id)
  UNION ALL
  SELECT 'emails_created_24h_with_resolve_job', COUNT(*)::numeric
  FROM emails e
  WHERE e.created_at >= now() - interval '24 hours'
    AND EXISTS (
      SELECT 1
      FROM webhook_jobs j
      WHERE j.job_type = 'email_resolve'
        AND j.payload::jsonb->>'emailId' = e.id::text
    )
  UNION ALL
  SELECT 'projects_total', COUNT(*)::numeric FROM projects
  UNION ALL
  SELECT 'projects_with_estimates', COUNT(*)::numeric
  FROM projects p
  WHERE EXISTS (SELECT 1 FROM project_estimates pe WHERE pe.project_id = p.id)
  UNION ALL
  SELECT 'projects_without_estimates', COUNT(*)::numeric
  FROM projects p
  WHERE NOT EXISTS (SELECT 1 FROM project_estimates pe WHERE pe.project_id = p.id)
  UNION ALL
  SELECT 'estimates_total', COUNT(*)::numeric FROM estimates
  UNION ALL
  SELECT 'estimates_with_monday_item_id', COUNT(*)::numeric
  FROM estimates
  WHERE NULLIF(TRIM(COALESCE(monday_item_id, '')), '') IS NOT NULL
  UNION ALL
  SELECT 'estimates_with_group_id', COUNT(*)::numeric
  FROM estimates
  WHERE NULLIF(TRIM(COALESCE(group_id, '')), '') IS NOT NULL
  UNION ALL
  SELECT 'estimates_with_synced_at', COUNT(*)::numeric
  FROM estimates
  WHERE synced_at IS NOT NULL
  UNION ALL
  SELECT 'estimates_with_file', COUNT(*)::numeric
  FROM estimates
  WHERE NULLIF(TRIM(COALESCE(estimate_storage_path, '')), '') IS NOT NULL
     OR NULLIF(TRIM(COALESCE(estimate_file_name, '')), '') IS NOT NULL
  UNION ALL
  SELECT 'estimates_with_file_extracted_success', COUNT(*)::numeric
  FROM estimates
  WHERE (
      NULLIF(TRIM(COALESCE(estimate_storage_path, '')), '') IS NOT NULL
      OR NULLIF(TRIM(COALESCE(estimate_file_name, '')), '') IS NOT NULL
    )
    AND extraction_status = 'success'
  UNION ALL
  SELECT 'estimates_with_file_extraction_failed', COUNT(*)::numeric
  FROM estimates
  WHERE (
      NULLIF(TRIM(COALESCE(estimate_storage_path, '')), '') IS NOT NULL
      OR NULLIF(TRIM(COALESCE(estimate_file_name, '')), '') IS NOT NULL
    )
    AND extraction_status = 'failed'
  UNION ALL
  SELECT 'estimates_with_file_extraction_pending', COUNT(*)::numeric
  FROM estimates
  WHERE (
      NULLIF(TRIM(COALESCE(estimate_storage_path, '')), '') IS NOT NULL
      OR NULLIF(TRIM(COALESCE(estimate_file_name, '')), '') IS NOT NULL
    )
    AND extraction_status IS NULL
  UNION ALL
  SELECT 'estimates_with_email', COUNT(*)::numeric
  FROM estimates e
  WHERE EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.estimate_id = e.id)
  UNION ALL
  SELECT 'canonical_estimates_total', COUNT(*)::numeric
  FROM project_estimates
  WHERE is_canonical = TRUE
  UNION ALL
  SELECT 'canonical_estimates_with_email', COUNT(*)::numeric
  FROM project_estimates pe
  WHERE pe.is_canonical = TRUE
    AND EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.estimate_id = pe.estimate_id)
  UNION ALL
  SELECT 'resolver_completed', COUNT(*)::numeric
  FROM webhook_jobs
  WHERE job_type = 'email_resolve' AND status = 'completed'
  UNION ALL
  SELECT 'resolver_pending', COUNT(*)::numeric
  FROM webhook_jobs
  WHERE job_type = 'email_resolve' AND status = 'pending'
  UNION ALL
  SELECT 'resolver_processing', COUNT(*)::numeric
  FROM webhook_jobs
  WHERE job_type = 'email_resolve' AND status = 'processing'
  UNION ALL
  SELECT 'resolver_failed', COUNT(*)::numeric
  FROM webhook_jobs
  WHERE job_type = 'email_resolve' AND status = 'failed'
  UNION ALL
  SELECT 'attachments_24h', COUNT(*)::numeric
  FROM attachments
  WHERE created_at >= now() - interval '24 hours'
  UNION ALL
  SELECT 'attachments_24h_success', COUNT(*)::numeric
  FROM attachments
  WHERE created_at >= now() - interval '24 hours'
    AND extraction_status = 'success'
  UNION ALL
  SELECT 'attachments_24h_failed', COUNT(*)::numeric
  FROM attachments
  WHERE created_at >= now() - interval '24 hours'
    AND extraction_status = 'failed'
  UNION ALL
  SELECT 'attachments_24h_pending', COUNT(*)::numeric
  FROM attachments
  WHERE created_at >= now() - interval '24 hours'
    AND extraction_status = 'pending'
  UNION ALL
  SELECT 'documents_24h', COUNT(*)::numeric
  FROM documents
  WHERE created_at >= now() - interval '24 hours'
  UNION ALL
  SELECT 'documents_24h_success', COUNT(*)::numeric
  FROM documents
  WHERE created_at >= now() - interval '24 hours'
    AND extraction_status = 'success'
  UNION ALL
  SELECT 'documents_24h_failed', COUNT(*)::numeric
  FROM documents
  WHERE created_at >= now() - interval '24 hours'
    AND extraction_status = 'failed'
  UNION ALL
  SELECT 'documents_24h_unsupported', COUNT(*)::numeric
  FROM documents
  WHERE created_at >= now() - interval '24 hours'
    AND extraction_status = 'unsupported'
  UNION ALL
  SELECT 'contract_queue_total', COUNT(*)::numeric
  FROM contract_packet_queue_v
  UNION ALL
  SELECT 'contract_queue_sla_breached', COUNT(*)::numeric
  FROM contract_packet_queue_v
  WHERE is_sla_breached
  UNION ALL
  SELECT 'docusign_30d', COUNT(*)::numeric
  FROM emails
  WHERE received_at >= now() - interval '30 days'
    AND from_domain = 'docusign.net'
  UNION ALL
  SELECT 'docusign_30d_project_linked', COUNT(*)::numeric
  FROM emails
  WHERE received_at >= now() - interval '30 days'
    AND from_domain = 'docusign.net'
    AND project_id IS NOT NULL
  UNION ALL
  SELECT 'payapp_30d', COUNT(*)::numeric
  FROM emails
  WHERE received_at >= now() - interval '30 days'
    AND (
      COALESCE(subject, '') ILIKE '%pay app%'
      OR COALESCE(subject, '') ILIKE '%lien waiver%'
      OR COALESCE(body_preview, '') ILIKE '%pay app%'
      OR COALESCE(body_preview, '') ILIKE '%lien waiver%'
    )
  UNION ALL
  SELECT 'payapp_30d_project_linked', COUNT(*)::numeric
  FROM emails
  WHERE received_at >= now() - interval '30 days'
    AND project_id IS NOT NULL
    AND (
      COALESCE(subject, '') ILIKE '%pay app%'
      OR COALESCE(subject, '') ILIKE '%lien waiver%'
      OR COALESCE(body_preview, '') ILIKE '%pay app%'
      OR COALESCE(body_preview, '') ILIKE '%lien waiver%'
    )
)
SELECT key, value::text
FROM m
ORDER BY key;
SQL
)"

  while IFS=$'\t' read -r key value; do
    [[ -n "$key" ]] || continue
    CUR["$key"]="$(to_num "$value")"
  done < <(sql_at "$query")
}

add_derived_metrics() {
  set_metric "emails_with_project_pct" "$(calc_pct "$(metric "emails_with_project")" "$(metric "emails_total")")"
  set_metric "emails_on_scoped_projects_estimate_link_pct" "$(calc_pct "$(metric "emails_with_project_and_estimate")" "$(metric "emails_on_projects_with_estimates")")"
  set_metric "emails_1h_resolve_coverage_pct" "$(calc_pct "$(metric "emails_created_1h_with_resolve_job")" "$(metric "emails_created_1h")")"
  set_metric "emails_24h_resolve_coverage_pct" "$(calc_pct "$(metric "emails_created_24h_with_resolve_job")" "$(metric "emails_created_24h")")"
  set_metric "emails_24h_project_link_pct" "$(calc_pct "$(metric "emails_created_24h_with_project")" "$(metric "emails_created_24h")")"
  set_metric "emails_24h_estimate_link_pct" "$(calc_pct "$(metric "emails_created_24h_with_estimate_link")" "$(metric "emails_created_24h")")"
  set_metric "project_estimate_scope_pct" "$(calc_pct "$(metric "projects_with_estimates")" "$(metric "projects_total")")"
  set_metric "estimates_with_monday_item_pct" "$(calc_pct "$(metric "estimates_with_monday_item_id")" "$(metric "estimates_total")")"
  set_metric "estimates_with_group_id_pct" "$(calc_pct "$(metric "estimates_with_group_id")" "$(metric "estimates_total")")"
  set_metric "estimates_with_file_pct" "$(calc_pct "$(metric "estimates_with_file")" "$(metric "estimates_total")")"
  set_metric "estimate_file_extract_success_pct" "$(calc_pct "$(metric "estimates_with_file_extracted_success")" "$(metric "estimates_with_file")")"
  set_metric "estimates_with_email_pct" "$(calc_pct "$(metric "estimates_with_email")" "$(metric "estimates_total")")"
  set_metric "canonical_estimates_with_email_pct" "$(calc_pct "$(metric "canonical_estimates_with_email")" "$(metric "canonical_estimates_total")")"

  local attachments_processed
  attachments_processed="$(awk -v s="$(metric "attachments_24h_success")" -v f="$(metric "attachments_24h_failed")" 'BEGIN{printf "%.0f", s+f}')"
  set_metric "attachments_24h_processed" "$attachments_processed"
  set_metric "attachments_24h_success_on_processed_pct" "$(calc_pct "$(metric "attachments_24h_success")" "$attachments_processed")"

  local documents_processed
  documents_processed="$(awk -v s="$(metric "documents_24h_success")" -v f="$(metric "documents_24h_failed")" -v u="$(metric "documents_24h_unsupported")" 'BEGIN{printf "%.0f", s+f+u}')"
  set_metric "documents_24h_processed" "$documents_processed"
  set_metric "documents_24h_success_on_processed_pct" "$(calc_pct "$(metric "documents_24h_success")" "$documents_processed")"

  set_metric "contract_sla_breach_pct" "$(calc_pct "$(metric "contract_queue_sla_breached")" "$(metric "contract_queue_total")")"
  set_metric "docusign_30d_project_link_pct" "$(calc_pct "$(metric "docusign_30d_project_linked")" "$(metric "docusign_30d")")"
  set_metric "payapp_30d_project_link_pct" "$(calc_pct "$(metric "payapp_30d_project_linked")" "$(metric "payapp_30d")")"
}

load_previous_snapshot() {
  if [[ ! -f "$LATEST_SNAPSHOT_FILE" ]]; then
    return
  fi
  while IFS=$'\t' read -r key value; do
    [[ -n "$key" ]] || continue
    PREV["$key"]="$(to_num "$value")"
  done < "$LATEST_SNAPSHOT_FILE"
}

is_pct_metric() {
  local key="$1"
  [[ "$key" == *_pct ]]
}

format_metric_value() {
  local key="$1"
  local value="$2"
  if is_pct_metric "$key"; then
    awk -v v="$value" 'BEGIN{printf "%.2f%%", v}'
    return
  fi
  awk -v v="$value" 'BEGIN{
    if (v == int(v)) {
      printf "%.0f", v
    } else {
      printf "%.2f", v
    }
  }'
}

format_metric_delta() {
  local key="$1"
  local current="$2"
  local previous="$3"

  if [[ -z "$previous" ]]; then
    echo "n/a"
    return
  fi

  if is_pct_metric "$key"; then
    awk -v c="$current" -v p="$previous" 'BEGIN{
      d = c - p;
      if (d > 0) {
        printf "+%.2fpp", d
      } else if (d < 0) {
        printf "%.2fpp", d
      } else {
        printf "0.00pp"
      }
    }'
    return
  fi

  awk -v c="$current" -v p="$previous" 'BEGIN{
    d = c - p;
    if (d > 0) {
      printf "+%.0f", d
    } else if (d < 0) {
      printf "%.0f", d
    } else {
      printf "0"
    }
  }'
}

metric_state() {
  local key="$1"
  local value
  value="$(metric "$key")"
  case "$key" in
    resolver_pending|resolver_failed)
      awk -v v="$value" 'BEGIN{ if (v == 0) print "OK"; else print "WARN"; }'
      ;;
    emails_1h_resolve_coverage_pct)
      awk -v v="$value" 'BEGIN{
        if (v >= 99) print "OK";
        else if (v >= 95) print "WARN";
        else print "FAIL";
      }'
      ;;
    emails_24h_resolve_coverage_pct)
      awk -v v="$value" 'BEGIN{
        if (v >= 90) print "OK";
        else if (v >= 70) print "WARN";
        else print "FAIL";
      }'
      ;;
    project_estimate_scope_pct|emails_on_scoped_projects_estimate_link_pct|estimates_with_monday_item_pct|estimate_file_extract_success_pct)
      awk -v v="$value" 'BEGIN{
        if (v >= 99) print "OK";
        else if (v >= 95) print "WARN";
        else print "FAIL";
      }'
      ;;
    projects_without_estimates|emails_with_project_without_estimate)
      awk -v v="$value" 'BEGIN{
        if (v == 0) print "OK";
        else if (v <= 25) print "WARN";
        else print "FAIL";
      }'
      ;;
    attachments_24h_success_on_processed_pct)
      awk -v v="$value" 'BEGIN{
        if (v >= 80) print "OK";
        else if (v >= 60) print "WARN";
        else print "FAIL";
      }'
      ;;
    documents_24h_success_on_processed_pct)
      awk -v v="$value" 'BEGIN{
        if (v >= 90) print "OK";
        else if (v >= 75) print "WARN";
        else print "FAIL";
      }'
      ;;
    contract_sla_breach_pct)
      awk -v v="$value" 'BEGIN{
        if (v <= 10) print "OK";
        else if (v <= 25) print "WARN";
        else print "FAIL";
      }'
      ;;
    docusign_30d_project_link_pct|payapp_30d_project_link_pct)
      awk -v v="$value" 'BEGIN{
        if (v >= 50) print "OK";
        else if (v >= 20) print "WARN";
        else print "FAIL";
      }'
      ;;
    *)
      echo "INFO"
      ;;
  esac
}

print_health_map_row() {
  local label="$1"
  local key="$2"
  local current prev delta state
  current="$(metric "$key")"
  prev="${PREV[$key]:-}"
  delta="$(format_metric_delta "$key" "$current" "$prev")"
  state="$(metric_state "$key")"
  printf "%-54s %14s %12s %8s\n" \
    "$label" \
    "$(format_metric_value "$key" "$current")" \
    "$delta" \
    "$state"
}

save_snapshot() {
  local now
  now="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  mkdir -p "$SNAPSHOT_DIR"
  {
    for key in "${!CUR[@]}"; do
      printf "%s\t%s\n" "$key" "${CUR[$key]}"
    done | sort
  } > "$LATEST_SNAPSHOT_FILE"

  {
    for key in "${!CUR[@]}"; do
      printf "%s\t%s\t%s\n" "$now" "$key" "${CUR[$key]}"
    done | sort -k2,2
  } >> "$HISTORY_FILE"
}

collect_metrics
add_derived_metrics
load_previous_snapshot

echo "Ops Status"
echo "Generated: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
if [[ -f "$LATEST_SNAPSHOT_FILE" ]]; then
  echo "Delta Baseline: ${LATEST_SNAPSHOT_FILE}"
else
  echo "Delta Baseline: none (first snapshot)"
fi
echo

echo "== Health Map =="
printf "%-54s %14s %12s %8s\n" "metric" "current" "delta" "state"
printf "%-54s %14s %12s %8s\n" "------" "-------" "-----" "-----"
print_health_map_row "resolver.pending_jobs" "resolver_pending"
print_health_map_row "resolver.failed_jobs" "resolver_failed"
print_health_map_row "emails.1h.resolve_coverage" "emails_1h_resolve_coverage_pct"
print_health_map_row "emails.24h.resolve_coverage" "emails_24h_resolve_coverage_pct"
print_health_map_row "projects.with_estimate_scope" "project_estimate_scope_pct"
print_health_map_row "emails.scoped_project_estimate_link_coverage" "emails_on_scoped_projects_estimate_link_pct"
print_health_map_row "projects.without_estimate_scope" "projects_without_estimates"
print_health_map_row "emails.project_linked_without_estimate_link" "emails_with_project_without_estimate"
print_health_map_row "estimates.with_monday_item_id" "estimates_with_monday_item_pct"
print_health_map_row "estimates.with_file_attached" "estimates_with_file_pct"
print_health_map_row "estimate_files.extraction_success_rate" "estimate_file_extract_success_pct"
print_health_map_row "estimates.with_any_email" "estimates_with_email_pct"
print_health_map_row "canonical_estimates.with_any_email" "canonical_estimates_with_email_pct"
print_health_map_row "attachments.24h.success_on_processed" "attachments_24h_success_on_processed_pct"
print_health_map_row "documents.24h.success_on_processed" "documents_24h_success_on_processed_pct"
print_health_map_row "contracts.queue_sla_breach_rate" "contract_sla_breach_pct"
print_health_map_row "docusign.30d.project_link_rate" "docusign_30d_project_link_pct"
print_health_map_row "payapp.30d.project_link_rate" "payapp_30d_project_link_pct"
echo

echo "== Email Resolver Queue =="
sql "SELECT status, COUNT(*) FROM webhook_jobs WHERE job_type='email_resolve' GROUP BY status ORDER BY status;"
sql "WITH p AS (
       SELECT COUNT(*) AS pending
       FROM webhook_jobs
       WHERE job_type='email_resolve' AND status='pending'
     ),
     r AS (
       SELECT GREATEST(COUNT(*)::numeric/5, 0.01) AS per_min
       FROM webhook_jobs
       WHERE job_type='email_resolve'
         AND status='completed'
         AND completed_at >= now() - interval '5 minutes'
     )
     SELECT p.pending,
            ROUND(r.per_min,2) AS per_min,
            ROUND((p.pending / r.per_min),1) AS eta_minutes
     FROM p, r;"
echo

echo "== Resolver Link Outcomes =="
sql "SELECT COUNT(*) AS resolver_links_total,
            COUNT(*) FILTER (WHERE match_detail LIKE 'email_resolver project_single%') AS project_single_links,
            COUNT(*) FILTER (WHERE match_detail LIKE 'email_resolver project_canonical%') AS project_canonical_links,
            COUNT(*) FILTER (WHERE match_detail LIKE 'email_resolver deterministic%') AS deterministic_links,
            COUNT(*) FILTER (WHERE match_detail LIKE 'email_resolver spark model=%') AS spark_links
     FROM estimate_emails
     WHERE match_detail LIKE 'email_resolver %';"
sql "WITH r AS (
       SELECT ee.email_id, ee.estimate_id
       FROM estimate_emails ee
       WHERE ee.match_detail LIKE 'email_resolver %'
     ),
     j AS (
       SELECT r.*, e.project_id
       FROM r
       JOIN emails e ON e.id = r.email_id
       WHERE e.project_id IS NOT NULL
     ),
     pc AS (
       SELECT project_id, COUNT(*) AS pe_count
       FROM project_estimates
       GROUP BY project_id
     ),
     c AS (
       SELECT j.*,
              COALESCE(pc.pe_count,0) AS pe_count,
              EXISTS (
                SELECT 1
                FROM project_estimates pe
                WHERE pe.project_id = j.project_id
                  AND pe.estimate_id = j.estimate_id
              ) AS matches_project
       FROM j
       LEFT JOIN pc ON pc.project_id = j.project_id
     )
     SELECT COUNT(*) AS links_with_project,
            COUNT(*) FILTER (WHERE pe_count = 0) AS links_on_projects_without_project_estimates,
            COUNT(*) FILTER (WHERE pe_count > 0 AND matches_project) AS links_consistent_when_project_has_estimates,
            COUNT(*) FILTER (WHERE pe_count > 0 AND NOT matches_project) AS links_mismatch_when_project_has_estimates
     FROM c;"
echo

echo "== Monday / Estimate Coverage =="
sql "SELECT
       COUNT(*) AS estimates_total,
       COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(monday_item_id, '')), '') IS NOT NULL) AS estimates_with_monday_item_id,
       COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(group_id, '')), '') IS NOT NULL) AS estimates_with_group_id,
       COUNT(*) FILTER (WHERE synced_at IS NOT NULL) AS estimates_with_synced_at
     FROM estimates;"
sql "SELECT
       COUNT(*) AS estimates_with_file,
       COUNT(*) FILTER (WHERE extraction_status = 'success') AS extracted_success,
       COUNT(*) FILTER (WHERE extraction_status = 'failed') AS extracted_failed,
       COUNT(*) FILTER (WHERE extraction_status IS NULL) AS extracted_pending
     FROM estimates
     WHERE NULLIF(TRIM(COALESCE(estimate_storage_path, '')), '') IS NOT NULL
        OR NULLIF(TRIM(COALESCE(estimate_file_name, '')), '') IS NOT NULL;"
sql "SELECT
       LOWER(TRIM(COALESCE(bid_status, '(null)'))) AS bid_status,
       COUNT(*) AS estimates_total,
       COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.estimate_id = e.id)) AS estimates_with_any_email
     FROM estimates e
     GROUP BY LOWER(TRIM(COALESCE(bid_status, '(null)')))
     ORDER BY estimates_total DESC;"
echo

echo "== Project Estimate Coverage =="
sql "SELECT COUNT(*) AS projects_total,
            COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM project_estimates pe WHERE pe.project_id = p.id)) AS projects_with_estimates,
            COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM project_estimates pe WHERE pe.project_id = p.id)) AS projects_without_estimates
     FROM projects p;"
sql "SELECT COUNT(*) AS emails_with_project,
            COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM project_estimates pe WHERE pe.project_id = e.project_id)) AS emails_on_projects_with_estimates,
            COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM project_estimates pe WHERE pe.project_id = e.project_id)) AS emails_on_projects_without_estimates
     FROM emails e
     WHERE e.project_id IS NOT NULL;"
sql "SELECT p.id,
            p.name,
            p.lifecycle_state,
            COUNT(e.id) AS linked_emails
     FROM projects p
     LEFT JOIN emails e ON e.project_id = p.id
     WHERE NOT EXISTS (
       SELECT 1
       FROM project_estimates pe
       WHERE pe.project_id = p.id
     )
     GROUP BY p.id, p.name, p.lifecycle_state
     ORDER BY linked_emails DESC, p.id ASC
     LIMIT 20;"
echo

echo "== Attachment / Document 24h Throughput =="
sql "SELECT COUNT(*) AS attachments_24h,
            COUNT(*) FILTER (WHERE extraction_status = 'success') AS success,
            COUNT(*) FILTER (WHERE extraction_status = 'failed') AS failed,
            COUNT(*) FILTER (WHERE extraction_status = 'pending') AS pending
     FROM attachments
     WHERE created_at >= now() - interval '24 hours';"
sql "SELECT COUNT(*) AS documents_24h,
            COUNT(*) FILTER (WHERE extraction_status = 'success') AS success,
            COUNT(*) FILTER (WHERE extraction_status = 'failed') AS failed,
            COUNT(*) FILTER (WHERE extraction_status = 'unsupported') AS unsupported
     FROM documents
     WHERE created_at >= now() - interval '24 hours';"
echo

echo "== Webhook Jobs (Failed/Pending) =="
sql "SELECT job_type,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed_jobs,
            COUNT(*) FILTER (WHERE status = 'pending') AS pending_jobs,
            COUNT(*) FILTER (WHERE status = 'processing') AS processing_jobs
     FROM webhook_jobs
     GROUP BY job_type
     HAVING COUNT(*) FILTER (WHERE status IN ('failed', 'pending', 'processing')) > 0
     ORDER BY failed_jobs DESC, pending_jobs DESC, processing_jobs DESC, job_type ASC;"
sql "SELECT job_type,
            COUNT(*) AS failed_jobs,
            MAX(completed_at) AS last_completed_at
     FROM webhook_jobs
     WHERE status = 'failed'
     GROUP BY job_type
     ORDER BY failed_jobs DESC, job_type ASC
     LIMIT 20;"
echo

echo "== Contract Packets =="
sql "SELECT COUNT(*) AS contract_queue_total,
            COUNT(*) FILTER (WHERE is_sla_breached) AS contract_queue_sla_breached
     FROM contract_packet_queue_v;"
echo

echo "== DocuSign / Pay App Signals (30d) =="
sql "SELECT COUNT(*) AS docusign_emails_30d,
            COUNT(*) FILTER (WHERE project_id IS NOT NULL) AS docusign_emails_30d_project_linked
     FROM emails
     WHERE received_at >= now() - interval '30 days'
       AND from_domain = 'docusign.net';"
sql "SELECT COUNT(*) AS payapp_signal_emails_30d,
            COUNT(*) FILTER (WHERE project_id IS NOT NULL) AS payapp_signal_project_linked_30d
     FROM emails
     WHERE received_at >= now() - interval '30 days'
       AND (
         COALESCE(subject,'') ILIKE '%pay app%'
         OR COALESCE(subject,'') ILIKE '%lien waiver%'
         OR COALESCE(body_preview,'') ILIKE '%pay app%'
         OR COALESCE(body_preview,'') ILIKE '%lien waiver%'
       );"
echo

echo "== Contracts Dispatcher Health =="
if curl -fsS -m 8 "https://contracts-dispatcher.cheez2012.workers.dev/health" >/dev/null 2>&1; then
  echo "OK: contracts-dispatcher health endpoint reachable"
else
  echo "WARN: contracts-dispatcher health endpoint not reachable"
fi

save_snapshot
