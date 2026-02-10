/**
 * Projects API handlers
 * Routes: GET /api/projects
 */
import { db } from "@lib/db/hub";

interface ProjectRow {
  id: number;
  name: string;
  project_number: string | null;
  contractor: string | null;
  awarded_value: number | null;
  address: string | null;
  location_city: string | null;
  location_state: string | null;
  location_zip: string | null;
  contract_status: string;
  dust_permit_status: string;
  noi_status: string;
  swppp_status: string;
  signs_status: string;
  email_count: number;
  first_seen: string | null;
  last_seen: string | null;
  monday_item_id: string | null;
  notes: string | null;
  account_id: number | null;
  account_name: string | null;
  created_at: string;
  updated_at: string;
}

export async function listProjects(): Promise<Response> {
  try {
    const projects = (await db
      .prepare(
        `SELECT p.*, a.name as account_name
         FROM projects p
         LEFT JOIN accounts a ON a.id = p.account_id
         ORDER BY p.last_seen DESC NULLS LAST, p.updated_at DESC`
      )
      .all()) as ProjectRow[];

    // Compute stats
    const stats = {
      total: projects.length,
      contractStatus: {} as Record<string, number>,
      dustPermitStatus: {} as Record<string, number>,
    };

    for (const p of projects) {
      const cs = p.contract_status || "Pending";
      stats.contractStatus[cs] = (stats.contractStatus[cs] || 0) + 1;
      const ds = p.dust_permit_status || "Not Needed";
      stats.dustPermitStatus[ds] = (stats.dustPermitStatus[ds] || 0) + 1;
    }

    return Response.json({ projects, stats });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return Response.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}
