/**
 * Dust Permits API handlers
 * Routes: GET /api/permits
 */
import { db } from "@lib/db/hub";

interface PermitRow {
  id: string;
  project_name: string | null;
  company_name: string | null;
  status: string | null;
  submitted_date: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  address: string | null;
  city: string | null;
  project_db_name: string | null;
}

export async function listPermits(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status");
    const search = url.searchParams.get("q");

    let query = `SELECT
          d.id,
          d.project_name,
          d.company_name,
          d.status,
          d.submitted_date,
          d.effective_date,
          d.expiration_date,
          d.address,
          d.city,
          p.name as project_db_name
         FROM dust_permits_filed_by_desert_services d
         LEFT JOIN projects p ON p.id = d.project_id`;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (statusFilter && statusFilter !== "all") {
      conditions.push(`d.status = $${params.length + 1}`);
      params.push(statusFilter);
    }

    if (search) {
      conditions.push(
        `(d.project_name ILIKE $${params.length + 1} OR d.id ILIKE $${params.length + 1} OR d.address ILIKE $${params.length + 1} OR d.company_name ILIKE $${params.length + 1})`
      );
      params.push(`%${search}%`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += " ORDER BY d.submitted_date DESC NULLS LAST";

    const permits = (await db.prepare(query).all(...params)) as PermitRow[];

    // Compute stats from full dataset (unfiltered)
    const statsRows = (await db
      .prepare(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'Active') as active,
          COUNT(*) FILTER (WHERE status = 'Closed') as closed,
          COUNT(*) FILTER (WHERE status = 'Superseded') as superseded,
          COUNT(*) FILTER (WHERE status = 'Rejected') as rejected,
          COUNT(*) FILTER (WHERE status = 'Pending Payment') as pending_payment,
          COUNT(*) FILTER (WHERE status = 'Submitted') as submitted,
          COUNT(*) FILTER (WHERE project_id IS NULL) as unlinked
        FROM dust_permits_filed_by_desert_services`
      )
      .get()) as Record<string, number>;

    return Response.json({
      permits,
      stats: {
        total: statsRows.total,
        active: statsRows.active,
        closed: statsRows.closed,
        superseded: statsRows.superseded,
        rejected: statsRows.rejected,
        pendingPayment: statsRows.pending_payment,
        submitted: statsRows.submitted,
        unlinked: statsRows.unlinked,
      },
    });
  } catch (error) {
    console.error("Failed to fetch permits:", error);
    return Response.json({ error: "Failed to fetch permits" }, { status: 500 });
  }
}
