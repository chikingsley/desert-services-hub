/**
 * Estimate by ID API handlers
 * Routes: /api/estimates/:id, /api/estimates/:id/pdf, /api/estimates/:id/duplicate, /api/estimates/:id/finalize, /api/estimates/:id/takeoff
 */

import { db } from "@lib/db/hub";
import {
  getCanonicalEstimateForProject,
  linkEstimateToProject,
  setCanonicalEstimateForProject,
} from "@lib/db/repositories/project-estimate";
import type {
  EstimateLineItemRow,
  EstimateRow,
  EstimateSectionRow,
} from "@lib/db/types";
import { handleDuplicateEstimate } from "@/api/estimates/by-id/duplicate-estimate";
import { handleGetEstimatePdf } from "@/api/estimates/by-id/get-estimate-pdf";
import {
  type BunRequest,
  getLinkedProjectIds,
  getPreferredEstimateVersion,
  parseEstimateId,
  parseFinalizeRequestBody,
  resolveFinalizeProjectId,
} from "@/api/estimates/by-id/shared";
import { handleUpdateEstimate } from "@/api/estimates/by-id/update-estimate";

// GET /api/estimates/:id - Get a single estimate with versions, sections, line items
export async function getEstimate(req: BunRequest): Promise<Response> {
  try {
    const id = parseEstimateId(req.params.id);
    if (!id) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const estimate = (await db
      .prepare("SELECT * FROM estimates WHERE id = ?")
      .get(id)) as EstimateRow | undefined;

    if (!estimate) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const version = await getPreferredEstimateVersion(id);

    const sections = version
      ? ((await db
          .prepare(
            "SELECT * FROM estimate_sections WHERE version_id = ? ORDER BY sort_order"
          )
          .all(version.id)) as EstimateSectionRow[])
      : [];

    const lineItems = version
      ? ((await db
          .prepare(
            "SELECT * FROM estimate_line_items WHERE version_id = ? ORDER BY sort_order"
          )
          .all(version.id)) as EstimateLineItemRow[])
      : [];

    return Response.json({
      id: estimate.id,
      base_number: estimate.base_number,
      takeoff_id: estimate.takeoff_id,
      job_name: estimate.job_name,
      job_address: estimate.job_address,
      client_name: estimate.client_name,
      client_address: estimate.client_address,
      client_email: estimate.client_email,
      client_phone: estimate.client_phone,
      estimator: estimate.estimator,
      estimator_email: estimate.estimator_email,
      notes: estimate.notes,
      status: estimate.status ?? "draft",
      is_locked: estimate.is_locked,
      created_at: estimate.created_at,
      updated_at: estimate.updated_at,
      current_version: version
        ? {
            ...version,
            sections,
            line_items: lineItems,
          }
        : null,
    });
  } catch (error) {
    console.error("Failed to fetch estimate:", error);
    return Response.json(
      { error: "Failed to fetch estimate" },
      { status: 500 }
    );
  }
}

// PUT /api/estimates/:id - Update an estimate
export function updateEstimate(req: BunRequest): Promise<Response> {
  return handleUpdateEstimate(req);
}

// POST /api/estimates/:id/finalize - Lock estimate and set project canonical final SOV
export async function finalizeEstimate(req: BunRequest): Promise<Response> {
  try {
    const id = parseEstimateId(req.params.id);
    if (!id) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const estimate = await db
      .prepare("SELECT id FROM estimates WHERE id = ?")
      .get(id);

    if (!estimate) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    let rawBody: unknown = {};
    try {
      rawBody = await req.json();
    } catch {
      rawBody = {};
    }

    const { projectId: parsedProjectId, source } =
      parseFinalizeRequestBody(rawBody);
    if (parsedProjectId === "invalid") {
      return Response.json(
        { error: "project_id must be a positive integer" },
        { status: 400 }
      );
    }

    const linkedProjectIds = await getLinkedProjectIds(id);
    const projectResolution = resolveFinalizeProjectId(
      parsedProjectId,
      linkedProjectIds
    );
    if ("errorResponse" in projectResolution) {
      return projectResolution.errorResponse;
    }
    const { projectId } = projectResolution;

    if (!linkedProjectIds.includes(projectId)) {
      const linked = await linkEstimateToProject(projectId, id, source);
      if (!linked) {
        return Response.json(
          { error: "Failed to link estimate to project" },
          { status: 500 }
        );
      }
    }

    const canonicalSet = await setCanonicalEstimateForProject(
      projectId,
      id,
      source
    );
    if (!canonicalSet) {
      return Response.json(
        { error: "Failed to set canonical estimate for project" },
        { status: 500 }
      );
    }

    await db
      .prepare(
        `UPDATE estimates
         SET is_locked = 1, updated_at = now()
         WHERE id = ?`
      )
      .run(id);

    const canonical = await getCanonicalEstimateForProject(projectId);

    return Response.json({
      success: true,
      estimate_id: id,
      project_id: projectId,
      is_locked: 1,
      canonicalized_at: canonical?.canonicalizedAt ?? null,
    });
  } catch (error) {
    console.error("Failed to finalize estimate:", error);
    return Response.json(
      { error: "Failed to finalize estimate" },
      { status: 500 }
    );
  }
}

// DELETE /api/estimates/:id - Delete an estimate
export async function deleteEstimate(req: BunRequest): Promise<Response> {
  try {
    const id = parseEstimateId(req.params.id);
    if (!id) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const estimate = await db
      .prepare("SELECT id FROM estimates WHERE id = ?")
      .get(id);

    if (!estimate) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    await db.prepare("DELETE FROM estimates WHERE id = ?").run(id);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete estimate:", error);
    return Response.json(
      { error: "Failed to delete estimate" },
      { status: 500 }
    );
  }
}

// GET /api/estimates/:id/pdf - Generate and download PDF
export function getEstimatePdf(req: BunRequest): Promise<Response> {
  return handleGetEstimatePdf(req);
}

// POST /api/estimates/:id/duplicate - Duplicate an estimate
export function duplicateEstimate(req: BunRequest): Promise<Response> {
  return handleDuplicateEstimate(req);
}

// GET /api/estimates/:id/takeoff - Get linked takeoff
export async function getEstimateTakeoff(req: BunRequest): Promise<Response> {
  try {
    const id = parseEstimateId(req.params.id);
    if (!id) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const estimate = (await db
      .prepare("SELECT takeoff_id FROM estimates WHERE id = ?")
      .get(id)) as { takeoff_id: string | null } | undefined;

    if (!estimate?.takeoff_id) {
      return Response.json({ takeoff: null });
    }

    const takeoff = (await db
      .prepare(
        `SELECT id, name, status, created_at, updated_at
         FROM takeoffs
         WHERE id = ?`
      )
      .get(estimate.takeoff_id)) as
      | {
          id: string;
          name: string;
          status: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!takeoff) {
      return Response.json({ takeoff: null });
    }

    return Response.json({ takeoff });
  } catch (error) {
    console.error("Failed to get linked takeoff:", error);
    return Response.json(
      { error: "Failed to get linked takeoff" },
      { status: 500 }
    );
  }
}
