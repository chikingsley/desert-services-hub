/**
 * Project workflow status update API handler
 * Route: PUT /api/contracts/:id/status
 */
import { pathId } from "@/api/validation";
import { getEstimateById } from "@estimates/db/estimate";
import {
  updateProjectWorkflowStatus,
  type ProjectWorkflowStatusField,
} from "@projects/db/project";
import { getPrimaryProjectIdForEstimate } from "@projects/db/project-estimate";
import { invalidateContractsListCache } from "@/api/contracts/cache";
import {
  formatErrorForLog,
  isTransientApiDbError,
  withApiDbTimeout,
} from "@/api/utils/db-guard";
import { z } from "zod";

type BunContractStatusRequest = Request & {
  params: {
    id: string;
  };
};

const projectStatusBodySchema = z.discriminatedUnion("field", [
  z.object({
    field: z.literal("contract"),
    status: z.enum(["n_a", "pending", "negotiating", "done"]),
  }),
  z.object({
    field: z.literal("dust_permit"),
    status: z.enum(["n_a", "requested", "submitted", "done"]),
  }),
  z.object({
    field: z.literal("safety"),
    status: z.enum(["n_a", "requested", "done"]),
  }),
  z.object({
    field: z.literal("noi"),
    status: z.enum(["requested", "done"]),
  }),
]);

const legacyStatusBodySchema = z.object({
  status: z.enum([
    "need_contract",
    "need_safety",
    "need_dust_permit",
    "no_action",
  ]),
});

type ProjectStatusUpdate = z.infer<typeof projectStatusBodySchema>;

const STATUS_LABEL_BY_FIELD: Record<
  ProjectStatusUpdate["field"],
  Record<string, string>
> = {
  contract: {
    n_a: "N/A",
    pending: "Pending",
    negotiating: "Negotiating",
    done: "Done",
  },
  dust_permit: {
    n_a: "N/A",
    requested: "Requested",
    submitted: "Submitted",
    done: "Done",
  },
  safety: {
    n_a: "N/A",
    requested: "Requested",
    done: "Done",
  },
  noi: {
    requested: "Requested",
    done: "Done",
  },
};

function parsePositivePathId(raw: string | undefined): number | null {
  const parsed = pathId.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

function parseStatusUpdate(body: unknown): ProjectStatusUpdate | null {
  const parsed = projectStatusBodySchema.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }

  const legacy = legacyStatusBodySchema.safeParse(body);
  if (!legacy.success) {
    return null;
  }

  switch (legacy.data.status) {
    case "need_contract":
      return { field: "contract", status: "pending" };
    case "need_safety":
      return { field: "safety", status: "requested" };
    case "need_dust_permit":
      return { field: "dust_permit", status: "requested" };
    case "no_action":
      return { field: "contract", status: "done" };
    default:
      return null;
  }
}

function resolveStorageValue(update: ProjectStatusUpdate): string {
  return STATUS_LABEL_BY_FIELD[update.field][update.status] ?? "Pending";
}

function resolveResponseStatuses(project: {
  contractStatus: string;
  dustPermitStatus: string;
  noiStatus: string;
  swpppStatus: string;
}): Record<string, string> {
  return {
    contract_status: project.contractStatus,
    dust_permit_status: project.dustPermitStatus,
    safety_status: project.swpppStatus,
    noi_status: project.noiStatus,
  };
}

export async function updateContractStatus(
  req: BunContractStatusRequest
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const estimateId = parsePositivePathId(req.params.id);
    if (!estimateId) {
      return Response.json({ error: "Invalid estimate ID" }, { status: 400 });
    }

    const estimate = await withApiDbTimeout(
      {
        operation: "contracts.status.estimate",
        requestId,
        route: "/api/contracts/:id/status",
        maxInFlight: 1,
      },
      () => getEstimateById(estimateId)
    );
    if (!estimate) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const update = parseStatusUpdate(await req.json());
    if (!update) {
      return Response.json({ error: "Invalid status payload" }, { status: 400 });
    }

    const projectId = await withApiDbTimeout(
      {
        operation: "contracts.status.project-id",
        requestId,
        route: "/api/contracts/:id/status",
        maxInFlight: 1,
      },
      () => getPrimaryProjectIdForEstimate(estimateId)
    );
    if (!projectId) {
      return Response.json(
        {
          error:
            "This estimate is not linked to a project. Link it before setting project statuses.",
        },
        { status: 409 }
      );
    }

    const field = update.field as ProjectWorkflowStatusField;
    const statusValue = resolveStorageValue(update);
    const project = await withApiDbTimeout(
      {
        operation: `contracts.status.update-project.${field}`,
        requestId,
        route: "/api/contracts/:id/status",
        maxInFlight: 1,
      },
      () => updateProjectWorkflowStatus(projectId, field, statusValue)
    );
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    invalidateContractsListCache();

    return Response.json({
      ok: true,
      estimate_id: estimateId,
      project_id: project.id,
      field,
      status: statusValue,
      ...resolveResponseStatuses(project),
    });
  } catch (error) {
    console.error("[api.contracts.status] failed", {
      requestId,
      route: "/api/contracts/:id/status",
      error: formatErrorForLog(error),
    });
    if (isTransientApiDbError(error)) {
      return Response.json(
        {
          error: "Project status update is temporarily busy. Please retry.",
          requestId,
        },
        { status: 503 }
      );
    }
    return Response.json(
      { error: "Failed to update project status", requestId },
      { status: 500 }
    );
  }
}
