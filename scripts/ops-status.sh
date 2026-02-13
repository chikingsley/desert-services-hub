#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase_db_desert-services-hub}"
PSQL_BASE=(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres)

sql() {
  "${PSQL_BASE[@]}" -c "$1"
}

echo "Ops Status"
echo "Generated: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
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

