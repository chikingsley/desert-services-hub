/**
 * Contracts API handlers
 * Route: GET /api/contracts
 */
import { db } from "@lib/db/hub";

type SortField =
  | "updated_at"
  | "name"
  | "contractor"
  | "total"
  | "contract_status";
type SortDirection = "asc" | "desc";

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
  const [fieldRaw, directionRaw] = (value || "updated_at.desc").split(".");
  const field: SortField =
    fieldRaw === "updated_at" ||
    fieldRaw === "name" ||
    fieldRaw === "contractor" ||
    fieldRaw === "total" ||
    fieldRaw === "contract_status"
      ? fieldRaw
      : "updated_at";
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

    const conditions: string[] = ["e.bid_status = 'Won'"];
    const params: unknown[] = [];

    if (statuses.length > 0) {
      conditions.push(
        `COALESCE(proj.contract_status, 'Unlinked') IN (${statuses.map(() => "?").join(", ")})`
      );
      params.push(...statuses);
    }

    if (query) {
      const like = `%${query}%`;
      conditions.push(
        "(e.name ILIKE ? OR e.contractor ILIKE ? OR e.estimate_number ILIKE ? OR e.location ILIKE ? OR proj.project_name ILIKE ?)"
      );
      params.push(like, like, like, like, like);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const orderBy = getSortExpression(sortField);
    const offset = (page - 1) * perPage;

    const [items, countResult, facetRows, valueRow] = await Promise.all([
      db
        .prepare(
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
           ORDER BY ${orderBy} ${sortDirection.toUpperCase()}, e.id DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, perPage, offset) as Promise<ContractRow[]>,
      db
        .prepare(
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
        .prepare(
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
        .prepare(
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
