import { findItem, getAllItems } from "@lib/catalog";
import type { CatalogItem } from "@lib/catalog/types";
import type { EstimateRow } from "@lib/db/types";
import { z } from "zod";

const stringOrNullSchema = z.union([z.string(), z.null()]);

const sectionSchema = z.object({
  id: z.string().trim().min(1, "Section id is required"),
  name: z.string().trim().min(1, "Section name is required"),
  title: stringOrNullSchema.optional(),
  show_subtotal: z.boolean().optional(),
});

const lineItemSchema = z
  .object({
    section_id: stringOrNullSchema.optional(),
    code: z.string().trim().optional(),
    item: z.string().trim().optional(),
    item_name: z.string().trim().optional(),
    description: z.string().optional(),
    quantity: z.coerce.number().finite().nonnegative().optional(),
    qty: z.coerce.number().finite().nonnegative().optional(),
    unit: z.string().trim().optional(),
    uom: z.string().trim().optional(),
    unit_cost: z.coerce.number().finite().nonnegative().optional(),
    unit_price: z.coerce.number().finite().nonnegative().optional(),
    cost: z.coerce.number().finite().nonnegative().optional(),
    notes: stringOrNullSchema.optional(),
  })
  .passthrough();

const createPayloadSchema = z
  .object({
    base_number: z.string().trim().optional(),
    takeoff_id: stringOrNullSchema.optional(),
    job_name: stringOrNullSchema.optional(),
    job_address: stringOrNullSchema.optional(),
    client_name: stringOrNullSchema.optional(),
    client_address: stringOrNullSchema.optional(),
    client_email: stringOrNullSchema.optional(),
    client_phone: stringOrNullSchema.optional(),
    notes: stringOrNullSchema.optional(),
    status: z.string().trim().optional(),
    is_locked: z.boolean().optional(),
    total: z.coerce.number().finite().nonnegative().optional(),
    sections: z.array(sectionSchema).optional(),
    line_items: z.array(lineItemSchema).optional(),
  })
  .passthrough();

const updatePayloadSchema = z
  .object({
    base_number: stringOrNullSchema.optional(),
    takeoff_id: stringOrNullSchema.optional(),
    job_name: stringOrNullSchema.optional(),
    job_address: stringOrNullSchema.optional(),
    client_name: stringOrNullSchema.optional(),
    client_address: stringOrNullSchema.optional(),
    client_email: stringOrNullSchema.optional(),
    client_phone: stringOrNullSchema.optional(),
    notes: stringOrNullSchema.optional(),
    status: stringOrNullSchema.optional(),
    is_locked: z.boolean().optional(),
    total: z.coerce.number().finite().nonnegative().optional(),
    sections: z.array(sectionSchema).optional(),
    line_items: z.array(lineItemSchema).optional(),
  })
  .passthrough();

export interface NormalizedEstimateSection {
  id: string;
  name: string;
  title?: string | null;
  show_subtotal?: boolean;
}

export interface NormalizedEstimateLineItem {
  section_id?: string | null;
  item_name: string;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  unit_price: number;
  notes?: string | null;
  is_excluded?: boolean;
}

export interface NormalizedCreateEstimatePayload {
  base_number?: string;
  takeoff_id?: string | null;
  job_name?: string | null;
  job_address?: string | null;
  client_name?: string | null;
  client_address?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  notes?: string | null;
  status?: string;
  is_locked?: boolean;
  total?: number;
  sections?: NormalizedEstimateSection[];
  line_items?: NormalizedEstimateLineItem[];
}

export interface NormalizedUpdateEstimatePayload {
  base_number?: string | null;
  takeoff_id?: string | null;
  job_name?: string | null;
  job_address?: string | null;
  client_name?: string | null;
  client_address?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  notes?: string | null;
  status?: string | null;
  is_locked?: boolean;
  total?: number;
  sections?: NormalizedEstimateSection[];
  line_items?: NormalizedEstimateLineItem[];
}

export class EstimatePayloadValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join(" "));
    this.name = "EstimatePayloadValidationError";
    this.issues = issues;
  }
}

const catalogByName = new Map(
  getAllItems().map((item) => [item.name.toLowerCase(), item])
);

function normalizeText(
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
  errors: string[]
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
    errors.push(
      `${fieldLabel} must be formatted as a two-line address (street on line 1, city/state/zip on line 2).`
    );
    return normalized;
  }

  return `${line1}\n${line2}`;
}

function firstFiniteNumber(
  ...values: Array<number | undefined>
): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function resolveCatalogItem(
  rawItem: z.infer<typeof lineItemSchema>
): CatalogItem {
  const code = normalizeText(rawItem.code)?.toUpperCase();
  if (code) {
    const byCode = findItem(code);
    if (byCode) {
      return byCode;
    }
  }

  const requestedName = normalizeText(rawItem.item_name ?? rawItem.item);
  if (requestedName) {
    const byName = catalogByName.get(requestedName.toLowerCase());
    if (byName) {
      return byName;
    }
  }

  throw new Error("Item must match a catalog code or exact catalog name.");
}

function normalizeLineItems(
  rawLineItems: z.infer<typeof lineItemSchema>[],
  errors: string[]
): NormalizedEstimateLineItem[] {
  const normalizedItems: NormalizedEstimateLineItem[] = [];

  rawLineItems.forEach((rawItem, index) => {
    const position = index + 1;
    let catalogItem: CatalogItem;

    try {
      catalogItem = resolveCatalogItem(rawItem);
    } catch (error) {
      errors.push(`Line item ${position}: ${(error as Error).message}`);
      return;
    }

    const description = catalogItem.description.trim();
    if (description.length === 0) {
      errors.push(
        `Line item ${position}: catalog item "${catalogItem.name}" is missing a description.`
      );
      return;
    }

    const quantity = firstFiniteNumber(rawItem.quantity, rawItem.qty, 1);
    if (quantity === undefined || quantity < 0) {
      errors.push(`Line item ${position}: quantity must be 0 or greater.`);
      return;
    }

    const unitPrice = firstFiniteNumber(
      rawItem.unit_price,
      rawItem.cost,
      rawItem.unit_cost,
      catalogItem.price
    );
    if (unitPrice === undefined || unitPrice < 0) {
      errors.push(
        `Line item ${position}: unit_price/cost must be a valid non-negative number.`
      );
      return;
    }

    const unitCost = firstFiniteNumber(
      rawItem.unit_cost,
      rawItem.cost,
      unitPrice
    );

    const isExcluded =
      rawItem.is_excluded === true || rawItem.is_excluded === 1;
    if (unitCost === undefined || unitCost < 0) {
      errors.push(
        `Line item ${position}: unit_cost must be a valid non-negative number.`
      );
      return;
    }

    normalizedItems.push({
      section_id: normalizeText(rawItem.section_id) ?? null,
      item_name: catalogItem.name,
      description,
      quantity,
      unit: catalogItem.unit,
      unit_cost: unitCost,
      unit_price: unitPrice,
      notes: normalizeText(rawItem.notes) ?? null,
      is_excluded: isExcluded,
    });
  });

  return normalizedItems;
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
  body: unknown
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
      ? normalizeLineItems(payload.line_items, errors)
      : undefined;

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
      ? normalizeLineItems(payload.line_items, errors)
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
      normalizeText(existingEstimate.client_name);
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
    notes: normalizeText(payload.notes),
    status: normalizeText(payload.status),
    is_locked: payload.is_locked,
    total: payload.total,
    sections: normalizedSections,
    line_items: normalizedLineItems,
  };
}
