/**
 * Takeoffs API handlers
 * Routes: GET /api/takeoffs, POST /api/takeoffs
 */
import {
  multiFilter,
  paginationSchema,
  parseQuery,
  searchParam,
  sortParam,
} from "@lib/api/validation";
import { db } from "@lib/db/client";
import { z } from "zod";

const SORT_FIELDS = ["updated_at", "created_at", "name", "status"] as const;
type SortField = (typeof SORT_FIELDS)[number];

const takeoffsQuerySchema = paginationSchema.extend({
  q: searchParam,
  status: multiFilter,
  sort: sortParam(SORT_FIELDS, "updated_at"),
});

const createTakeoffSchema = z.object({
  name: z.string().catch("Untitled Takeoff"),
  pdf_url: z.string().nullable().catch(null),
  annotations: z.array(z.unknown()).catch([]),
  page_scales: z.record(z.string(), z.unknown()).catch({}),
  status: z.string().catch("draft"),
});

interface TakeoffRow {
  annotations: string;
  created_at: string;
  id: string;
  name: string;
  page_scales: string;
  pdf_url: string | null;
  status: string;
  updated_at: string;
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
    const { page, perPage, q, status, sort } = parseQuery(
      url,
      takeoffsQuerySchema
    );

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status.length > 0) {
      const offset = params.length;
      conditions.push(
        `status IN (${status.map((_, i) => `$${offset + i + 1}`).join(", ")})`
      );
      params.push(...status);
    }

    if (q) {
      const offset = params.length;
      conditions.push(`name ILIKE $${offset + 1}`);
      params.push(`%${q}%`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy = getSortExpression(sort.field);
    const offset = (page - 1) * perPage;

    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;

    const [rows, countResult, statusRows] = await Promise.all([
      db
        .query(
          `SELECT *
           FROM takeoffs
           ${where}
           ORDER BY ${orderBy} ${sort.direction.toUpperCase()}, id DESC
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
  const body = createTakeoffSchema.parse(await req.json());
  const id = crypto.randomUUID();

  await db
    .query(
      `INSERT INTO takeoffs (id, name, pdf_url, annotations, page_scales, status)
       VALUES ($1, $2, $3, $4, $5, $6)`
    )
    .run(
      id,
      body.name,
      body.pdf_url,
      JSON.stringify(body.annotations),
      JSON.stringify(body.page_scales),
      body.status
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
