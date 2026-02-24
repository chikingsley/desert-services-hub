/**
 * Projects API handlers
 * Route: GET /api/projects
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
  "last_seen",
  "updated_at",
  "name",
  "awarded_value",
  "email_count",
] as const;
type SortField = (typeof SORT_FIELDS)[number];

const projectsQuerySchema = paginationSchema.extend({
  q: searchParam,
  contract_status: multiFilter,
  dust_status: multiFilter,
  sort: sortParam(SORT_FIELDS, "last_seen"),
});

interface ProjectRow {
  account_id: number | null;
  account_name: string | null;
  address: string | null;
  awarded_value: number | null;
  contract_status: string;
  contractor: string | null;
  created_at: string;
  document_count: number;
  dust_permit_status: string;
  email_count: number;
  first_seen: string | null;
  id: number;
  last_seen: string | null;
  location_city: string | null;
  location_state: string | null;
  location_zip: string | null;
  monday_item_id: string | null;
  name: string;
  noi_status: string;
  notes: string | null;
  project_number: string | null;
  signs_status: string;
  swppp_status: string;
  updated_at: string;
}

function getSortExpression(field: SortField): string {
  switch (field) {
    case "updated_at":
      return "p.updated_at";
    case "name":
      return "LOWER(p.name)";
    case "awarded_value":
      return "COALESCE(p.awarded_value, 0)";
    case "email_count":
      return "COALESCE(p.email_count, 0)";
    default:
      return "p.last_seen";
  }
}

export async function listProjects(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const {
      page,
      perPage,
      q,
      contract_status: contractStatuses,
      dust_status: dustStatuses,
      sort,
    } = parseQuery(url, projectsQuerySchema);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (contractStatuses.length > 0) {
      const offset = params.length;
      conditions.push(
        `COALESCE(p.contract_status, 'Pending') IN (${contractStatuses.map((_, i) => `$${offset + i + 1}`).join(", ")})`
      );
      params.push(...contractStatuses);
    }

    if (dustStatuses.length > 0) {
      const offset = params.length;
      conditions.push(
        `COALESCE(p.dust_permit_status, 'Not Needed') IN (${dustStatuses.map((_, i) => `$${offset + i + 1}`).join(", ")})`
      );
      params.push(...dustStatuses);
    }

    if (q) {
      const like = `%${q}%`;
      const offset = params.length;
      conditions.push(
        `(p.name ILIKE $${offset + 1} OR p.contractor ILIKE $${offset + 2} OR a.name ILIKE $${offset + 3} OR p.address ILIKE $${offset + 4} OR p.project_number ILIKE $${offset + 5})`
      );
      params.push(like, like, like, like, like);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy = getSortExpression(sort.field);
    const offset = (page - 1) * perPage;

    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;

    const [items, countResult, contractRows, dustRows] = await Promise.all([
      db
        .query(
          `SELECT
            p.id,
            p.name,
            p.project_number,
            p.contractor,
            p.awarded_value,
            p.address,
            p.location_city,
            p.location_state,
            p.location_zip,
            p.contract_status,
            p.dust_permit_status,
            p.noi_status,
            p.swppp_status,
            p.signs_status,
            COALESCE(docs.document_count, 0)::int as document_count,
            p.email_count,
            p.first_seen,
            p.last_seen,
            p.monday_item_id,
            p.notes,
            p.account_id,
            a.name as account_name,
            p.created_at,
            p.updated_at
           FROM projects p
           LEFT JOIN accounts a ON a.id = p.account_id
           LEFT JOIN LATERAL (
              SELECT count(*)::int AS document_count
              FROM documents d
              WHERE d.project_id = p.id
           ) docs ON true
           ${where}
           ORDER BY ${orderBy} ${sort.direction.toUpperCase()} NULLS LAST, p.id DESC
           LIMIT ${limitParam} OFFSET ${offsetParam}`
        )
        .all(...params, perPage, offset) as Promise<ProjectRow[]>,
      db
        .query(
          `SELECT count(*)::int as total
           FROM projects p
           LEFT JOIN accounts a ON a.id = p.account_id
           ${where}`
        )
        .get(...params) as Promise<{ total: number } | null>,
      db
        .query(
          `SELECT COALESCE(contract_status, 'Pending') as status, count(*)::int as count
           FROM projects
           GROUP BY COALESCE(contract_status, 'Pending')
           ORDER BY COALESCE(contract_status, 'Pending') ASC`
        )
        .all() as Promise<Array<{ status: string; count: number }>>,
      db
        .query(
          `SELECT COALESCE(dust_permit_status, 'Not Needed') as status, count(*)::int as count
           FROM projects
           GROUP BY COALESCE(dust_permit_status, 'Not Needed')
           ORDER BY COALESCE(dust_permit_status, 'Not Needed') ASC`
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
        contractStatuses: contractRows,
        dustStatuses: dustRows,
      },
    });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return Response.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}
