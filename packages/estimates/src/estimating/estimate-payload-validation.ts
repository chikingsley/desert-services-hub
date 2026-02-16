import { findItem, getAllItems } from "@estimates/catalog";
import type { CatalogItem } from "@estimates/catalog/types";
import type { EditorEstimate, EstimateRow } from "@lib/db/types";
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
    unit_price: z.coerce.number().finite().nonnegative().optional(),
    cost: z.coerce.number().finite().nonnegative().optional(),
    notes: stringOrNullSchema.optional(),
    allow_description_override: z.boolean().optional(),
    allow_unit_override: z.boolean().optional(),
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
    estimator: stringOrNullSchema.optional(),
    estimator_email: stringOrNullSchema.optional(),
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
    estimator: stringOrNullSchema.optional(),
    estimator_email: stringOrNullSchema.optional(),
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
  estimator?: string | null;
  estimator_email?: string | null;
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
  estimator?: string | null;
  estimator_email?: string | null;
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
  errors: string[],
  options?: {
    allowSingleLineAddress?: boolean;
  }
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

function isInspectionCatalogItem(item: CatalogItem): boolean {
  return item.code === "SWPPP-005" || item.code === "SWPPP-006";
}

function extractDollarAmounts(text: string): number[] {
  const matches = [...text.matchAll(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/g)];
  return matches
    .map((match) => Number.parseFloat(match[1] ?? "NaN"))
    .filter((value) => Number.isFinite(value));
}

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

function formatRate(value: number): string {
  return `$${value.toFixed(2)}`;
}

function buildInspectionDescription(item: CatalogItem, rate: number): string {
  if (item.code === "SWPPP-005") {
    return [
      "Performed every 14 days or within 24 hours of 1/2-inch rain event.",
      "Includes additional inspections for months with more than 4 weeks.",
      `Additional inspections for rain events and/or project extensions are not included and will be billed at ${formatRate(rate)} each.`,
    ].join(" ");
  }

  return [
    "Performed every 28 days for inactive or stabilized sites.",
    `Additional inspections for rain events and/or project extensions are not included and will be billed at ${formatRate(rate)} each.`,
  ].join(" ");
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

    const allowDescriptionOverride =
      rawItem.allow_description_override === true;
    const allowUnitOverride = rawItem.allow_unit_override === true;

    const catalogDescription = catalogItem.description.trim();
    if (catalogDescription.length === 0) {
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
      catalogItem.price
    );
    if (unitPrice === undefined || unitPrice < 0) {
      errors.push(
        `Line item ${position}: unit_price/cost must be a valid non-negative number.`
      );
      return;
    }

    let description = catalogDescription;
    if (allowDescriptionOverride) {
      description = normalizeText(rawItem.description) ?? "";
    } else if (isInspectionCatalogItem(catalogItem)) {
      description = buildInspectionDescription(catalogItem, unitPrice);
    }
    if (!description || description.trim().length === 0) {
      errors.push(
        `Line item ${position}: description override is enabled but description is empty.`
      );
      return;
    }

    const isExcluded =
      rawItem.is_excluded === true || rawItem.is_excluded === 1;

    const unit = allowUnitOverride
      ? normalizeText(rawItem.unit ?? rawItem.uom)
      : catalogItem.unit;
    if (!unit || unit.trim().length === 0) {
      errors.push(
        `Line item ${position}: unit override is enabled but unit is empty.`
      );
      return;
    }

    if (isInspectionCatalogItem(catalogItem)) {
      const descriptionRates = extractDollarAmounts(description);
      if (descriptionRates.length === 0) {
        errors.push(
          `Line item ${position}: inspection description must include a dollar rate matching unit cost.`
        );
        return;
      }
      const hasMismatch = descriptionRates.some(
        (rate) => !amountsMatch(rate, unitPrice)
      );
      if (hasMismatch) {
        errors.push(
          `Line item ${position}: inspection description dollar amount must match unit price (${unitPrice.toFixed(2)}).`
        );
        return;
      }
    }

    normalizedItems.push({
      section_id: normalizeText(rawItem.section_id) ?? null,
      item_name: catalogItem.name,
      description,
      quantity,
      unit,
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
  body: unknown,
  options?: {
    allowSingleLineAddress?: boolean;
  }
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

const editorSectionSchema = z
  .object({
    id: z.string().trim().min(1, "Section id is required"),
    name: z.string().trim().min(1, "Section name is required"),
    title: z.string().trim().optional(),
    showSubtotal: z.boolean().optional(),
  })
  .passthrough();

const editorLineItemSchema = z
  .object({
    id: z.string().trim().optional(),
    item: z.string().trim().min(1, "Line item name is required"),
    description: z.string().optional(),
    qty: z.coerce.number().finite().nonnegative(),
    uom: z.string().trim().optional(),
    cost: z.coerce.number().finite().nonnegative(),
    total: z.coerce.number().finite().nonnegative().optional(),
    sectionId: stringOrNullSchema.optional(),
    notes: stringOrNullSchema.optional(),
    isAlternate: z.boolean().optional(),
    catalogCode: z.string().trim().optional(),
    allowDescriptionOverride: z.boolean().optional(),
    allowUnitOverride: z.boolean().optional(),
  })
  .passthrough();

const ESTIMATOR_DIRECTORY = {
  "Jared Aiken": {
    email: "jared@desertservices.net",
    phone: "(989) 330-7859",
  },
  "Denise Bender": {
    email: "denise@desertservices.net",
    phone: "(480) 513-8986",
  },
  "Jeff Gardner": {
    email: "jeff@desertservices.net",
    phone: "(480) 513-8986",
  },
  "Chi Ejimofor": {
    email: "chi@desertservices.net",
    phone: "(304) 405-2446",
  },
} as const;

const ESTIMATOR_NAMES = Object.keys(ESTIMATOR_DIRECTORY);

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function resolveEstimatorContact(estimatorName: string): {
  email: string;
  phone: string;
} {
  const contact =
    ESTIMATOR_DIRECTORY[estimatorName as keyof typeof ESTIMATOR_DIRECTORY];
  if (!contact) {
    throw new EstimatePayloadValidationError([
      `Estimator must be one of: ${ESTIMATOR_NAMES.join(", ")}.`,
    ]);
  }
  return contact;
}

const editorEstimateSchema = z
  .object({
    estimateNumber: z.string().trim().min(1, "estimateNumber is required"),
    date: z.string().trim().min(1, "date is required"),
    estimator: z.string().trim().min(1, "estimator is required"),
    estimatorEmail: z.string().trim().optional().default(""),
    estimatorPhone: z.string().trim().optional().default(""),
    billTo: z.object({
      companyName: z.string().trim().min(1, "billTo.companyName is required"),
      address: z.string().trim().min(1, "billTo.address is required"),
      email: z.string().trim().optional().default(""),
      phone: z.string().trim().optional().default(""),
    }),
    jobInfo: z.object({
      siteName: z.string().trim().min(1, "jobInfo.siteName is required"),
      address: z.string().trim().min(1, "jobInfo.address is required"),
    }),
    sections: z.array(editorSectionSchema).default([]),
    lineItems: z
      .array(editorLineItemSchema)
      .min(1, "lineItems must contain at least one row"),
    total: z.coerce.number().finite().nonnegative().optional(),
  })
  .passthrough();

const LEGACY_PDF_ITEM_NAME_ALIASES: Record<string, string> = {
  inspections: "SWPPP Inspections",
  "mobilization charge": "Mobilization / Trip Charge",
  "mobilization charges": "Mobilization / Trip Charge",
  "permit filing": "Maricopa Dust Permit (1-5 acres)",
  "inlet protection": "Drop Inlet Protection",
  "temp fencing": "Fence Install",
  "concrete rolloff": "Concrete Washout (15 yd)",
  "sand bags": "Fence Stand Sandbags",
  "track out grate": "Rumble Grates Rental (Monthly)",
  "entrance rock": "Rock Entrance",
  "swppp site sign": "SWPPP Sign",
  "water truck service": "Water Truck w/ Operator",
  "street sweeper": "Street Sweeper w/ Operator",
  "backflow rental": "Backflow Device Rental (Monthly)",
  "backflow certification": "Backflow Device Rental (Monthly)",
  "10 yard container": "10 yd Roll-Off",
  "15 yard container": "15 yd Roll-Off",
  "20 yard container": "20 yd Roll-Off",
  "30 yard container": "30 yd Roll-Off",
  "40 yard container": "40 yd Roll-Off",
  "rp 40 yard container": "40 yd Roll-Off",
  "tank installation": "Full Tank System Install",
  "waste water tank": "Waste Tank Service (1x/week)",
  "water truck cleanout": "Water Truck w/ Operator",
  "hand wash": "Handwash Station (1x/week)",
  "portable to": "Standard Porta John (1x/week)",
};

const CID_MARKER_RE = /\(cid:[^)]+\)/g;
const ELLIPSIS_RE = /\.{3,}/g;
const COLLAPSE_WHITESPACE_RE = /\s+/g;
const MOBILIZATION_PREFIX_RE = /^mobilization ch/;
const INSPECTIONS_PREFIX_RE = /^inspections?/;
const WATER_TRUCK_SERVICE_PREFIX_RE = /^water truck ser/;
const WATER_TRUCK_CLEANOUT_PREFIX_RE = /^water truck cleanout/;
const STREET_SWEEPER_PREFIX_RE = /^street swee/;
const PJ_SERVICE_1_PREFIX_RE = /^pj service\s*1/;
const PJ_SERVICE_2_PREFIX_RE = /^pj service\s*2/;
const PJ_SERVICE_3_PREFIX_RE = /^pj service\s*3/;
const HW_SERVICE_1_PREFIX_RE = /^hw service\s*1/;
const HW_SERVICE_2_PREFIX_RE = /^hw service\s*2/;
const HW_SERVICE_3_PREFIX_RE = /^hw service\s*3/;
const DELIVERY_REMOVAL_PREFIX_RE = /^delivery\/remov/;
const PORTABLE_TO_PREFIX_RE = /^portable to/;
const HAND_WASH_PREFIX_RE = /^hand wash/;
const BACKFLOW_CERT_PREFIX_RE = /^backflow certifi/;
const ADA_COMPLIANT_PREFIX_RE = /^ada compliant/;
const SWPPP_RESERVE_RE = /swppp reserve/;
const SWPPP_PLAN_DESIGN_RE = /swppp plan de/;
const COMPOST_FILTER_RE = /compost filter/;
const SILT_FENCE_INSTALL_RE = /silt fence instal/;
const PRESSURE_WASHING_RE = /pressure washin/;
const LOT_WASH_RE = /lot wash/;
const TEXTURA_OR_PROCORE_RE = /textura|procore|gcpay/;
const CCIP_OR_OCIP_RE = /ccip|ocip|insurance|prequal/;

function normalizeAliasKey(value: string): string {
  return value
    .toLowerCase()
    .replace(CID_MARKER_RE, "")
    .replace(ELLIPSIS_RE, "")
    .replace(COLLAPSE_WHITESPACE_RE, " ")
    .trim();
}

function resolveLegacyPdfItemAlias(
  itemName: string,
  description: string
): string {
  const itemKey = normalizeAliasKey(itemName);
  const descriptionKey = normalizeAliasKey(description);

  const alias = LEGACY_PDF_ITEM_NAME_ALIASES[itemKey];
  if (alias) {
    return alias;
  }

  if (MOBILIZATION_PREFIX_RE.test(itemKey) || itemKey === "charge") {
    return "Mobilization / Trip Charge";
  }

  if (INSPECTIONS_PREFIX_RE.test(itemKey)) {
    return "SWPPP Inspections";
  }

  if (
    WATER_TRUCK_SERVICE_PREFIX_RE.test(itemKey) ||
    WATER_TRUCK_CLEANOUT_PREFIX_RE.test(itemKey) ||
    STREET_SWEEPER_PREFIX_RE.test(itemKey)
  ) {
    return STREET_SWEEPER_PREFIX_RE.test(itemKey)
      ? "Street Sweeper w/ Operator"
      : "Water Truck w/ Operator";
  }

  if (PJ_SERVICE_1_PREFIX_RE.test(itemKey)) {
    return "Standard Porta John (1x/week)";
  }
  if (PJ_SERVICE_2_PREFIX_RE.test(itemKey)) {
    return "Standard Porta John (2x/week)";
  }
  if (PJ_SERVICE_3_PREFIX_RE.test(itemKey)) {
    return "Standard Porta John (3x/week)";
  }

  if (HW_SERVICE_1_PREFIX_RE.test(itemKey)) {
    return "Handwash Station (1x/week)";
  }
  if (HW_SERVICE_2_PREFIX_RE.test(itemKey)) {
    return "Handwash Station (2x/week)";
  }
  if (HW_SERVICE_3_PREFIX_RE.test(itemKey)) {
    return "Handwash Station (3x/week)";
  }

  if (
    DELIVERY_REMOVAL_PREFIX_RE.test(itemKey) ||
    itemKey === "delivery/removal fee"
  ) {
    return "Porta John Delivery/Pickup";
  }

  if (PORTABLE_TO_PREFIX_RE.test(itemKey)) {
    return "Standard Porta John (1x/week)";
  }

  if (HAND_WASH_PREFIX_RE.test(itemKey)) {
    return "Handwash Station (1x/week)";
  }

  if (BACKFLOW_CERT_PREFIX_RE.test(itemKey)) {
    return "Backflow Device Rental (Monthly)";
  }

  if (ADA_COMPLIANT_PREFIX_RE.test(itemKey)) {
    if (itemKey.includes("2x")) {
      return "ADA Porta John (2x/week)";
    }
    if (itemKey.includes("3x")) {
      return "ADA Porta John (3x/week)";
    }
    return "ADA Porta John (1x/week)";
  }

  if (SWPPP_RESERVE_RE.test(itemKey) || SWPPP_RESERVE_RE.test(descriptionKey)) {
    return "SWPPP Reserve";
  }

  if (SWPPP_PLAN_DESIGN_RE.test(itemKey)) {
    return "SWPPP Plan Design";
  }

  if (COMPOST_FILTER_RE.test(itemKey)) {
    return "Compost Filter Sock";
  }

  if (SILT_FENCE_INSTALL_RE.test(itemKey)) {
    return "Wire-Backed Silt Fence";
  }

  if (PRESSURE_WASHING_RE.test(itemKey) || LOT_WASH_RE.test(descriptionKey)) {
    return "Water Truck w/ Operator";
  }

  if (itemKey === "misc" || itemKey === "misc fees") {
    if (TEXTURA_OR_PROCORE_RE.test(descriptionKey)) {
      return "Textura/Procore Processing";
    }

    if (CCIP_OR_OCIP_RE.test(descriptionKey)) {
      return "CCIP/OCIP/Insurance Portal";
    }
  }

  return itemName;
}

function normalizeLineItemsForPdf(
  lineItems: z.infer<typeof editorLineItemSchema>[],
  errors: string[]
): NormalizedEstimateLineItem[] {
  const normalized: NormalizedEstimateLineItem[] = [];

  lineItems.forEach((lineItem, index) => {
    const position = index + 1;
    const strictErrors: string[] = [];
    const strictResult = normalizeLineItems(
      [
        {
          section_id: lineItem.sectionId,
          code: lineItem.catalogCode,
          item_name: lineItem.item,
          description: lineItem.description,
          quantity: lineItem.qty,
          unit: lineItem.uom,
          unit_price: lineItem.cost,
          notes: lineItem.notes,
          is_excluded: lineItem.isAlternate ? 1 : 0,
          allow_description_override: lineItem.allowDescriptionOverride,
          allow_unit_override: lineItem.allowUnitOverride,
        },
      ],
      strictErrors
    );

    if (strictErrors.length === 0 && strictResult.length === 1) {
      normalized.push(strictResult[0] as NormalizedEstimateLineItem);
      return;
    }

    const unknownCatalogOnly =
      strictErrors.length > 0 &&
      strictErrors.every((issue) =>
        issue.endsWith("Item must match a catalog code or exact catalog name.")
      );

    if (!unknownCatalogOnly) {
      errors.push(...strictErrors);
      return;
    }

    const itemName = normalizeText(lineItem.item);
    if (!itemName) {
      errors.push(`Line item ${position}: Line item name is required.`);
      return;
    }

    const quantity = lineItem.qty;
    if (!Number.isFinite(quantity) || quantity < 0) {
      errors.push(`Line item ${position}: quantity must be 0 or greater.`);
      return;
    }

    const cost = lineItem.cost;
    if (!Number.isFinite(cost) || cost < 0) {
      errors.push(
        `Line item ${position}: unit_price/cost must be a valid non-negative number.`
      );
      return;
    }

    const aliasedName = resolveLegacyPdfItemAlias(
      itemName,
      lineItem.description ?? ""
    );

    normalized.push({
      section_id: normalizeText(lineItem.sectionId) ?? null,
      item_name: aliasedName,
      description: normalizeText(lineItem.description) ?? aliasedName,
      quantity,
      unit: normalizeText(lineItem.uom) ?? "Each",
      unit_price: cost,
      notes: normalizeText(lineItem.notes) ?? null,
      is_excluded: lineItem.isAlternate === true,
    });
  });

  return normalized;
}

/**
 * Strict PDF guardrail: validates and canonicalizes EditorEstimate input using
 * the same catalog-backed rules as create/update API payloads.
 */
export function validateAndNormalizeEditorEstimateForPdf(
  estimate: unknown
): EditorEstimate {
  const parsed = editorEstimateSchema.safeParse(estimate);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message);
    throw new EstimatePayloadValidationError(issues);
  }

  const payload = parsed.data;
  const resolvedEstimator = resolveEstimatorContact(payload.estimator);
  const validationErrors: string[] = [];

  if (
    payload.estimatorEmail &&
    payload.estimatorEmail.toLowerCase() !== resolvedEstimator.email
  ) {
    validationErrors.push(
      `Estimator email mismatch for ${payload.estimator}. Expected ${resolvedEstimator.email}.`
    );
  }

  if (
    payload.estimatorPhone &&
    normalizeDigits(payload.estimatorPhone) !==
      normalizeDigits(resolvedEstimator.phone)
  ) {
    validationErrors.push(
      `Estimator phone mismatch for ${payload.estimator}. Expected ${resolvedEstimator.phone}.`
    );
  }

  const normalized = validateCreateEstimatePayload(
    {
      job_name: payload.jobInfo.siteName,
      job_address: payload.jobInfo.address,
      client_name: payload.billTo.companyName,
      client_address: payload.billTo.address,
      client_email: payload.billTo.email,
      client_phone: payload.billTo.phone,
      sections: payload.sections.map((section) => ({
        id: section.id,
        name: section.name,
        title: section.title,
        show_subtotal: section.showSubtotal,
      })),
    },
    {
      allowSingleLineAddress: true,
    }
  );

  const normalizedLineItems = normalizeLineItemsForPdf(
    payload.lineItems,
    validationErrors
  ).map((lineItem, index) => {
    const sourceId = payload.lineItems[index]?.id;
    const rowTotal = Number(
      (lineItem.quantity * lineItem.unit_price).toFixed(2)
    );

    return {
      id:
        sourceId && sourceId.trim().length > 0 ? sourceId : `line-${index + 1}`,
      item: lineItem.item_name,
      description: lineItem.description,
      qty: lineItem.quantity,
      uom: lineItem.unit,
      cost: lineItem.unit_price,
      total: rowTotal,
      sectionId: lineItem.section_id ?? undefined,
      isAlternate: lineItem.is_excluded === true ? true : undefined,
    };
  });

  if (validationErrors.length > 0) {
    throw new EstimatePayloadValidationError(validationErrors);
  }

  const normalizedSections = (normalized.sections ?? []).map((section) => ({
    id: section.id,
    name: section.name,
    title: section.title ?? undefined,
    showSubtotal: section.show_subtotal,
  }));

  const computedTotal = Number(
    normalizedLineItems.reduce((sum, item) => sum + item.total, 0).toFixed(2)
  );

  return {
    estimateNumber: payload.estimateNumber,
    date: payload.date,
    estimator: payload.estimator,
    estimatorEmail: resolvedEstimator.email,
    estimatorPhone: resolvedEstimator.phone,
    billTo: {
      companyName: normalized.client_name ?? payload.billTo.companyName,
      address: normalized.client_address ?? payload.billTo.address,
      email: normalized.client_email ?? payload.billTo.email,
      phone: normalized.client_phone ?? payload.billTo.phone,
    },
    jobInfo: {
      siteName: normalized.job_name ?? payload.jobInfo.siteName,
      address: normalized.job_address ?? payload.jobInfo.address,
    },
    sections: normalizedSections,
    lineItems: normalizedLineItems,
    total: computedTotal,
  };
}
