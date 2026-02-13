/**
 * Estimates API handlers
 * Route: GET /api/estimates, POST /api/estimates
 */
import { db } from "@lib/db/hub";
import {
  EstimatePayloadValidationError,
  validateCreateEstimatePayload,
} from "@lib/estimating/estimate-payload-validation";
import { generateBaseNumber } from "@lib/utils";

interface EstimateListRow {
  id: string;
  base_number: string;
  job_name: string;
  client_name: string | null;
  job_address: string | null;
  status: string;
  created_at: string;
  takeoff_id: string | null;
  current_version_id: string | null;
  current_version_number: number | null;
  current_version_total: number | null;
  current_version_is_current: number | null;
  current_version_created_at: string | null;
}

type SortField = "created_at" | "job_name" | "client_name" | "total" | "status";
type SortDirection = "asc" | "desc";

const DEFAULT_SORT: `${SortField}.${SortDirection}` = "created_at.desc";
const DEFAULT_PER_PAGE = 50;

// Generate a unique base number (YYMMDD format with suffix for duplicates)
async function getNextBaseNumber(): Promise<string> {
  const baseNumber = generateBaseNumber();

  const existing = (await db
    .prepare(
      `SELECT base_number FROM estimates
       WHERE base_number LIKE ?
       ORDER BY base_number DESC
       LIMIT 1`
    )
    .get(`${baseNumber}%`)) as { base_number: string } | undefined;

  if (!existing) {
    return baseNumber;
  }

  const lastNumber = existing.base_number;
  if (lastNumber.length > 6) {
    const suffix = Number.parseInt(lastNumber.slice(6), 10) + 1;
    return `${baseNumber}${suffix.toString().padStart(2, "0")}`;
  }
  return `${baseNumber}01`;
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
  const raw = (value || DEFAULT_SORT).trim();
  const [fieldRaw, directionRaw] = raw.split(".");

  const field =
    fieldRaw === "created_at" ||
    fieldRaw === "job_name" ||
    fieldRaw === "client_name" ||
    fieldRaw === "total" ||
    fieldRaw === "status"
      ? fieldRaw
      : "created_at";

  const direction = directionRaw === "asc" ? "asc" : "desc";

  return { field, direction };
}

function parseStatusFilter(value: string | null): string[] {
  if (!value) {
    return [];
  }

  const statuses = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return [...new Set(statuses)].slice(0, 20);
}

function getSortExpression(field: SortField): string {
  switch (field) {
    case "job_name":
      return "LOWER(COALESCE(q.name, ''))";
    case "client_name":
      return "LOWER(COALESCE(NULLIF(q.client_name, ''), q.contractor, ''))";
    case "total":
      return "COALESCE(cv.total, 0)";
    case "status":
      return "LOWER(COALESCE(q.bid_status, 'draft'))";
    default:
      return "q.created_at";
  }
}

// GET /api/estimates - List estimates with server-side filters/sort/pagination
export async function listEstimates(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const perPage = Math.min(
      200,
      Math.max(
        1,
        parsePositiveInt(url.searchParams.get("perPage"), DEFAULT_PER_PAGE)
      )
    );

    const query = url.searchParams.get("q")?.trim() || "";
    const source = (url.searchParams.get("source") || "all").trim();
    const statuses = parseStatusFilter(url.searchParams.get("status"));
    const { field: sortField, direction: sortDirection } = parseSort(
      url.searchParams.get("sort")
    );

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query) {
      const like = `%${query}%`;
      conditions.push(
        "(q.name ILIKE ? OR q.estimate_number ILIKE ? OR q.contractor ILIKE ? OR q.client_name ILIKE ? OR q.base_number ILIKE ? OR q.job_address ILIKE ? OR q.location ILIKE ?)"
      );
      params.push(like, like, like, like, like, like, like);
    }

    if (source === "manual") {
      conditions.push("q.takeoff_id IS NULL");
    } else if (source === "takeoff") {
      conditions.push("q.takeoff_id IS NOT NULL");
    }

    if (statuses.length > 0) {
      conditions.push(
        `COALESCE(q.bid_status, 'draft') IN (${statuses.map(() => "?").join(", ")})`
      );
      params.push(...statuses);
    } else {
      // Default behavior for main list: hide Yet to Bid until explicitly filtered in.
      conditions.push("COALESCE(q.bid_status, 'draft') <> ?");
      params.push("Yet to Bid");
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderByExpression = getSortExpression(sortField);
    const offset = (page - 1) * perPage;

    const [rows, countResult, statusFacetRows] = await Promise.all([
      db
        .prepare(
          `SELECT
            q.id,
            COALESCE(NULLIF(q.base_number, ''), q.estimate_number) as base_number,
            q.name as job_name,
            COALESCE(NULLIF(q.client_name, ''), q.contractor) as client_name,
            COALESCE(NULLIF(q.job_address, ''), q.location) as job_address,
            COALESCE(q.bid_status, 'draft') as status,
            q.created_at,
            q.takeoff_id,
            cv.id as current_version_id,
            cv.version_number as current_version_number,
            cv.total as current_version_total,
            cv.is_current as current_version_is_current,
            cv.created_at as current_version_created_at
          FROM estimates q
          LEFT JOIN LATERAL (
            SELECT v.id, v.version_number, v.total, v.is_current, v.created_at
            FROM estimate_versions v
            WHERE v.estimate_id = q.id
            ORDER BY v.is_current DESC, v.version_number DESC, v.created_at DESC
            LIMIT 1
          ) cv ON TRUE
          ${where}
          ORDER BY ${orderByExpression} ${sortDirection.toUpperCase()}, q.id DESC
          LIMIT ? OFFSET ?`
        )
        .all(...params, perPage, offset) as Promise<EstimateListRow[]>,
      db
        .prepare(`SELECT count(*)::int as total FROM estimates q ${where}`)
        .get(...params) as Promise<{ total: number } | null>,
      db
        .prepare(
          `SELECT COALESCE(bid_status, 'draft') as status, count(*)::int as count
           FROM estimates
           GROUP BY COALESCE(bid_status, 'draft')
           ORDER BY COALESCE(bid_status, 'draft') ASC`
        )
        .all() as Promise<Array<{ status: string; count: number }>>,
    ]);

    const total = countResult?.total ?? 0;

    return Response.json({
      items: rows.map((row) => ({
        id: row.id,
        base_number: row.base_number,
        job_name: row.job_name,
        client_name: row.client_name,
        job_address: row.job_address,
        status: row.status,
        created_at: row.created_at,
        takeoff_id: row.takeoff_id,
        current_version: row.current_version_id
          ? {
              id: row.current_version_id,
              version_number: row.current_version_number ?? 1,
              total: row.current_version_total ?? 0,
              is_current: row.current_version_is_current ?? 1,
              created_at: row.current_version_created_at ?? row.created_at,
            }
          : null,
      })),
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
      facets: {
        statuses: statusFacetRows,
        sources: {
          manual: await db
            .prepare(
              "SELECT count(*)::int as count FROM estimates WHERE takeoff_id IS NULL"
            )
            .get()
            .then((r) => (r as { count: number } | null)?.count ?? 0),
          takeoff: await db
            .prepare(
              "SELECT count(*)::int as count FROM estimates WHERE takeoff_id IS NOT NULL"
            )
            .get()
            .then((r) => (r as { count: number } | null)?.count ?? 0),
        },
      },
    });
  } catch (error) {
    console.error("Failed to fetch estimates:", error);
    return Response.json(
      { error: "Failed to fetch estimates" },
      { status: 500 }
    );
  }
}

// POST /api/estimates - Create a new estimate
export async function createEstimate(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const payload = validateCreateEstimatePayload(body);

    const baseNumber = payload.base_number || (await getNextBaseNumber());
    const jobName = payload.job_name || "Untitled Estimate";
    const status = payload.status || "draft";
    const sections = payload.sections ?? [];
    const lineItems = payload.line_items ?? [];
    const computedTotal =
      payload.total ??
      lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

    const result = await db.transaction(async () => {
      const insertResult = await db.run(
        `INSERT INTO estimates (base_number, takeoff_id, name, job_name, job_address, client_name, client_address, client_email, client_phone, estimator, estimator_email, notes, bid_status, status, is_locked)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        [
          baseNumber,
          payload.takeoff_id || null,
          jobName,
          jobName,
          payload.job_address || null,
          payload.client_name || null,
          payload.client_address || null,
          payload.client_email || null,
          payload.client_phone || null,
          payload.estimator || null,
          payload.estimator_email || null,
          payload.notes || null,
          status,
          status,
          payload.is_locked ? 1 : 0,
        ]
      );
      const id = (insertResult as unknown as Array<{ id: number }>)[0].id;

      const versionId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO estimate_versions (id, estimate_id, version_number, total, is_current)
           VALUES (?, ?, 1, ?, 1)`
        )
        .run(versionId, id, computedTotal);

      const sectionIdMap = new Map<string, string>();
      if (sections.length > 0) {
        const sectionValues: unknown[] = [];
        const sectionPlaceholders: string[] = [];
        let sortOrder = 0;

        for (const section of sections) {
          const sectionId = crypto.randomUUID();
          sectionIdMap.set(section.id, sectionId);
          sectionPlaceholders.push("(?, ?, ?, ?, ?, ?)");
          sectionValues.push(
            sectionId,
            versionId,
            section.name,
            section.title ?? null,
            section.show_subtotal ? 1 : 0,
            sortOrder
          );
          sortOrder += 1;
        }

        await db.run(
          `INSERT INTO estimate_sections (id, version_id, name, title, show_subtotal, sort_order) VALUES ${sectionPlaceholders.join(", ")}`,
          sectionValues
        );
      }

      if (lineItems.length > 0) {
        const itemValues: unknown[] = [];
        const itemPlaceholders: string[] = [];
        let sortOrder = 0;

        for (const item of lineItems) {
          const lineItemId = crypto.randomUUID();
          itemPlaceholders.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
          itemValues.push(
            lineItemId,
            versionId,
            item.section_id
              ? (sectionIdMap.get(item.section_id) ?? null)
              : null,
            item.item_name,
            item.description,
            item.quantity,
            item.unit,
            item.unit_price,
            item.notes ?? null,
            item.is_excluded ? 1 : 0,
            sortOrder
          );
          sortOrder += 1;
        }

        await db.run(
          `INSERT INTO estimate_line_items (id, version_id, section_id, item_name, description, quantity, unit, unit_price, notes, is_excluded, sort_order) VALUES ${itemPlaceholders.join(", ")}`,
          itemValues
        );
      }

      return { id, version_id: versionId };
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof EstimatePayloadValidationError) {
      return Response.json(
        { error: error.issues[0], issues: error.issues },
        { status: 400 }
      );
    }

    console.error("Failed to create estimate:", error);
    return Response.json(
      { error: "Failed to create estimate" },
      { status: 500 }
    );
  }
}

export const estimatesRoutes = {
  GET: listEstimates,
  POST: createEstimate,
};
