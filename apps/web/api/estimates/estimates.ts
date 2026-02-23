/**
 * Estimates API handlers
 * Route: GET /api/estimates, POST /api/estimates
 */

import {
  EstimatePayloadValidationError,
  validateCreateEstimatePayload,
} from "@/packages/estimates/estimating/estimate-payload-validation";
import {
  multiFilter,
  paginationSchema,
  parseQuery,
  searchParam,
  sortParam,
} from "@lib/api/validation";
import { db } from "@lib/db/client";
import { generateBaseNumber } from "@lib/utils";
import { z } from "zod";

const SORT_FIELDS = [
  "created_at",
  "job_name",
  "client_name",
  "total",
  "status",
] as const;
type SortField = (typeof SORT_FIELDS)[number];

const estimatesQuerySchema = paginationSchema.extend({
  q: searchParam,
  source: z.enum(["all", "manual", "takeoff"]).catch("all"),
  status: multiFilter,
  sort: sortParam(SORT_FIELDS, "created_at"),
});

interface EstimateListRow {
  id: string;
  base_number: string | null;
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

async function getNextBaseNumber(): Promise<string> {
  const baseNumber = generateBaseNumber();

  const existing = (await db
    .query(
      `SELECT base_number FROM estimates
       WHERE base_number LIKE $1
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

function getSortExpression(field: SortField): string {
  switch (field) {
    case "job_name":
      return "LOWER(COALESCE(q.job_name, ''))";
    case "client_name":
      return "LOWER(COALESCE(q.contractor, ''))";
    case "total":
      return "COALESCE(cv.total, 0)";
    case "status":
      return "LOWER(COALESCE(q.status, 'draft'))";
    default:
      return "q.created_at";
  }
}

// GET /api/estimates - List estimates with server-side filters/sort/pagination
export async function listEstimates(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const {
      page,
      perPage,
      q: query,
      source,
      status: statuses,
      sort: { field: sortField, direction: sortDirection },
    } = parseQuery(url, estimatesQuerySchema);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query) {
      const like = `%${query}%`;
      const offset = params.length;
      conditions.push(
        `(q.job_name ILIKE $${offset + 1} OR q.contractor ILIKE $${offset + 2} OR q.base_number ILIKE $${offset + 3} OR q.job_address ILIKE $${offset + 4})`
      );
      params.push(like, like, like, like);
    }

    if (source === "manual") {
      conditions.push("q.takeoff_id IS NULL");
    } else if (source === "takeoff") {
      conditions.push("q.takeoff_id IS NOT NULL");
    }

    if (statuses.length > 0) {
      const offset = params.length;
      conditions.push(
        `COALESCE(q.status, 'draft') IN (${statuses.map((_, i) => `$${offset + i + 1}`).join(", ")})`
      );
      params.push(...statuses);
    } else {
      // Default behavior for main list: hide Yet to Bid until explicitly filtered in.
      const offset = params.length;
      conditions.push(`COALESCE(q.status, 'draft') <> $${offset + 1}`);
      params.push("Yet to Bid");
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderByExpression = getSortExpression(sortField);
    const offset = (page - 1) * perPage;

    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;

    const [rows, countResult, statusFacetRows] = await Promise.all([
      db
        .query(
          `SELECT
            q.id,
            q.base_number,
            q.job_name,
            q.contractor as client_name,
            q.job_address,
            COALESCE(q.status, 'draft') as status,
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
          LIMIT ${limitParam} OFFSET ${offsetParam}`
        )
        .all(...params, perPage, offset) as Promise<EstimateListRow[]>,
      db
        .query(`SELECT count(*)::int as total FROM estimates q ${where}`)
        .get(...params) as Promise<{ total: number } | null>,
      db
        .query(
          `SELECT COALESCE(status, 'draft') as status, count(*)::int as count
           FROM estimates
           GROUP BY COALESCE(status, 'draft')
           ORDER BY COALESCE(status, 'draft') ASC`
        )
        .all() as Promise<Array<{ status: string; count: number }>>,
    ]);

    const total = countResult?.total ?? 0;

    return Response.json({
      items: rows.map((row) => ({
        id: row.id,
        base_number: row.base_number,
        job_name: row.job_name || "Untitled Estimate",
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
            .query(
              "SELECT count(*)::int as count FROM estimates WHERE takeoff_id IS NULL"
            )
            .get()
            .then((r) => (r as { count: number } | null)?.count ?? 0),
          takeoff: await db
            .query(
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

type NormalizedCreatePayload = ReturnType<typeof validateCreateEstimatePayload>;

async function insertEstimateHeader(params: {
  baseNumber: string;
  jobName: string;
  status: string;
  payload: NormalizedCreatePayload;
}): Promise<number> {
  const { baseNumber, jobName, status, payload } = params;

  const insertResult = await db.run(
    `INSERT INTO estimates (base_number, takeoff_id, name, job_name, job_address, contractor, client_address, estimator, estimator_email, notes, status, is_locked)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      baseNumber,
      payload.takeoff_id || null,
      jobName,
      jobName,
      payload.job_address || null,
      payload.client_name || null,
      payload.client_address || null,
      payload.estimator || null,
      payload.estimator_email || null,
      payload.notes || null,
      status,
      payload.is_locked ? 1 : 0,
    ]
  );

  return (insertResult as unknown as Array<{ id: number }>)[0].id;
}

async function insertEstimateVersion(
  estimateId: number,
  total: number
): Promise<string> {
  const versionId = crypto.randomUUID();
  await db
    .query(
      `INSERT INTO estimate_versions (id, estimate_id, version_number, total, is_current)
       VALUES ($1, $2, 1, $3, 1)`
    )
    .run(versionId, estimateId, total);
  return versionId;
}

async function insertEstimateSections(
  versionId: string,
  sections: NonNullable<NormalizedCreatePayload["sections"]>
): Promise<Map<string, string>> {
  const sectionIdMap = new Map<string, string>();

  if (sections.length === 0) {
    return sectionIdMap;
  }

  const sectionValues: unknown[] = [];
  const sectionPlaceholders: string[] = [];
  let sortOrder = 0;

  for (const section of sections) {
    const sectionId = crypto.randomUUID();
    sectionIdMap.set(section.id, sectionId);
    const offset = sectionValues.length;
    sectionPlaceholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
    );
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

  return sectionIdMap;
}

async function insertEstimateLineItems(params: {
  versionId: string;
  lineItems: NonNullable<NormalizedCreatePayload["line_items"]>;
  sectionIdMap: Map<string, string>;
}): Promise<void> {
  const { versionId, lineItems, sectionIdMap } = params;

  if (lineItems.length === 0) {
    return;
  }

  const itemValues: unknown[] = [];
  const itemPlaceholders: string[] = [];
  let sortOrder = 0;

  for (const item of lineItems) {
    const lineItemId = crypto.randomUUID();
    const offset = itemValues.length;
    itemPlaceholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`
    );
    itemValues.push(
      lineItemId,
      versionId,
      item.section_id ? (sectionIdMap.get(item.section_id) ?? null) : null,
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

async function createEstimateRecord(params: {
  baseNumber: string;
  jobName: string;
  status: string;
  payload: NormalizedCreatePayload;
  sections: NonNullable<NormalizedCreatePayload["sections"]>;
  lineItems: NonNullable<NormalizedCreatePayload["line_items"]>;
  total: number;
}): Promise<{ id: number; version_id: string }> {
  const estimateId = await insertEstimateHeader({
    baseNumber: params.baseNumber,
    jobName: params.jobName,
    status: params.status,
    payload: params.payload,
  });

  const versionId = await insertEstimateVersion(estimateId, params.total);
  const sectionIdMap = await insertEstimateSections(versionId, params.sections);
  await insertEstimateLineItems({
    versionId,
    lineItems: params.lineItems,
    sectionIdMap,
  });

  return { id: estimateId, version_id: versionId };
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

    const result = await db.transaction(() =>
      createEstimateRecord({
        baseNumber,
        jobName,
        status,
        payload,
        sections,
        lineItems,
        total: computedTotal,
      })
    );

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
