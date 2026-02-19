/**
 * Contracts API handlers
 * Route: GET /api/contracts
 */
import {
  multiFilter,
  paginationSchema,
  parseQuery,
  searchParam,
  sortParam,
} from "@lib/api/validation";
import { db } from "@lib/db/client";

const SORT_FIELDS = [
  "updated_at",
  "name",
  "contractor",
  "total",
  "contract_status",
] as const;
type SortField = (typeof SORT_FIELDS)[number];

const contractsQuerySchema = paginationSchema.extend({
  q: searchParam,
  status: multiFilter,
  sort: sortParam(SORT_FIELDS, "updated_at"),
});

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

function getSortExpression(field: SortField): string {
  switch (field) {
    case "name":
      return "LOWER(e.name)";
    case "contractor":
      return "LOWER(COALESCE(e.contractor, ''))";
    case "total":
      return "COALESCE(e.awarded_value, e.bid_value, 0)";
    case "contract_status":
      return "LOWER(COALESCE(proj.contract_status, 'Unlinked'))";
    default:
      return "e.updated_at";
  }
}

export async function listContracts(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const { page, perPage, q, status, sort } = parseQuery(
      url,
      contractsQuerySchema
    );

    const conditions: string[] = ["e.bid_status = 'Won'"];
    const params: unknown[] = [];

    if (status.length > 0) {
      const offset = params.length;
      conditions.push(
        `COALESCE(proj.contract_status, 'Unlinked') IN (${status.map((_, i) => `$${offset + i + 1}`).join(", ")})`
      );
      params.push(...status);
    }

    if (q) {
      const like = `%${q}%`;
      const offset = params.length;
      conditions.push(
        `(e.name ILIKE $${offset + 1} OR e.contractor ILIKE $${offset + 2} OR e.estimate_number ILIKE $${offset + 3} OR e.location ILIKE $${offset + 4} OR proj.project_name ILIKE $${offset + 5})`
      );
      params.push(like, like, like, like, like);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const orderBy = getSortExpression(sort.field);
    const offset = (page - 1) * perPage;

    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;

    const [items, countResult, facetRows, valueRow] = await Promise.all([
      db
        .query(
          `SELECT
            e.id, e.monday_item_id, e.name, e.estimate_number,
            e.contractor, e.group_id, e.bid_status, e.bid_value,
            e.awarded_value, e.due_date, e.location,
            proj.project_id, proj.project_name,
            proj.contract_status, proj.dust_permit_status,
            e.created_at, e.updated_at
           FROM estimates e
           LEFT JOIN LATERAL (
              SELECT
                p.id as project_id,
                p.name as project_name,
                p.contract_status,
                p.dust_permit_status
              FROM project_estimates pe
              JOIN projects p ON p.id = pe.project_id
              WHERE pe.estimate_id = e.id
              ORDER BY pe.created_at DESC NULLS LAST, p.id DESC
              LIMIT 1
           ) proj ON true
           ${where}
           ORDER BY ${orderBy} ${sort.direction.toUpperCase()}, e.id DESC
           LIMIT ${limitParam} OFFSET ${offsetParam}`
        )
        .all(...params, perPage, offset) as Promise<ContractRow[]>,
      db
        .query(
          `SELECT count(*)::int as total
           FROM estimates e
           LEFT JOIN LATERAL (
              SELECT p.contract_status, p.name as project_name
              FROM project_estimates pe
              JOIN projects p ON p.id = pe.project_id
              WHERE pe.estimate_id = e.id
              ORDER BY pe.created_at DESC NULLS LAST, p.id DESC
              LIMIT 1
           ) proj ON true
           ${where}`
        )
        .get(...params) as Promise<{ total: number } | null>,
      db
        .query(
          `SELECT COALESCE(proj.contract_status, 'Unlinked') as status, COUNT(*)::int as count
           FROM estimates e
           LEFT JOIN LATERAL (
              SELECT p.contract_status
              FROM project_estimates pe
              JOIN projects p ON p.id = pe.project_id
              WHERE pe.estimate_id = e.id
              ORDER BY pe.created_at DESC NULLS LAST, p.id DESC
              LIMIT 1
           ) proj ON true
           WHERE e.bid_status = 'Won'
           GROUP BY COALESCE(proj.contract_status, 'Unlinked')
           ORDER BY COALESCE(proj.contract_status, 'Unlinked') ASC`
        )
        .all() as Promise<Array<{ status: string; count: number }>>,
      db
        .query(
          `SELECT COALESCE(SUM(COALESCE(awarded_value, bid_value, 0)), 0)::bigint as total_value
           FROM estimates
           WHERE bid_status = 'Won'`
        )
        .get() as Promise<{ total_value: number } | null>,
    ]);

    const total = countResult?.total ?? 0;

    return Response.json({
      items,
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
      facets: {
        contractStatuses: facetRows,
      },
      summary: {
        totalValue: valueRow?.total_value ?? 0,
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
