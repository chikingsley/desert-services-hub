/**
 * Dust Permits API handlers
 * Route: GET /api/permits
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
  "submitted_date",
  "effective_date",
  "expiration_date",
  "project_name",
] as const;
type SortField = (typeof SORT_FIELDS)[number];

const permitsQuerySchema = paginationSchema.extend({
  q: searchParam,
  status: multiFilter,
  sort: sortParam(SORT_FIELDS, "submitted_date"),
});
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

function getSortExpression(field: SortField): string {
  switch (field) {
    case "effective_date":
      return "d.effective_date";
    case "expiration_date":
      return "d.expiration_date";
    case "project_name":
      return "LOWER(COALESCE(d.project_name, ''))";
    default:
      return "d.submitted_date";
  }
}

export async function listPermits(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const { page, perPage, q, status, sort } = parseQuery(
      url,
      permitsQuerySchema
    );

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status.length > 0) {
      const offset = params.length;
      conditions.push(
        `COALESCE(d.status, 'Unknown') IN (${status.map((_, i) => `$${offset + i + 1}`).join(", ")})`
      );
      params.push(...status);
    }

    if (q) {
      const like = `%${q}%`;
      const offset = params.length;
      conditions.push(
        `(d.project_name ILIKE $${offset + 1} OR d.id ILIKE $${offset + 2} OR d.address ILIKE $${offset + 3} OR d.company_name ILIKE $${offset + 4} OR p.name ILIKE $${offset + 5})`
      );
      params.push(like, like, like, like, like);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy = getSortExpression(sort.field);
    const offset = (page - 1) * perPage;

    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;

    const [items, countResult, statusRows] = await Promise.all([
      db
        .query(
          `SELECT
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
           LEFT JOIN projects p ON p.id = d.project_id
           ${where}
           ORDER BY ${orderBy} ${sort.direction.toUpperCase()} NULLS LAST, d.id DESC
           LIMIT ${limitParam} OFFSET ${offsetParam}`
        )
        .all(...params, perPage, offset) as Promise<PermitRow[]>,
      db
        .query(
          `SELECT count(*)::int as total
           FROM dust_permits_filed_by_desert_services d
           LEFT JOIN projects p ON p.id = d.project_id
           ${where}`
        )
        .get(...params) as Promise<{ total: number } | null>,
      db
        .query(
          `SELECT COALESCE(status, 'Unknown') as status, COUNT(*)::int as count
           FROM dust_permits_filed_by_desert_services
           GROUP BY COALESCE(status, 'Unknown')
           ORDER BY COALESCE(status, 'Unknown') ASC`
        )
        .all() as Promise<Array<{ status: string; count: number }>>,
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
        statuses: statusRows,
      },
    });
  } catch (error) {
    console.error("Failed to fetch permits:", error);
    return Response.json({ error: "Failed to fetch permits" }, { status: 500 });
  }
}
