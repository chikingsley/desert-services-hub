/**
 * Project by ID API handlers
 * Route: /api/projects/:id/final-sov
 */
import { db } from "@lib/db/client";
import { getCanonicalProjectSov } from "@lib/db/repositories/project-estimate";

// Bun extends Request with params from route matching
type BunProjectRequest = Request & { params: { id: string } };

function parseProjectId(rawId: string): number | null {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

// GET /api/projects/:id/final-sov - Canonical final estimate SOV for project
export async function getProjectFinalSov(
  req: BunProjectRequest
): Promise<Response> {
  try {
    const projectId = parseProjectId(req.params.id);
    if (!projectId) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const project = (await db
      .query("SELECT id, name FROM projects WHERE id = $1")
      .get(projectId)) as { id: number; name: string } | null;

    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const canonicalSov = await getCanonicalProjectSov(projectId);
    if (!canonicalSov) {
      return Response.json(
        {
          error: "No canonical final estimate is set for this project",
          code: "missing_final_sov",
        },
        { status: 404 }
      );
    }

    return Response.json({
      project_id: project.id,
      project_name: project.name,
      estimate_id: canonicalSov.canonicalEstimate.estimateId,
      canonicalized_at: canonicalSov.canonicalEstimate.canonicalizedAt,
      estimate: {
        base_number: canonicalSov.canonicalEstimate.baseNumber,
        job_name: canonicalSov.canonicalEstimate.jobName,
        job_address: canonicalSov.canonicalEstimate.jobAddress,
        client_name: canonicalSov.canonicalEstimate.clientName,
        current_version_id: canonicalSov.canonicalEstimate.currentVersionId,
        current_version_total:
          canonicalSov.canonicalEstimate.currentVersionTotal,
      },
      sections: canonicalSov.sections,
      line_items: canonicalSov.lineItems,
    });
  } catch (error) {
    console.error("Failed to fetch project final SOV:", error);
    return Response.json(
      { error: "Failed to fetch project final SOV" },
      { status: 500 }
    );
  }
}
