/**
 * Estimates API handlers
 * Routes: GET /api/estimates, POST /api/estimates
 */
import { db } from "@lib/db/hub";
import type { EstimateRow, EstimateSection } from "@lib/db/types";
import { generateBaseNumber } from "@lib/utils";

type EstimateWithVersionsJson = EstimateRow & { versions: string };

interface EstimateLineItemInput {
  section_id?: string;
  description?: string;
  item?: string;
  quantity?: number;
  qty?: number;
  unit?: string;
  uom?: string;
  unit_cost?: number;
  cost?: number;
  unit_price?: number;
  notes?: string;
}

// Generate a unique base number (YYMMDD format with suffix for duplicates)
async function getNextBaseNumber(): Promise<string> {
  const baseNumber = generateBaseNumber();

  // Check for existing estimates with this prefix
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

  // Add suffix for duplicates (01, 02, etc.)
  const lastNumber = existing.base_number;
  if (lastNumber.length > 6) {
    const suffix = Number.parseInt(lastNumber.slice(6), 10) + 1;
    return `${baseNumber}${suffix.toString().padStart(2, "0")}`;
  }
  return `${baseNumber}01`;
}

// GET /api/estimates - List estimates with pagination
export async function listEstimates(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit")) || 50)
    );
    const offset = (page - 1) * limit;

    const [estimates, countResult, statsResult] = await Promise.all([
      db
        .prepare(
          `SELECT q.id,
            COALESCE(NULLIF(q.base_number, ''), q.estimate_number) as base_number,
            COALESCE(NULLIF(q.job_name, ''), q.name) as job_name,
            COALESCE(NULLIF(q.client_name, ''), q.contractor) as client_name,
            COALESCE(q.bid_status, NULLIF(q.status, ''), 'draft') as status,
            q.created_at,
            q.takeoff_id,
          (SELECT COALESCE(json_agg(json_build_object(
            'id', v.id,
            'version_number', v.version_number,
            'total', v.total,
            'is_current', v.is_current,
            'created_at', v.created_at
          )), '[]'::json) FROM estimate_versions v WHERE v.estimate_id = q.id) as versions
        FROM estimates q
        ORDER BY q.created_at DESC
        LIMIT ? OFFSET ?`
        )
        .all(limit, offset) as Promise<EstimateWithVersionsJson[]>,
      db
        .prepare("SELECT count(*)::int as total FROM estimates")
        .get() as Promise<{ total: number } | null>,
      db
        .prepare(
          `SELECT
            count(*)::int as total,
            COALESCE(SUM(COALESCE(bid_value, 0)), 0)::bigint as total_value,
            count(*) FILTER (WHERE bid_status = 'Bid Sent')::int as bid_sent,
            count(*) FILTER (WHERE bid_status = 'Won')::int as won,
            count(*) FILTER (WHERE bid_status = 'Lost' OR bid_status = 'GC Not Awarded')::int as lost,
            count(*) FILTER (WHERE bid_status = 'Yet to Bid')::int as yet_to_bid
          FROM estimates`
        )
        .get() as Promise<{
        total: number;
        total_value: number;
        bid_sent: number;
        won: number;
        lost: number;
        yet_to_bid: number;
      } | null>,
    ]);

    const total = countResult?.total ?? 0;

    // Parse the versions JSON for each estimate
    const parsedEstimates = estimates.map((e) => ({
      ...e,
      versions:
        typeof e.versions === "string"
          ? JSON.parse(e.versions)
          : (e.versions ?? []),
    }));

    return Response.json({
      estimates: parsedEstimates,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats: {
        total: statsResult?.total ?? 0,
        totalValue: statsResult?.total_value ?? 0,
        bidSent: statsResult?.bid_sent ?? 0,
        won: statsResult?.won ?? 0,
        lost: statsResult?.lost ?? 0,
        yetToBid: statsResult?.yet_to_bid ?? 0,
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
    const body = (await req.json()) as Record<string, unknown>;

    // Auto-generate base_number if not provided (YYMMDD format)
    const baseNumber =
      (body.base_number as string) || (await getNextBaseNumber());

    const result = await db.transaction(async () => {
      // Insert estimate (let DB auto-generate integer id)
      const insertResult = await db.run(
        `INSERT INTO estimates (base_number, takeoff_id, job_name, name, job_address, client_name, client_email, client_phone, notes, status, is_locked)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        [
          baseNumber,
          (body.takeoff_id as string) || null,
          (body.job_name as string) || "Untitled Estimate",
          (body.job_name as string) || "Untitled Estimate",
          (body.job_address as string) || null,
          (body.client_name as string) || null,
          (body.client_email as string) || null,
          (body.client_phone as string) || null,
          (body.notes as string) || null,
          (body.status as string) || "draft",
          body.is_locked ? 1 : 0,
        ]
      );
      const id = (insertResult as unknown as Array<{ id: number }>)[0].id;

      // Create first version
      const versionId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO estimate_versions (id, estimate_id, version_number, total, is_current)
         VALUES (?, ?, 1, ?, 1)`
        )
        .run(versionId, id, (body.total as number) || 0);

      // Create sections if provided (batch insert)
      const sectionIdMap = new Map<string, string>();
      const sections = body.sections as EstimateSection[] | undefined;
      if (sections && sections.length > 0) {
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

      // Create line items if provided (batch insert)
      const lineItems = body.line_items as EstimateLineItemInput[] | undefined;
      if (lineItems && lineItems.length > 0) {
        const itemValues: unknown[] = [];
        const itemPlaceholders: string[] = [];
        let sortOrder = 0;
        for (const item of lineItems) {
          const lineItemId = crypto.randomUUID();
          const cost = item.cost ?? 0;
          itemPlaceholders.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
          itemValues.push(
            lineItemId,
            versionId,
            item.section_id
              ? (sectionIdMap.get(item.section_id) ?? null)
              : null,
            item.item || item.description || "",
            item.quantity ?? item.qty ?? 1,
            item.unit || item.uom || "EA",
            item.unit_cost ?? cost * 0.7,
            item.unit_price ?? cost,
            item.notes ||
              (item.item &&
              item.description &&
              item.description.trim() &&
              item.item !== item.description
                ? item.description
                : null) ||
              null,
            sortOrder
          );
          sortOrder += 1;
        }
        await db.run(
          `INSERT INTO estimate_line_items (id, version_id, section_id, description, quantity, unit, unit_cost, unit_price, notes, sort_order) VALUES ${itemPlaceholders.join(", ")}`,
          itemValues
        );
      }

      return { id, version_id: versionId };
    });

    return Response.json(result);
  } catch (error) {
    console.error("Failed to create estimate:", error);
    return Response.json(
      { error: "Failed to create estimate" },
      { status: 500 }
    );
  }
}

// Route handler object for Bun.serve()
export const estimatesRoutes = {
  GET: listEstimates,
  POST: createEstimate,
};
