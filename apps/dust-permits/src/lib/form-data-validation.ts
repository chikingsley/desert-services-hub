import { z } from "zod";
import type { DeepPartial, FormData } from "@/form-data";
import { DEFAULTS, EntityTypeSchema } from "@/form-data";

type Path = (string | number)[];
interface IssueCtx {
  addIssue: (issue: { code: "custom"; message: string; path?: Path }) => void;
}

const PAVE_WHEN_VALUES = ["prior", "during", "end"] as const;
const WATER_TIER_VALUES = ["0-2", "2-10", "10-100", "100+"] as const;
const PREVENT_ACCESS_METHODS = [
  "ditches",
  "fences",
  "berms",
  "shrubs",
  "trees",
  "other",
] as const;
const TRACKOUT_DEVICE_TYPES = [
  "gravel_pad",
  "grizzly",
  "wheel_wash",
  "paved_area",
  "other",
] as const;

const NULLABLE_NUMBER_PATHS = new Set([
  "site.latitude",
  "site.longitude",
  "categoryB1.avgDailyDisturbedAcres",
  "categoryB2.avgDailyDisturbedAcres",
  "categoryF1.avgDailyDisturbanceNovFeb",
  "categoryF1.avgDailyDisturbanceMarOct",
  "categoryG1.avgDailyDisturbedAcres",
  "categoryG2.avgDailyDisturbedAcres",
  "categoryH.avgDailyDisturbedAcres",
  "categoryI1.avgDailyDisturbedAcres",
  "categoryJ.avgDailyDisturbedAcres",
  "postK.b1.avgDailyDisturbedAcres",
  "postK.b2.avgDailyDisturbedAcres",
  "postK.c2.avgDailyDisturbedAcres",
  "postK.c3.avgDailyDisturbedAcres",
  "postK.f2.avgDailyDisturbedAcres",
  "postK.g1.avgDailyDisturbedAcres",
  "postK.g2.avgDailyDisturbedAcres",
  "postK.h.avgDailyDisturbedAcres",
  "postK.i1.avgDailyDisturbedAcres",
  "postK.i2.avgDailyDisturbedAcres",
  "postK.j.avgDailyDisturbedAcres",
  "postK.d4.cubicYardsImport",
  "postK.d4.cubicYardsExport",
  "postK.f1NovFeb.avgDailyDisturbedAcres",
  "postK.f1MarOct.avgDailyDisturbedAcres",
]);

const NULLABLE_STRING_PATHS = new Set(["_meta.noiPermitId", "_meta.ltfNumber"]);

const OPTIONAL_OBJECT_FIELDS: Record<string, Record<string, z.ZodTypeAny>> = {
  primaryContact: {
    mobile: z.string(),
    fax: z.string(),
  },
  propertyOwner: {
    entityType: EntityTypeSchema,
    name: z.string(),
    address1: z.string(),
    address2: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    phone: z.string(),
    fax: z.string(),
    contactFirstName: z.string(),
    contactLastName: z.string(),
    contactPhone: z.string(),
    contactEmail: z.string(),
  },
  subsidiary: {
    parentEntityType: EntityTypeSchema,
    parentName: z.string(),
    parentAddress1: z.string(),
    parentAddress2: z.string(),
    parentCity: z.string(),
    parentState: z.string(),
    parentZip: z.string(),
    parentPhone: z.string(),
    parentEmail: z.string(),
    parentStateOfIncorporation: z.string(),
  },
  violation: {
    permitNumber: z.string(),
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pathToString(path: Path): string {
  return path.map(String).join(".");
}

function getNullableSchema(path: Path): z.ZodTypeAny {
  const pathKey = pathToString(path);
  if (NULLABLE_NUMBER_PATHS.has(pathKey)) {
    return z.number().nullable();
  }
  if (NULLABLE_STRING_PATHS.has(pathKey)) {
    return z.string().nullable();
  }
  return z.null();
}

function getArraySchemaForPath(path: Path): z.ZodTypeAny | null {
  const pathKey = pathToString(path);
  if (
    pathKey === "categoryC4.applyWaterPreventMethods" ||
    pathKey === "categoryC4.preventAccessMethods"
  ) {
    return z.array(z.enum(PREVENT_ACCESS_METHODS));
  }
  if (pathKey === "categoryE1.deviceType") {
    return z.array(z.enum(TRACKOUT_DEVICE_TYPES));
  }
  return null;
}

function buildSchemaFromTemplate(
  template: unknown,
  options: { partial: boolean; path: Path }
): z.ZodTypeAny {
  if (Array.isArray(template)) {
    const pathSchema = getArraySchemaForPath(options.path);
    if (pathSchema) {
      return pathSchema;
    }

    if (template.length === 0) {
      return z.array(z.unknown());
    }

    const first = template[0];
    if (isPlainObject(first)) {
      return z.array(
        buildSchemaFromTemplate(first, {
          partial: options.partial,
          path: [...options.path, 0],
        })
      );
    }
    if (typeof first === "string") {
      return z.array(z.string());
    }
    if (typeof first === "number") {
      return z.array(z.number());
    }
    if (typeof first === "boolean") {
      return z.array(z.boolean());
    }
    return z.array(z.unknown());
  }

  if (template === null) {
    return getNullableSchema(options.path);
  }

  if (isPlainObject(template)) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, value] of Object.entries(template)) {
      const childSchema = buildSchemaFromTemplate(value, {
        partial: options.partial,
        path: [...options.path, key],
      });
      shape[key] = options.partial ? childSchema.optional() : childSchema;
    }
    const optionalFields = OPTIONAL_OBJECT_FIELDS[pathToString(options.path)];
    if (optionalFields) {
      for (const [key, schema] of Object.entries(optionalFields)) {
        if (!shape[key]) {
          shape[key] = schema.optional();
        }
      }
    }
    return z.strictObject(shape);
  }

  if (typeof template === "string") {
    const pathKey = pathToString(options.path);
    if (pathKey.endsWith(".paveWhen")) {
      return z.enum(PAVE_WHEN_VALUES);
    }
    if (pathKey.startsWith("postK.") && pathKey.endsWith(".waterTier")) {
      return z.enum(WATER_TIER_VALUES);
    }
    return z.string();
  }

  if (typeof template === "number") {
    return z.number();
  }

  if (typeof template === "boolean") {
    return z.boolean();
  }

  return z.unknown();
}

function addIssue(ctx: IssueCtx, path: Path, message: string): void {
  ctx.addIssue({
    code: "custom",
    message,
    path,
  });
}

function validateOtherDescriptionRecursively(
  value: unknown,
  path: Path,
  ctx: IssueCtx
): void {
  if (!isPlainObject(value)) {
    return;
  }

  if ("other" in value && "otherDescription" in value) {
    const otherValue = value.other;
    const otherDescriptionValue = value.otherDescription;
    const otherDescription =
      typeof otherDescriptionValue === "string"
        ? otherDescriptionValue.trim()
        : "";
    const otherSelected =
      otherValue === true ||
      (typeof otherValue === "string" && otherValue !== "None");

    if (otherSelected && !otherDescription) {
      addIssue(
        ctx,
        [...path, "otherDescription"],
        "otherDescription is required when 'other' is selected"
      );
    }
  }

  for (const [key, child] of Object.entries(value)) {
    if (isPlainObject(child)) {
      validateOtherDescriptionRecursively(child, [...path, key], ctx);
    }
  }
}

function validateConditionalRules(data: FormData, ctx: IssueCtx): void {
  validateOtherDescriptionRecursively(data, [], ctx);

  const applyWaterMethods = data.categoryC4.applyWaterPreventMethods;
  const { preventAccessMethods } = data.categoryC4;

  if (
    data.categoryC4.applyWaterPrevent === "None" &&
    applyWaterMethods.length > 0
  ) {
    addIssue(
      ctx,
      ["categoryC4", "applyWaterPreventMethods"],
      "applyWaterPreventMethods must be empty when applyWaterPrevent is None"
    );
  }
  if (
    data.categoryC4.applyWaterPrevent !== "None" &&
    applyWaterMethods.length === 0
  ) {
    addIssue(
      ctx,
      ["categoryC4", "applyWaterPreventMethods"],
      "applyWaterPreventMethods must include at least one method when applyWaterPrevent is active"
    );
  }
  if (
    applyWaterMethods.includes("other") &&
    data.categoryC4.applyWaterPreventOtherText.trim() === ""
  ) {
    addIssue(
      ctx,
      ["categoryC4", "applyWaterPreventOtherText"],
      "applyWaterPreventOtherText is required when applyWaterPreventMethods includes 'other'"
    );
  }

  if (
    data.categoryC4.preventAccess === "None" &&
    preventAccessMethods.length > 0
  ) {
    addIssue(
      ctx,
      ["categoryC4", "preventAccessMethods"],
      "preventAccessMethods must be empty when preventAccess is None"
    );
  }
  if (
    data.categoryC4.preventAccess !== "None" &&
    preventAccessMethods.length === 0
  ) {
    addIssue(
      ctx,
      ["categoryC4", "preventAccessMethods"],
      "preventAccessMethods must include at least one method when preventAccess is active"
    );
  }
  if (
    preventAccessMethods.includes("other") &&
    data.categoryC4.preventAccessOtherText.trim() === ""
  ) {
    addIssue(
      ctx,
      ["categoryC4", "preventAccessOtherText"],
      "preventAccessOtherText is required when preventAccessMethods includes 'other'"
    );
  }

  if (
    data.categoryE1.deviceType.includes("other") &&
    data.categoryE1.deviceTypeOther.trim() === ""
  ) {
    addIssue(
      ctx,
      ["categoryE1", "deviceTypeOther"],
      "deviceTypeOther is required when categoryE1.deviceType includes 'other'"
    );
  }
}

const baseOverridesSchema = buildSchemaFromTemplate(DEFAULTS, {
  partial: true,
  path: [],
});

const baseFormDataSchema = buildSchemaFromTemplate(DEFAULTS, {
  partial: false,
  path: [],
});

export const FormDataOverridesSchema = baseOverridesSchema as z.ZodType<
  DeepPartial<FormData>
>;

export const FormDataSchema = (
  baseFormDataSchema as z.ZodType<FormData>
).superRefine((data, ctx) => {
  validateConditionalRules(data, ctx as IssueCtx);
});

function formatValidationError(title: string, error: z.ZodError): string {
  const pretty = z.prettifyError(error).trim();
  const fieldLines = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return `- ${path}: ${issue.message}`;
  });
  const details =
    fieldLines.length > 0 ? `\n\nDetails:\n${fieldLines.join("\n")}` : "";
  return `${title}\n${pretty}${details}`;
}

export function validateFormDataOverrides(
  overrides: unknown
):
  | { success: true; data: DeepPartial<FormData> }
  | { success: false; error: string } {
  const parsed = FormDataOverridesSchema.safeParse(overrides);
  if (!parsed.success) {
    return {
      error: formatValidationError("Invalid FormData overrides.", parsed.error),
      success: false,
    };
  }
  return { data: parsed.data, success: true };
}

export function validateBuiltFormData(
  formData: unknown
): { success: true; data: FormData } | { success: false; error: string } {
  const parsed = FormDataSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      error: formatValidationError(
        "Invalid FormData after build/reconcile.",
        parsed.error
      ),
      success: false,
    };
  }
  return { data: parsed.data, success: true };
}
