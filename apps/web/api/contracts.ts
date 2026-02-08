/**
 * Contracts API handlers
 * Routes: GET /api/contracts
 *
 * "Contracts" = Won estimates from Monday.com estimating board.
 * Each Won estimate represents a contract that needs to be collected,
 * reviewed, and executed. The linked project's contract_status tracks
 * where it is in the pipeline.
 */
import { db } from "@lib/db/hub";

interface ContractRow {
  id: number;
  monday_item_id: string | null;
  name: string;
  estimate_number: string | null;
  contractor: string | null;
  group_id: string | null;
  bid_status: string | null;
  bid_value: number | null;
  awarded_value: number | null;
  due_date: string | null;
  location: string | null;
  project_id: number | null;
  project_name: string | null;
  contract_status: string | null;
  dust_permit_status: string | null;
  created_at: string;
  updated_at: string;
}

export async function listContracts(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status");
    const search = url.searchParams.get("q");

    let query = `SELECT e.id, e.monday_item_id, e.name, e.estimate_number,
            e.contractor, e.group_id, e.bid_status, e.bid_value,
            e.awarded_value, e.due_date, e.location,
            p.id as project_id, p.name as project_name,
            p.contract_status, p.dust_permit_status,
            e.created_at, e.updated_at
         FROM estimates e
         LEFT JOIN projects p ON p.linked_estimate_ids LIKE '%' || e.monday_item_id || '%'
         WHERE e.bid_status = 'Won'`;

    const params: unknown[] = [];

    if (statusFilter && statusFilter !== "all") {
      query += ` AND p.contract_status = $${params.length + 1}`;
      params.push(statusFilter);
    }

    if (search) {
      query += ` AND (e.name ILIKE $${params.length + 1} OR e.contractor ILIKE $${params.length + 1} OR e.estimate_number ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    query += " ORDER BY e.updated_at DESC";

    const contracts = (await db
      .prepare(query)
      .all(...params)) as ContractRow[];

    // Stats
    const statsRows = (await db
      .prepare(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE bid_status = 'Won') as won,
          SUM(CASE WHEN bid_status = 'Won' THEN COALESCE(awarded_value, bid_value, 0) ELSE 0 END) as total_value
        FROM estimates
        WHERE bid_status = 'Won'`
      )
      .get()) as Record<string, number>;

    // Contract status breakdown (from linked projects)
    const pipelineStats = (await db
      .prepare(
        `SELECT p.contract_status, COUNT(*) as count
         FROM estimates e
         LEFT JOIN projects p ON p.linked_estimate_ids LIKE '%' || e.monday_item_id || '%'
         WHERE e.bid_status = 'Won'
         GROUP BY p.contract_status`
      )
      .all()) as { contract_status: string | null; count: number }[];

    const pipeline: Record<string, number> = {};
    for (const row of pipelineStats) {
      pipeline[row.contract_status || "Unlinked"] = row.count;
    }

    return Response.json({
      contracts,
      stats: {
        total: statsRows.total,
        totalValue: statsRows.total_value || 0,
        pipeline,
      },
    });
  } catch (error) {
    console.error("Failed to fetch contracts:", error);
    return Response.json(
      { error: "Failed to fetch contracts" },
      { status: 500 }
    );
  }
}
