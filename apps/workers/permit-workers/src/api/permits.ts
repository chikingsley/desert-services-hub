/**
 * Permits API Handlers
 *
 * Thin HTTP handlers that wrap core business logic.
 * Uses shared browser session for performance.
 */

import {
  getActivePermits,
  getPermitById,
} from "@lib/db/repositories/dust-permit";
import type { Permit as DbPermit } from "@lib/db/types";
import { z } from "zod";
import { buildFormData, type DeepPartial, type FormData } from "@/form-data";
import { closeSchema } from "@/handlers/close";
import { createSchema } from "@/handlers/create";
import { renewSchema } from "@/handlers/renew";
import type { Permit as DashboardPermit } from "@/lib/types";
import { closePermit } from "@/portal/close";
import { createApplicationFull, renewPermitFull } from "@/portal/create";
import { deleteByApplicationId, deleteSingleDraft } from "@/portal/delete";
import {
  getOrCreateBrowserSession,
  getSessionPageAndContext,
} from "@/portal/utils/browser";
import { login } from "@/portal/utils/login";
import { captureError } from "@/portal/utils/sentry";

const log = (msg: string) => process.stderr.write(`${msg}\n`);

// ============================================
// API-specific schemas (extend handler schemas for HTTP)
// ============================================

/**
 * Create permit request - extends handler schema with API-specific fields
 */
const apiCreateSchema = createSchema
  .omit({ headless: true, keepOpen: true })
  .extend({
    copyFromApp: z
      .string()
      .optional()
      .describe("Permit ID to copy from (for renew flow)"),
  });

/**
 * Revise request schema
 */
const apiReviseSchema = z.object({
  revisionType: z.string().describe("Type of revision"),
  notes: z.string().optional().describe("Additional notes"),
});

// ============================================
// Helpers
// ============================================

function transformPermitForDashboard(dbPermit: DbPermit): DashboardPermit {
  const permitNumber = dbPermit.id;
  const company = dbPermit.companyName || "Unknown";
  const projectName = dbPermit.projectName || "Unnamed Project";
  const address = dbPermit.address
    ? `${dbPermit.address}${dbPermit.city ? `, ${dbPermit.city}` : ""}`
    : undefined;

  return {
    permitNumber,
    company,
    projectName,
    address,
    current: {
      id: dbPermit.id,
      applicationNumber: dbPermit.id,
      permitNumber: dbPermit.id,
      version: 1,
      versionType: "new",
      projectName,
      company,
      address,
      requestStatus: "complete",
      permitStatus:
        (dbPermit.status as DashboardPermit["current"]["permitStatus"]) ||
        "Draft",
      submittedAt: dbPermit.submittedDate || undefined,
      effectiveAt: dbPermit.effectiveDate || undefined,
      expiresAt: dbPermit.expirationDate || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    history: [],
  };
}

async function ensureBrowserSession(): Promise<
  | {
      success: true;
      page: NonNullable<ReturnType<typeof getSessionPageAndContext>>;
    }
  | { success: false; error: string }
> {
  const session = await getOrCreateBrowserSession();
  const ctx = getSessionPageAndContext();

  if (!ctx) {
    return { success: false, error: "No browser session available" };
  }

  if (!session.isLoggedIn) {
    log("   ✗ Not logged in - attempting re-login...");
    const loggedIn = await login(ctx.page);
    if (!loggedIn) {
      return { success: false, error: "Failed to login to portal" };
    }
    session.isLoggedIn = true;
  }

  return { success: true, page: ctx };
}

function jsonError(error: string, status = 400): Response {
  return Response.json(
    { success: false, error, timestamp: new Date().toISOString() },
    { status }
  );
}

function jsonSuccess(data: Record<string, unknown>): Response {
  return Response.json({
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// Handlers
// ============================================

/**
 * GET /api/permits - List all permits
 */
export async function handleListPermits(): Promise<Response> {
  const dbPermits = await getActivePermits();
  return Response.json(dbPermits.map(transformPermitForDashboard));
}

/**
 * GET /api/permits/:id - Get single permit
 */
export async function handleGetPermit(id: string): Promise<Response> {
  const permit = await getPermitById(id);

  if (!permit) {
    return jsonError(`Permit ${id} not found`, 404);
  }

  return Response.json(transformPermitForDashboard(permit));
}

/**
 * POST /api/permits/create - Create new permit
 */
export async function handleCreatePermit(body: unknown): Promise<Response> {
  // Validate input using schema
  const parsed = apiCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  const { flow, companyName, copyFromApp, formDataPath } = parsed.data;

  // Load form data from file if path provided
  let overrides: DeepPartial<FormData> | undefined;
  if (formDataPath) {
    try {
      const file = Bun.file(formDataPath);
      const text = await file.text();
      overrides = JSON.parse(text) as DeepPartial<FormData>;
    } catch {
      return jsonError(`Failed to load form data from ${formDataPath}`);
    }
  }

  const formData = buildFormData({ overrides });

  // Get browser session
  const session = await getOrCreateBrowserSession();
  if (!session) {
    return jsonError("Failed to start browser session", 500);
  }

  const { page, context } = session.instance;

  try {
    const result = await createApplicationFull(page, context, flow, formData, {
      companyName,
      copyFromApp,
    });

    if (!result.success) {
      return jsonError(result.error || "Create failed", 500);
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
        operation: "createPermit",
        step: flow,
        extra: { companyName, copyFromApp },
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

  // Validate input - only need companyName from body
  const bodySchema = renewSchema.pick({ companyName: true });
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  try {
    const sessionResult = await ensureBrowserSession();
    if (!sessionResult.success) {
      return jsonError(sessionResult.error, 500);
    }

    const ctx = sessionResult.page;
    const result = await renewPermitFull(
      ctx.page,
      ctx.context,
      id,
      parsed.data.companyName
    );

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

  // Validate input - only need reason from body (optional)
  const bodySchema = closeSchema.pick({ reason: true });
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  try {
    const sessionResult = await ensureBrowserSession();
    if (!sessionResult.success) {
      return jsonError(sessionResult.error, 500);
    }

    const ctx = sessionResult.page;
    const result = await closePermit(
      ctx.page,
      ctx.context,
      id,
      parsed.data.reason
    );

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

  // Validate input
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
    if (!sessionResult.success) {
      return jsonError(sessionResult.error, 500);
    }

    const { page, context } = sessionResult.page;

    // Map revision type to purpose string
    const typeDescriptions: Record<string, string> = {
      boundary: "Boundary/Map Change - Update the disturbed area boundary",
      acreage: "Acreage Change - Modify total acreage amount",
      contact: "Contact Information - Update owner/operator contacts",
      schedule: "Project Schedule - Change start/end dates",
      bmp: "BMP Modifications - Update best management practices",
      other: "General revision",
    };
    const baseDescription =
      typeDescriptions[revisionType] || "General revision";
    const revisionPurpose = notes
      ? `${baseDescription}. ${notes}`
      : baseDescription;

    // Navigate to My Dust Apps
    const { navigateToMyDustApps, waitForElement } = await import(
      "@/portal/utils/helpers"
    );
    const { portal } = await import("@/portal/utils/selectors");

    const atDustApps = await navigateToMyDustApps(page);
    if (!atDustApps) {
      return jsonError("Failed to navigate to My Dust Apps", 500);
    }
    await waitForElement(page, portal.dustApps.newApplicationBtn, 15_000);

    // Create revision
    const { createReviseApplication } = await import("@/portal/create");
    const result = await createReviseApplication(
      page,
      context,
      id,
      revisionPurpose
    );

    if (!result.success) {
      return jsonError(result.error || "Revision failed", 500);
    }

    return jsonSuccess({
      applicationId: result.applicationId,
      permitId: id,
      revisionType,
      notes: notes || null,
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
    if (!sessionResult.success) {
      return jsonError(sessionResult.error, 500);
    }

    const { page, context } = sessionResult.page;

    const deleted = await deleteByApplicationId(page, context, id);

    if (deleted) {
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
    if (!sessionResult.success) {
      return jsonError(sessionResult.error, 500);
    }

    const { page, context } = sessionResult.page;
    let deletedCount = 0;

    while (await deleteSingleDraft(page, context)) {
      deletedCount++;
      log(`   ✓ Deleted draft ${deletedCount}`);
    }

    log(`   ✓ Deleted ${deletedCount} total drafts`);
    return jsonSuccess({
      message: `Deleted ${deletedCount} drafts`,
      deletedCount,
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
