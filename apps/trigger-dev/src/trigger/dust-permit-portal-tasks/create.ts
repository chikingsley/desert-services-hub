import { readFile } from "node:fs/promises";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { createApplicationFull } from "@dust-permits/portal/create";
import {
  ensureBrowserSessionReady,
  getSessionPageAndContext,
  withBrowserSessionOperation,
} from "@dust-permits/portal/utils/browser";
import type { DeepPartial, FormData } from "@/form-data";
import { buildFormData } from "@/form-data";
import {
  FormDataOverridesSchema,
  validateBuiltFormData,
  validateFormDataOverrides,
} from "@dust-permits/lib/form-data-validation";
import type {
  GeometrySource,
  ResolvedGeometrySource,
} from "@dust-permits/lib/geometry-source";
import {
  GeometrySourceSchema,
  resolveGeometrySource,
  splitFormDataAndGeometrySource,
  validateGeometrySource,
} from "@dust-permits/lib/geometry-source";
import { persistDraftPermitRecord } from "@dust-permits/lib/permit-records";

const createPayloadSchema = z.object({
  companyName: z.string().optional(),
  copyFromApp: z.string().optional(),
  flow: z.enum(["new-company", "existing-company", "renew"]),
  formData: FormDataOverridesSchema.optional(),
  formDataPath: z.string().optional(),
  geometrySource: GeometrySourceSchema.optional(),
});

type CreatePayload = z.infer<typeof createPayloadSchema>;

async function ensureBrowserSession(): Promise<
  NonNullable<ReturnType<typeof getSessionPageAndContext>>
> {
  const session = await ensureBrowserSessionReady();
  const ctx = getSessionPageAndContext();

  if (!ctx) {
    throw new Error("No browser session available");
  }

  if (!(session.isLoggedIn && session.portalReady)) {
    throw new Error("Failed to login to portal");
  }

  return ctx;
}

async function loadOverridesFromFile(
  formDataPath: string
): Promise<
  | { data: DeepPartial<FormData>; geometrySource?: GeometrySource }
  | { error: string }
> {
  let overridesInput: unknown;
  try {
    const text = await readFile(formDataPath, "utf8");
    overridesInput = JSON.parse(text) as unknown;
  } catch (error) {
    return {
      error: `Failed to load form data from ${formDataPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  let formDataInput = overridesInput;
  let geometrySourceInput: unknown;

  try {
    const split = splitFormDataAndGeometrySource(overridesInput);
    formDataInput = split.formData;
    geometrySourceInput = split.geometrySource;
  } catch (error) {
    return {
      error: `Invalid create config in ${formDataPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const validation = validateFormDataOverrides(formDataInput);
  if (!validation.success) {
    return { error: validation.error };
  }

  if (geometrySourceInput === undefined) {
    return { data: validation.data };
  }

  const geometryValidation = validateGeometrySource(geometrySourceInput);
  if (!geometryValidation.success) {
    return {
      error: `Invalid geometrySource in ${formDataPath}.\n${geometryValidation.error}`,
    };
  }

  return {
    data: validation.data,
    geometrySource: geometryValidation.data,
  };
}

function applyGeometryToFormData(
  formData: FormData,
  geometry: ResolvedGeometrySource
): FormData {
  if (geometry.centroid) {
    formData.site.latitude = geometry.centroid.lat;
    formData.site.longitude = geometry.centroid.lng;
  }

  if (
    geometry.disturbedAcresSource === "explicit" &&
    geometry.disturbedAcres !== null
  ) {
    formData.site.acresDisturbed = geometry.disturbedAcres;
    return formData;
  }

  const currentAcres = formData.site.acresDisturbed;
  if (
    geometry.disturbedAcres !== null &&
    (currentAcres === null || currentAcres === undefined)
  ) {
    formData.site.acresDisturbed = geometry.disturbedAcres;
    return formData;
  }

  if (
    geometry.disturbedAcresSource === "computed" &&
    geometry.disturbedAcres !== null &&
    typeof currentAcres === "number" &&
    Number.isFinite(currentAcres) &&
    Math.abs(currentAcres - geometry.disturbedAcres) > 0.05
  ) {
    logger.warn(
      "[dust-permit-create] geometry acreage differs from FormData.site.acresDisturbed; keeping explicit FormData value",
      {
        formDataAcres: currentAcres,
        geometryAcres: geometry.disturbedAcres,
      }
    );
  }

  return formData;
}

async function validateCreateMapPreflight(
  formData: FormData,
  geometry?: ResolvedGeometrySource
): Promise<{ valid: true } | { valid: false; error: string }> {
  if (geometry) {
    if (!geometry.mapData.disturbedArea) {
      return {
        error: "Geometry source did not produce a disturbed-area polygon",
        valid: false,
      };
    }
    return { valid: true };
  }

  const { latitude, longitude, acresDisturbed } = formData.site;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return { valid: true };
  }

  try {
    const { buildPermitMapDataFromSiteCoordinates } = await import(
      "@dust-permits/lib/site-drawing"
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

export async function runDustPermitPortalCreate(payload: CreatePayload) {
  const {
    flow,
    companyName,
    copyFromApp,
    formData: inlineFormData,
    formDataPath,
    geometrySource: inlineGeometrySource,
  } = payload;

  let overrides: DeepPartial<FormData> | undefined;
  let geometrySource: GeometrySource | undefined;

  if (inlineFormData) {
    overrides = inlineFormData;
  } else if (formDataPath) {
    const loaded = await loadOverridesFromFile(formDataPath);
    if ("error" in loaded) {
      throw new Error(loaded.error);
    }
    overrides = loaded.data;
    geometrySource = loaded.geometrySource;
  }

  geometrySource = inlineGeometrySource ?? geometrySource;

  const formData = buildFormData({ overrides });

  let resolvedGeometry: ResolvedGeometrySource | undefined;
  if (geometrySource) {
    try {
      resolvedGeometry = await resolveGeometrySource(geometrySource);
    } catch (error) {
      throw new Error(
        `Failed to resolve geometrySource: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (resolvedGeometry) {
    applyGeometryToFormData(formData, resolvedGeometry);
  }

  const formValidation = validateBuiltFormData(formData);
  if (!formValidation.success) {
    throw new Error(formValidation.error);
  }

  const mapValidation = await validateCreateMapPreflight(
    formData,
    resolvedGeometry
  );
  if (mapValidation.valid === false) {
    logger.warn("[dust-permit-create] map preflight warning", {
      error: mapValidation.error,
    });
  }

  const { page, context } = await ensureBrowserSession();

  logger.info("Starting dust permit create flow", {
    companyName: companyName ?? null,
    copyFromApp: copyFromApp ?? null,
    flow,
    hasGeometrySource: Boolean(geometrySource),
    hasInlineFormData: Boolean(inlineFormData),
    hasFormDataPath: Boolean(formDataPath),
  });

  const result = await withBrowserSessionOperation(`create:${flow}`, async () =>
    await createApplicationFull(page, context, flow, formData, {
      companyName,
      copyFromApp,
      geometry: resolvedGeometry,
    })
  );

  if (!result.success) {
    throw new Error(result.error || "Create failed");
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
      logger.warn("Failed to persist created draft permit record", {
        applicationId: result.applicationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info("Dust permit create flow completed", {
    applicationId: result.applicationId,
    flow,
    reachedPage5: result.reachedPage5,
  });

  return {
    applicationId: result.applicationId,
    flow,
    reachedPage5: result.reachedPage5,
  };
}

export const dustPermitPortalCreate = schemaTask({
  id: "dust-permit-portal-create",
  schema: createPayloadSchema,
  maxDuration: 7200,
  retry: {
    maxAttempts: 1,
  },
  run: async (payload) => await runDustPermitPortalCreate(payload),
});
