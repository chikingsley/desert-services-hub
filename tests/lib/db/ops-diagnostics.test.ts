/**
 * Ops Diagnostics Test Suite
 *
 * Integration tests validating the SQL queries used for system health
 * monitoring, project auditing, linking scope analysis, and contract reporting.
 *
 * All queries are READ-ONLY against the live Postgres database.
 * Assertions verify query shape, type safety, and relational invariants
 * (e.g. emails_with_project <= emails_total) — never exact row counts.
 *
 * Run: bun test tests/db/ops-diagnostics.test.ts --verbose
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { db } from "@lib/db/client";

// ---------------------------------------------------------------------------
// Health state classifier (ported from ops-status.sh metric_state)
// ---------------------------------------------------------------------------

type HealthState = "OK" | "WARN" | "FAIL" | "INFO";

function classifyHealth(key: string, value: number): HealthState {
  switch (key) {
    case "emails_1h_estimate_link_coverage_pct":
      if (value >= 99) {
        return "OK";
      }
      if (value >= 95) {
        return "WARN";
      }
      return "FAIL";

    case "emails_24h_estimate_link_coverage_pct":
      if (value >= 90) {
        return "OK";
      }
      if (value >= 70) {
        return "WARN";
      }
      return "FAIL";

    case "project_estimate_scope_pct":
    case "emails_on_scoped_projects_estimate_link_pct":
    case "estimates_with_monday_item_pct":
    case "estimate_file_extract_success_pct":
      if (value >= 99) {
        return "OK";
      }
      if (value >= 95) {
        return "WARN";
      }
      return "FAIL";

    case "projects_without_estimates":
    case "emails_with_project_without_estimate":
      if (value === 0) {
        return "OK";
      }
      if (value <= 25) {
        return "WARN";
      }
      return "FAIL";

    case "attachments_24h_success_on_processed_pct":
      if (value >= 80) {
        return "OK";
      }
      if (value >= 60) {
        return "WARN";
      }
      return "FAIL";

    case "documents_24h_success_on_processed_pct":
      if (value >= 90) {
        return "OK";
      }
      if (value >= 75) {
        return "WARN";
      }
      return "FAIL";

    case "docusign_30d_project_link_pct":
    case "payapp_30d_project_link_pct":
      if (value >= 50) {
        return "OK";
      }
      if (value >= 20) {
        return "WARN";
      }
      return "FAIL";

    default:
      return "INFO";
  }
}

function calcPct(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return (numerator / denominator) * 100;
}

// ---------------------------------------------------------------------------
// Ops health metrics CTE (ported from ops-status.sh)
// ---------------------------------------------------------------------------

const OPS_METRICS_SQL = `
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
  FROM emails WHERE created_at >= now() - interval '1 hour'
  UNION ALL
  SELECT 'emails_created_1h_with_estimate_link', COUNT(*)::numeric
  FROM emails e
  WHERE e.created_at >= now() - interval '1 hour'
    AND EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.email_id = e.id)
  UNION ALL
  SELECT 'emails_created_24h', COUNT(*)::numeric
  FROM emails WHERE created_at >= now() - interval '24 hours'
  UNION ALL
  SELECT 'emails_created_24h_with_project', COUNT(*)::numeric
  FROM emails
  WHERE created_at >= now() - interval '24 hours' AND project_id IS NOT NULL
  UNION ALL
  SELECT 'emails_created_24h_with_estimate_link', COUNT(*)::numeric
  FROM emails e
  WHERE e.created_at >= now() - interval '24 hours'
    AND EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.email_id = e.id)
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
  FROM estimates WHERE synced_at IS NOT NULL
  UNION ALL
  SELECT 'estimates_with_file', COUNT(*)::numeric
  FROM estimates
  WHERE NULLIF(TRIM(COALESCE(estimate_storage_path, '')), '') IS NOT NULL
     OR NULLIF(TRIM(COALESCE(estimate_file_name, '')), '') IS NOT NULL
  UNION ALL
  SELECT 'estimates_with_file_extracted_success', COUNT(*)::numeric
  FROM estimates
  WHERE (NULLIF(TRIM(COALESCE(estimate_storage_path, '')), '') IS NOT NULL
      OR NULLIF(TRIM(COALESCE(estimate_file_name, '')), '') IS NOT NULL)
    AND extraction_status = 'success'
  UNION ALL
  SELECT 'estimates_with_file_extraction_failed', COUNT(*)::numeric
  FROM estimates
  WHERE (NULLIF(TRIM(COALESCE(estimate_storage_path, '')), '') IS NOT NULL
      OR NULLIF(TRIM(COALESCE(estimate_file_name, '')), '') IS NOT NULL)
    AND extraction_status = 'failed'
  UNION ALL
  SELECT 'estimates_with_file_extraction_pending', COUNT(*)::numeric
  FROM estimates
  WHERE (NULLIF(TRIM(COALESCE(estimate_storage_path, '')), '') IS NOT NULL
      OR NULLIF(TRIM(COALESCE(estimate_file_name, '')), '') IS NOT NULL)
    AND extraction_status IS NULL
  UNION ALL
  SELECT 'estimates_with_email', COUNT(*)::numeric
  FROM estimates e
  WHERE EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.estimate_id = e.id)
  UNION ALL
  SELECT 'canonical_estimates_total', COUNT(*)::numeric
  FROM project_estimates WHERE is_canonical = TRUE
  UNION ALL
  SELECT 'canonical_estimates_with_email', COUNT(*)::numeric
  FROM project_estimates pe
  WHERE pe.is_canonical = TRUE
    AND EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.estimate_id = pe.estimate_id)
  UNION ALL
  SELECT 'attachments_24h', COUNT(*)::numeric
  FROM documents WHERE source = 'email_attachment' AND created_at >= now() - interval '24 hours'
  UNION ALL
  SELECT 'attachments_24h_success', COUNT(*)::numeric
  FROM documents
  WHERE source = 'email_attachment' AND created_at >= now() - interval '24 hours' AND extraction_status = 'success'
  UNION ALL
  SELECT 'attachments_24h_failed', COUNT(*)::numeric
  FROM documents
  WHERE source = 'email_attachment' AND created_at >= now() - interval '24 hours' AND extraction_status = 'failed'
  UNION ALL
  SELECT 'attachments_24h_pending', COUNT(*)::numeric
  FROM documents
  WHERE source = 'email_attachment' AND created_at >= now() - interval '24 hours' AND extraction_status = 'pending'
  UNION ALL
  SELECT 'documents_24h', COUNT(*)::numeric
  FROM documents WHERE created_at >= now() - interval '24 hours'
  UNION ALL
  SELECT 'documents_24h_success', COUNT(*)::numeric
  FROM documents
  WHERE created_at >= now() - interval '24 hours' AND extraction_status = 'success'
  UNION ALL
  SELECT 'documents_24h_failed', COUNT(*)::numeric
  FROM documents
  WHERE created_at >= now() - interval '24 hours' AND extraction_status = 'failed'
  UNION ALL
  SELECT 'documents_24h_unsupported', COUNT(*)::numeric
  FROM documents
  WHERE created_at >= now() - interval '24 hours' AND extraction_status = 'unsupported'
  UNION ALL
  SELECT 'docusign_30d', COUNT(*)::numeric
  FROM emails
  WHERE received_at >= now() - interval '30 days' AND from_domain = 'docusign.net'
  UNION ALL
  SELECT 'docusign_30d_project_linked', COUNT(*)::numeric
  FROM emails
  WHERE received_at >= now() - interval '30 days'
    AND from_domain = 'docusign.net' AND project_id IS NOT NULL
  UNION ALL
  SELECT 'payapp_30d', COUNT(*)::numeric
  FROM emails
  WHERE received_at >= now() - interval '30 days'
    AND (COALESCE(subject, '') ILIKE '%pay app%'
      OR COALESCE(subject, '') ILIKE '%lien waiver%'
      OR COALESCE(body_preview, '') ILIKE '%pay app%'
      OR COALESCE(body_preview, '') ILIKE '%lien waiver%')
  UNION ALL
  SELECT 'payapp_30d_project_linked', COUNT(*)::numeric
  FROM emails
  WHERE received_at >= now() - interval '30 days'
    AND project_id IS NOT NULL
    AND (COALESCE(subject, '') ILIKE '%pay app%'
      OR COALESCE(subject, '') ILIKE '%lien waiver%'
      OR COALESCE(body_preview, '') ILIKE '%pay app%'
      OR COALESCE(body_preview, '') ILIKE '%lien waiver%')
)
SELECT key, value::text FROM m ORDER BY key
`;

// ---------------------------------------------------------------------------
// Linking scope WHERE clauses
// ---------------------------------------------------------------------------

const BACKFILL_SCOPES: Record<string, string> = {
  "project-estimate-gap": `
    e.project_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM project_estimates pe WHERE pe.project_id = e.project_id)
    AND NOT EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.email_id = e.id)
  `,
  "project-any-gap": `
    e.project_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.email_id = e.id)
  `,
  "project-no-estimate-scope": `
    e.project_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM project_estimates pe WHERE pe.project_id = e.project_id)
  `,
  unprojected: "e.project_id IS NULL",
  "all-unresolved": `
    e.project_id IS NULL
    OR (
      e.project_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM estimate_emails ee WHERE ee.email_id = e.id)
    )
  `,
  all: "TRUE",
};

function buildScopeStatsQuery(whereClause: string): string {
  return `
    WITH target AS (
      SELECT e.id AS email_id
      FROM emails e
      WHERE ${whereClause}
      ORDER BY e.created_at DESC NULLS LAST, e.id DESC
      LIMIT 50000
    ),
    linked AS (
      SELECT DISTINCT ee.email_id
      FROM estimate_emails ee
    )
    SELECT
      (SELECT COUNT(*)::int FROM target) AS target_rows,
      (SELECT COUNT(*)::int FROM target t JOIN linked l ON l.email_id = t.email_id) AS already_linked_rows,
      (SELECT COUNT(*)::int FROM target t LEFT JOIN linked l ON l.email_id = t.email_id WHERE l.email_id IS NULL) AS remaining_rows
  `;
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

const metrics = new Map<string, number>();
let metricsLoaded = false;

async function loadMetrics(): Promise<void> {
  if (metricsLoaded) {
    return;
  }
  const rows = await db
    .query<{ key: string; value: string }>(OPS_METRICS_SQL)
    .all();
  for (const row of rows) {
    metrics.set(row.key, Number(row.value));
  }
  metricsLoaded = true;
}

function m(key: string): number {
  return metrics.get(key) ?? 0;
}

// ===========================================================================
// 1. OPS HEALTH METRICS
// ===========================================================================

describe("ops health metrics", () => {
  beforeAll(loadMetrics);

  describe("metric collection", () => {
    test("returns at least 30 known metric keys", () => {
      expect(metrics.size).toBeGreaterThanOrEqual(30);
    });

    test("all values are numeric and non-negative", () => {
      for (const [_key, value] of metrics) {
        expect(typeof value).toBe("number");
        expect(value).toBeGreaterThanOrEqual(0);
      }
    });

    test("contains all expected base metric keys", () => {
      const expected = [
        "emails_total",
        "emails_with_project",
        "projects_total",
        "estimates_total",
      ];
      for (const key of expected) {
        expect(metrics.has(key)).toBe(true);
      }
    });
  });

  describe("email metrics", () => {
    test("project linkage is bounded by total", () => {
      expect(m("emails_with_project")).toBeLessThanOrEqual(m("emails_total"));
    });

    test("estimate-linked emails are a subset of project-linked emails", () => {
      expect(m("emails_with_project_and_estimate")).toBeLessThanOrEqual(
        m("emails_with_project")
      );
    });

    test("project-linked emails partition into with/without estimate link", () => {
      expect(
        m("emails_with_project_and_estimate") +
          m("emails_with_project_without_estimate")
      ).toBe(m("emails_with_project"));
    });

    test("scoped project email counts are bounded", () => {
      expect(
        m("emails_on_projects_with_estimates") +
          m("emails_on_projects_without_estimates")
      ).toBe(m("emails_with_project"));
    });

    test("1h cohort is bounded by 24h cohort", () => {
      expect(m("emails_created_1h")).toBeLessThanOrEqual(
        m("emails_created_24h")
      );
    });

    test("estimate-link coverage is bounded by cohort size", () => {
      expect(m("emails_created_1h_with_estimate_link")).toBeLessThanOrEqual(
        m("emails_created_1h")
      );
      expect(m("emails_created_24h_with_estimate_link")).toBeLessThanOrEqual(
        m("emails_created_24h")
      );
    });
  });

  describe("project metrics", () => {
    test("projects with/without estimates sum to total", () => {
      expect(
        m("projects_with_estimates") + m("projects_without_estimates")
      ).toBe(m("projects_total"));
    });
  });

  describe("estimate metrics", () => {
    test("monday item coverage is bounded by total", () => {
      expect(m("estimates_with_monday_item_id")).toBeLessThanOrEqual(
        m("estimates_total")
      );
    });

    test("file coverage is bounded by total", () => {
      expect(m("estimates_with_file")).toBeLessThanOrEqual(
        m("estimates_total")
      );
    });

    test("extraction statuses are bounded by file count", () => {
      const extracted =
        m("estimates_with_file_extracted_success") +
        m("estimates_with_file_extraction_failed") +
        m("estimates_with_file_extraction_pending");
      expect(extracted).toBeLessThanOrEqual(m("estimates_with_file"));
    });

    test("canonical estimates with email are bounded", () => {
      expect(m("canonical_estimates_with_email")).toBeLessThanOrEqual(
        m("canonical_estimates_total")
      );
    });
  });

  describe("throughput 24h", () => {
    test("attachment extraction statuses are bounded", () => {
      const processed =
        m("attachments_24h_success") +
        m("attachments_24h_failed") +
        m("attachments_24h_pending");
      expect(processed).toBeLessThanOrEqual(m("attachments_24h"));
    });

    test("document extraction statuses are bounded", () => {
      const processed =
        m("documents_24h_success") +
        m("documents_24h_failed") +
        m("documents_24h_unsupported");
      expect(processed).toBeLessThanOrEqual(m("documents_24h"));
    });
  });

  describe("domain signals 30d", () => {
    test("DocuSign project-linked is bounded by total", () => {
      expect(m("docusign_30d_project_linked")).toBeLessThanOrEqual(
        m("docusign_30d")
      );
    });

    test("PayApp project-linked is bounded by total", () => {
      expect(m("payapp_30d_project_linked")).toBeLessThanOrEqual(
        m("payapp_30d")
      );
    });
  });

  describe("derived percentage metrics", () => {
    test("percentages are bounded 0-100", () => {
      const pctKeys = [
        ["emails_with_project", "emails_total"],
        [
          "emails_with_project_and_estimate",
          "emails_on_projects_with_estimates",
        ],
        ["projects_with_estimates", "projects_total"],
        ["estimates_with_monday_item_id", "estimates_total"],
        ["estimates_with_file", "estimates_total"],
        ["estimates_with_file_extracted_success", "estimates_with_file"],
        ["estimates_with_email", "estimates_total"],
        ["canonical_estimates_with_email", "canonical_estimates_total"],
      ] as const;

      for (const [num, den] of pctKeys) {
        const pct = calcPct(m(num), m(den));
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }
    });
  });
});

// ===========================================================================
// 2. PROJECT AUDIT
// ===========================================================================

describe("project audit", () => {
  let projectId: number | null = null;

  beforeAll(async () => {
    const row = await db
      .query<{ id: number }>(
        "SELECT id FROM projects ORDER BY updated_at DESC LIMIT 1"
      )
      .get();
    projectId = row?.id ?? null;
  });

  test("project header returns expected columns", async () => {
    if (!projectId) {
      return;
    }
    const row = await db
      .query<{
        id: number;
        name: string;
        contractor: string | null;
        contract_status: string | null;
        dust_permit_status: string | null;
        email_count: number | null;
        outlook_folder: string | null;
      }>(
        `SELECT id, name, contractor, contract_status, dust_permit_status,
                email_count, outlook_folder
         FROM projects WHERE id = $1`
      )
      .get(projectId);
    expect(row).not.toBeNull();
    if (!row) {
      return;
    }
    expect(row.id).toBe(projectId);
    expect(typeof row.name).toBe("string");
  });

  test("tracked folder query returns expected shape", async () => {
    if (!projectId) {
      return;
    }
    const rows = await db
      .query<{
        id: number;
        display_name: string;
        folder_id: string;
        project_id: number;
      }>(
        `SELECT id, display_name, folder_id, project_id
         FROM tracked_folders WHERE project_id = $1
         ORDER BY created_at DESC`
      )
      .all(projectId);
    for (const row of rows) {
      expect(row.project_id).toBe(projectId);
    }
  });

  test("email linkage aggregates are internally consistent", async () => {
    if (!projectId) {
      return;
    }
    const row = await db
      .query<{
        linked_email_rows: number;
        unique_message_keys: number;
        emails_with_attachments: number;
      }>(
        `WITH e AS (
          SELECT * FROM emails WHERE project_id = $1
        ),
        keys AS (
          SELECT COALESCE(NULLIF(internet_message_id, ''), message_id) AS msg_key FROM e
        )
        SELECT
          (SELECT COUNT(*)::int FROM e) AS linked_email_rows,
          (SELECT COUNT(DISTINCT msg_key)::int FROM keys) AS unique_message_keys,
          (SELECT COUNT(*)::int FROM e WHERE has_attachments = 1) AS emails_with_attachments`
      )
      .get(projectId);
    expect(row).not.toBeNull();
    if (!row) {
      return;
    }
    expect(row.unique_message_keys).toBeLessThanOrEqual(row.linked_email_rows);
    expect(row.emails_with_attachments).toBeLessThanOrEqual(
      row.linked_email_rows
    );
  });

  test("permit signals query returns expected columns", async () => {
    if (!projectId) {
      return;
    }
    const row = await db
      .query<{
        submitted_confirmation_at: string | null;
        payment_approved_at: string | null;
        permit_issued_email_at: string | null;
        permit_rejected_email_at: string | null;
      }>(
        `WITH e AS (SELECT * FROM emails WHERE project_id = $1)
         SELECT
           MAX(received_at) FILTER (WHERE lower(COALESCE(from_email,'')) = 'aqdimpact@maricopa.gov'
             AND COALESCE(subject,'') ~* 'submission confirmation') AS submitted_confirmation_at,
           MAX(received_at) FILTER (WHERE lower(COALESCE(from_email,'')) = 'noreply@pointandpay.com'
             AND COALESCE(subject,'') ~* 'payment has been approved') AS payment_approved_at,
           MAX(received_at) FILTER (WHERE lower(COALESCE(from_email,'')) = 'no-reply@maricopa.gov'
             AND COALESCE(subject,'') ~* 'dust permit issued') AS permit_issued_email_at,
           MAX(received_at) FILTER (WHERE lower(COALESCE(from_email,'')) = 'no-reply@maricopa.gov'
             AND COALESCE(subject,'') ~* 'dust permit rejected') AS permit_rejected_email_at
         FROM e`
      )
      .get(projectId);
    expect(row).not.toBeNull();
  });

  test("estimate linkage query returns expected join shape", async () => {
    if (!projectId) {
      return;
    }
    const rows = await db
      .query<{
        project_id: number;
        estimate_id: number;
        source: string | null;
        monday_item_id: string | null;
        estimate_number: string | null;
        bid_status: string | null;
      }>(
        `SELECT pe.project_id, pe.estimate_id, pe.source,
                est.monday_item_id, est.estimate_number, est.bid_status
         FROM project_estimates pe
         JOIN estimates est ON est.id = pe.estimate_id
         WHERE pe.project_id = $1
         ORDER BY pe.created_at DESC`
      )
      .all(projectId);
    for (const row of rows) {
      expect(row.project_id).toBe(projectId);
      expect(typeof row.estimate_id).toBe("number");
    }
  });

  test("attachment extraction counts are non-negative", async () => {
    if (!projectId) {
      return;
    }
    const row = await db
      .query<{
        attachment_rows: number;
        att_success: number;
        att_failed: number;
        att_pending: number;
      }>(
        `SELECT
           COUNT(*)::int AS attachment_rows,
           COUNT(*) FILTER (WHERE a.extraction_status = 'success')::int AS att_success,
           COUNT(*) FILTER (WHERE a.extraction_status = 'failed')::int AS att_failed,
           COUNT(*) FILTER (WHERE a.extraction_status = 'pending')::int AS att_pending
         FROM documents a
         JOIN emails e ON e.id = a.email_id
         WHERE a.source = 'email_attachment'
           AND e.project_id = $1`
      )
      .get(projectId);
    expect(row).not.toBeNull();
    if (!row) {
      return;
    }
    expect(
      row.att_success + row.att_failed + row.att_pending
    ).toBeLessThanOrEqual(row.attachment_rows);
  });

  test("document extraction counts are non-negative", async () => {
    if (!projectId) {
      return;
    }
    const row = await db
      .query<{
        document_rows: number;
        doc_success: number;
        doc_failed: number;
      }>(
        `SELECT
           COUNT(*)::int AS document_rows,
           COUNT(*) FILTER (WHERE extraction_status = 'success')::int AS doc_success,
           COUNT(*) FILTER (WHERE extraction_status = 'failed')::int AS doc_failed
         FROM documents WHERE project_id = $1`
      )
      .get(projectId);
    expect(row).not.toBeNull();
    if (!row) {
      return;
    }
    expect(row.doc_success + row.doc_failed).toBeLessThanOrEqual(
      row.document_rows
    );
  });

  test("DoD checklist returns 6 fields each PASS or WARN", async () => {
    if (!projectId) {
      return;
    }
    const row = await db
      .query<{
        project_exists: string;
        folder_linked: string;
        emails_linked: string;
        estimates_linked: string;
        permit_state_present: string;
        documents_present: string;
      }>(
        `WITH
         proj AS (SELECT * FROM projects WHERE id = $1),
         folder AS (SELECT COUNT(*)::int AS c FROM tracked_folders WHERE project_id = $1),
         emails AS (SELECT COUNT(*)::int AS c FROM emails WHERE project_id = $1),
         permits AS (SELECT COUNT(*)::int AS c FROM dust_permits_filed_by_desert_services WHERE project_id = $1),
         ests AS (SELECT COUNT(*)::int AS c FROM project_estimates WHERE project_id = $1),
         docs AS (SELECT COUNT(*)::int AS c FROM documents WHERE project_id = $1)
         SELECT
           CASE WHEN EXISTS (SELECT 1 FROM proj) THEN 'PASS' ELSE 'FAIL' END AS project_exists,
           CASE WHEN (SELECT c FROM folder) > 0 THEN 'PASS' ELSE 'WARN' END AS folder_linked,
           CASE WHEN (SELECT c FROM emails) > 0 THEN 'PASS' ELSE 'WARN' END AS emails_linked,
           CASE WHEN (SELECT c FROM ests) > 0 THEN 'PASS' ELSE 'WARN' END AS estimates_linked,
           CASE WHEN (SELECT c FROM permits) > 0 OR (SELECT dust_permit_status FROM proj) IN ('Requested','Issued','Closed','Billing Sent') THEN 'PASS' ELSE 'WARN' END AS permit_state_present,
           CASE WHEN (SELECT c FROM docs) > 0 THEN 'PASS' ELSE 'WARN' END AS documents_present`
      )
      .get(projectId);
    expect(row).not.toBeNull();
    if (!row) {
      return;
    }
    const validStates = ["PASS", "WARN", "FAIL"];
    expect(validStates).toContain(row.project_exists);
    expect(validStates).toContain(row.folder_linked);
    expect(validStates).toContain(row.emails_linked);
    expect(validStates).toContain(row.estimates_linked);
    expect(validStates).toContain(row.permit_state_present);
    expect(validStates).toContain(row.documents_present);
  });
});

// ===========================================================================
// 3. LINKING SCOPES
// ===========================================================================

describe("linking scopes", () => {
  const scopeResults = new Map<
    string,
    {
      target_rows: number;
      already_linked_rows: number;
      remaining_rows: number;
    }
  >();

  beforeAll(async () => {
    for (const [scope, where] of Object.entries(BACKFILL_SCOPES)) {
      const row = await db
        .query<{
          target_rows: number;
          already_linked_rows: number;
          remaining_rows: number;
        }>(buildScopeStatsQuery(where))
        .get();
      if (row) {
        scopeResults.set(scope, row);
      }
    }
  });

  for (const scope of Object.keys(BACKFILL_SCOPES)) {
    test(`scope "${scope}" returns valid stats`, () => {
      const row = scopeResults.get(scope);
      expect(row).toBeDefined();
      if (!row) {
        return;
      }
      expect(row.target_rows).toBeGreaterThanOrEqual(0);
      expect(row.already_linked_rows).toBeGreaterThanOrEqual(0);
      expect(row.remaining_rows).toBeGreaterThanOrEqual(0);
    });

    test(`scope "${scope}" stats sum correctly`, () => {
      const row = scopeResults.get(scope);
      expect(row).toBeDefined();
      if (!row) {
        return;
      }
      expect(row.already_linked_rows + row.remaining_rows).toBe(
        row.target_rows
      );
    });
  }

  test("scope 'all' target >= 'all-unresolved' target", () => {
    const all = scopeResults.get("all");
    const unresolved = scopeResults.get("all-unresolved");
    if (all && unresolved) {
      expect(all.target_rows).toBeGreaterThanOrEqual(unresolved.target_rows);
    }
  });
});

// ===========================================================================
// 4. CONTRACT STATUS
// ===========================================================================

describe("contract status", () => {
  test("pending contracts query returns expected columns", async () => {
    const rows = await db
      .query<{
        id: number;
        name: string;
        contractor: string | null;
        contract_status: string;
      }>(
        `SELECT id, name, contractor, COALESCE(contract_status, 'Pending') AS contract_status
         FROM projects
         WHERE contract_status = 'Pending' OR contract_status IS NULL
         ORDER BY name`
      )
      .all();
    for (const row of rows) {
      expect(row.contract_status).toBe("Pending");
      expect(typeof row.id).toBe("number");
      expect(typeof row.name).toBe("string");
    }
  });

  test("status summary partitions are consistent", async () => {
    const row = await db
      .query<{
        pending: number;
        received: number;
        sent_back: number;
        executed: number;
        total: number;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE contract_status = 'Pending' OR contract_status IS NULL)::int AS pending,
           COUNT(*) FILTER (WHERE contract_status = 'Received')::int AS received,
           COUNT(*) FILTER (WHERE contract_status = 'Sent Back')::int AS sent_back,
           COUNT(*) FILTER (WHERE contract_status = 'Executed')::int AS executed,
           COUNT(*)::int AS total
         FROM projects`
      )
      .get();
    expect(row).not.toBeNull();
    if (!row) {
      return;
    }
    expect(row.total).toBeGreaterThanOrEqual(0);
    expect(
      row.pending + row.received + row.sent_back + row.executed
    ).toBeLessThanOrEqual(row.total);
  });
});

// ===========================================================================
// 5. HEALTH STATE CLASSIFICATION (pure TS, no DB)
// ===========================================================================

describe("health state classification", () => {
  describe("emails_1h_estimate_link_coverage_pct", () => {
    test("99+ -> OK", () => {
      expect(classifyHealth("emails_1h_estimate_link_coverage_pct", 99)).toBe(
        "OK"
      );
      expect(classifyHealth("emails_1h_estimate_link_coverage_pct", 100)).toBe(
        "OK"
      );
    });

    test("95-98.99 -> WARN", () => {
      expect(classifyHealth("emails_1h_estimate_link_coverage_pct", 95)).toBe(
        "WARN"
      );
      expect(classifyHealth("emails_1h_estimate_link_coverage_pct", 98.5)).toBe(
        "WARN"
      );
    });

    test("<95 -> FAIL", () => {
      expect(classifyHealth("emails_1h_estimate_link_coverage_pct", 94.9)).toBe(
        "FAIL"
      );
      expect(classifyHealth("emails_1h_estimate_link_coverage_pct", 0)).toBe(
        "FAIL"
      );
    });
  });

  describe("emails_24h_estimate_link_coverage_pct", () => {
    test("90+ -> OK", () => {
      expect(classifyHealth("emails_24h_estimate_link_coverage_pct", 90)).toBe(
        "OK"
      );
    });

    test("70-89.99 -> WARN", () => {
      expect(classifyHealth("emails_24h_estimate_link_coverage_pct", 70)).toBe(
        "WARN"
      );
      expect(
        classifyHealth("emails_24h_estimate_link_coverage_pct", 89.9)
      ).toBe("WARN");
    });

    test("<70 -> FAIL", () => {
      expect(
        classifyHealth("emails_24h_estimate_link_coverage_pct", 69.9)
      ).toBe("FAIL");
    });
  });

  describe("high-bar percentage thresholds (99/95)", () => {
    const keys = [
      "project_estimate_scope_pct",
      "emails_on_scoped_projects_estimate_link_pct",
      "estimates_with_monday_item_pct",
      "estimate_file_extract_success_pct",
    ] as const;

    for (const key of keys) {
      test(`${key}: 99+ OK, 95-98 WARN, <95 FAIL`, () => {
        expect(classifyHealth(key, 99)).toBe("OK");
        expect(classifyHealth(key, 97)).toBe("WARN");
        expect(classifyHealth(key, 94)).toBe("FAIL");
      });
    }
  });

  describe("count thresholds (0/25)", () => {
    const keys = [
      "projects_without_estimates",
      "emails_with_project_without_estimate",
    ] as const;

    for (const key of keys) {
      test(`${key}: 0 OK, 1-25 WARN, 26+ FAIL`, () => {
        expect(classifyHealth(key, 0)).toBe("OK");
        expect(classifyHealth(key, 25)).toBe("WARN");
        expect(classifyHealth(key, 26)).toBe("FAIL");
      });
    }
  });

  describe("attachments_24h_success_on_processed_pct (80/60)", () => {
    test("boundary cases", () => {
      expect(
        classifyHealth("attachments_24h_success_on_processed_pct", 80)
      ).toBe("OK");
      expect(
        classifyHealth("attachments_24h_success_on_processed_pct", 60)
      ).toBe("WARN");
      expect(
        classifyHealth("attachments_24h_success_on_processed_pct", 59)
      ).toBe("FAIL");
    });
  });

  describe("documents_24h_success_on_processed_pct (90/75)", () => {
    test("boundary cases", () => {
      expect(classifyHealth("documents_24h_success_on_processed_pct", 90)).toBe(
        "OK"
      );
      expect(classifyHealth("documents_24h_success_on_processed_pct", 75)).toBe(
        "WARN"
      );
      expect(classifyHealth("documents_24h_success_on_processed_pct", 74)).toBe(
        "FAIL"
      );
    });
  });

  describe("domain signal thresholds (50/20)", () => {
    const keys = [
      "docusign_30d_project_link_pct",
      "payapp_30d_project_link_pct",
    ] as const;

    for (const key of keys) {
      test(`${key}: 50+ OK, 20-49 WARN, <20 FAIL`, () => {
        expect(classifyHealth(key, 50)).toBe("OK");
        expect(classifyHealth(key, 20)).toBe("WARN");
        expect(classifyHealth(key, 19)).toBe("FAIL");
      });
    }
  });

  test("unknown metric returns INFO", () => {
    expect(classifyHealth("some_unknown_metric", 42)).toBe("INFO");
  });
});
