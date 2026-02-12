/**
 * Dust Permits API handlers
 * Route: GET /api/permits
 */
import { db } from "@lib/db/hub";

type SortField =
  | "submitted_date"
  | "effective_date"
  | "expiration_date"
  | "project_name";
type SortDirection = "asc" | "desc";

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
  const [fieldRaw, directionRaw] = (value || "submitted_date.desc").split(".");
  const field: SortField =
    fieldRaw === "submitted_date" ||
    fieldRaw === "effective_date" ||
    fieldRaw === "expiration_date" ||
    fieldRaw === "project_name"
      ? fieldRaw
      : "submitted_date";
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
    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const perPage = Math.min(
      200,
      Math.max(1, parsePositiveInt(url.searchParams.get("perPage"), 50))
    );
    const query = url.searchParams.get("q")?.trim() || "";
    const statuses = parseMultiFilter(url.searchParams.get("status"));
    const { field: sortField, direction: sortDirection } = parseSort(
      url.searchParams.get("sort")
    );

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (statuses.length > 0) {
      conditions.push(
        `COALESCE(d.status, 'Unknown') IN (${statuses.map(() => "?").join(", ")})`
      );
      params.push(...statuses);
    }

    if (query) {
      const like = `%${query}%`;
      conditions.push(
        "(d.project_name ILIKE ? OR d.id ILIKE ? OR d.address ILIKE ? OR d.company_name ILIKE ? OR p.name ILIKE ?)"
      );
      params.push(like, like, like, like, like);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy = getSortExpression(sortField);
    const offset = (page - 1) * perPage;

    const [items, countResult, statusRows] = await Promise.all([
      db
        .prepare(
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
           ORDER BY ${orderBy} ${sortDirection.toUpperCase()} NULLS LAST, d.id DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, perPage, offset) as Promise<PermitRow[]>,
      db
        .prepare(
          `SELECT count(*)::int as total
           FROM dust_permits_filed_by_desert_services d
           LEFT JOIN projects p ON p.id = d.project_id
           ${where}`
        )
        .get(...params) as Promise<{ total: number } | null>,
      db
        .prepare(
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
