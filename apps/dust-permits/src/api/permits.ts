/**
 * Permits API Handlers
 *
 * Thin HTTP handlers that wrap core business logic.
 * Uses shared browser session for performance.
 */

import type { DeepPartial, FormData } from "@/form-data";
import { buildFormData } from "@/form-data";
import {
  validateBuiltFormData,
  validateFormDataOverrides,
} from "@/lib/form-data-validation";
import {
  deleteAllDraftPermitRecords,
  deletePermitRecord,
  markPermitClosedRecord,
  persistDraftPermitRecord,
} from "@/lib/permit-records";
import { closePermit } from "@/portal/close";
import { createApplicationFull, renewPermitFull } from "@/portal/create";
import { deleteAllDrafts, deleteByApplicationId } from "@/portal/delete";
import { withBrowserSessionOperation } from "@/portal/utils/browser";
import { captureError } from "@/portal/utils/sentry";
import {
  apiCreateSchema,
  apiReviseSchema,
  closeBodySchema,
  ensureBrowserSession,
  getPermitForDashboard,
  jsonError,
  jsonSuccess,
  listPermitsForDashboard,
  log,
  renewBodySchema,
  validateCreateMapPreflight,
} from "./permits-helpers";

// ============================================
// Handlers
// ============================================

/**
 * GET /api/permits - List all permits
 */
export async function handleListPermits(): Promise<Response> {
  return Response.json(await listPermitsForDashboard());
}

/**
 * GET /api/permits/:id - Get single permit
 */
export async function handleGetPermit(id: string): Promise<Response> {
  const permit = await getPermitForDashboard(id);
  if (!permit) {
    return jsonError(`Permit ${id} not found`, 404);
  }
  return Response.json(permit);
}

/**
 * POST /api/permits/create - Create new permit
 */
export async function handleCreatePermit(body: unknown): Promise<Response> {
  const parsed = apiCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  const { flow, companyName, copyFromApp, formDataPath } = parsed.data;

  let overrides: DeepPartial<FormData> | undefined;
  if (formDataPath) {
    let overridesInput: unknown;
    try {
      const file = Bun.file(formDataPath);
      const text = await file.text();
      overridesInput = JSON.parse(text) as unknown;
    } catch (error) {
      return jsonError(
        `Failed to load form data from ${formDataPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    const overridesValidation = validateFormDataOverrides(overridesInput);
    if (!overridesValidation.success) {
      return jsonError(overridesValidation.error);
    }
    overrides = overridesValidation.data;
  }

  const formData = buildFormData({ overrides });
  const formValidation = validateBuiltFormData(formData);
  if (!formValidation.success) {
    return jsonError(formValidation.error);
  }
  const mapValidation = await validateCreateMapPreflight(formData);
  if (mapValidation.valid === false) {
    return jsonError(mapValidation.error);
  }

  const sessionResult = await ensureBrowserSession();
  if (sessionResult.success === false) {
    return jsonError(sessionResult.error, 500);
  }

  const { page, context } = sessionResult.page;

  try {
    const result = await withBrowserSessionOperation(
      `create:${flow}`,
      async () =>
        await createApplicationFull(page, context, flow, formData, {
          companyName,
          copyFromApp,
        })
    );

    if (!result.success) {
      return jsonError(result.error || "Create failed", 500);
    }

    if (result.applicationId) {
      try {
        await persistDraftPermitRecord({
          applicationId: result.applicationId,
          companyName,
          flow,
          formData,
          sourcePermitId: copyFromApp ?? null,
        });
      } catch (error) {
        log(
          `   ⚠ Failed to persist draft permit record: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return jsonSuccess({
      applicationId: result.applicationId,
      flow,
      reachedPage5: result.reachedPage5,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (error instanceof Error) {
      captureError(error, {
        extra: { companyName, copyFromApp },
        operation: "createPermit",
        step: flow,
      });
    }
    return jsonError(errorMsg, 500);
  }
}

/**
 * POST /api/permits/:id/renew - Renew permit
 */
export async function handleRenewPermit(
  id: string,
  body: unknown
): Promise<Response> {
  log(`\n🔄 RENEW permit request: ${id}`);

  const parsed = renewBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  try {
    const sessionResult = await ensureBrowserSession();
    if (sessionResult.success === false) {
      return jsonError(sessionResult.error, 500);
    }

    const ctx = sessionResult.page;
    const result = await withBrowserSessionOperation(
      `renew:${id}`,
      async () =>
        await renewPermitFull(
          ctx.page,
          ctx.context,
          id,
          parsed.data.companyName
        )
    );

    if (!result.success) {
      return jsonError(result.error || "Renew failed", 500);
    }

    if (result.applicationId) {
      await persistDraftPermitRecord({
        applicationId: result.applicationId,
        companyName: parsed.data.companyName,
        flow: "renew",
        sourcePermitId: id,
      });
    }

    return jsonSuccess(result);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`   ✗ Renew error: ${errorMsg}`);
    return jsonError(`Renew error: ${errorMsg}`, 500);
  }
}

/**
 * POST /api/permits/:id/close - Close permit
 */
export async function handleClosePermit(
  id: string,
  body: unknown
): Promise<Response> {
  log(`\n🔒 CLOSE permit request: ${id}`);

  const parsed = closeBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  try {
    const sessionResult = await ensureBrowserSession();
    if (sessionResult.success === false) {
      return jsonError(sessionResult.error, 500);
    }

    const ctx = sessionResult.page;
    const result = await withBrowserSessionOperation(
      `close:${id}`,
      async () =>
        await closePermit(ctx.page, ctx.context, id, parsed.data.reason)
    );

    if (!result.success) {
      return jsonError(result.error || "Close failed", 500);
    }

    await markPermitClosedRecord(id);
    return jsonSuccess(result);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`   ✗ Close error: ${errorMsg}`);
    return jsonError(`Close error: ${errorMsg}`, 500);
  }
}

/**
 * POST /api/permits/:id/revise - Revise permit
 */
export async function handleRevisePermit(
  id: string,
  body: unknown
): Promise<Response> {
  log(`\n📝 REVISE permit request: ${id}`);

  const parsed = apiReviseSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  const { revisionType, notes } = parsed.data;
  log(`   Type: ${revisionType}`);
  if (notes) {
    log(`   Notes: ${notes}`);
  }

  try {
    const sessionResult = await ensureBrowserSession();
    if (sessionResult.success === false) {
      return jsonError(sessionResult.error, 500);
    }

    const { page, context } = sessionResult.page;

    const typeDescriptions: Record<string, string> = {
      acreage: "Acreage Change - Modify total acreage amount",
      bmp: "BMP Modifications - Update best management practices",
      boundary: "Boundary/Map Change - Update the disturbed area boundary",
      contact: "Contact Information - Update owner/operator contacts",
      other: "General revision",
      schedule: "Project Schedule - Change start/end dates",
    };
    const baseDescription =
      typeDescriptions[revisionType] || "General revision";
    const revisionPurpose = notes
      ? `${baseDescription}. ${notes}`
      : baseDescription;

    const { navigateToMyDustApps, waitForElement } = await import(
      "@/portal/utils/helpers"
    );
    const { portal } = await import("@/portal/utils/selectors");

    const atDustApps = await navigateToMyDustApps(page);
    if (!atDustApps) {
      return jsonError("Failed to navigate to My Dust Apps", 500);
    }
    await waitForElement(page, portal.dustApps.newApplicationBtn, 15_000);

    const { createReviseApplication } = await import("@/portal/create");
    const result = await withBrowserSessionOperation(
      `revise:${id}`,
      async () =>
        await createReviseApplication(page, context, id, revisionPurpose)
    );

    if (!result.success) {
      return jsonError(result.error || "Revision failed", 500);
    }

    if (result.applicationId) {
      await persistDraftPermitRecord({
        applicationId: result.applicationId,
        flow: "revise",
        sourcePermitId: id,
      });
    }

    return jsonSuccess({
      applicationId: result.applicationId,
      notes: notes || null,
      permitId: id,
      revisionType,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`   ✗ Revise error: ${errorMsg}`);
    return jsonError(`Revise error: ${errorMsg}`, 500);
  }
}

/**
 * DELETE /api/permits/:id - Delete single draft
 */
export async function handleDeletePermit(id: string): Promise<Response> {
  log(`\n🗑️  DELETE permit request: ${id}`);

  try {
    const sessionResult = await ensureBrowserSession();
    if (sessionResult.success === false) {
      return jsonError(sessionResult.error, 500);
    }

    const { page, context } = sessionResult.page;
    const deleted = await withBrowserSessionOperation(
      `delete:${id}`,
      async () => await deleteByApplicationId(page, context, id)
    );

    if (deleted) {
      await deletePermitRecord(id);
      log(`   ✓ Delete completed for ${id}`);
      return jsonSuccess({ message: `Permit ${id} deleted successfully` });
    }

    log(`   ✗ Delete failed for ${id}`);
    return jsonError(`Delete failed for ${id} - check browser`, 500);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`   ✗ Delete error: ${errorMsg}`);
    return jsonError(`Delete error: ${errorMsg}`, 500);
  }
}

/**
 * DELETE /api/permits/drafts - Delete all drafts
 */
export async function handleDeleteAllDrafts(): Promise<Response> {
  log("\n🗑️  DELETE ALL DRAFTS request");

  try {
    const sessionResult = await ensureBrowserSession();
    if (sessionResult.success === false) {
      return jsonError(sessionResult.error, 500);
    }

    const { page, context } = sessionResult.page;
    const success = await withBrowserSessionOperation(
      "delete:drafts",
      async () => await deleteAllDrafts(page, context)
    );
    if (!success) {
      return jsonError("Delete all drafts failed", 500);
    }

    const deletedDbCount = await deleteAllDraftPermitRecords();
    log("   ✓ Deleted all portal drafts");
    return jsonSuccess({
      deletedAll: true,
      deletedDbCount,
      message: "Deleted all drafts",
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`   ✗ Delete all drafts error: ${errorMsg}`);
    return jsonError(`Delete error: ${errorMsg}`, 500);
  }
}

/**
 * GET /health - Health check
 */
export function handleHealthCheck(): Response {
  return Response.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
