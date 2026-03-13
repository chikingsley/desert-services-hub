import type { EstimateRow } from "@lib/db/types";
import { z } from "zod";
import {
  lineItemSchema,
  type NormalizedEstimateLineItem,
  normalizeCatalogLineItems,
} from "@/packages/estimates/estimating/estimate-payload-validation-line-items";

const stringOrNullSchema = z.union([z.string(), z.null()]);

const sectionSchema = z.object({
  id: z.string().trim().min(1, "Section id is required"),
  name: z.string().trim().min(1, "Section name is required"),
  title: stringOrNullSchema.optional(),
  show_subtotal: z.boolean().optional(),
});

const createPayloadSchema = z.looseObject({
  base_number: z.string().trim().optional(),
  takeoff_id: stringOrNullSchema.optional(),
  job_name: stringOrNullSchema.optional(),
  job_address: stringOrNullSchema.optional(),
  client_name: stringOrNullSchema.optional(),
  client_address: stringOrNullSchema.optional(),
  client_email: stringOrNullSchema.optional(),
  client_phone: stringOrNullSchema.optional(),
  estimator: stringOrNullSchema.optional(),
  estimator_email: stringOrNullSchema.optional(),
  notes: stringOrNullSchema.optional(),
  status: z.string().trim().optional(),
  is_locked: z.boolean().optional(),
  total: z.coerce.number().finite().nonnegative().optional(),
  sections: z.array(sectionSchema).optional(),
  line_items: z.array(lineItemSchema).optional(),
});

const updatePayloadSchema = z.looseObject({
  base_number: stringOrNullSchema.optional(),
  takeoff_id: stringOrNullSchema.optional(),
  job_name: stringOrNullSchema.optional(),
  job_address: stringOrNullSchema.optional(),
  client_name: stringOrNullSchema.optional(),
  client_address: stringOrNullSchema.optional(),
  client_email: stringOrNullSchema.optional(),
  client_phone: stringOrNullSchema.optional(),
  estimator: stringOrNullSchema.optional(),
  estimator_email: stringOrNullSchema.optional(),
  notes: stringOrNullSchema.optional(),
  status: stringOrNullSchema.optional(),
  is_locked: z.boolean().optional(),
  total: z.coerce.number().finite().nonnegative().optional(),
  sections: z.array(sectionSchema).optional(),
  line_items: z.array(lineItemSchema).optional(),
});

export interface NormalizedEstimateSection {
  id: string;
  name: string;
  show_subtotal?: boolean;
  title?: string | null;
}

export interface NormalizedCreateEstimatePayload {
  base_number?: string;
  client_address?: string | null;
  client_email?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  estimator?: string | null;
  estimator_email?: string | null;
  is_locked?: boolean;
  job_address?: string | null;
  job_name?: string | null;
  line_items?: NormalizedEstimateLineItem[];
  notes?: string | null;
  sections?: NormalizedEstimateSection[];
  status?: string;
  takeoff_id?: string | null;
  total?: number;
}

export interface NormalizedUpdateEstimatePayload {
  base_number?: string | null;
  client_address?: string | null;
  client_email?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  estimator?: string | null;
  estimator_email?: string | null;
  is_locked?: boolean;
  job_address?: string | null;
  job_name?: string | null;
  line_items?: NormalizedEstimateLineItem[];
  notes?: string | null;
  sections?: NormalizedEstimateSection[];
  status?: string | null;
  takeoff_id?: string | null;
  total?: number;
}

export class EstimatePayloadValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join(" "));
    this.name = "EstimatePayloadValidationError";
    this.issues = issues;
  }
}

export function normalizeText(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeAddress(
  value: string | null | undefined,
  fieldLabel: string,
  errors: string[],
  options?: { allowSingleLineAddress?: boolean }
): string | null | undefined {
  const normalized = normalizeText(value);
  if (normalized === undefined || normalized === null) {
    return normalized;
  }

  const input = normalized.replaceAll("\r", "");
  let line1 = "";
  let line2 = "";

  if (input.includes("\n")) {
    const lines = input
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    line1 = lines[0] ?? "";
    line2 = lines.slice(1).join(", ").trim();
  } else if (input.includes(",")) {
    const firstComma = input.indexOf(",");
    line1 = input.slice(0, firstComma).trim();
    line2 = input.slice(firstComma + 1).trim();
  }

  if (line1.length === 0 || line2.length === 0) {
    if (options?.allowSingleLineAddress) {
      return normalized;
    }

    errors.push(
      `${fieldLabel} must be formatted as a two-line address (street on line 1, city/state/zip on line 2).`
    );
    return normalized;
  }

  return `${line1}\n${line2}`;
}

function normalizeSections(
  rawSections: z.infer<typeof sectionSchema>[] | undefined
): NormalizedEstimateSection[] | undefined {
  if (rawSections === undefined) {
    return undefined;
  }

  return rawSections.map((section) => ({
    id: section.id.trim(),
    name: section.name.trim(),
    title: normalizeText(section.title) ?? null,
    show_subtotal: section.show_subtotal,
  }));
}

function requireCoreFields(
  core: {
    jobName: string | null | undefined;
    clientName: string | null | undefined;
    jobAddress: string | null | undefined;
    clientAddress: string | null | undefined;
  },
  errors: string[]
): void {
  if (!core.jobName || core.jobName.trim() === "") {
    errors.push("job_name is required when estimate has line items.");
  }
  if (!core.clientName || core.clientName.trim() === "") {
    errors.push("client_name is required when estimate has line items.");
  }
  if (!core.jobAddress || core.jobAddress.trim() === "") {
    errors.push("job_address is required when estimate has line items.");
  }
  if (!core.clientAddress || core.clientAddress.trim() === "") {
    errors.push("client_address is required when estimate has line items.");
  }
}

export function validateCreateEstimatePayload(
  body: unknown,
  options?: { allowSingleLineAddress?: boolean }
): NormalizedCreateEstimatePayload {
  const parsed = createPayloadSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message);
    throw new EstimatePayloadValidationError(issues);
  }

  const errors: string[] = [];
  const payload = parsed.data;
  const normalizedLineItems =
    payload.line_items !== undefined
      ? normalizeCatalogLineItems(payload.line_items, errors)
      : undefined;

  const normalizedJobAddress = normalizeAddress(
    payload.job_address,
    "job_address",
    errors,
    options
  );
  const normalizedClientAddress = normalizeAddress(
    payload.client_address,
    "client_address",
    errors,
    options
  );

  if (normalizedLineItems !== undefined && normalizedLineItems.length > 0) {
    requireCoreFields(
      {
        jobName: normalizeText(payload.job_name),
        clientName: normalizeText(payload.client_name),
        jobAddress: normalizedJobAddress,
        clientAddress: normalizedClientAddress,
      },
      errors
    );
  }

  if (errors.length > 0) {
    throw new EstimatePayloadValidationError(errors);
  }

  return {
    base_number: normalizeText(payload.base_number) ?? undefined,
    takeoff_id: normalizeText(payload.takeoff_id),
    job_name: normalizeText(payload.job_name),
    job_address: normalizedJobAddress,
    client_name: normalizeText(payload.client_name),
    client_address: normalizedClientAddress,
    client_email: normalizeText(payload.client_email),
    client_phone: normalizeText(payload.client_phone),
    estimator: normalizeText(payload.estimator),
    estimator_email: normalizeText(payload.estimator_email),
    notes: normalizeText(payload.notes),
    status: normalizeText(payload.status) ?? undefined,
    is_locked: payload.is_locked,
    total: payload.total,
    sections: normalizeSections(payload.sections),
    line_items: normalizedLineItems,
  };
}

export function validateUpdateEstimatePayload(
  body: unknown,
  existingEstimate: EstimateRow
): NormalizedUpdateEstimatePayload {
  const parsed = updatePayloadSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message);
    throw new EstimatePayloadValidationError(issues);
  }

  const errors: string[] = [];
  const payload = parsed.data;
  const normalizedSections = normalizeSections(payload.sections);
  const normalizedLineItems =
    payload.line_items !== undefined
      ? normalizeCatalogLineItems(payload.line_items, errors)
      : undefined;

  if (normalizedSections !== undefined && normalizedLineItems === undefined) {
    errors.push(
      "sections cannot be updated without line_items in the same request."
    );
  }

  const normalizedJobAddress = normalizeAddress(
    payload.job_address,
    "job_address",
    errors
  );
  const normalizedClientAddress = normalizeAddress(
    payload.client_address,
    "client_address",
    errors
  );

  if (normalizedLineItems !== undefined && normalizedLineItems.length > 0) {
    const effectiveJobName =
      normalizeText(payload.job_name) ??
      normalizeText(existingEstimate.job_name ?? existingEstimate.name);
    const effectiveClientName =
      normalizeText(payload.client_name) ??
      normalizeText(
        existingEstimate.client_name ?? existingEstimate.contractor
      );
    const effectiveJobAddress =
      normalizedJobAddress ??
      normalizeAddress(existingEstimate.job_address, "job_address", errors);
    const effectiveClientAddress =
      normalizedClientAddress ??
      normalizeAddress(
        existingEstimate.client_address,
        "client_address",
        errors
      );

    requireCoreFields(
      {
        jobName: effectiveJobName,
        clientName: effectiveClientName,
        jobAddress: effectiveJobAddress,
        clientAddress: effectiveClientAddress,
      },
      errors
    );
  }

  if (errors.length > 0) {
    throw new EstimatePayloadValidationError(errors);
  }

  return {
    base_number: normalizeText(payload.base_number),
    takeoff_id: normalizeText(payload.takeoff_id),
    job_name: normalizeText(payload.job_name),
    job_address: normalizedJobAddress,
    client_name: normalizeText(payload.client_name),
    client_address: normalizedClientAddress,
    client_email: normalizeText(payload.client_email),
    client_phone: normalizeText(payload.client_phone),
    estimator: normalizeText(payload.estimator),
    estimator_email: normalizeText(payload.estimator_email),
    notes: normalizeText(payload.notes),
    status: normalizeText(payload.status),
    is_locked: payload.is_locked,
    total: payload.total,
    sections: normalizedSections,
    line_items: normalizedLineItems,
  };
}
