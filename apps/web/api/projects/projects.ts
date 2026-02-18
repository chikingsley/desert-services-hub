/**
 * Projects API handlers
 * Route: GET /api/projects
 */
import { db } from "@lib/db/hub";

type SortField =
  | "last_seen"
  | "updated_at"
  | "name"
  | "awarded_value"
  | "email_count";
type SortDirection = "asc" | "desc";

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
  document_count: number;
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

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseSort(value: string | null): {
  field: SortField;
  direction: SortDirection;
} {
  const [fieldRaw, directionRaw] = (value || "last_seen.desc").split(".");
  const field: SortField =
    fieldRaw === "last_seen" ||
    fieldRaw === "updated_at" ||
    fieldRaw === "name" ||
    fieldRaw === "awarded_value" ||
    fieldRaw === "email_count"
      ? fieldRaw
      : "last_seen";
  const direction: SortDirection = directionRaw === "asc" ? "asc" : "desc";
  return { field, direction };
}

function parseMultiFilter(value: string | null): string[] {
  if (!value) {
    return [];
  }

  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry !== "all");

  return [...new Set(values)].slice(0, 50);
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
    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const perPage = Math.min(
      200,
      Math.max(1, parsePositiveInt(url.searchParams.get("perPage"), 50))
    );
    const query = url.searchParams.get("q")?.trim() || "";
    const contractStatuses = parseMultiFilter(
      url.searchParams.get("contract_status")
    );
    const dustStatuses = parseMultiFilter(url.searchParams.get("dust_status"));
    const { field: sortField, direction: sortDirection } = parseSort(
      url.searchParams.get("sort")
    );

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (contractStatuses.length > 0) {
      conditions.push(
        `COALESCE(p.contract_status, 'Pending') IN (${contractStatuses.map(() => "?").join(", ")})`
      );
      params.push(...contractStatuses);
    }

    if (dustStatuses.length > 0) {
      conditions.push(
        `COALESCE(p.dust_permit_status, 'Not Needed') IN (${dustStatuses.map(() => "?").join(", ")})`
      );
      params.push(...dustStatuses);
    }

    if (query) {
      const like = `%${query}%`;
      conditions.push(
        "(p.name ILIKE ? OR p.contractor ILIKE ? OR a.name ILIKE ? OR p.address ILIKE ? OR p.project_number ILIKE ?)"
      );
      params.push(like, like, like, like, like);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy = getSortExpression(sortField);
    const offset = (page - 1) * perPage;

    const [items, countResult, contractRows, dustRows] = await Promise.all([
      db
        .prepare(
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
           ORDER BY ${orderBy} ${sortDirection.toUpperCase()} NULLS LAST, p.id DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, perPage, offset) as Promise<ProjectRow[]>,
      db
        .prepare(
          `SELECT count(*)::int as total
           FROM projects p
           LEFT JOIN accounts a ON a.id = p.account_id
           ${where}`
        )
        .get(...params) as Promise<{ total: number } | null>,
      db
        .prepare(
          `SELECT COALESCE(contract_status, 'Pending') as status, count(*)::int as count
           FROM projects
           GROUP BY COALESCE(contract_status, 'Pending')
           ORDER BY COALESCE(contract_status, 'Pending') ASC`
        )
        .all() as Promise<Array<{ status: string; count: number }>>,
      db
        .prepare(
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
