/**
 * Permits API Handlers
 *
 * All permit HTTP handlers live here. No separate "helpers" file.
 */

import {
  ftsSearchPermits,
  getActivePermits,
  getExpiringPermits,
  getPermitById,
} from "@lib/db/repositories/dust-permit";
import type { Permit as DbPermit } from "@lib/db/types";
import { z } from "zod";
import type { DeepPartial, FormData } from "@/form-data";
import { buildFormData, DEFAULTS } from "@/form-data";
import {
  FormDataOverridesSchema,
  validateBuiltFormData,
  validateFormDataOverrides,
} from "@/lib/form-data-validation";
import {
  deleteAllDraftPermitRecords,
  deletePermitRecord,
  markPermitClosedRecord,
  persistDraftPermitRecord,
} from "@/lib/permit-records";
import type { Permit as DashboardPermit } from "@/lib/types";
import { closePermit } from "@/portal/close";
import { createApplicationFull, renewPermitFull } from "@/portal/create";
import {
  checkExpedited,
  clickPaymentContinue,
  confirmPayment,
  fillPaymentPage1,
  submitApplication,
} from "@/portal/create/fill";
import { deleteAllDrafts, deleteByApplicationId } from "@/portal/delete";
import {
  ensureBrowserSessionReady,
  getSessionPageAndContext,
  withBrowserSessionOperation,
} from "@/portal/utils/browser";
import { checkpoint } from "@/portal/utils/operator";

// ─── Shared utilities ────────────────────────────────────────────────

const log = (msg: string) => process.stderr.write(`${msg}\n`);

function jsonError(error: string, status = 400): Response {
  return Response.json(
    { error, success: false, timestamp: new Date().toISOString() },
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

async function ensureBrowserSession(): Promise<
  | {
      success: true;
      page: NonNullable<ReturnType<typeof getSessionPageAndContext>>;
    }
  | { success: false; error: string }
> {
  const session = await ensureBrowserSessionReady();
  const ctx = getSessionPageAndContext();

  if (!ctx) {
    return { error: "No browser session available", success: false };
  }

  if (!(session.isLoggedIn && session.portalReady)) {
    return { error: "Failed to login to portal", success: false };
  }

  return { page: ctx, success: true };
}

// ─── Schemas ─────────────────────────────────────────────────────────

const apiCreateSchema = z.object({
  companyName: z.string().optional().describe("Company name for the permit"),
  copyFromApp: z
    .string()
    .optional()
    .describe("Permit ID to copy from (for renew flow)"),
  flow: z
    .enum(["new-company", "existing-company", "renew"])
    .describe("Creation flow type"),
  formData: FormDataOverridesSchema.optional().describe(
    "Inline form data overrides (alternative to formDataPath)"
  ),
  formDataPath: z
    .string()
    .optional()
    .describe("Path to form data JSON overrides on worker filesystem"),
});

const apiReviseSchema = z.object({
  notes: z.string().optional().describe("Additional notes"),
  revisionType: z.string().describe("Type of revision"),
});

const renewBodySchema = z.object({
  companyName: z.string().describe("Company name for renewal"),
});

export const renewAndPayBodySchema = z.object({
  companyName: z.string().describe("Company name for renewal"),
  expedited: z.boolean().optional().default(false),
});

const closeBodySchema = z.object({
  reason: z.string().optional().describe("Reason for closing"),
});

// ─── DB → API transform ─────────────────────────────────────────────

function transformPermitForDashboard(dbPermit: DbPermit): DashboardPermit {
  const permitNumber = dbPermit.id;
  const company = dbPermit.companyName || "Unknown";
  const projectName = dbPermit.projectName || "Unnamed Project";
  const address = dbPermit.address
    ? `${dbPermit.address}${dbPermit.city ? `, ${dbPermit.city}` : ""}`
    : undefined;

  return {
    address,
    company,
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
    permitNumber,
    projectName,
  };
}

// ─── Map preflight validation ────────────────────────────────────────

async function validateCreateMapPreflight(
  formData: FormData
): Promise<{ valid: true } | { valid: false; error: string }> {
  const { latitude, longitude, acresDisturbed } = formData.site;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return { valid: true };
  }

  try {
    const { buildPermitMapDataFromSiteCoordinates } = await import(
      "@/lib/site-drawing"
    );
    await buildPermitMapDataFromSiteCoordinates(
      { acresDisturbed, latitude, longitude },
      { includeAccessPoint: false }
    );
  } catch (error) {
    return {
      error: `Map preflight failed for site ${latitude.toFixed(6)},${longitude.toFixed(6)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      valid: false,
    };
  }

  return { valid: true };
}

// ─── Revision type descriptions ──────────────────────────────────────

const REVISION_TYPE_DESCRIPTIONS: Record<string, string> = {
  acreage: "Acreage Change - Modify total acreage amount",
  bmp: "BMP Modifications - Update best management practices",
  boundary: "Boundary/Map Change - Update the disturbed area boundary",
  contact: "Contact Information - Update owner/operator contacts",
  other: "General revision",
  schedule: "Project Schedule - Change start/end dates",
};

// ─── Handlers ────────────────────────────────────────────────────────

/**
 * GET /api/permits
 */
export async function handleListPermits(): Promise<Response> {
  const dbPermits = await getActivePermits();
  return Response.json(dbPermits.map(transformPermitForDashboard));
}

/**
 * GET /api/permits/:id
 */
export async function handleGetPermit(id: string): Promise<Response> {
  const permit = await getPermitById(id);
  if (!permit) {
    return jsonError(`Permit ${id} not found`, 404);
  }
  return Response.json(transformPermitForDashboard(permit));
}

/**
 * GET /api/permits/search?q=...&limit=20
 */
export async function handleSearchPermits(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const query = url.searchParams.get("q")?.trim();
  if (!query) {
    return jsonError("Missing ?q= search query");
  }
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);
  const permits = await ftsSearchPermits(query, limit);
  return Response.json(permits.map(transformPermitForDashboard));
}

/**
 * GET /api/permits/expiring?days=30
 */
export async function handleExpiringPermits(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const days = Math.min(Number(url.searchParams.get("days") ?? 30), 365);
  const permits = await getExpiringPermits(days);
  return Response.json(permits.map(transformPermitForDashboard));
}

/** Load and validate form data overrides from a JSON file path. */
async function loadOverridesFromFile(
  formDataPath: string
): Promise<{ data: DeepPartial<FormData> } | { error: Response }> {
  let overridesInput: unknown;
  try {
    const file = Bun.file(formDataPath);
    const text = await file.text();
    overridesInput = JSON.parse(text) as unknown;
  } catch (error) {
    return {
      error: jsonError(
        `Failed to load form data from ${formDataPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      ),
    };
  }

  const validation = validateFormDataOverrides(overridesInput);
  if (!validation.success) {
    return { error: jsonError(validation.error) };
  }
  return { data: validation.data };
}

/**
 * POST /api/permits/create
 */
export async function handleCreatePermit(body: unknown): Promise<Response> {
  const parsed = apiCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  const {
    flow,
    companyName,
    copyFromApp,
    formDataPath,
    formData: inlineFormData,
  } = parsed.data;

  let overrides: DeepPartial<FormData> | undefined;
  if (inlineFormData) {
    // Already validated by FormDataOverridesSchema in apiCreateSchema.safeParse
    overrides = inlineFormData;
  } else if (formDataPath) {
    const loaded = await loadOverridesFromFile(formDataPath);
    if ("error" in loaded) {
      return loaded.error;
    }
    overrides = loaded.data;
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
          `   Failed to persist draft: ${error instanceof Error ? error.message : String(error)}`
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
    return jsonError(errorMsg, 500);
  }
}

/**
 * POST /api/permits/:id/renew
 */
export async function handleRenewPermit(
  id: string,
  body: unknown
): Promise<Response> {
  log(`\n  RENEW permit request: ${id}`);

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
    log(`  Renew error: ${errorMsg}`);
    return jsonError(`Renew error: ${errorMsg}`, 500);
  }
}

/**
 * POST /api/permits/:id/renew-and-pay
 *
 * Same phases as the E2E test, with operator checkpoints between them.
 *
 * 1. Renew through pages 1-5
 * 2. Checkpoint → "Submit renewal?"
 * 3. Set expedited (if requested) + submit
 * 4. Fill payment form + advance to review
 * 5. Checkpoint → "Pay $X?"
 * 6. Confirm payment
 */
export async function handleRenewAndPay(
  id: string,
  body: unknown
): Promise<Response> {
  log(`\n  RENEW & PAY permit request: ${id}`);

  const parsed = renewAndPayBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  const { companyName, expedited } = parsed.data;

  if (!DEFAULTS.payment.card.cardNumber) {
    return jsonError(
      "Payment env vars not configured (PAYMENT_CARD_NUMBER missing)",
      500
    );
  }

  try {
    const sessionResult = await ensureBrowserSession();
    if (sessionResult.success === false) {
      return jsonError(sessionResult.error, 500);
    }

    const { page, context } = sessionResult.page;

    // Phase 1: Renew through pages 1-5
    const renewResult = await renewPermitFull(page, context, id, companyName);

    if (!renewResult.success) {
      return jsonError(renewResult.error || "Renewal failed", 500);
    }

    const appId = renewResult.applicationId;
    log(`  Renewal created: ${appId}`);

    if (appId) {
      await persistDraftPermitRecord({
        applicationId: appId,
        companyName,
        flow: "renew",
        sourcePermitId: id,
      });
    }

    // Checkpoint: approve submission
    const submitApproved = await checkpoint(`Submit renewal for ${id}?`, {
      permitId: id,
      companyName,
      applicationId: appId,
      expedited,
    });

    if (!submitApproved) {
      return jsonSuccess({
        applicationId: appId,
        stage: "page5-ready",
        error: "Operator declined submission",
        success: false,
      });
    }

    // Phase 2: Expedited + Submit
    if (expedited) {
      await checkExpedited(page, true);
    }

    const submitResult = await submitApplication(page);
    log(
      `  Submit: success=${submitResult.success}, redirect=${submitResult.redirectedToPayment}`
    );

    if (!submitResult.success) {
      return jsonError(`Submit failed: ${submitResult.error}`, 500);
    }

    if (!submitResult.redirectedToPayment) {
      return jsonSuccess({
        applicationId: appId,
        stage: "submitted-no-payment",
        success: true,
      });
    }

    // Phase 3: Fill payment + advance to review
    const fillReport = await fillPaymentPage1(page, DEFAULTS.payment);
    log(`  Filled: ${fillReport.filledFields.join(", ")}`);

    if (!fillReport.success) {
      return jsonError(
        `Payment fill failed: ${fillReport.failedFields.join(", ")}`,
        500
      );
    }

    const advanced = await clickPaymentContinue(page);
    if (!advanced) {
      return jsonError("Failed to advance to payment review page", 500);
    }

    // Dry-run to read amounts
    const review = await confirmPayment(page, { dryRun: true });

    // Checkpoint: approve payment
    const payApproved = await checkpoint(
      `Pay ${review.totalPaid || "unknown"} for ${id}? Card ****${review.cardLastFour || "????"}`,
      {
        permitId: id,
        applicationId: appId,
        amount: review.amount,
        convenienceFee: review.convenienceFee,
        totalPaid: review.totalPaid,
        cardLastFour: review.cardLastFour,
      }
    );

    if (!payApproved) {
      return jsonSuccess({
        applicationId: appId,
        stage: "payment-review",
        amount: review.amount,
        convenienceFee: review.convenienceFee,
        totalPaid: review.totalPaid,
        error: "Operator declined payment",
        success: false,
      });
    }

    // Phase 4: Confirm payment
    log("  Processing payment...");
    const payResult = await confirmPayment(page, { dryRun: false });
    log(
      `  Payment: success=${payResult.success}, total=${payResult.totalPaid}`
    );

    return jsonSuccess({
      applicationId: appId,
      stage: "paid",
      amount: payResult.amount,
      convenienceFee: payResult.convenienceFee,
      totalPaid: payResult.totalPaid,
      cardLastFour: payResult.cardLastFour,
      success: payResult.success,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`  Renew & Pay error: ${errorMsg}`);
    return jsonError(`Renew & Pay error: ${errorMsg}`, 500);
  }
}

/**
 * POST /api/permits/:id/close
 */
export async function handleClosePermit(
  id: string,
  body: unknown
): Promise<Response> {
  log(`\n  CLOSE permit request: ${id}`);

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
    log(`  Close error: ${errorMsg}`);
    return jsonError(`Close error: ${errorMsg}`, 500);
  }
}

/**
 * POST /api/permits/:id/revise
 */
export async function handleRevisePermit(
  id: string,
  body: unknown
): Promise<Response> {
  log(`\n  REVISE permit request: ${id}`);

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

    const baseDescription =
      REVISION_TYPE_DESCRIPTIONS[revisionType] || "General revision";
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
    log(`  Revise error: ${errorMsg}`);
    return jsonError(`Revise error: ${errorMsg}`, 500);
  }
}

/**
 * DELETE /api/permits/:id
 */
export async function handleDeletePermit(id: string): Promise<Response> {
  log(`\n  DELETE permit request: ${id}`);

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
      log(`  Delete completed for ${id}`);
      return jsonSuccess({ message: `Permit ${id} deleted successfully` });
    }

    log(`  Delete failed for ${id}`);
    return jsonError(`Delete failed for ${id} - check browser`, 500);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`  Delete error: ${errorMsg}`);
    return jsonError(`Delete error: ${errorMsg}`, 500);
  }
}

/**
 * DELETE /api/permits/drafts
 */
export async function handleDeleteAllDrafts(): Promise<Response> {
  log("\n  DELETE ALL DRAFTS request");

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
    log("  Deleted all portal drafts");
    return jsonSuccess({
      deletedAll: true,
      deletedDbCount,
      message: "Deleted all drafts",
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`  Delete all drafts error: ${errorMsg}`);
    return jsonError(`Delete error: ${errorMsg}`, 500);
  }
}

/**
 * GET /health
 */
export function handleHealthCheck(): Response {
  return Response.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
