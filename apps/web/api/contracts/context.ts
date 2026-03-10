/**
 * Contract context API handlers
 * Routes:
 * - GET /api/contracts/:id/context
 * - POST /api/contracts/:id/email-links
 * - DELETE /api/contracts/:id/email-links/:emailId
 */
import { pathId } from "@/api/validation";
import { getEmailById } from "@email/db/email";
import { db } from "@lib/db/client";
import { getEstimateById } from "@estimates/db/estimate";
import {
  linkEmailToEstimate,
  unlinkEmailFromEstimate,
} from "@estimates/db/estimate-email";
import { getProjectById } from "@projects/db/project";
import { getPrimaryProjectIdForEstimate } from "@projects/db/project-estimate";
import type { Estimate, Project } from "@lib/db/types";
import {
  formatErrorForLog,
  isTransientApiDbError,
  withApiDbTimeout,
} from "@/api/utils/db-guard";
import { z } from "zod";

type BunContractRequest = Request & {
  params: {
    id: string;
    emailId?: string;
  };
};

interface EstimateRow {
  bid_status: string | null;
  contractor: string | null;
  estimate_number: string | null;
  id: number;
  monday_item_id: string | null;
  name: string;
  updated_at: string;
}

interface ProjectRow {
  contract_status: string | null;
  contractor: string | null;
  dust_permit_status: string | null;
  id: number;
  name: string;
  noi_status: string | null;
  safety_status: string | null;
  updated_at: string;
}

interface ProjectEstimateRow {
  bid_status: string | null;
  contractor: string | null;
  estimate_id: number;
  estimate_name: string;
  estimate_number: string | null;
  is_canonical: boolean;
  monday_item_id: string | null;
  source: string;
  updated_at: string;
}

interface ContractDocumentRow {
  document_type: string | null;
  email_id: number | null;
  estimate_id: number | null;
  extraction_status: string | null;
  file_name: string | null;
  id: number;
  project_id: number | null;
  updated_at: string | null;
}

interface ContractEmailRow {
  from_email: string | null;
  id: number;
  linked_estimate_ids: number[];
  linked_to_selected_estimate: boolean;
  project_id: number | null;
  received_at: string | null;
  subject: string | null;
}

const linkBodySchema = z.object({
  detail: z.string().trim().max(500).optional(),
  email_id: z.coerce.number().int().positive(),
});

function parsePositivePathId(raw: string | undefined): number | null {
  const parsed = pathId.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

function mapEstimateRow(estimate: Estimate): EstimateRow {
  return {
    id: estimate.id,
    name: estimate.name,
    estimate_number: estimate.estimateNumber,
    contractor: estimate.contractor,
    bid_status: estimate.bidStatus,
    monday_item_id: estimate.mondayItemId ?? null,
    updated_at: estimate.updatedAt,
  };
}

function mapProjectRow(project: Project): ProjectRow {
  return {
    id: project.id,
    name: project.name,
    contractor: project.contractor,
    contract_status: project.contractStatus ?? null,
    dust_permit_status: project.dustPermitStatus ?? null,
    safety_status: project.swpppStatus ?? null,
    noi_status: project.noiStatus ?? null,
    updated_at: project.updatedAt,
  };
}

async function getPrimaryProjectByEstimateId(
  estimateId: number
): Promise<ProjectRow | null> {
  const projectId = await getPrimaryProjectIdForEstimate(estimateId);
  if (projectId == null) {
    return null;
  }

  const project = await getProjectById(projectId);
  return project ? mapProjectRow(project) : null;
}

async function getProjectEstimates(
  projectId: number
): Promise<ProjectEstimateRow[]> {
  return await db
    .query<ProjectEstimateRow, [number]>(
      `SELECT
         e.id AS estimate_id,
         e.name AS estimate_name,
         e.estimate_number,
         e.contractor,
         e.bid_status,
         e.monday_item_id,
         pe.is_canonical,
         pe.source,
         e.updated_at::text
       FROM project_estimates pe
       JOIN estimates e ON e.id = pe.estimate_id
       WHERE pe.project_id = $1
       ORDER BY pe.is_canonical DESC, e.updated_at DESC NULLS LAST, e.id DESC`
    )
    .all(projectId);
}

async function getContextDocuments(
  projectId: number | null,
  estimateId: number
): Promise<ContractDocumentRow[]> {
  return await db
    .query<ContractDocumentRow, [number, number]>(
      `WITH project_estimate_ids AS (
         SELECT estimate_id
         FROM project_estimates
         WHERE $1::int IS NOT NULL
           AND project_id = $1
       ),
       context_emails AS (
         SELECT id AS email_id
         FROM emails
         WHERE $1::int IS NOT NULL
           AND project_id = $1
         UNION
         SELECT ee.email_id
         FROM estimate_emails ee
         WHERE ee.estimate_id IN (SELECT estimate_id FROM project_estimate_ids)
       )
       SELECT
         d.id,
         d.project_id,
         d.estimate_id,
         d.email_id,
         d.document_type,
         d.file_name,
         d.extraction_status,
         d.updated_at::text
       FROM documents d
       WHERE d.estimate_id = $2
          OR (
            $1::int IS NOT NULL
            AND (
              d.project_id = $1
              OR d.estimate_id IN (SELECT estimate_id FROM project_estimate_ids)
              OR d.email_id IN (SELECT email_id FROM context_emails)
            )
          )
       ORDER BY d.updated_at DESC NULLS LAST, d.id DESC
       LIMIT 500`
    )
    .all(projectId, estimateId);
}

async function getContextEmails(
  projectId: number | null,
  selectedEstimateId: number
): Promise<ContractEmailRow[]> {
  return await db
    .query<ContractEmailRow, [number, number]>(
      `WITH project_estimate_ids AS (
         SELECT estimate_id
         FROM project_estimates
         WHERE $1::int IS NOT NULL
           AND project_id = $1
       ),
       base_emails AS (
         SELECT ee.email_id AS id
         FROM estimate_emails ee
         WHERE ee.estimate_id = $2
         UNION
         SELECT e.id
         FROM emails e
         WHERE $1::int IS NOT NULL
           AND e.project_id = $1
         UNION
         SELECT ee.email_id AS id
         FROM estimate_emails ee
         WHERE ee.estimate_id IN (SELECT estimate_id FROM project_estimate_ids)
       )
       SELECT
         e.id,
         e.received_at::text,
         e.subject,
         e.from_email,
         e.project_id,
         EXISTS (
           SELECT 1
           FROM estimate_emails ee_sel
           WHERE ee_sel.estimate_id = $2
             AND ee_sel.email_id = e.id
         ) AS linked_to_selected_estimate,
         COALESCE(
           (
             SELECT ARRAY_AGG(linked.estimate_id ORDER BY linked.estimate_id)
             FROM (
               SELECT DISTINCT ee_all.estimate_id
               FROM estimate_emails ee_all
               WHERE ee_all.email_id = e.id
             ) linked
           ),
           ARRAY[]::int[]
         ) AS linked_estimate_ids
       FROM emails e
       JOIN base_emails b ON b.id = e.id
       ORDER BY e.received_at DESC NULLS LAST, e.id DESC
       LIMIT 300`
    )
    .all(projectId, selectedEstimateId);
}

export async function getContractContext(
  req: BunContractRequest
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const estimateId = parsePositivePathId(req.params.id);
    if (!estimateId) {
      return Response.json({ error: "Invalid estimate ID" }, { status: 400 });
    }

    const estimateEntity = await withApiDbTimeout(
      {
        operation: "contracts.context.estimate",
        requestId,
        route: "/api/contracts/:id/context",
        maxInFlight: 1,
      },
      () => getEstimateById(estimateId)
    );
    if (!estimateEntity) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }
    const estimate = mapEstimateRow(estimateEntity);

    const project = await withApiDbTimeout(
      {
        operation: "contracts.context.project",
        requestId,
        route: "/api/contracts/:id/context",
        maxInFlight: 1,
      },
      () => getPrimaryProjectByEstimateId(estimateId)
    );
    const projectId = project?.id ?? null;

    const projectEstimates =
      projectId == null
        ? ([
            {
              estimate_id: estimate.id,
              estimate_name: estimate.name,
              estimate_number: estimate.estimate_number,
              contractor: estimate.contractor,
              bid_status: estimate.bid_status,
              monday_item_id: estimate.monday_item_id,
              is_canonical: true,
              source: "selected_estimate",
              updated_at: estimate.updated_at,
            },
          ] as ProjectEstimateRow[])
        : await withApiDbTimeout(
            {
              operation: "contracts.context.project-estimates",
              requestId,
              route: "/api/contracts/:id/context",
              maxInFlight: 1,
            },
            () => getProjectEstimates(projectId)
          );
    const documents = await withApiDbTimeout(
      {
        operation: "contracts.context.documents",
        requestId,
        route: "/api/contracts/:id/context",
        maxInFlight: 1,
      },
      () => getContextDocuments(projectId, estimateId)
    );
    const emails = await withApiDbTimeout(
      {
        operation: "contracts.context.emails",
        requestId,
        route: "/api/contracts/:id/context",
        maxInFlight: 1,
      },
      () => getContextEmails(projectId, estimateId)
    );

    return Response.json({
      estimate,
      project,
      projectEstimates,
      documents,
      emails,
      summary: {
        estimateCount: projectEstimates.length,
        documentCount: documents.length,
        emailCount: emails.length,
        linkedEmailCount: emails.filter(
          (email) => email.linked_to_selected_estimate
        ).length,
      },
    });
  } catch (error) {
    console.error("[api.contracts.context] failed", {
      requestId,
      route: "/api/contracts/:id/context",
      error: formatErrorForLog(error),
    });
    if (isTransientApiDbError(error)) {
      return Response.json(
        { error: "Contract context is temporarily busy. Please retry.", requestId },
        { status: 503 }
      );
    }
    return Response.json(
      { error: "Failed to fetch contract context", requestId },
      { status: 500 }
    );
  }
}

export async function addContractEmailLink(
  req: BunContractRequest
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const estimateId = parsePositivePathId(req.params.id);
    if (!estimateId) {
      return Response.json({ error: "Invalid estimate ID" }, { status: 400 });
    }

    const parsed = linkBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
        { status: 400 }
      );
    }

    const emailId = parsed.data.email_id;
    const detail =
      parsed.data.detail && parsed.data.detail.length > 0
        ? parsed.data.detail
        : "linked_from_contracts_tab";

    const [estimateExists, emailExists] = await Promise.all([
      withApiDbTimeout(
        {
          operation: "contracts.email-link.estimate",
          requestId,
          route: "/api/contracts/:id/email-links",
        },
        () => getEstimateById(estimateId)
      ),
      withApiDbTimeout(
        {
          operation: "contracts.email-link.email",
          requestId,
          route: "/api/contracts/:id/email-links",
        },
        () => getEmailById(emailId)
      ),
    ]);

    if (!estimateExists) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }
    if (!emailExists) {
      return Response.json({ error: "Email not found" }, { status: 404 });
    }

    const linked = await withApiDbTimeout(
      {
        operation: "contracts.email-link.create",
        requestId,
        route: "/api/contracts/:id/email-links",
      },
      () =>
        linkEmailToEstimate(
          estimateId,
          emailId,
          "manual",
          detail
        )
    );
    if (!linked) {
      return Response.json(
        { error: "Failed to create estimate-email link" },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      estimate_id: estimateId,
      email_id: emailId,
    });
  } catch (error) {
    console.error("[api.contracts.email-link] failed", {
      requestId,
      route: "/api/contracts/:id/email-links",
      error: formatErrorForLog(error),
    });
    if (isTransientApiDbError(error)) {
      return Response.json(
        { error: "Contract email linking is temporarily busy. Please retry.", requestId },
        { status: 503 }
      );
    }
    return Response.json(
      { error: "Failed to add contract email link", requestId },
      { status: 500 }
    );
  }
}

export async function removeContractEmailLink(
  req: BunContractRequest
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const estimateId = parsePositivePathId(req.params.id);
    const emailId = parsePositivePathId(req.params.emailId);
    if (!(estimateId && emailId)) {
      return Response.json(
        { error: "Invalid estimate or email ID" },
        { status: 400 }
      );
    }

    const removed = await withApiDbTimeout(
      {
        operation: "contracts.email-link.remove",
        requestId,
        route: "/api/contracts/:id/email-links/:emailId",
      },
      () => unlinkEmailFromEstimate(estimateId, emailId)
    );

    return Response.json({
      ok: true,
      removed,
      estimate_id: estimateId,
      email_id: emailId,
    });
  } catch (error) {
    console.error("[api.contracts.email-unlink] failed", {
      requestId,
      route: "/api/contracts/:id/email-links/:emailId",
      error: formatErrorForLog(error),
    });
    if (isTransientApiDbError(error)) {
      return Response.json(
        { error: "Contract email unlinking is temporarily busy. Please retry.", requestId },
        { status: 503 }
      );
    }
    return Response.json(
      { error: "Failed to remove contract email link", requestId },
      { status: 500 }
    );
  }
}
