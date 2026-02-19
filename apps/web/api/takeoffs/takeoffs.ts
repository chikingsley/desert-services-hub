/**
 * Takeoffs API handlers
 * Routes: GET /api/takeoffs, POST /api/takeoffs
 */
import { db } from "@lib/db/client";

type SortField = "updated_at" | "created_at" | "name" | "status";
type SortDirection = "asc" | "desc";

interface TakeoffRow {
  id: string;
  name: string;
  pdf_url: string | null;
  annotations: string;
  page_scales: string;
  status: string;
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
    fieldRaw === "created_at" ||
    fieldRaw === "name" ||
    fieldRaw === "status"
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
    case "created_at":
      return "created_at";
    case "name":
      return "LOWER(name)";
    case "status":
      return "LOWER(status)";
    default:
      return "updated_at";
  }
}

// GET /api/takeoffs - list takeoffs with server-side filters/sort/pagination
export async function listTakeoffs(req: Request): Promise<Response> {
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
      const offset = params.length;
      conditions.push(`status IN (${statuses.map((_, i) => `$${offset + i + 1}`).join(", ")})`);
      params.push(...statuses);
    }

    if (query) {
      const offset = params.length;
      conditions.push(`name ILIKE $${offset + 1}`);
      params.push(`%${query}%`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy = getSortExpression(sortField);
    const offset = (page - 1) * perPage;

    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;

    const [rows, countResult, statusRows] = await Promise.all([
      db
        .query(
          `SELECT *
           FROM takeoffs
           ${where}
           ORDER BY ${orderBy} ${sortDirection.toUpperCase()}, id DESC
           LIMIT ${limitParam} OFFSET ${offsetParam}`
        )
        .all(...params, perPage, offset) as Promise<TakeoffRow[]>,
      db
        .query(`SELECT count(*)::int as total FROM takeoffs ${where}`)
        .get(...params) as Promise<{ total: number } | null>,
      db
        .query(
          `SELECT COALESCE(status, 'Unknown') as status, COUNT(*)::int as count
           FROM takeoffs
           GROUP BY COALESCE(status, 'Unknown')
           ORDER BY COALESCE(status, 'Unknown') ASC`
        )
        .all() as Promise<Array<{ status: string; count: number }>>,
    ]);

    const total = countResult?.total ?? 0;

    return Response.json({
      items: rows.map((t) => ({
        ...t,
        annotations: JSON.parse(t.annotations || "[]"),
        page_scales: JSON.parse(t.page_scales || "{}"),
      })),
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
    console.error("Failed to fetch takeoffs:", error);
    return Response.json(
      { error: "Failed to fetch takeoffs" },
      { status: 500 }
    );
  }
}

// POST /api/takeoffs - Create a new takeoff
export async function createTakeoff(req: Request): Promise<Response> {
  const body = (await req.json()) as Record<string, unknown>;
  const id = crypto.randomUUID();

  await db
    .query(
      `INSERT INTO takeoffs (id, name, pdf_url, annotations, page_scales, status)
       VALUES ($1, $2, $3, $4, $5, $6)`
    )
    .run(
      id,
      (body.name as string) || "Untitled Takeoff",
      (body.pdf_url as string) || null,
      JSON.stringify((body.annotations as unknown[]) || []),
      JSON.stringify((body.page_scales as Record<string, unknown>) || {}),
      (body.status as string) || "draft"
    );

  const takeoff = (await db
    .query("SELECT * FROM takeoffs WHERE id = $1")
    .get(id)) as TakeoffRow;

  return Response.json({
    ...takeoff,
    annotations: JSON.parse(takeoff.annotations || "[]"),
    page_scales: JSON.parse(takeoff.page_scales || "{}"),
  });
}

export const takeoffsRoutes = {
  GET: listTakeoffs,
  POST: createTakeoff,
};
